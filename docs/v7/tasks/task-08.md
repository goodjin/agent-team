# Task 08：端到端测试

**优先级**: P1
**预估工时**: 4h
**依赖**: Task 1 至 Task 7（所有模块完成后执行）
**阶段**: Phase 2

---

## 目标

验证完整可观测性流水线的正确性：日志 → Trace → 指标 → 检查点的联动工作，包括崩溃恢复场景测试，以及性能回归验证（可观测性引入后执行时间增加 < 5%）。

---

## 输入文件

- `src/observability/` - 所有 Task 1-5 输出
- `src/workflow/` - Task 6 输出
- `src/ai/agent-loop.ts` - 核心执行引擎
- `src/server/` - API 端点（Task 7 输出）

---

## 输出文件

| 文件 | 说明 |
|------|------|
| `tests/e2e/observability.e2e.test.ts` | 可观测性联动测试 |
| `tests/e2e/checkpoint-recovery.e2e.test.ts` | 检查点恢复测试 |

---

## 实现步骤

### 步骤 1：可观测性联动测试 `tests/e2e/observability.e2e.test.ts`

测试场景：执行一次真实（或 mock）Agent 任务，验证三大支柱均正确工作。

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { AgentLoop } from '../../src/ai/agent-loop.js';
import { createObservabilityMiddleware } from '../../src/observability/index.js';
import { MetricsCollector } from '../../src/observability/metrics.js';
import { Logger } from '../../src/observability/logger.js';

// 使用临时测试目录，不污染真实 workspace
const TEST_WORKSPACE = 'tests/tmp/e2e-workspace';

describe('Observability E2E', () => {
  let agentLoop: AgentLoop;

  before(async () => {
    // 初始化测试环境
    process.env.WORKSPACE_DIR = TEST_WORKSPACE;
    agentLoop = createMockAgentLoop();
    createObservabilityMiddleware(agentLoop);
  });

  after(async () => {
    // 清理测试目录
    await Logger.getInstance().flush();
  });

  it('执行任务后生成日志文件', async () => {
    await runMockTask(agentLoop, { id: 'test-task-001', title: 'E2E Test Task' });

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(TEST_WORKSPACE, 'logs', `${today}.log`);
    assert.ok(existsSync(logFile), 'Log file should exist');

    // 验证日志内容
    const lines = readFileSync(logFile, 'utf-8').trim().split('\n');
    const entries = lines.map(l => JSON.parse(l));

    const taskStarted = entries.find(e => e.event === 'task.started');
    assert.ok(taskStarted, 'task.started event should be logged');
    assert.equal(taskStarted.taskId, 'test-task-001');

    const taskCompleted = entries.find(e => e.event === 'task.completed' || e.event === 'task.failed');
    assert.ok(taskCompleted, 'task end event should be logged');
  });

  it('执行任务后生成 Trace 文件', async () => {
    const { traceId } = await runMockTask(agentLoop, { id: 'test-task-002', title: 'Trace Test' });
    assert.ok(traceId, 'traceId should be returned');

    const traceFile = join(TEST_WORKSPACE, 'traces', `${traceId}.json`);
    assert.ok(existsSync(traceFile), `Trace file ${traceId}.json should exist`);

    const trace = JSON.parse(readFileSync(traceFile, 'utf-8'));
    assert.equal(trace.traceId, traceId);
    assert.ok(Array.isArray(trace.spans), 'Trace should have spans array');
    assert.ok(trace.spans.length > 0, 'Trace should have at least one span');

    // 验证工具调用 Span 存在
    const toolSpan = trace.spans.find((s: any) => s.kind === 'tool');
    assert.ok(toolSpan, 'Should have at least one tool span');
    assert.ok(toolSpan.durationMs >= 0, 'Tool span durationMs should be non-negative');
  });

  it('Trace 调用树层级正确（task > tool）', async () => {
    const { traceId } = await runMockTask(agentLoop, {
      id: 'test-task-003',
      title: 'Hierarchy Test',
      tools: ['mock_tool_a', 'mock_tool_b'],
    });

    const traceFile = join(TEST_WORKSPACE, 'traces', `${traceId}.json`);
    const trace = JSON.parse(readFileSync(traceFile, 'utf-8'));

    const rootSpan = trace.spans.find((s: any) => !s.parentSpanId);
    assert.ok(rootSpan, 'Should have a root span with no parentSpanId');
    assert.equal(rootSpan.kind, 'task');

    const toolSpans = trace.spans.filter((s: any) => s.kind === 'tool');
    toolSpans.forEach((ts: any) => {
      assert.ok(ts.parentSpanId, 'Tool spans should have parentSpanId');
    });
  });

  it('指标统计准确', async () => {
    const metrics = MetricsCollector.getInstance();
    const initialCount = metrics.getSummary('task.total').count;

    // 执行 3 次任务（2成功1失败）
    await runMockTask(agentLoop, { id: 'metric-test-001', success: true });
    await runMockTask(agentLoop, { id: 'metric-test-002', success: true });
    await runMockTask(agentLoop, { id: 'metric-test-003', success: false });

    const totalSummary = metrics.getSummary('task.total');
    assert.ok(totalSummary.count >= initialCount + 3, 'task.total should increment by 3');

    const successCount = metrics.getSummary('task.success_count').count;
    const failureCount = metrics.getSummary('task.failure_count').count;
    assert.ok(successCount >= 2, 'Should have at least 2 successes');
    assert.ok(failureCount >= 1, 'Should have at least 1 failure');
  });

  it('性能回归测试：可观测性引入后执行时间增加 < 5%', async () => {
    // 不使用可观测性
    const loopWithout = createMockAgentLoop();
    const start1 = Date.now();
    for (let i = 0; i < 10; i++) {
      await runMockTask(loopWithout, { id: `perf-baseline-${i}` });
    }
    const baselineMs = Date.now() - start1;

    // 使用可观测性
    const loopWith = createMockAgentLoop();
    createObservabilityMiddleware(loopWith);
    const start2 = Date.now();
    for (let i = 0; i < 10; i++) {
      await runMockTask(loopWith, { id: `perf-obs-${i}` });
    }
    const observableMs = Date.now() - start2;

    const overhead = (observableMs - baselineMs) / baselineMs;
    assert.ok(overhead < 0.05, `Overhead ${(overhead * 100).toFixed(1)}% should be < 5%`);
  });
});
```

### 步骤 2：检查点恢复测试 `tests/e2e/checkpoint-recovery.e2e.test.ts`

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowCheckpointer } from '../../src/observability/checkpoint.js';
import { WorkflowRecoveryManager } from '../../src/workflow/recovery.js';

describe('Checkpoint Recovery E2E', () => {
  it('保存并恢复检查点：已完成步骤不重复执行', async () => {
    const checkpointer = WorkflowCheckpointer.getInstance();
    const recovery = WorkflowRecoveryManager.getInstance();

    // 创建工作流，模拟 5 步任务
    const wfId = checkpointer.createWorkflow({ task: 'e2e-recovery-test' });
    const steps = ['step-1', 'step-2', 'step-3', 'step-4', 'step-5'];

    // 完成前 3 步
    await checkpointer.saveCheckpoint(wfId, {
      status: 'running',
      completedSteps: [
        { stepId: 'step-1', agentId: 'agent-1', completedAt: new Date().toISOString(), output: 'result-1', durationMs: 100 },
        { stepId: 'step-2', agentId: 'agent-1', completedAt: new Date().toISOString(), output: 'result-2', durationMs: 200 },
        { stepId: 'step-3', agentId: 'agent-2', completedAt: new Date().toISOString(), output: 'result-3', durationMs: 150 },
      ],
      pendingSteps: [
        { stepId: 'step-4', description: 'Step 4', dependsOn: ['step-3'] },
        { stepId: 'step-5', description: 'Step 5', dependsOn: ['step-4'] },
      ],
      metadata: {
        totalSteps: 5,
        completedCount: 3,
        traceId: 'trace-test',
        lastActiveAt: new Date().toISOString(),
      },
    });

    // 模拟崩溃后恢复
    const result = await recovery.recover(wfId);

    assert.equal(result.recoveredFrom, 1);  // 第 1 个检查点
    assert.equal(result.completedStepsSkipped, 3);
    assert.equal(result.pendingSteps.length, 2);
    assert.deepEqual(
      result.pendingSteps.map(s => s.stepId),
      ['step-4', 'step-5']
    );

    // 验证已完成步骤
    assert.ok(await recovery.isStepCompleted(wfId, 'step-1'));
    assert.ok(await recovery.isStepCompleted(wfId, 'step-2'));
    assert.ok(await recovery.isStepCompleted(wfId, 'step-3'));
    assert.ok(!(await recovery.isStepCompleted(wfId, 'step-4')));
    assert.ok(!(await recovery.isStepCompleted(wfId, 'step-5')));

    // 完成剩余步骤
    await recovery.completeStep(wfId, {
      stepId: 'step-4', agentId: 'agent-2',
      completedAt: new Date().toISOString(), output: 'result-4', durationMs: 180,
    });

    assert.ok(await recovery.isStepCompleted(wfId, 'step-4'));
    assert.ok(!(await recovery.isStepCompleted(wfId, 'step-5')));

    // 标记完成
    await checkpointer.markCompleted(wfId);

    // 已完成的工作流不出现在 incomplete 列表中
    const incomplete = await recovery.scanIncomplete();
    const found = incomplete.find(w => w.workflowId === wfId);
    assert.ok(!found, 'Completed workflow should not appear in incomplete list');
  });

  it('检查点原子写入：中断不产生损坏文件', async () => {
    const checkpointer = WorkflowCheckpointer.getInstance();
    const wfId = checkpointer.createWorkflow({ task: 'atomic-test' });

    // 保存多个检查点
    for (let i = 0; i < 5; i++) {
      await checkpointer.saveCheckpoint(wfId, {
        status: 'running',
        metadata: {
          totalSteps: 10, completedCount: i + 1,
          traceId: 'trace-atomic', lastActiveAt: new Date().toISOString(),
        },
      });
    }

    // 加载最新检查点，验证校验和
    const latest = await checkpointer.loadLatestCheckpoint(wfId);
    assert.ok(latest, 'Should load latest checkpoint');
    assert.ok(checkpointer.validateCheckpoint(latest), 'Checksum should be valid');
    assert.equal(latest.checkpointSeq, 5);
  });

  it('超过 10 个检查点时自动清理', async () => {
    const checkpointer = WorkflowCheckpointer.getInstance();
    const wfId = checkpointer.createWorkflow({ task: 'prune-test' });

    for (let i = 0; i < 12; i++) {
      await checkpointer.saveCheckpoint(wfId, {
        status: 'running',
        metadata: {
          totalSteps: 12, completedCount: i + 1,
          traceId: 'trace-prune', lastActiveAt: new Date().toISOString(),
        },
      });
    }

    // 检查目录中最多 10 个文件
    const { readdirSync } = await import('fs');
    const { join } = await import('path');
    const files = readdirSync(join('workspace/checkpoints', wfId))
      .filter(f => f.endsWith('.json.gz'));
    assert.ok(files.length <= 10, `Should have at most 10 checkpoints, got ${files.length}`);
  });
});
```

### 步骤 3：辅助工具函数

```typescript
// tests/e2e/helpers.ts

import { EventEmitter } from 'events';

export function createMockAgentLoop(): EventEmitter {
  return new EventEmitter();
}

export async function runMockTask(
  loop: EventEmitter,
  opts: { id: string; title?: string; success?: boolean; tools?: string[] }
): Promise<{ traceId?: string }> {
  const { id, title = 'Mock Task', success = true, tools = ['mock_tool'] } = opts;

  loop.emit('task:start', { id, title });

  // 模拟工具调用
  for (const toolName of tools) {
    const callId = `call-${Date.now()}`;
    loop.emit('tool:call', { toolName, params: { q: 'test' }, agentId: 'agent-mock', callId });
    await new Promise(r => setTimeout(r, 5)); // 模拟耗时
    if (success) {
      loop.emit('tool:result', { toolName, durationMs: 5, callId });
    } else {
      loop.emit('tool:error', { toolName, error: new Error('mock error'), callId });
    }
  }

  // 模拟 LLM 调用
  loop.emit('llm:request', { model: 'claude-3', agentId: 'agent-mock', promptTokens: 500 });
  await new Promise(r => setTimeout(r, 10));
  loop.emit('llm:response', { durationMs: 10, outputTokens: 200, model: 'claude-3' });

  loop.emit('task:end', { id, success, durationMs: 50 });

  // 等待异步处理完成
  await new Promise(r => setTimeout(r, 50));

  return {};
}
```

---

## 验收标准

- [ ] 执行任务后 `workspace/logs/{today}.log` 包含 task.started / tool.called / task.completed 事件
- [ ] Trace 文件包含根 Span（kind=task）和工具 Span（kind=tool），层级关系正确
- [ ] 执行 3 次任务（2成功1失败）后，指标统计准确
- [ ] 保存 3 步检查点后模拟崩溃，恢复时 isStepCompleted() 正确区分已完成和未完成步骤
- [ ] 保存 12 个检查点后，目录中文件数 <= 10
- [ ] 性能回归：可观测性引入后执行时间增加 < 5%
- [ ] 所有 E2E 测试通过（`npm test tests/e2e/`）
- [ ] TypeScript 编译无错误（strict 模式）
