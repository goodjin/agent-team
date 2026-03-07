# Agent 通信总线架构
# Agent Communication Bus Architecture

> 多智能体协作的核心通信基础设施 | Core communication infrastructure for multi-agent collaboration

---

## 概述 | Overview

Agent 通信总线（Agent Communication Bus, ACB）是 AgentOS 的消息传递基础设施，支持多个 Agent 之间的异步通信、事件分发和状态同步。

Agent Communication Bus (ACB) is AgentOS's message passing infrastructure, supporting asynchronous communication, event distribution, and state synchronization between multiple agents.

### 设计目标 | Design Goals

- **松耦合** - Agent 之间无需直接引用
- **异步通信** - 支持非阻塞消息传递
- **可扩展** - 易于添加新的通信模式
- **可靠性** - 消息可靠传递与确认

---

## 架构设计 | Architecture

### 整体架构 | Overall Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AgentOS Platform                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │  Agent  │  │  Agent  │  │  Agent  │  │  Agent  │       │
│  │    A    │  │    B    │  │    C    │  │    D    │       │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘       │
│       │            │            │            │              │
│       └────────────┴────────────┴────────────┘              │
│                          │                                   │
│              ┌───────────┴───────────┐                     │
│              │   Agent Communication │                     │
│              │         Bus (ACB)      │                     │
│              └───────────┬───────────┘                     │
│                          │                                   │
│       ┌──────────────────┼──────────────────┐               │
│       │                  │                  │               │
│  ┌────┴────┐       ┌─────┴────┐       ┌─────┴────┐         │
│  │ Message │       │  Event   │       │ Context  │         │
│  │ Queue   │       │  Bus     │       │ Manager  │         │
│  └─────────┘       └──────────┘       └──────────┘         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 核心组件 | Core Components

| 组件 | 职责 | Responsibility |
|------|------|----------------|
| `MessageRouter` | 消息路由 | Message routing |
| `EventEmitter` | 事件分发 | Event distribution |
| `ContextManager` | 上下文管理 | Context management |
| `AgentRegistry` | Agent 注册 | Agent registration |

---

## 消息模式 | Message Patterns

### 1. 发布/订阅 | Pub/Sub

```typescript
// Agent A 发布消息
await agentBus.publish('task:completed', {
  taskId: 'task-123',
  result: 'success',
});

// Agent B 订阅消息
agentBus.subscribe('task:completed', (message) => {
  console.log('任务完成:', message.payload.taskId);
});
```

### 2. 请求/响应 | Request/Response

```typescript
// Agent A 发送请求
const response = await agentBus.request('agent:B', {
  type: 'get-status',
  payload: {},
}, { timeout: 5000 });

console.log('响应:', response);
```

### 3. 广播 | Broadcast

```typescript
// 广播消息给所有 Agent
await agentBus.broadcast({
  type: 'system:shutdown',
  payload: { reason: 'maintenance' },
});
```

---

## 消息格式 | Message Format

### 基础消息结构

```typescript
interface AgentMessage {
  id: string;              // 消息唯一ID
  type: string;           // 消息类型
  source: string;         // 发送方 Agent ID
  target?: string;        // 目标 Agent ID (可选)
  payload: any;           // 消息内容
  timestamp: number;     // 时间戳
  metadata?: {
    correlationId?: string;  // 关联ID
    replyTo?: string;        // 响应地址
    priority?: 'low' | 'normal' | 'high';
  };
}
```

### 消息类型 | Message Types

| 类型 | 描述 | 方向 |
|------|------|------|
| `task:created` | 任务创建 | Pub/Sub |
| `task:assigned` | 任务分配 | Pub/Sub |
| `task:completed` | 任务完成 | Pub/Sub |
| `task:failed` | 任务失败 | Pub/Sub |
| `context:shared` | 上下文共享 | Pub/Sub |
| `agent:status` | Agent 状态 | Request/Response |
| `system:shutdown` | 系统关闭 | Broadcast |

---

## 事件系统 | Event System

### 事件类型 | Event Types

```typescript
// 任务生命周期事件
'task:created'      // 任务创建
'task:assigned'    // 任务分配
'task:started'     // 任务开始
'task:progress'    // 任务进度
'task:completed'   // 任务完成
'task:failed'      // 任务失败

// Agent 生命周期事件
'agent:registered'    // Agent 注册
'agent:unregistered' // Agent 注销
'agent:online'       // Agent 上线
'agent:offline'     // Agent 下线
'agent:error'       // Agent 错误

// 系统事件
'system:ready'      // 系统就绪
'system:shutdown'   // 系统关闭
```

### 使用示例 | Usage Example

```typescript
import { EventEmitter } from 'eventemitter3';

// 创建事件总线
const eventBus = new EventEmitter();

// 监听任务完成事件
eventBus.on('task:completed', (task) => {
  console.log(`✅ 任务 ${task.title} 已完成`);
  
  // 触发下一个任务
  triggerNextTask(task.id);
});

// 监听 Agent 状态变化
eventBus.on('agent:status', (agent, status) => {
  console.log(`Agent ${agent.name} 状态: ${status}`);
});

// 触发事件
eventBus.emit('task:completed', {
  id: 'task-123',
  title: '开发用户模块',
});
```

---

## 上下文管理 | Context Management

### 共享上下文 | Shared Context

```typescript
import { ContextManager } from './core/context-manager.js';

const contextManager = new ContextManager();

// 设置共享上下文
await contextManager.set('project:metadata', {
  name: 'my-project',
  version: '1.0.0',
  agents: ['agent-A', 'agent-B'],
});

// 获取共享上下文
const metadata = await contextManager.get('project:metadata');

// Agent 间共享数据
await contextManager.share('agent:A', 'agent:B', {
  type: 'task-context',
  data: { taskId: 'task-123', progress: 50 },
});
```

### 上下文作用域 | Context Scopes

```typescript
// 项目级上下文 (所有 Agent 共享)
project scope: 'project:*'

// 任务级上下文 (任务相关 Agent 共享)
task scope: 'task:{taskId}:*'

// Agent 级上下文 (特定 Agent 私有)
agent scope: 'agent:{agentId}:*'
```

---

## Agent 注册与发现 | Agent Registry & Discovery

### 注册 Agent

```typescript
import { AgentRegistry } from './core/agent-registry.js';

const registry = new AgentRegistry();

// 注册 Agent
await registry.register({
  id: 'developer-001',
  name: 'Developer Agent',
  capabilities: ['code-generation', 'code-review', 'refactoring'],
  status: 'online',
  metadata: {
    specialization: 'frontend',
    language: 'typescript',
  },
});
```

### 发现 Agent

```typescript
// 按能力查找
const developers = await registry.findByCapability('code-generation');

// 按状态查找
const onlineAgents = await registry.findByStatus('online');

// 按类型查找
const testers = await registry.findByType('tester');
```

---

## 可靠性机制 | Reliability

### 消息确认 | Message Acknowledgment

```typescript
await agentBus.publish('task:completed', payload, {
  requireAck: true,
  retryCount: 3,
  retryDelay: 1000,
});
```

### 消息持久化 | Message Persistence

```typescript
// 持久化消息队列
const agentBus = new AgentBus({
  persistence: {
    enabled: true,
    storage: 'redis',
    ttl: 86400,  // 24小时
  },
});
```

### 死信处理 | Dead Letter Handling

```typescript
agentBus.on('message:failed', (message, error) => {
  console.error('消息处理失败:', error.message);
  // 重试或记录到死信队列
});
```

---

## 性能优化 | Performance

### 消息批处理 | Message Batching

```typescript
const agentBus = new AgentBus({
  batching: {
    enabled: true,
    batchSize: 100,
    batchTimeout: 100,  // ms
  },
});
```

### 流量控制 | Flow Control

```typescript
const agentBus = new AgentBus({
  rateLimit: {
    maxMessagesPerSecond: 1000,
    maxPerAgent: 100,
  },
});
```

---

## 监控与调试 | Monitoring & Debugging

### 消息追踪 | Message Tracing

```typescript
agentBus.on('message:*', (message) => {
  console.log(`[${message.timestamp}] ${message.source} → ${message.target}: ${message.type}`);
});
```

### 性能指标 | Metrics

```typescript
const metrics = agentBus.getMetrics();
console.log({
  messagesSent: metrics.messagesSent,
  messagesReceived: metrics.messagesReceived,
  avgLatency: metrics.avgLatency,
  errorRate: metrics.errorRate,
});
```

---

## 完整示例 | Complete Example

```typescript
import { AgentBus } from './core/agent-bus.js';
import { ContextManager } from './core/context-manager.js';
import { AgentRegistry } from './core/agent-registry.js';

// 初始化
const agentBus = new AgentBus();
const contextManager = new ContextManager();
const registry = new AgentRegistry();

// 注册 Agent
await registry.register({
  id: 'pm-agent',
  name: 'Product Manager',
  capabilities: ['requirement-analysis', 'task-planning'],
});

await registry.register({
  id: 'dev-agent',
  name: 'Developer',
  capabilities: ['code-generation', 'debugging'],
});

// 订阅事件
agentBus.subscribe('task:created', async (message) => {
  const { task } = message.payload;
  
  // 根据任务类型分配 Agent
  const agent = await registry.findByCapability(task.requiredCapability)[0];
  
  // 分配任务
  await agentBus.publish('task:assigned', {
    taskId: task.id,
    agentId: agent.id,
  });
});

// 发布任务
await agentBus.publish('task:created', {
  id: 'task-001',
  title: '实现用户登录',
  requiredCapability: 'code-generation',
});
```

---

## 相关文档 | Related Docs

- [使用指南 - 任务分解引擎](guides/task-decomposition.md)
- [API 文档 - TaskOrchestrator](api/task-orchestrator.md)
- [README](../README.md)
