# AgentOS 架构设计文档

> 版本: 1.0.0
> 日期: 2026-03-06
> 设计者: 架构师 Agent

---

## 1. 概述

### 1.1 项目背景

当前系统是一个基于角色的多智能体项目管理系统 (Agent Team)，其核心能力包括：
- 任务管理与执行
- 角色系统 (Product Manager, Architect, Developer, Tester, Doc Writer)
- 工作流引擎
- LLM 多服务商支持

### 1.2 升级目标

打造 **AgentOS - 智能体团队协作操作系统**，实现：
- **任务自动分解**：复杂需求自动拆解为可执行子任务
- **Agent 通信**：多 Agent 之间的标准化通信机制
- **状态持久化**：任务、对话历史的长期存储
- **可扩展架构**：支持更多角色和自定义工作流

### 1.3 设计原则

1. **向后兼容**：不破坏现有 API，保持与现有代码的兼容性
2. **渐进式演进**：新架构逐步替换旧模块
3. **事件驱动**：组件之间通过事件总线解耦
4. **类型安全**：全面使用 TypeScript 类型系统

---

## 2. 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AgentOS Core                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌───────────┐ │
│  │   Client    │    │   HTTP/API   │    │   WebSocket │    │  CLI      │ │
│  │   Layer     │───▶│   Gateway    │───▶│   Server    │    │  Interface│ │
│  └─────────────┘    └──────────────┘    └─────────────┘    └───────────┘ │
│                              │                      │                      │
│                              ▼                      ▼                      │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                     Agent Communication Bus (ACB)                   │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │ │
│  │  │  Message  │  │   Topic    │  │   Agent    │  │  Pipeline  │    │ │
│  │  │  Router   │  │  Registry  │  │   Registry │  │   Engine   │    │ │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘    │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                  Task Decomposition Engine (TDE)                  │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │ │
│  │  │  Intent   │  │    Task    │  │   Task     │  │  Resource  │    │ │
│  │  │  Analyzer │  │  Decomposer│  │  Scheduler │  │  Estimator │    │ │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘    │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                          Existing Core Modules                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  ┌────────────────┐   │
│  │TaskManager   │  │WorkflowEngine│  │  RoleSystem │  │ EventSystem   │   │
│  │              │  │              │  │             │  │  (Enhanced)   │   │
│  └──────────────┘  └──────────────┘  └─────────────┘  └────────────────┘   │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  ┌────────────────┐   │
│  │ProjectAgent  │  │ToolRegistry │  │LLMService   │  │  Storage      │   │
│  │  (Enhanced)  │  │              │  │  Factory    │  │  Adapter      │   │
│  └──────────────┘  └──────────────┘  └─────────────┘  └────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心模块设计

### 3.1 Agent Communication Bus (ACB)

**目标**：实现 Agent 之间的标准化通信

#### 3.1.1 架构设计

```typescript
// 核心接口定义

// 消息类型
interface AgentMessage {
  id: string;
  type: MessageType;
  source: AgentId;
  target: AgentId | TopicName;
  payload: any;
  correlationId?: string;
  timestamp: Date;
  ttl?: number;  // 消息过期时间(毫秒)
  headers?: Record<string, string>;
}

type MessageType = 
  | 'request'      // 请求消息
  | 'response'     // 响应消息  
  | 'event'        // 事件通知
  | 'broadcast'    // 广播消息
  | 'heartbeat'    // 心跳检测
  | 'command';     // 命令消息

// Agent 标识
type AgentId = string;
type TopicName = string;

// 消息处理器
interface MessageHandler {
  (message: AgentMessage): Promise<void> | void;
}

// 通信总线接口
interface IAgentCommunicationBus {
  // 消息发送
  send(message: AgentMessage): Promise<void>;
  sendToAgent(target: AgentId, message: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<void>;
  publishToTopic(topic: TopicName, message: Omit<AgentMessage, 'id' | 'timestamp' | 'target'>): Promise<void>;
  
  // 订阅管理
  subscribeToAgent(agentId: AgentId, handler: MessageHandler): Subscription;
  subscribeToTopic(topic: TopicName, handler: MessageHandler): Subscription;
  unsubscribe(subscription: Subscription): void;
  
  // Agent 注册
  registerAgent(agent: Agent): void;
  unregisterAgent(agentId: AgentId): void;
  getAgent(agentId: AgentId): Agent | undefined;
  
  // 消息队列管理
  getQueueSize(agentId: AgentId): number;
  pauseQueue(agentId: AgentId): void;
  resumeQueue(agentId: AgentId): void;
}
```

#### 3.1.2 消息路由

```
                    ┌──────────────┐
                    │   Incoming   │
                    │    Queue     │
                    └──────┬───────┘
                           │
                           ▼
              ┌────────────────────────┐
              │     Message Router     │
              │  ┌──────────────────┐  │
              │  │  Route by Type   │  │
              │  │  - request       │  │
              │  │  - response      │  │
              │  │  - event        │  │
              │  │  - broadcast    │  │
              │  └──────────────────┘  │
              └───────────┬────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │  Agent   │    │  Topic   │    │  Dead    │
    │  Queue   │    │  Queue   │    │  Letter  │
    └──────────┘    └──────────┘    └──────────┘
```

#### 3.1.3 与现有代码的集成

```typescript
// 兼容性包装器
class EventSystemBridge {
  private bus: IAgentCommunicationBus;
  private eventSystem: EventSystem;
  
  // 将 EventSystem 事件转发到 ACB
  bridgeEvents(): void {
    const eventTypes: EventType[] = [
      'task.created', 'task.started', 'task.completed', 'task.failed',
      'agent.created', 'agent.stopped', 'agent.status.changed'
    ];
    
    for (const eventType of eventTypes) {
      this.eventSystem.on(eventType, (event: Event) => {
        this.bus.publishToTopic(`event:${eventType}`, {
          type: 'event',
          source: 'event-system',
          payload: event.data,
          correlationId: event.type,
        });
      });
    }
  }
  
  // 将 ACB 消息转发到 EventSystem
  bridgeToEventSystem(): void {
    this.bus.subscribeToTopic('system', (message) => {
      if (message.type === 'event') {
        this.eventSystem.emit(message.payload.type, message.payload.data);
      }
    });
  }
}
```

#### 3.1.4 技术风险评估

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 消息丢失 | 中 | 实现消息持久化和确认机制 |
| 循环依赖 | 低 | 消息头添加 traceId 防止回环 |
| 性能瓶颈 | 中 | 消息队列异步处理，支持背压 |
| 内存泄漏 | 低 | 订阅自动清理，超时释放 |

---

### 3.2 Task Decomposition Engine (TDE)

**目标**：将复杂需求自动分解为可执行的子任务序列

#### 3.2.1 架构设计

```typescript
// 核心接口定义

// 任务分解请求
interface DecompositionRequest {
  id: string;
  originalTask: string;           // 原始需求描述
  context: ExecutionContext;       // 执行上下文
  constraints?: TaskConstraints;   // 约束条件
  strategy?: DecompositionStrategy;
}

// 分解策略
type DecompositionStrategy = 
  | 'sequential'     // 串行分解
  | 'parallel'      // 并行分解  
  | 'hybrid';       // 混合策略

// 分解结果
interface DecompositionResult {
  requestId: string;
  strategy: DecompositionStrategy;
  tasks: DecomposedTask[];
  reasoning: string;           // 分解理由
  estimatedDuration: number;  // 预估时长(毫秒)
  resourceRequirements: ResourceRequirement[];
}

// 子任务
interface DecomposedTask {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  role: RoleType;
  priority: Priority;
  dependencies: string[];     // 依赖的其他子任务 ID
  estimatedDuration: number;
  inputSchema?: z.ZodType;    // 输入验证 schema
  outputSchema?: z.ZodType;   // 输出验证 schema
  retryPolicy?: RetryPolicy;
}

// 资源需求
interface ResourceRequirement {
  type: 'llm' | 'tool' | 'time' | 'memory';
  amount: number;
  unit: string;
}

// TDE 核心接口
interface ITaskDecompositionEngine {
  // 分解任务
  decompose(request: DecompositionRequest): Promise<DecompositionResult>;
  
  // 增量分解（已有部分任务时补充）
  decomposeIncremental(
    pendingTasks: string[], 
    newRequirements: string
  ): Promise<DecomposedTask[]>;
  
  // 验证分解结果
  validate(result: DecompositionResult): ValidationResult;
  
  // 优化分解结果
  optimize(result: DecompositionResult): Promise<DecompositionResult>;
}
```

#### 3.2.2 分解流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    Task Decomposition Flow                     │
└─────────────────────────────────────────────────────────────────┘

    ┌─────────────┐
    │   Intent    │
    │  Analyzer   │
    └──────┬──────┘
           │
           ▼
    ┌─────────────────────────────────────────┐
    │         LLM-powered Analysis            │
    │  - 提取关键实体 (功能点、技术栈)         │
    │  - 识别任务类型 (分析、设计、开发、测试)  │
    │  - 评估复杂度 (简单/中等/复杂)           │
    └──────┬────────────────────────────────┘
           │
           ▼
    ┌─────────────────────────────────────────┐
    │         Task Graph Builder              │
    │  - 构建任务依赖图                        │
    │  - 识别可并行任务                        │
    │  - 分配角色和优先级                      │
    └──────┬────────────────────────────────┘
           │
           ▼
    ┌─────────────────────────────────────────┐
    │         Resource Estimator              │
    │  - 估算所需 LLM 调用次数                 │
    │  - 估算工具使用                          │
    │  - 估算总时长                            │
    └──────┬────────────────────────────────┘
           │
           ▼
    ┌─────────────┐
    │  Validator  │
    │   & Polish  │
    └─────────────┘
```

#### 3.2.3 与现有代码集成

```typescript
// TaskOrchestrator 增强
class EnhancedTaskOrchestrator {
  private tde: ITaskDecompositionEngine;
  private originalOrchestrator: TaskOrchestrator;
  
  async processUserInput(userInput: string): Promise<{
    task: Task;
    isNew: boolean;
    isDecomposed: boolean;     // 新增：是否进行了任务分解
    subtasks?: Task[];
  }> {
    // 首先尝试匹配已有任务
    const matchResult = await this.originalOrchestrator.processUserInput(userInput);
    
    if (matchResult.isNew) {
      // 智能判断是否需要分解
      const shouldDecompose = await this.shouldDecompose(userInput);
      
      if (shouldDecompose) {
        // 调用 TDE 进行分解
        const decomposition = await this.tde.decompose({
          id: uuidv4(),
          originalTask: userInput,
          context: await this.buildContext(matchResult.task),
        });
        
        // 将分解结果转换为子任务
        const subtasks = await this.convertToSubtasks(decomposition);
        
        return {
          task: matchResult.task,
          isNew: true,
          isDecomposed: true,
          subtasks,
        };
      }
    }
    
    return {
      ...matchResult,
      isDecomposed: false,
    };
  }
  
  // 判断是否需要分解
  private async shouldDecompose(task: string): Promise<boolean> {
    // 简单启发式判断
    const indicators = [
      task.length > 200,           // 需求描述较长
      task.includes('和'),         // 包含多个需求
      task.includes('需要'),       // 明确的功能需求
      task.includes('实现'),       // 需要实现
    ];
    
    return indicators.filter(Boolean).length >= 2;
  }
}
```

#### 3.2.4 技术风险评估

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 分解质量不稳定 | 高 | 多轮验证，人工审核机制 |
| LLM 调用成本 | 中 | 缓存分解结果，支持小模型 |
| 循环依赖 | 中 | 静态分析检测环 |
| 任务过细 | 低 | 最小任务粒度限制 |

---

## 4. API 设计

### 4.1 ACB API

```typescript
// -------------------
// Agent Management
// -------------------

// 注册 Agent
POST /api/agents
Body: {
  id: string;
  name: string;
  type: RoleType;
  capabilities: string[];
}
Response: { agentId: string }

// 获取 Agent 列表
GET /api/agents
Response: { agents: Agent[] }

// 获取单个 Agent
GET /api/agents/:id
Response: { agent: Agent }

// 删除 Agent
DELETE /api/agents/:id
Response: { success: boolean }

// -------------------
// Message Operations
// -------------------

// 发送消息
POST /api/messages
Body: {
  type: MessageType;
  target: AgentId | TopicName;
  payload: any;
  correlationId?: string;
}
Response: { messageId: string }

// 获取消息历史
GET /api/messages
Query: {
  agentId?: string;
  topic?: string;
  since?: string;
  limit?: number;
}
Response: { messages: AgentMessage[] }

// -------------------
// Topic Operations
// -------------------

// 创建主题
POST /api/topics
Body: { name: string; description?: string }
Response: { topicId: string }

// 订阅主题
POST /api/topics/:id/subscribe
Body: { agentId: string }
Response: { subscriptionId: string }

// 取消订阅
DELETE /api/subscriptions/:id
Response: { success: boolean }
```

### 4.2 TDE API

```typescript
// -------------------
// Task Decomposition
// -------------------

// 分解任务
POST /api/tasks/decompose
Body: {
  originalTask: string;
  context?: {
    projectId: string;
    projectPath: string;
  };
  strategy?: 'sequential' | 'parallel' | 'hybrid';
}
Response: {
  requestId: string;
  tasks: DecomposedTask[];
  reasoning: string;
  estimatedDuration: number;
}

// 验证分解结果
POST /api/tasks/validate
Body: { decomposition: DecompositionResult }
Response: { valid: boolean; errors: string[] }

// 获取分解历史
GET /api/tasks/decompositions
Query: {
  projectId?: string;
  since?: string;
  limit?: number;
}
Response: { decompositions: DecompositionResult[] }
```

---

## 5. 数据流设计

### 5.1 完整数据流

```
User Input
    │
    ▼
┌─────────────────┐
│  API Gateway   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ TaskOrchestrator│────▶│  TDE (if needed)│
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│   TaskManager   │◀───▶│    ACB          │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  RoleExecutor  │     │   Role Agents   │
│  (BaseRole)    │────▶│ (PM/Arch/Dev/..)│
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  LLM Service    │     │      Tools      │
│   (Multi-Provider)    │   (ToolRegistry) │
└─────────────────┘     └─────────────────┘
```

### 5.2 消息流

```
Agent A                    ACB                      Agent B
   │                        │                          │
   │  send({target: B})    │                          │
   │───────────────────────▶│                          │
   │                        │  route to B's queue      │
   │                        │─────────────────────────▶│
   │                        │                          │
   │                        │     process & respond    │
   │                        │◀─────────────────────────│
   │                        │                          │
   │    receive response    │                          │
   │◀───────────────────────┤                          │
   │                        │                          │
```

---

## 6. 存储设计

### 6.1 持久化方案

```typescript
// 存储层抽象
interface IStorageAdapter {
  // 任务存储
  saveTask(task: Task): Promise<void>;
  getTask(id: string): Promise<Task | null>;
  listTasks(filter?: TaskFilter): Promise<Task[]>;
  
  // 消息存储
  saveMessage(message: AgentMessage): Promise<void>;
  listMessages(query: MessageQuery): Promise<AgentMessage[]>;
  
  // Agent 状态
  saveAgentState(agentId: string, state: AgentState): Promise<void>;
  getAgentState(agentId: string): Promise<AgentState | null>;
  
  // 分解历史
  saveDecomposition(result: DecompositionResult): Promise<void>;
  getDecompositions(projectId: string): Promise<DecompositionResult[]>;
}

// 初始实现：文件系统 + JSON
// 后续可扩展：SQLite, PostgreSQL, Redis
```

### 6.2 数据模型

```typescript
// Task 存储模型
interface StoredTask {
  id: string;
  projectId: string;
  type: TaskType;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignedRole?: RoleType;
  dependencies: string[];
  subtaskIds: string[];
  input: any;
  output: any;
  result?: ToolResult;
  messages: TaskMessage[];
  executionRecords: TaskExecutionRecord[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  metadata: Record<string, any>;
}

// AgentMessage 存储模型
interface StoredMessage {
  id: string;
  projectId: string;
  type: MessageType;
  source: AgentId;
  target: AgentId | TopicName;
  correlationId?: string;
  payload: any;
  timestamp: string;
  ttl?: number;
  processed: boolean;
}
```

---

## 7. 兼容性设计

### 7.1 向后兼容策略

1. **API 兼容性**
   - 现有 `ProjectAgent` API 完全保持不变
   - 新功能通过扩展方法添加
   - 废弃 API 标记 `@deprecated` 并提供替代方案

2. **事件兼容性**
   - 现有事件类型保持不变
   - 新事件使用 `agent:*` 前缀
   - EventSystem 作为 ACB 的事件源

3. **角色系统兼容性**
   - 现有角色 (PM, Architect, Developer, Tester, DocWriter) 完全兼容
   - 新增角色通过插件机制加载
   - 角色能力通过 Capability 描述

### 7.2 渐进式迁移

```typescript
// 迁移路径
class MigrationManager {
  // Phase 1: 并行运行
  // - ACB 与 EventSystem 同时工作
  // - 消息双向同步
  
  // Phase 2: 逐步迁移
  // - 新功能优先使用 ACB
  // - 旧功能保持 EventSystem
  
  // Phase 3: 完全迁移
  // - EventSystem 降级为 ACB 的适配器
  // - 移除重复代码
}
```

---

## 8. 实施计划

### 8.1 第一阶段：基础设施 (2周)

1. **ACB 核心实现**
   - 消息队列
   - 消息路由
   - Agent 注册

2. **TDE 核心实现**
   - 意图分析器
   - 任务分解器
   - 资源估算器

### 8.2 第二阶段：集成 (2周)

1. **与现有系统集成**
   - EventSystem 桥接
   - TaskOrchestrator 增强
   - 存储适配器

2. **API Gateway**
   - REST API
   - WebSocket 支持

### 8.3 第三阶段：优化 (1周)

1. **性能优化**
   - 消息批处理
   - 缓存策略
   - 并发控制

2. **监控与调试**
   - 日志系统
   - 指标收集
   - 调试工具

---

## 9. 总结

本文档定义了 AgentOS 的核心架构，包括：

1. **Agent Communication Bus (ACB)** - 标准化的多 Agent 通信机制
2. **Task Decomposition Engine (TDE)** - 智能任务分解引擎

关键设计决策：
- 事件驱动架构确保组件解耦
- 向后兼容确保平滑迁移
- 清晰的 API 接口便于扩展
- 完整的风险评估确保系统稳定

后续工作：
- 完善各模块的详细设计
- 实现核心代码
- 编写测试用例
- 部署与监控

---

*文档版本: 1.0.0*
*最后更新: 2026-03-06*
