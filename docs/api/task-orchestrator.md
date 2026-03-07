# TaskOrchestrator API 参考 | API Reference

> 任务编排器 - 负责智能任务分配与拆分
> Task Orchestrator - Intelligent task assignment and decomposition

## 概述 | Overview

`TaskOrchestrator` 是 AgentOS 的核心组件，负责：
- 判断用户输入是否属于已有任务
- 智能分配执行角色
- 复杂任务自动拆分

`TaskOrchestrator` is a core AgentOS component responsible for:
- Determining if user input belongs to existing tasks
- Intelligent role assignment
- Complex task decomposition

---

## 类 | Class

### TaskOrchestrator

```typescript
import { TaskOrchestrator } from './core/task-orchestrator.js';
```

#### 构造函数 | Constructor

```typescript
constructor(agent: ProjectAgent)
```

| 参数 | 类型 | 描述 | Description |
|------|------|------|-------------|
| agent | `ProjectAgent` | 项目智能体实例 | Project agent instance |

---

## 方法 | Methods

### processUserInput

处理用户输入，判断是否属于已有任务或创建新任务。

Process user input, determine if it belongs to an existing task or create a new one.

```typescript
async processUserInput(userInput: string): Promise<{
  task: Task;
  isNew: boolean;
  matchResult?: TaskMatchResult;
}>
```

**参数 | Parameters:**

| 参数 | 类型 | 描述 |
|------|------|------|
| userInput | `string` | 用户输入的自然语言任务描述 |

**返回 | Returns:**

```typescript
{
  task: Task;           // 匹配或创建的任务
  isNew: boolean;       // 是否为新任务
  matchResult?: TaskMatchResult;  // 任务匹配结果
}
```

**示例 | Example:**

```typescript
const orchestrator = new TaskOrchestrator(projectAgent);

const result = await orchestrator.processUserInput(
  "请帮我实现用户登录功能"
);

console.log(`任务: ${result.task.title}`);
console.log(`是否为新任务: ${result.isNew}`);
```

---

### assignRole (私有方法)

智能分配执行角色 | Intelligently assign execution role

```typescript
private async assignRole(userInput: string): Promise<{
  role: RoleType;
  needsProjectManager: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
}>
```

**参数 | Parameters:**

| 参数 | 类型 | 描述 |
|------|------|------|
| userInput | `string` | 用户需求描述 |

**返回 | Returns:**

```typescript
{
  role: RoleType;                    // 分配的角色
  needsProjectManager: boolean;      // 是否需要项目经理拆分
  priority: 'low'|'medium'|'high'|'critical'  // 任务优先级
}
```

**支持的角色 | Supported Roles:**

- `product-manager` - 产品经理
- `architect` - 架构师  
- `developer` - 开发者
- `tester` - 测试工程师
- `doc-writer` - 文档编写者

---

## 使用示例 | Usage Examples

### 完整示例 | Full Example

```typescript
import { ProjectAgent } from './core/project-agent.js';
import { TaskOrchestrator } from './core/task-orchestrator.js';

// 初始化项目智能体
const agent = new ProjectAgent({
  projectName: 'my-project',
  projectPath: '/path/to/project',
});
await agent.loadConfig();

// 创建任务编排器
const orchestrator = new TaskOrchestrator(agent);

// 处理用户输入
const result = await orchestrator.processUserInput(
  "实现一个用户注册功能，需要邮箱验证"
);

if (result.isNew) {
  console.log(`✅ 创建新任务: ${result.task.title}`);
  console.log(`📋 分配角色: ${result.task.assignedRole}`);
  console.log(`⭐ 优先级: ${result.task.priority}`);
} else {
  console.log(`📝 添加到现有任务: ${result.task.title}`);
}
```

### 与 TaskManager 集成 | Integration with TaskManager

```typescript
const orchestrator = new TaskOrchestrator(agent);

// 创建任务
const { task, isNew } = await orchestrator.processUserInput(
  "开发订单管理模块"
);

// 获取任务管理器执行任务
const taskManager = agent.getTaskManager();
await taskManager.executeTask(task.id);

// 监听任务事件
taskManager.on('task:completed', (task) => {
  console.log(`任务完成: ${task.title}`);
});
```

---

## 错误处理 | Error Handling

```typescript
try {
  const result = await orchestrator.processUserInput(input);
} catch (error) {
  if (error instanceof Error) {
    console.error(`错误: ${error.message}`);
  }
}
```

---

## 相关类型 | Related Types

| 类型 | 描述 |
|------|------|
| `Task` | 任务对象 |
| `TaskMatchResult` | 任务匹配结果 |
| `RoleType` | 角色类型 |
| `Priority` | 优先级 |
