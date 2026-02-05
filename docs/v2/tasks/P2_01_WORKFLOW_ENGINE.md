---
status: pending
priority: P2
estimated_hours: 16
created: 2026-02-04
updated: 2026-02-04
---

# P2.1 工作流引擎核心

## 任务信息

| 属性 | 值 |
|------|-----|
| 状态 | pending |
| 优先级 | P2 |
| 预估工时 | 16h |
| 负责人 | - |
| 关联任务 | P2.2, P2.3 |

## 描述

实现工作流定义解析和执行引擎，支持串行、并行、条件分支。

## 核心数据结构

### Workflow

```typescript
interface Workflow {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: WorkflowStep[];
  triggers?: Trigger[];
  timeout?: number;        // 默认超时（毫秒）
  retryPolicy?: RetryPolicy;
  createdAt: Date;
  updatedAt: Date;
}
```

### WorkflowStep

```typescript
interface WorkflowStep {
  id: string;
  name: string;
  type: 'role' | 'condition' | 'parallel' | 'loop' | 'human-approval';
  config: StepConfig;
  next?: string | string[];  // 下一步，可以是数组（并行）
  errorHandling?: 'continue' | 'stop' | 'retry';
}

interface StepConfig {
  roleId?: string;           // role 类型
  condition?: string;        // condition 类型
  steps?: WorkflowStep[];    // parallel/loop 类型
  approver?: string;         // human-approval 类型
  timeout?: number;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
}
```

### 执行上下文

```typescript
interface ExecutionContext {
  workflowId: string;
  executionId: string;
  stepId: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  variables: Record<string, any>;
  history: ExecutionHistory[];
}
```

## 引擎功能

- [ ] 工作流定义解析
- [ ] 步骤拓扑排序
- [ ] 串行执行
- [ ] 并行执行
- [ ] 条件分支判断
- [ ] 循环支持
- [ ] 超时处理
- [ ] 错误处理和重试
- [ ] 执行状态持久化

## 修改文件

- [ ] `src/core/workflow-engine.ts` (新建)
- [ ] `src/types/workflow.ts` (新建)

## 验收标准

- [ ] 能解析工作流定义
- [ ] 能执行串行步骤
- [ ] 能并行执行多个步骤
- [ ] 条件分支正常工作
- [ ] 超时和错误能正确处理

---

## 完成记录

| 日期 | 操作 | 负责人 |
|------|------|--------|
| - | - | - |
