# Task 06：检查点恢复机制

**优先级**: P1
**预估工时**: 4h
**依赖**: Task 5（WorkflowCheckpoint）
**阶段**: Phase 2

---

## 目标

实现从检查点恢复工作流执行的完整流程。系统启动时自动扫描未完成的工作流，提供恢复接口，确保恢复后已完成步骤不重复执行。

---

## 输入文件

- `docs/v7/01-requirements.md` - 第 3.2.1 节检查点恢复相关需求
- `src/observability/checkpoint.ts` - Task 5 输出
- `src/ai/master-agent.ts` - 了解 MasterAgent 执行流程

---

## 输出文件

| 文件 | 说明 |
|------|------|
| `src/workflow/recovery.ts` | 工作流恢复逻辑 |
| `src/workflow/index.ts` | 统一导出 |

---

## 实现步骤

### 步骤 1：设计恢复接口

```typescript
// src/workflow/recovery.ts

export interface RecoveryResult {
  workflowId: string;
  recoveredFrom: number;      // 从第几个检查点恢复
  completedStepsSkipped: number;  // 跳过的已完成步骤数
  pendingSteps: PendingStep[];    // 待执行的步骤
}

export interface WorkflowRecoveryManager {
  // 扫描未完成的工作流
  scanIncomplete(): Promise<WorkflowSummary[]>;

  // 从最近检查点恢复
  recover(workflowId: string): Promise<RecoveryResult>;

  // 标记步骤完成
  completeStep(workflowId: string, step: CompletedStep): Promise<void>;

  // 检查步骤是否已完成（恢复时用于跳过）
  isStepCompleted(workflowId: string, stepId: string): Promise<boolean>;
}
```

### 步骤 2：实现恢复管理器 `src/workflow/recovery.ts`

```typescript
import { WorkflowCheckpointer } from '../observability/checkpoint.js';
import { getLogger } from '../observability/logger.js';
import type { WorkflowSummary, WorkflowCheckpointData, CompletedStep, PendingStep } from '../observability/types.js';

const logger = getLogger('recovery');

export interface RecoveryResult {
  workflowId: string;
  checkpoint: WorkflowCheckpointData;
  recoveredFrom: number;
  completedStepsSkipped: number;
  pendingSteps: PendingStep[];
}

export class WorkflowRecoveryManager {
  private static instance: WorkflowRecoveryManager;
  private checkpointer: WorkflowCheckpointer;

  // 内存缓存：workflowId → 已完成步骤集合
  private completedStepSets = new Map<string, Set<string>>();

  private constructor() {
    this.checkpointer = WorkflowCheckpointer.getInstance();
  }

  static getInstance(): WorkflowRecoveryManager {
    if (!WorkflowRecoveryManager.instance) {
      WorkflowRecoveryManager.instance = new WorkflowRecoveryManager();
    }
    return WorkflowRecoveryManager.instance;
  }

  async scanIncomplete(): Promise<WorkflowSummary[]> {
    const incomplete = await this.checkpointer.listIncompleteWorkflows();
    if (incomplete.length > 0) {
      logger.info(`Found ${incomplete.length} incomplete workflow(s)`, {
        data: { workflows: incomplete.map(w => w.workflowId) },
      } as any);
    }
    return incomplete;
  }

  async recover(workflowId: string): Promise<RecoveryResult> {
    const checkpoint = await this.checkpointer.loadLatestCheckpoint(workflowId);
    if (!checkpoint) {
      throw new Error(`No checkpoint found for workflow: ${workflowId}`);
    }

    // 标记为恢复中
    await this.checkpointer.saveCheckpoint(workflowId, {
      status: 'recovering',
      metadata: {
        ...checkpoint.metadata,
        lastActiveAt: new Date().toISOString(),
      },
    });

    // 从检查点恢复已完成步骤集合
    const completedSet = new Set(checkpoint.completedSteps.map(s => s.stepId));
    this.completedStepSets.set(workflowId, completedSet);

    const result: RecoveryResult = {
      workflowId,
      checkpoint,
      recoveredFrom: checkpoint.checkpointSeq,
      completedStepsSkipped: checkpoint.completedSteps.length,
      pendingSteps: checkpoint.pendingSteps,
    };

    // 打印恢复信息
    logger.info('Workflow recovering from checkpoint', {
      event: 'workflow.recovering',
      data: {
        workflowId,
        seq: checkpoint.checkpointSeq,
        skipped: result.completedStepsSkipped,
        pending: result.pendingSteps.length,
      },
    } as any);

    console.log(
      `\n[Recovery] Restoring workflow: ${workflowId}\n` +
      `  From checkpoint #${checkpoint.checkpointSeq}\n` +
      `  Skipping ${result.completedStepsSkipped} completed step(s)\n` +
      `  Resuming ${result.pendingSteps.length} pending step(s)\n`
    );

    return result;
  }

  async completeStep(workflowId: string, step: CompletedStep): Promise<void> {
    // 更新内存缓存
    let set = this.completedStepSets.get(workflowId);
    if (!set) {
      set = new Set();
      this.completedStepSets.set(workflowId, set);
    }
    set.add(step.stepId);

    // 加载当前检查点并追加已完成步骤
    const latest = await this.checkpointer.loadLatestCheckpoint(workflowId);
    if (!latest) return;

    const completedSteps = [...latest.completedSteps, step];
    const pendingSteps = latest.pendingSteps.filter(s => s.stepId !== step.stepId);

    await this.checkpointer.saveCheckpoint(workflowId, {
      status: 'running',
      completedSteps,
      pendingSteps,
      metadata: {
        ...latest.metadata,
        completedCount: completedSteps.length,
        lastActiveAt: new Date().toISOString(),
      },
    });
  }

  async isStepCompleted(workflowId: string, stepId: string): Promise<boolean> {
    // 先查内存缓存
    const set = this.completedStepSets.get(workflowId);
    if (set) return set.has(stepId);

    // 缓存未命中：从文件加载
    const checkpoint = await this.checkpointer.loadLatestCheckpoint(workflowId);
    if (!checkpoint) return false;

    const completedSet = new Set(checkpoint.completedSteps.map(s => s.stepId));
    this.completedStepSets.set(workflowId, completedSet);
    return completedSet.has(stepId);
  }
}
```

### 步骤 3：系统启动时自动扫描

在应用启动入口（如 `src/index.ts`）添加启动扫描：

```typescript
// 应用启动时（无需修改 MasterAgent，在外部调用）
import { WorkflowRecoveryManager } from './workflow/index.js';

async function onStartup() {
  const recovery = WorkflowRecoveryManager.getInstance();
  const incomplete = await recovery.scanIncomplete();

  if (incomplete.length > 0) {
    console.log('\n=== Incomplete Workflows Detected ===');
    incomplete.forEach((wf, i) => {
      console.log(`  ${i + 1}. ${wf.workflowId}`);
      console.log(`     Status: ${wf.status}`);
      console.log(`     Progress: ${wf.completedCount}/${wf.totalSteps} steps`);
      console.log(`     Last active: ${wf.lastActiveAt}`);
    });
    console.log('\nUse recovery.recover(workflowId) to resume.\n');
  }
}
```

### 步骤 4：与 MasterAgent 集成（最小化修改）

在 MasterAgent 子任务执行完成后，通过 recovery manager 保存步骤：

```typescript
// MasterAgent 中（仅在子任务完成后追加，不改变执行逻辑）
// 如果 workflowId 存在，就保存检查点
if (this.workflowId) {
  const recovery = WorkflowRecoveryManager.getInstance();
  await recovery.completeStep(this.workflowId, {
    stepId: subTask.id,
    agentId: subAgent.id,
    completedAt: new Date().toISOString(),
    output: result,
    durationMs: elapsed,
  });
}
```

---

## 验收标准

- [ ] `scanIncomplete()` 返回所有状态非 completed/failed 的工作流
- [ ] `recover(workflowId)` 将检查点状态更新为 recovering，并在控制台打印恢复信息
- [ ] `isStepCompleted(wfId, stepId)` 对已完成的步骤返回 true，未完成的返回 false
- [ ] 模拟执行 5 步任务，在第 3 步后强制终止，重启后 `scanIncomplete()` 能发现该工作流
- [ ] 从第 3 步恢复后，步骤 1、2 的 `isStepCompleted()` 返回 true（不重复执行）
- [ ] 恢复控制台输出包含：工作流 ID、检查点序号、跳过步骤数、待执行步骤数
- [ ] 单元测试覆盖率 > 80%
- [ ] TypeScript 编译无错误（strict 模式）
