# Task 05：WorkflowCheckpoint（工作流检查点系统）

**优先级**: P1
**预估工时**: 6h
**依赖**: Task 1（Logger）
**阶段**: Phase 2

---

## 目标

实现工作流检查点保存系统，支持原子写入（tmp + rename）、gzip 压缩存储、SHA256 完整性校验，以及自动清理旧检查点（最多保留 10 个）。

---

## 输入文件

- `docs/v7/01-requirements.md` - 第 3.2.1 节（WorkflowCheckpointing 需求）
- `docs/v7/02-architecture.md` - WorkflowCheckpoint 架构设计
- `src/observability/logger.ts` - 记录检查点日志

---

## 输出文件

| 文件 | 说明 |
|------|------|
| `src/observability/checkpoint.ts` | WorkflowCheckpointer 主体实现 |
| `tests/observability/checkpoint.test.ts` | 单元测试 |

---

## 实现步骤

### 步骤 1：类型定义（扩展 types.ts）

在 `src/observability/types.ts` 中补充检查点相关类型：

```typescript
export type WorkflowStatus =
  | 'pending' | 'running' | 'paused'
  | 'completed' | 'failed' | 'recovering';

export interface CompletedStep {
  stepId: string;
  agentId: string;
  completedAt: string;
  output: any;
  durationMs: number;
}

export interface PendingStep {
  stepId: string;
  description: string;
  dependsOn: string[];
}

export interface WorkflowCheckpointData {
  workflowId: string;
  checkpointSeq: number;
  createdAt: string;
  status: WorkflowStatus;
  checksum: string;              // SHA256 of the data (excluding this field)
  taskInput: Record<string, any>;
  completedSteps: CompletedStep[];
  pendingSteps: PendingStep[];
  metadata: {
    totalSteps: number;
    completedCount: number;
    traceId: string;
    lastActiveAt: string;
  };
}

export interface WorkflowSummary {
  workflowId: string;
  status: WorkflowStatus;
  lastCheckpointSeq: number;
  completedCount: number;
  totalSteps: number;
  lastActiveAt: string;
}
```

### 步骤 2：实现 WorkflowCheckpointer `src/observability/checkpoint.ts`

关键技术点：
- 原子写入：`write → .tmp` 然后 `rename`（POSIX rename 保证原子性）
- 压缩：使用 Node.js 内置 `zlib.gzip`
- 校验：SHA256 对序列化后的数据（不含 checksum 字段本身）计算

```typescript
import {
  mkdirSync, writeFileSync, renameSync, readdirSync,
  unlinkSync, existsSync, readFileSync
} from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import { randomUUID } from 'crypto';
import { getLogger } from './logger.js';
import type {
  WorkflowCheckpointData, WorkflowStatus, WorkflowSummary
} from './types.js';

const logger = getLogger('checkpoint');
const MAX_CHECKPOINTS = 10;

export class WorkflowCheckpointer {
  private static instance: WorkflowCheckpointer;
  private readonly checkpointsDir: string;

  private constructor(checkpointsDir = 'workspace/checkpoints') {
    this.checkpointsDir = checkpointsDir;
    mkdirSync(checkpointsDir, { recursive: true });
  }

  static getInstance(): WorkflowCheckpointer {
    if (!WorkflowCheckpointer.instance) {
      WorkflowCheckpointer.instance = new WorkflowCheckpointer();
    }
    return WorkflowCheckpointer.instance;
  }

  createWorkflow(taskInput: Record<string, any>): string {
    const workflowId = `wf-${randomUUID()}`;
    const workflowDir = join(this.checkpointsDir, workflowId);
    mkdirSync(workflowDir, { recursive: true });

    // 写入初始检查点（状态为 pending）
    const initial: WorkflowCheckpointData = {
      workflowId,
      checkpointSeq: 0,
      createdAt: new Date().toISOString(),
      status: 'pending',
      checksum: '',
      taskInput,
      completedSteps: [],
      pendingSteps: [],
      metadata: {
        totalSteps: 0,
        completedCount: 0,
        traceId: '',
        lastActiveAt: new Date().toISOString(),
      },
    };
    this.writeAtomically(workflowId, initial);
    return workflowId;
  }

  async saveCheckpoint(
    workflowId: string,
    state: Partial<WorkflowCheckpointData>
  ): Promise<void> {
    const latest = await this.loadLatestCheckpoint(workflowId);
    const nextSeq = (latest?.checkpointSeq ?? 0) + 1;

    const checkpoint: WorkflowCheckpointData = {
      ...(latest ?? {} as WorkflowCheckpointData),
      ...state,
      workflowId,
      checkpointSeq: nextSeq,
      createdAt: new Date().toISOString(),
      checksum: '',  // 计算前先清空
    };

    // 计算校验和（对不含 checksum 的数据）
    checkpoint.checksum = this.calcChecksum(checkpoint);

    this.writeAtomically(workflowId, checkpoint);
    this.pruneOldCheckpoints(workflowId);

    logger.info('Checkpoint saved', {
      event: 'checkpoint.saved',
      data: { workflowId, seq: nextSeq },
    } as any);
  }

  async loadLatestCheckpoint(workflowId: string): Promise<WorkflowCheckpointData | null> {
    const dir = join(this.checkpointsDir, workflowId);
    if (!existsSync(dir)) return null;

    const files = this.getCheckpointFiles(workflowId);
    if (files.length === 0) return null;

    // 取最新的（序号最大）
    const latest = files[files.length - 1];
    return this.readCheckpoint(join(dir, latest));
  }

  async listIncompleteWorkflows(): Promise<WorkflowSummary[]> {
    const summaries: WorkflowSummary[] = [];

    if (!existsSync(this.checkpointsDir)) return summaries;

    const workflowIds = readdirSync(this.checkpointsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const wfId of workflowIds) {
      const latest = await this.loadLatestCheckpoint(wfId);
      if (latest && latest.status !== 'completed' && latest.status !== 'failed') {
        summaries.push({
          workflowId: wfId,
          status: latest.status,
          lastCheckpointSeq: latest.checkpointSeq,
          completedCount: latest.metadata.completedCount,
          totalSteps: latest.metadata.totalSteps,
          lastActiveAt: latest.metadata.lastActiveAt,
        });
      }
    }

    return summaries;
  }

  async markCompleted(workflowId: string): Promise<void> {
    await this.saveCheckpoint(workflowId, {
      status: 'completed',
      metadata: { lastActiveAt: new Date().toISOString() } as any,
    });
  }

  async markFailed(workflowId: string, reason: string): Promise<void> {
    await this.saveCheckpoint(workflowId, {
      status: 'failed',
      metadata: { lastActiveAt: new Date().toISOString(), failureReason: reason } as any,
    });
  }

  validateCheckpoint(checkpoint: WorkflowCheckpointData): boolean {
    const expected = this.calcChecksum({ ...checkpoint, checksum: '' });
    return checkpoint.checksum === expected;
  }

  private writeAtomically(workflowId: string, data: WorkflowCheckpointData): void {
    const dir = join(this.checkpointsDir, workflowId);
    const filename = `checkpoint-${String(data.checkpointSeq).padStart(3, '0')}.json.gz`;
    const finalPath = join(dir, filename);
    const tmpPath = `${finalPath}.tmp`;

    // 1. 序列化 + gzip
    const json = JSON.stringify(data);
    const compressed = gzipSync(Buffer.from(json, 'utf-8'));

    // 2. 写入临时文件
    writeFileSync(tmpPath, compressed);

    // 3. 原子重命名
    renameSync(tmpPath, finalPath);
  }

  private readCheckpoint(filePath: string): WorkflowCheckpointData | null {
    try {
      const compressed = readFileSync(filePath);
      const json = gunzipSync(compressed).toString('utf-8');
      const data = JSON.parse(json) as WorkflowCheckpointData;

      if (!this.validateCheckpoint(data)) {
        logger.warn('Checkpoint integrity check failed', {
          data: { filePath },
        } as any);
        return null;
      }

      return data;
    } catch (err) {
      logger.error('Failed to read checkpoint', err as Error, {
        data: { filePath },
      } as any);
      return null;
    }
  }

  private calcChecksum(data: WorkflowCheckpointData): string {
    const copy = { ...data, checksum: '' };
    return createHash('sha256')
      .update(JSON.stringify(copy))
      .digest('hex');
  }

  private getCheckpointFiles(workflowId: string): string[] {
    const dir = join(this.checkpointsDir, workflowId);
    return readdirSync(dir)
      .filter(f => f.endsWith('.json.gz') && !f.endsWith('.tmp'))
      .sort();  // 字典序即序号升序
  }

  private pruneOldCheckpoints(workflowId: string): void {
    const files = this.getCheckpointFiles(workflowId);
    if (files.length <= MAX_CHECKPOINTS) return;

    const toDelete = files.slice(0, files.length - MAX_CHECKPOINTS);
    const dir = join(this.checkpointsDir, workflowId);
    toDelete.forEach(f => {
      try { unlinkSync(join(dir, f)); } catch { /* 清理失败忽略 */ }
    });
  }
}
```

---

## 验收标准

- [ ] `createWorkflow({ task: 'test' })` 返回格式为 `wf-{uuid}` 的字符串，且目录已创建
- [ ] `saveCheckpoint()` 后文件为 `.json.gz` 格式，可被 gunzip 解压
- [ ] 读取检查点时 SHA256 校验通过
- [ ] 手动修改检查点文件字节，`validateCheckpoint()` 返回 false
- [ ] 保存超过 10 个检查点后，旧的自动删除（只保留最近 10 个）
- [ ] 写入过程中强制中断（如写 .tmp 后抛异常），不出现损坏的正式文件
- [ ] `listIncompleteWorkflows()` 只返回 status 为 running/pending/recovering/paused 的工作流
- [ ] 单元测试覆盖率 > 80%
- [ ] TypeScript 编译无错误（strict 模式）
