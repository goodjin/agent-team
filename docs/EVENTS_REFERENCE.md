# 事件参考

Project Agent 提供了丰富的事件系统，用于监控任务执行、系统状态变化、工具调用等。本文档详细描述所有支持的事件类型、数据结构和使用方法。

## 目录

- [事件分类](#事件分类)
- [任务事件](#任务事件)
- [工作流事件](#工作流事件)
- [工具事件](#工具事件)
- [项目分析事件](#项目分析事件)
- [系统事件](#系统事件)
- [使用示例](#使用示例)
- [事件过滤](#事件过滤)

---

## 事件分类

Project Agent 的事件系统包含 18 种事件类型，分为以下几类：

| 分类 | 数量 | 说明 |
|------|------|------|
| 任务事件 | 6 | 跟踪任务的完整生命周期 |
| 工作流事件 | 3 | 跟踪工作流的执行过程 |
| 工具事件 | 6 | 跟踪工具的注册和执行 |
| 项目分析事件 | 2 | 跟踪项目分析过程 |
| 系统事件 | 1 | 系统级错误事件 |

---

## 任务事件

任务事件跟踪任务的完整生命周期，从创建到完成或失败。

### task:created

**触发时机**: 任务创建时

**事件数据**:

```typescript
{
  event: 'task:created';
  timestamp: Date;
  data: {
    task: Task;
  };
}
```

**Task 结构**:

```typescript
interface Task {
  id: string;                  // 任务唯一标识
  type: string;                // 任务类型
  title: string;               // 任务标题
  description: string;         // 任务描述
  status: TaskStatus;          // 任务状态
  priority: Priority;          // 优先级
  assignedRole?: string;       // 分配的角色 ID
  dependencies?: string[];     // 依赖的任务 ID
  createdAt: Date;             // 创建时间
  updatedAt: Date;             // 更新时间
}
```

**TaskStatus 类型**:

```typescript
type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'blocked' | 'deleted';
```

---

### task:started

**触发时机**: 任务开始执行时（状态变为 in-progress）

**事件数据**:

```typescript
{
  event: 'task:started';
  timestamp: Date;
  data: {
    task: Task;
  };
}
```

---

### task:completed

**触发时机**: 任务成功完成时（状态变为 completed）

**事件数据**:

```typescript
{
  event: 'task:completed';
  timestamp: Date;
  data: {
    task: Task;
    result: ToolResult;
    duration: number;  // 执行时间（毫秒）
  };
}
```

---

### task:failed

**触发时机**: 任务执行失败时（状态变为 failed）

**事件数据**:

```typescript
{
  event: 'task:failed';
  timestamp: Date;
  data: {
    task: Task;
    result: ToolResult;
    error: string;  // 错误信息
  };
}
```

---

### task:blocked

**触发时机**: 任务因依赖未满足被阻塞时（状态变为 blocked）

**事件数据**:

```typescript
{
  event: 'task:blocked';
  timestamp: Date;
  data: {
    task: Task;
    blockingDependencies: string[];  // 阻塞的依赖任务 ID
  };
}
```

---

### task:deleted

**触发时机**: 任务被删除时

**事件数据**:

```typescript
{
  event: 'task:deleted';
  timestamp: Date;
  data: {
    taskId: string;  // 被删除的任务 ID
  };
}
```

---

## 工作流事件

工作流事件跟踪工作流的执行过程。

### workflow:started

**触发时机**: 工作流开始执行时

**事件数据**:

```typescript
{
  event: 'workflow:started';
  timestamp: Date;
  data: {
    workflowId: string;
    workflow: Workflow;
    stepCount: number;  // 步骤数量
  };
}
```

**Workflow 结构**:

```typescript
interface Workflow {
  id: string;              // 工作流唯一标识
  name: string;            // 工作流名称
  description: string;     // 工作流描述
  steps: WorkflowStep[];   // 工作流步骤
}
```

**WorkflowStep 结构**:

```typescript
interface WorkflowStep {
  id: string;              // 步骤 ID
  name: string;            // 步骤名称
  role: string;            // 执行角色
  taskType: string;        // 任务类型
  dependencies?: string[]; // 依赖的步骤 ID
}
```

---

### workflow:completed

**触发时机**: 工作流所有步骤都成功完成时

**事件数据**:

```typescript
{
  event: 'workflow:completed';
  timestamp: Date;
  data: {
    workflowId: string;
    results: ToolResult[];  // 所有步骤的执行结果
    duration: number;       // 总执行时间（毫秒）
  };
}
```

---

### workflow:failed

**触发时机**: 工作流执行失败时（某个步骤失败）

**事件数据**:

```typescript
{
  event: 'workflow:failed';
  timestamp: Date;
  data: {
    workflowId: string;
    failedStep: string;     // 失败的步骤 ID
    error: string;          // 错误信息
    completedSteps: number; // 已完成的步骤数
    results: ToolResult[];  // 已完成的步骤结果
  };
}
```

---

## 工具事件

工具事件跟踪工具的注册和执行过程。

### tool:registered

**触发时机**: 工具注册到注册表时

**事件数据**:

```typescript
{
  event: 'tool:registered';
  timestamp: Date;
  data: {
    name: string;
    category: string;
  };
}
```

---

### tool:unregistered

**触发时机**: 工具从注册表注销时

**事件数据**:

```typescript
{
  event: 'tool:unregistered';
  timestamp: Date;
  data: {
    name: string;
  };
}
```

---

### tool:before-execute

**触发时机**: 工具执行前

**事件数据**:

```typescript
{
  event: 'tool:before-execute';
  timestamp: Date;
  data: {
    name: string;     // 工具名称
    params: any;      // 执行参数
  };
}
```

---

### tool:after-execute

**触发时机**: 工具执行成功后

**事件数据**:

```typescript
{
  event: 'tool:after-execute';
  timestamp: Date;
  data: {
    name: string;           // 工具名称
    params: any;            // 执行参数
    result: ToolResult;     // 执行结果
  };
}
```

**ToolResult 结构**:

```typescript
interface ToolResult<T = any> {
  success: boolean;                // 是否成功
  data?: T;                        // 返回数据
  error?: string;                  // 错误信息
  metadata?: Record<string, any>;  // 元数据
}
```

---

### tool:error

**触发时机**: 工具执行出错时

**事件数据**:

```typescript
{
  event: 'tool:error';
  timestamp: Date;
  data: {
    name: string;     // 工具名称
    params: any;      // 执行参数
    error: string;    // 错误信息
  };
}
```

---

### tool:executed

**触发时机**: 工具执行完成后（成功或失败）

**注意**: 此事件在类型定义中存在，但当前版本中未实际触发，仅通过事件转发机制注册。

**事件数据**:

```typescript
{
  event: 'tool:executed';
  timestamp: Date;
  data: {
    name: string;           // 工具名称
    params: any;            // 执行参数
    result: ToolResult;     // 执行结果
  };
}
```

---

## 项目分析事件

项目分析事件跟踪项目分析的开始和完成。

### project:analysis:started

**触发时机**: 项目分析开始时

**事件数据**:

```typescript
{
  event: 'project:analysis:started';
  timestamp: Date;
  data: {
    projectPath: string;  // 项目路径
  };
}
```

---

### project:analysis:completed

**触发时机**: 项目分析完成时

**事件数据**:

```typescript
{
  event: 'project:analysis:completed';
  timestamp: Date;
  data: {
    analysis: ProjectAnalysis;
  };
}
```

**ProjectAnalysis 结构**:

```typescript
interface ProjectAnalysis {
  projectPath: string;
  structure: ProjectStructure;
  technologies: string[];
  buildSystem: string;
  testingFramework?: string;
  language: string;
}
```

---

## 系统事件

### error

**触发时机**: 系统发生错误时

**事件数据**:

```typescript
{
  event: 'error';
  timestamp: Date;
  data: {
    source: string;                    // 错误来源
    error: string;                     // 错误信息
    errorCode?: string;                // 错误代码
    context?: Record<string, any>;     // 错误上下文
  };
}
```

---

## 使用示例

### 监听所有任务事件

```typescript
const agent = new ProjectAgent({
  projectName: 'my-project',
  projectPath: process.cwd(),
});

// 监听任务创建
agent.on('task:created', (data) => {
  console.log(`[任务创建] ${data.data.task.title}`);
});

// 监听任务开始
agent.on('task:started', (data) => {
  console.log(`[任务开始] ${data.data.task.title}`);
});

// 监听任务完成
agent.on('task:completed', (data) => {
  console.log(`[任务完成] ${data.data.task.title}`);
  console.log(`  耗时: ${data.data.duration}ms`);
});

// 监听任务失败
agent.on('task:failed', (data) => {
  console.error(`[任务失败] ${data.data.task.title}`);
  console.error(`  错误: ${data.data.error}`);
});

// 监听任务阻塞
agent.on('task:blocked', (data) => {
  console.warn(`[任务阻塞] ${data.data.task.title}`);
  console.warn(`  等待依赖: ${data.data.blockingDependencies.join(', ')}`);
});
```

### 监听工具执行

```typescript
// 监听工具执行前
agent.on('tool:before-execute', (data) => {
  console.log(`[工具调用] ${data.data.name}`);
  console.log(`  参数: ${JSON.stringify(data.data.params)}`);
});

// 监听工具执行后
agent.on('tool:after-execute', (data) => {
  const status = data.data.result.success ? '成功' : '失败';
  console.log(`[工具完成] ${data.data.name} - ${status}`);
});

// 监听工具错误
agent.on('tool:error', (data) => {
  console.error(`[工具错误] ${data.data.name}`);
  console.error(`  错误: ${data.data.error}`);
});
```

### 监听工作流事件

```typescript
agent.on('workflow:started', (data) => {
  console.log(`[工作流开始] ${data.data.workflow.name}`);
  console.log(`  步骤数: ${data.data.stepCount}`);
});

agent.on('workflow:completed', (data) => {
  console.log(`[工作流完成] ${data.data.workflowId}`);
  console.log(`  总耗时: ${data.data.duration}ms`);
});

agent.on('workflow:failed', (data) => {
  console.error(`[工作流失败] ${data.data.workflowId}`);
  console.error(`  失败步骤: ${data.data.failedStep}`);
  console.error(`  错误: ${data.data.error}`);
});
```

### 创建事件日志

```typescript
const eventLog: AgentEventData[] = [];

// 监听所有事件
agent.on('*', (data) => {
  eventLog.push(data);
});

// 监听错误事件用于统一处理
agent.on('error', (data) => {
  console.error(`[系统错误] ${data.data.source}`);
  console.error(`  错误: ${data.data.error}`);
});

// 任务完成后输出摘要
agent.on('task:completed', (data) => {
  const summary = {
    task: data.data.task.title,
    role: data.data.task.assignedRole,
    type: data.data.task.type,
    duration: data.data.duration,
    status: 'completed',
  };
  console.log('任务摘要:', JSON.stringify(summary, null, 2));
});
```

### 使用事件构建进度追踪器

```typescript
class ProgressTracker {
  private totalTasks: number = 0;
  private completedTasks: number = 0;
  private currentTask: string = '';
  private startTime: Date;

  constructor(agent: ProjectAgent) {
    this.startTime = new Date();

    agent.on('task:created', (data) => {
      this.totalTasks++;
      console.log(`[进度] 任务已创建: ${data.data.task.title} (${this.completedTasks}/${this.totalTasks})`);
    });

    agent.on('task:started', (data) => {
      this.currentTask = data.data.task.title;
      console.log(`[进度] 开始执行: ${this.currentTask}`);
    });

    agent.on('task:completed', (data) => {
      this.completedTasks++;
      const progress = Math.round((this.completedTasks / this.totalTasks) * 100);
      console.log(`[进度] 完成: ${data.data.task.title} (${progress}%)`);
    });

    agent.on('task:failed', (data) => {
      console.error(`[进度] 失败: ${data.data.task.title}`);
    });

    agent.on('workflow:completed', (data) => {
      const duration = Date.now() - this.startTime.getTime();
      console.log(`[进度] 工作流完成！总耗时: ${duration}ms`);
    });
  }
}

// 使用
const tracker = new ProgressTracker(agent);
```

---

## 事件过滤

### 监听特定事件

```typescript
// 只监听任务完成事件
agent.on('task:completed', handler);

// 只监听工具执行事件
agent.on('tool:executed', handler);

// 只监听错误事件
agent.on('error', handler);
```

### 监听多个事件

```typescript
const taskEvents = ['task:created', 'task:started', 'task:completed', 'task:failed'];
taskEvents.forEach(event => {
  agent.on(event, (data) => {
    console.log(`[${event}] ${data.data.task.title}`);
  });
});
```

### 监听所有事件

```typescript
// 使用通配符监听所有事件
agent.on('*', (data) => {
  console.log(`[事件] ${data.event} - ${new Date(data.timestamp).toISOString()}`);
});
```

### 移除事件监听器

```typescript
const handler = (data: AgentEventData) => {
  console.log(data.event);
};

// 添加监听器
agent.on('task:completed', handler);

// 移除监听器
agent.off('task:completed', handler);
```

---

## 事件触发位置参考

| 事件名称 | 触发组件 | 源文件位置 |
|---------|---------|-----------|
| task:* | TaskManager | src/core/task-manager.ts |
| workflow:* | ProjectAgent | src/core/project-agent.ts |
| tool:registered/unregistered | ToolRegistry | src/tools/tool-registry.ts |
| tool:before/after/execute | ToolRegistry | src/tools/tool-registry.ts |
| project:analysis:* | ProjectAgent | src/core/project-agent.ts |
| error | TaskManager / ProjectAgent | src/core/task-manager.ts, src/core/project-agent.ts |
