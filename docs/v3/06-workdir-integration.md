# TASK-006: WorkDirManager 集成到任务创建流程

## 任务描述

将 WorkDirManager 集成到 TaskManager.createTask() 中，确保每个任务创建时自动创建工作目录。

## 需求来源

**架构设计**: `docs/v3/02-architecture.md` - 5.1 任务创建流程

```
TaskManager.createTask(input)
    │
    ▼
WorkDirManager.createWorkDir(config)

返回 WorkDirState →    │
    ▼ 注入任务上下文
```

## 交付物

- 修改 `src/core/task-manager.ts` - 集成 WorkDirManager
- 修改 `src/types/index.ts` - 扩展 TaskInput 类型
- 新增集成测试 `tests/integration/workdir-task-creation.test.ts`

## 详细设计

### 1. 修改 TaskInput 类型

```typescript
// src/types/index.ts

export interface TaskWorkDirConfig {
  path?: string;           // 自定义路径，不指定则使用默认
  basePath?: string;       // 默认: 'workspace'
  template?: 'default' | 'minimal' | 'custom';
  customDirs?: string[];
  preserve?: boolean;       // 任务完成后保留目录
}

export interface TaskInput {
  variables?: Record<string, any>;
  stepConfig?: Record<string, any>;
  stepOutputs?: Record<string, any>;

  // 新增: 工作目录配置
  workDir?: TaskWorkDirConfig;
  workDirState?: WorkDirState;  // 已创建的工作目录状态
}
```

### 2. 修改 TaskManager

```typescript
// src/core/task-manager.ts

import { WorkDirManager, type WorkDirState } from './work-dir-manager.js';

export class TaskManager {
  private workDirManager: WorkDirManager;

  constructor(eventSystem: EventSystem) {
    // ...
    this.workDirManager = new WorkDirManager();
  }

  createTask(params: {
    // ... 现有参数
    input?: {
      workDir?: {
        path?: string;
        basePath?: string;
        template?: 'default' | 'minimal' | 'custom';
        customDirs?: string[];
        preserve?: boolean;
      };
      // ... 其他现有字段
    };
  }): Task {
    const task: Task = {
      id: uuidv4(),
      // ... 其他字段
    };

    // 集成: 自动创建工作目录
    if (params.input?.workDir) {
      const workDirState = this.workDirManager.createWorkDir({
        taskId: task.id,
        customPath: params.input.workDir.path,
        basePath: params.input.workDir.basePath || 'workspace',
        template: params.input.workDir.template || 'default',
        customDirs: params.input.workDir.customDirs,
        preserve: params.input.workDir.preserve,
      });

      task.input = task.input || {};
      task.input.workDirState = {
        rootPath: workDirState.rootPath,
        structure: workDirState.structure,
        createdAt: workDirState.createdAt,
      };
    }

    this.tasks.set(task.id, task);
    this.emit('task:created', { event: 'task:created', timestamp: new Date(), data: { task } });

    return task;
  }
}
```

### 3. 修改 ProjectAgent

```typescript
// src/core/project-agent.ts

// 在需要创建任务的地方传入 workDir 配置
const task = this.taskManager.createTask({
  title: '开发任务',
  assignedRole: 'developer',
  input: {
    workDir: {
      basePath: 'workspace',
      template: 'default',
    },
    // ... 其他输入
  },
});
```

## 验收标准

- [ ] `TaskManager.createTask()` 自动调用 `workDirManager.createWorkDir()`
- [ ] 任务 input.workDirState 包含正确的工作目录信息
- [ ] 支持自定义 workDir.path
- [ ] 支持自定义 basePath、template 等配置
- [ ] 单元测试验证创建流程
- [ ] 集成测试验证完整流程

## 测试用例

```typescript
// tests/integration/workdir-task-creation.test.ts

describe('WorkDir Task Creation Integration', () => {
  it('should create work dir when task is created', () => {
    const task = taskManager.createTask({
      title: 'Test Task',
      input: {
        workDir: { basePath: 'workspace' },
      },
    });

    expect(task.input.workDirState).toBeDefined();
    expect(task.input.workDirState.rootPath).toContain('workspace/');
    expect(task.input.workDirState.rootPath).toContain(task.id);
  });

  it('should create custom path work dir', () => {
    const task = taskManager.createTask({
      title: 'Custom Path Task',
      input: {
        workDir: { path: './my-custom-path' },
      },
    });

    expect(task.input.workDirState.rootPath).toBe('./my-custom-path');
  });

  it('should not create work dir when not configured', () => {
    const task = taskManager.createTask({
      title: 'No WorkDir Task',
    });

    expect(task.input.workDirState).toBeUndefined();
  });
});
```

## 依赖

- TASK-001: WorkDirManager 核心组件 (必须先完成)

## 预估工时

2h

## 状态

⏳ 待执行
