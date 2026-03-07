# 任务分解引擎使用指南
# Task Decomposition Engine Guide

> 复杂任务自动拆分子任务 | Automatically decompose complex tasks

---

## 概述 | Overview

任务分解引擎（Task Decomposition Engine）是 AgentOS 的核心组件之一，负责将复杂用户需求拆分为可执行的子任务列表。

The Task Decomposition Engine is one of AgentOS's core components, responsible for breaking down complex user requirements into executable subtask lists.

### 核心功能 | Core Features

- **智能拆分** - 分析任务复杂度，自动拆分为子任务
- **依赖管理** - 分析子任务间的依赖关系
- **并行优化** - 识别可并行执行的任务
- **动态调整** - 根据执行状态动态调整任务计划

---

## 架构 | Architecture

```
用户需求
    │
    ▼
┌─────────────────┐
│  TaskOrchestrator │
│   (任务编排器)    │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌──────────┐
│ 角色分配 │ │ 任务拆分  │
└────┬───┘ └────┬────┘
     │          │
     └────┬─────┘
          │
          ▼
    ┌───────────┐
    │TaskManager │
    │ (执行器)   │
    └───────────┘
```

---

## 使用方法 | Usage

### 1. 基本任务拆分 | Basic Task Decomposition

```typescript
import { TaskOrchestrator } from './core/task-orchestrator.js';
import { ProjectAgent } from './core/project-agent.js';

const agent = new ProjectAgent({
  projectName: 'my-project',
  projectPath: './src',
});

await agent.loadConfig();
const orchestrator = new TaskOrchestrator(agent);

// 处理复杂需求
const result = await orchestrator.processUserInput(
  "实现一个电商系统，包括用户模块、商品模块、订单模块、支付模块"
);

console.log('创建的任务:', result.task.title);
console.log('分配的角色:', result.task.assignedRole);
```

### 2. 使用任务管理器 | Using TaskManager

```typescript
import { TaskManager } from './core/task-manager.js';
import { ToolRegistry } from './tools/tool-registry.js';

// 创建任务管理器
const toolRegistry = new ToolRegistry();
const taskManager = new TaskManager(projectConfig, toolRegistry);

// 创建带子任务的主任务
const mainTask = taskManager.createTask({
  title: '电商系统开发',
  description: '实现完整电商系统',
  priority: 'high',
  subtasks: [
    {
      title: '用户模块',
      description: '实现用户注册登录',
      assignedRole: 'developer',
    },
    {
      title: '商品模块',
      description: '实现商品管理',
      assignedRole: 'developer',
    },
    {
      title: '订单模块',
      description: '实现订单处理',
      assignedRole: 'developer',
    },
  ],
});

// 执行任务
await taskManager.executeTask(mainTask.id);
```

---

## 任务类型 | Task Types

| 类型 | 描述 | Description |
|------|------|-------------|
| `requirement-analysis` | 需求分析 | Requirement analysis |
| `architecture-design` | 架构设计 | Architecture design |
| `development` | 开发实现 | Development |
| `testing` | 测试验证 | Testing |
| `documentation` | 文档编写 | Documentation |
| `code-review` | 代码审查 | Code review |
| `custom` | 自定义任务 | Custom task |

---

## 任务状态 | Task Status

```
pending → in-progress → completed
              ↓
            failed
              ↓
           blocked
```

| 状态 | 描述 |
|------|------|
| `pending` | 等待执行 |
| `in-progress` | 执行中 |
| `completed` | 已完成 |
| `failed` | 执行失败 |
| `blocked` | 被阻塞 |

---

## 高级功能 | Advanced Features

### 任务依赖 | Task Dependencies

```typescript
const task = taskManager.createTask({
  title: '多模块开发',
  description: '并行开发多个模块',
  dependencies: ['task-id-1', 'task-id-2'],  // 依赖的任务ID
});
```

### 任务约束 | Task Constraints

```typescript
const task = taskManager.createTask({
  title: '限时任务',
  description: '需要在规定时间内完成',
  constraints: {
    maxRetries: 3,
    timeout: 300000,  // 5分钟超时
    blocking: true,
  },
});
```

### 任务事件监听 | Task Event Listening

```typescript
// 监听任务状态变化
taskManager.on('task:status-changed', (task, oldStatus, newStatus) => {
  console.log(`任务 ${task.title}: ${oldStatus} → ${newStatus}`);
});

// 监听任务完成
taskManager.on('task:completed', (task) => {
  console.log(`✅ 任务完成: ${task.title}`);
});

// 监听任务失败
taskManager.on('task:failed', (task, error) => {
  console.error(`❌ 任务失败: ${task.title}`, error);
});
```

---

## 任务匹配 | Task Matching

任务匹配器（TaskMatcher）用于判断新输入是否属于已有任务：

```typescript
import { TaskMatcher } from './core/task-matcher.js';

const matcher = new TaskMatcher(agent);

// 检查输入是否匹配已有任务
const result = await matcher.matchTask(userInput, existingTasks);

if (result.matched) {
  console.log(`匹配到任务: ${result.taskId}`);
  console.log(`匹配度: ${result.confidence}`);
} else {
  console.log('创建新任务');
}
```

---

## 配置 | Configuration

### 任务拆分配置

```typescript
const config = {
  taskDecomposition: {
    // 最大子任务数量
    maxSubtasks: 10,
    // 是否自动并行化
    autoParallelize: true,
    // 任务复杂度阈值
    complexityThreshold: 5,
    // 是否需要项目经理审批
    requirePmApproval: false,
  },
};
```

---

## 最佳实践 | Best Practices

### 1. 合理设置任务粒度

```typescript
// ❌ 粒度太粗
const badTask = taskManager.createTask({
  title: '开发整个系统',
  description: '实现所有功能',
});

// ✅ 粒度适中
const goodTask = taskManager.createTask({
  title: '用户模块开发',
  description: '实现用户注册、登录、个人中心',
  subtasks: [
    { title: '用户注册', ... },
    { title: '用户登录', ... },
    { title: '个人中心', ... },
  ],
});
```

### 2. 正确设置依赖

```typescript
// 正确的依赖顺序
const tasks = [
  taskManager.createTask({ title: '数据库设计', ... }),
  taskManager.createTask({ 
    title: '后端开发', 
    dependencies: ['db-design-task-id'],  // 依赖数据库设计
    ... 
  }),
  taskManager.createTask({ 
    title: '前端开发', 
    dependencies: ['backend-task-id'],  // 依赖后端API
    ... 
  }),
];
```

### 3. 使用优先级管理

```typescript
// 根据业务重要性设置优先级
taskManager.createTask({
  title: '核心功能',
  priority: 'critical',  // 关键任务
});

taskManager.createTask({
  title: '优化功能',
  priority: 'low',  // 低优先级
});
```

---

## 故障排除 | Troubleshooting

### 任务卡住不动

```typescript
// 检查任务状态
const task = taskManager.getTask(taskId);
console.log(task.status);

// 手动重置任务
taskManager.updateTaskStatus(taskId, 'pending');
```

### 任务执行失败

```typescript
// 获取错误信息
taskManager.on('task:failed', (task, error) => {
  console.error('失败原因:', error.message);
  // 建议重试或调整任务
});
```

---

## 相关文档 | Related Docs

- [API 文档 - TaskOrchestrator](api/task-orchestrator.md)
- [架构文档 - Agent 通信总线](architecture/agent-bus.md)
- [README](../README.md)
