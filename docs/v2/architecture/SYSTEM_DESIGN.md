# Agent Team 架构设计文档

> 版本: 2.0  
> 更新日期: 2026-02-04  
> 状态: 进行中

## 目录

1. [概述](#概述)
2. [系统架构](#系统架构)
3. [核心模块](#核心模块)
4. [数据模型](#数据模型)
5. [API 设计](#api-设计)
6. [技术栈](#技术栈)
7. [部署架构](#部署架构)

---

## 概述

### 项目目标

Agent Team 是一个基于 LLM 的智能体协作平台，支持：
- 多角色智能体协作
- 任务管理与执行
- 工作流自动化
- 项目管理

### 当前状态

| 模块 | 状态 | 说明 |
|------|------|------|
| LLM 集成 | ✅ 完成 | 智谱 GLM 集成 |
| 任务管理 | ✅ 完成 | CRUD + 对话式交互 |
| Web UI | ✅ 完成 | 仪表板、任务中心 |
| 智能体管理 | ⚠️ 待完善 | API 返回空数据 |
| 工作流系统 | ⚠️ 待完善 | 仅 UI 框架 |
| 项目管理 | ⚠️ 待完善 | 仅 UI 框架 |

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      前端 (Frontend)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  仪表板      │  │  任务中心    │  │  智能体管理          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                       │ HTTP / WebSocket
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     后端 (Backend)                           │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Express    │  │  REST API   │  │  WebSocket Server   │ │
│  │  Server     │  │             │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                            │                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Core Layer                         │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │  │
│  │  │ Task     │ │ Agent    │ │ Workflow │ │ Project  │ │  │
│  │  │ Manager  │ │ Manager  │ │ Engine   │ │ Manager  │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
│                            │                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Service Layer                       │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │  │
│  │  │ LLM      │ │ Role     │ │ File     │ │ Git      │ │  │
│  │  │ Service  │ │ Service  │ │ Service  │ │ Service  │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   存储层 (Storage)                           │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │  文件系统        │  │  配置目录       │                  │
│  │  ~/.agent-team/  │  │  ~/.agent-team │                  │
│  │  projects/       │  │  /config.yaml  │                  │
│  └─────────────────┘  └─────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心模块

### 1. Task Manager（任务管理器）

**职责**: 任务生命周期管理

```typescript
class TaskManager {
  // 任务管理
  createTask(options: TaskOptions): Task;
  getTask(id: string): Task | undefined;
  getAllTasks(): Task[];
  updateTask(id: string, updates: Partial<Task>): Task;
  deleteTask(id: string): boolean;
  
  // 任务执行
  executeTask(id: string): Promise<ToolResult>;
  retryTask(id: string): Promise<ToolResult>;
  
  // 任务状态
  updateTaskStatus(id: string, status: TaskStatus): void;
  getTaskResult(id: string): ToolResult | undefined;
}
```

### 2. Agent Manager（智能体管理器）

**职责**: 智能体生命周期和状态监控

```typescript
class AgentManager {
  // 智能体管理
  createAgent(config: AgentConfig): Promise<Agent>;
  getAgent(id: string): Agent | undefined;
  getAllAgents(): Agent[];
  deleteAgent(id: string): boolean;
  
  // 状态管理
  updateAgentStatus(id: string, status: AgentStatus): void;
  heartbeat(agentId: string): void;
  
  // 健康检查
  checkHealth(agentId: string): AgentHealthResult;
  autoRestart(agentId: string): void;
}
```

### 3. Workflow Engine（工作流引擎）

**职责**: 工作流定义解析和执行

```typescript
class WorkflowEngine {
  // 工作流管理
  createWorkflow(workflow: WorkflowDefinition): Workflow;
  getWorkflow(id: string): Workflow | undefined;
  executeWorkflow(id: string, inputs?: Record<string, any>): ExecutionResult;
  stopExecution(executionId: string): void;
  
  // 执行控制
  getExecutionStatus(executionId: string): ExecutionStatus;
  getExecutionHistory(workflowId: string): Execution[];
}
```

### 4. LLM Service（LLM 服务）

**职责**: LLM API 调用和模型管理

```typescript
class LLMService {
  // 模型调用
  complete(options: LLMOptions): Promise<LLMResponse>;
  streamComplete(options: LLMOptions): AsyncIterator<LLMResponse>;
  
  // 模型管理
  getAvailableModels(): ModelInfo[];
  getModelConfig(provider: string, model: string): ModelConfig;
}
```

### 5. Role Service（角色服务）

**职责**: 角色加载和执行

```typescript
class RoleService {
  // 角色管理
  getRole(id: string): Role | undefined;
  getAllRoles(): Role[];
  getBuiltInRoles(): Role[];
  
  // 角色执行
  executeRole(roleId: string, task: Task): Promise<RoleResult>;
  assignRole(input: string): Promise<RoleAssignment>;
}
```

---

## 数据模型

### Task（任务）

```typescript
interface Task {
  id: string;
  type: TaskType;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignedRole: string;
  ownerRole: string;
  dependencies: string[];
  subtasks: SubTask[];
  input?: Record<string, any>;
  output?: Record<string, any>;
  metadata: TaskMetadata;
  messages: TaskMessage[];
  executionRecords: ExecutionRecord[];
  createdAt: Date;
  updatedAt: Date;
}
```

### Agent（智能体）

```typescript
interface Agent {
  id: string;
  name: string;
  roleId: string;
  projectId: string;
  status: AgentStatus;
  llmProvider?: string;
  llmModel?: string;
  completedTasks: number;
  failedTasks: number;
  metadata: {
    createdAt: Date;
    lastActiveAt: Date;
    restartCount: number;
  };
}
```

### Workflow（工作流）

```typescript
interface Workflow {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'archived';
  steps: WorkflowStep[];
  triggers?: Trigger[];
  timeout?: number;
  executionCount: number;
  lastExecutedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### Project（项目）

```typescript
interface Project {
  id: string;
  name: string;
  path: string;
  description: string;
  status: 'active' | 'archived';
  config: ProjectConfig;
  members: ProjectMember[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

---

## API 设计

### 基础结构

```
Base URL: http://localhost:3020/api

Response Format:
{
  "success": true,
  "data": { ... },
  "error"?: {
    "code": "ERROR_CODE",
    "message": "错误描述"
  }
}
```

### 端点列表

| 模块 | 方法 | 路径 | 描述 |
|------|------|------|------|
| 任务 | GET | `/tasks` | 任务列表 |
| 任务 | POST | `/tasks/chat` | 对话式创建 |
| 任务 | POST | `/tasks/:id/execute` | 执行任务 |
| 智能体 | GET | `/agents` | 智能体列表 |
| 智能体 | POST | `/agents` | 创建智能体 |
| 工作流 | GET | `/workflows` | 工作流列表 |
| 工作流 | POST | `/workflows/:id/execute` | 执行工作流 |
| 项目 | GET | `/projects` | 项目列表 |
| 配置 | GET | `/config` | 系统配置 |

---

## 技术栈

### 后端

| 技术 | 用途 |
|------|------|
| Node.js 20 | 运行时 |
| Express | Web 框架 |
| TypeScript | 语言 |
| tsx | 开发运行 |

### 前端

| 技术 | 用途 |
|------|------|
| HTML5/CSS3 | 界面 |
| Vanilla JS | 交互 |
| 原生 Fetch | HTTP 客户端 |

### 测试

| 技术 | 用途 |
|------|------|
| Vitest | 单元测试 |
| Playwright | E2E 测试 |

---

## 部署架构

### 开发环境

```
本地开发:
localhost:3020
├── Web UI
├── REST API
└── 文件存储: ~/.agent-team/
```

### 生产环境（待实现）

```
反向代理 (Nginx)
     │
     ▼
┌─────────────────┐
│  Node.js Server │ x N
│  - API 服务      │
│  - WebSocket    │
└─────────────────┘
     │
     ▼
┌─────────────────┐
│  文件存储        │
│  ~/.agent-team/ │
└─────────────────┘
```

---

## 目录结构

```
agent-team/
├── src/
│   ├── core/           # 核心模块
│   │   ├── task-manager.ts
│   │   ├── task-orchestrator.ts
│   │   ├── agent-mgr.ts
│   │   └── events.ts
│   ├── services/       # 服务层
│   │   ├── llm.service.ts
│   │   └── llm-config.ts
│   ├── roles/          # 角色系统
│   │   ├── base.ts
│   │   ├── factory.ts
│   │   └── product-manager.ts
│   ├── server/         # 服务端
│   │   ├── index.ts
│   │   └── api.ts
│   └── types/          # 类型定义
├── public/             # 前端资源
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── prompts/            # 角色配置
│   └── roles/
├── docs/              # 文档
│   └── v2/
│       ├── tasks/
│       └── architecture/
└── package.json
```

---

## 演进路线

```
v1.0 (当前)          v2.0 (目标)           v3.0 (未来)
     │                     │                     │
     ▼                     ▼                     ▼
┌─────────┐          ┌─────────────┐      ┌─────────────┐
│ 基础功能 │   →     │ 完整功能    │  →   │  云原生支持  │
│ 任务管理 │          │ 智能体/工作流│      │  分布式部署  │
│ LLM 集成 │          │ 多项目管理  │      │  团队协作    │
└─────────┘          └─────────────┘      └─────────────┘
```

---

## 相关文档

- 任务拆分: `docs/v2/tasks/`
- 使用指南: `docs/guides/`
- API 文档: `docs/reference/`
