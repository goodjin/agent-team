# Project Agent 设计文档

## 1. 技术架构

### 1.1 技术栈
- **语言**：TypeScript
- **运行时**：Node.js
- **Web 服务器框架**：Express.js
- **配置解析**：js-yaml
- **验证**：Zod
- **日志**：自定义日志系统

### 1.2 项目结构
```
agent-team/
├── src/
│   ├── ai/               # AI Agent（智能体核心逻辑）
│   ├── config/           # 配置管理
│   ├── core/             # 核心系统
│   ├── code-analysis/    # 代码分析
│   ├── roles/            # 角色提示词（Markdown文件）
│   ├── rules/            # 规则文件（Markdown文件）
│   ├── services/         # LLM 服务
│   ├── server/           # Web 服务器
│   ├── tools/            # 工具系统
│   ├── types/            # 类型定义
│   └── utils/            # 工具函数
├── docs/                 # 文档
└── examples/             # 示例
```

### 1.3 架构分层设计

本系统采用**六边形架构（Hexagonal Architecture）**，也称为**洋葱架构（Onion Architecture）**，实现清晰的关注点分离和依赖倒置。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户接口层 (User Interface)                      │
│  ┌─────────────────┐  ┌─────────────────┐                                   │
│  │   Web Server    │  │   API Server    │                                   │
│  │   管理界面      │  │   REST API      │                                   │
│  └─────────────────┘  └─────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             应用层 (Application Layer)                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        ProjectAgent (主入口)                         │    │
│  │  ┌─────────────┐  ┌─────────────┐                                   │    │
│  │  │ TaskManager │  │ AgentMgr    │                                   │    │
│  │  │  任务管理   │  │ 智能体管理  │                                   │    │
│  │  └─────────────┘  └─────────────┘                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              领域层 (Domain Layer)                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐     │    │
│  │  │  Role    │  │  Agent   │  │  Task    │  │ RolePrompt      │     │    │
│  │  │  角色    │  │  智能体  │  │  任务    │  │ 角色提示词规则  │     │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘     │    │
│  │  ┌──────────┐  ┌──────────┐                                           │    │
│  │  │ Event    │  │ Checkpoint│                                           │    │
│  │  │  事件    │  │  断点    │                                           │    │
│  │  └──────────┘  └──────────┘                                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            基础设施层 (Infrastructure Layer)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │  LLM Service │  │  Tool System │  │  Storage     │  │  Event System  │   │
│  │  LLM 服务    │  │  工具系统    │  │  存储系统    │  │  事件系统      │   │
│  │  ├OpenAI     │  │  ├FileTools  │  │  ├SQLite     │  │  ├Emitter      │   │
│  │  ├Claude     │  │  ├GitTools   │  │  ├FileSystem │  │  └Dispatcher  │   │
│  │  ├Qwen       │  │  ├Browser    │  │  └Cache     │  │               │   │
│  │  └GLM        │  │  └AIGen      │  │              │  │               │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**分层原则**：
- **上层依赖下层**：用户接口层 → 应用层 → 领域层 → 基础设施层
- **依赖倒置**：领域层通过接口定义，基础设施层实现接口
- **内层不知道外层**：领域层不关心谁来调用，基础设施层不关心被谁使用

### 1.4 功能模块详细设计

#### 1.4.1 模块概览

| 模块 | 路径 | 职责 | 依赖 |
|-----|------|------|------|
| ProjectAgent | `core/` | 系统入口，协调各组件 | TaskManager, AgentMgr |
| TaskManager | `core/` | 任务生命周期管理 | Task, Event |
| AgentMgr | `core/` | 智能体创建和管理 | Role, Agent |
| LLMService | `services/llm/` | LLM 调用和适配 | Adapter Layer |
| LLMAdapterLayer | `services/llm/adapters/` | 各服务商适配 | HTTP Client |
| ToolRegistry | `tools/` | 工具注册和管理 | ToolDefinition |
| RoleManager | `roles/` | 角色提示词管理 | Markdown文件 |
| RuleManager | `rules/` | 规则文件管理 | Markdown文件 |
| Storage | `infrastructure/` | 数据持久化 | SQLite, FileSystem |
| ConfigManager | `config/` | 配置加载和管理 | Config |
| EventSystem | `core/` | 事件派发和监听 | Event |

#### 1.4.2 核心模块详细设计

**TaskManager 模块**
```
职责：管理任务从创建到完成的完整生命周期

主要方法：
├── createTask(request): Task
├── getTask(id): Task | null
├── updateTask(id, updates): Task
├── deleteTask(id): boolean
├── startTask(id): void
├── completeTask(id, result): void
├── failTask(id, error): void
├── getTasks(filters): Task[]
└── getTaskStats(projectId): TaskStats

状态机：
pending → running → done
              ↓
            failed
```

**AgentMgr 模块**
```
职责：智能体创建和管理，根据任务需要创建智能体

主要方法：
├── createAgent(roleId): Agent
├── getAgent(id): Agent | null
├── getAgentsByRole(roleId): Agent[]
├── restartAgent(id): void
└── checkAgentStatus(id): AgentStatus

智能体状态：
└── 简化为：idle（空闲）、running（执行中）、stopped（停止）
```

**LLMService 模块**
```
职责：提供统一的 LLM 调用接口，管理多服务商和故障转移

主要方法：
├── chat(request): Promise<ChatResponse>
├── chatStream(request): AsyncIterator<ChatResponse>
├── embed(request): Promise<EmbeddingResponse>
├── getAvailableProviders(): Provider[]
├── failover(provider): void
├── getStats(): TokenStats
└── healthCheck(): Promise<boolean>

配置简化：
├── 用户仅需提供 API Key
├── 其他配置由系统预设
└── 故障转移自动进行
```
职责：管理任务从创建到完成的完整生命周期

主要方法：
├── createTask(request): Task
├── getTask(id): Task | null
├── updateTask(id, updates): Task
├── deleteTask(id): boolean
├── startTask(id): void
├── completeTask(id, result): void
├── failTask(id, error): void
├── getTasks(filters): Task[]
└── getTaskStats(projectId): TaskStats

状态机：
pending → in_progress → completed
              ↓
            failed
              ↓
            blocked (依赖未满足)
```

**TaskOrchestrator 模块**
```
职责：智能分配任务给合适的智能体，处理任务依赖和并行执行

主要方法：
├── analyzeTask(task): TaskAnalysis
├── decomposeTask(task): Task[]
├── assignAgent(task): AgentInstance
├── executeTask(task): Promise<TaskResult>
├── executeParallel(tasks): Promise<TaskResult[]>
├── executeSequential(tasks): Promise<TaskResult[]>
└── handleDependencies(task): Task[]

任务分解策略：
├── 简单任务：直接分配给智能体
├── 中等任务：分解为 2-5 个子任务
└── 复杂任务：分解为 5+ 子任务，启用工作流模式
```

**LLMService 模块**
```
职责：提供统一的 LLM 调用接口，管理多服务商和故障转移

主要方法：
├── chat(request): Promise<ChatResponse>
├── chatStream(request): AsyncIterator<ChatResponse>
├── embed(request): Promise<EmbeddingResponse>
├── getAvailableProviders(): Provider[]
├── failover(provider): void
├── getStats(): TokenStats
└── healthCheck(): Promise<boolean>

服务商优先级：
├── 角色专属配置
├── 全局默认配置
└── fallbackOrder 列表
```

**ToolRegistry 模块**
```
职责：工具的注册、发现和调用

主要方法：
├── register(tool: ToolDefinition): void
├── unregister(name): boolean
├── getTool(name): ToolDefinition | null
├── getTools(filters): ToolDefinition[]
├── execute(name, params): Promise<ToolResult>
└── validateParams(name, params): ValidationResult

工具分类：
├── file: 文件操作
├── git: Git 操作
├── code: 代码分析
├── browser: 浏览器操作
├── ai-generation: AI 生成
└── custom: 自定义工具
```

**RoleManager 模块**
```
职责：角色提示词管理

主要方法：
├── getRolePrompt(roleId): string
├── createRole(request): Role
├── updateRole(id, updates): Role
├── deleteRole(id): boolean
└── listRoles(): Role[]

角色提示词存储：
└── 存储为 Markdown 文件，路径：roles/{roleId}/system_prompt.md
```

**RuleManager 模块**
```
职责：规则文件管理

主要方法：
├── getRules(scope): string[]  // scope: global/project/role
├── addRule(rule): void
├── deleteRule(id): boolean
└── listRules(): Rule[]

规则存储：
├── 存储为 Markdown 文件
├── 路径：rules/{type}_{name}.md
├── 类型：global_xxx、project_xxx、role_xxx
└ └── 优先级：project > role > global
```

### 1.5 模块依赖关系

```
                              ┌─────────────────┐
                              │   Web Server    │◄──── 管理界面入口
                              └────────┬────────┘
                                       │
                              ┌────────▼────────┐
                              │  ProjectAgent   │◄──── 主入口
                              └────────┬────────┘
               ┌──────────────────────┼──────────────────────┐
               │                      │                      │
      ┌────────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
      │  TaskManager    │   │    AgentMgr     │   │   EventSystem   │
      └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
               │                     │                      │
      ┌────────┴────────┐   ┌────────┴────────┐   ┌────────┴────────┐
      │                 │   │                 │   │                 │
┌────▼────┐   ┌───────▼──┐   └─▼────────────┐   └──────┬─────────┐
│ RoleMgr │   │ RuleMgr  │   │ ContextMem   │   │ Storage│
└────┬────┘   └────┬─────┘   └──────────────┘   └───────┼─────────┘
     │             │                                      │
     │      ┌──────┴──────┐                              │
     │      │             │                              │
┌────▼────┐ └─▼────────────┐   ┌─────────────────────────▼──────────┐
│LLMService│   │ Checkpoint  │   │                     Storage        │
└────┬────┘   └────────────┘   │  ┌──────────┐  ┌──────────┐  ┌────┐│
     │                          │  │  SQLite  │  │ FileSys  │  │Log ││
┌────▼────┐                     │  └──────────┘  └──────────┘  └────┘│
│Adapters  │                     └─────────────────────────────────────┘
│OpenAI    │
│Claude    │
│Qwen      │
│GLM       │
└──────────┘
```

**依赖原则**：
- **单向依赖**：上层模块依赖下层模块，下层模块不依赖上层
- **接口隔离**：通过接口抽象，避免直接依赖具体实现
- **依赖注入**：模块通过构造函数注入依赖，便于测试

### 1.6 数据流设计

#### 1.6.1 任务执行数据流

```
用户请求
    │
    ▼
┌─────────────────┐
│  CLI / Web API  │  // 暂不实现CLI，移除此入口
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ProjectAgent    │
│ (入口协调)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ TaskManager     │◄── 创建/查询任务
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AgentMgr        │◄── 分配智能体
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ RoleManager     │◄── 获取角色提示词
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ LLMService      │◄── 调用大模型
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ToolRegistry    │◄── 工具调用
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Checkpoint      │◄── 断点记录
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ TaskManager     │──► 完成/失败
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ EventSystem     │──► 通知用户
└─────────────────┘
```

#### 1.6.2 任务拆分数据流

```
用户需求描述
    │
    ▼
┌─────────────────┐
│ 大模型分析      │◄── 理解需求，生成任务列表
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ TaskManager     │◄── 为每个任务分配编号和分类
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AgentMgr        │◄── 为每个任务创建智能体
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 智能体执行任务  │◄── 按角色提示词执行
└─────────────────┘
```
用户请求
    │
    ▼
┌─────────────────┐
│  CLI / Web API  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ProjectAgent    │
│ (入口协调)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ TaskManager     │◄── 创建/查询任务
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ TaskOrchestrator│◄── 分析、分解、分配
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────┐
│ Role  │ │ Agent │◄── 获取角色定义和智能体
│ Manager│ │Instance│
└───┬───┘ └───┬───┘
    │         │
    │         ▼
    │   ┌─────────────────┐
    │   │ ContextManager  │◄── 加载上下文
    │   └────────┬────────┘
    │            │
    │            ▼
    │   ┌─────────────────┐
    │   │ LLMService      │◄── 调用大模型
    │   └────────┬────────┘
    │            │
    │            ▼
    │   ┌─────────────────┐
    │   │ ToolRegistry    │◄── 工具调用
    │   └────────┬────────┘
    │            │
    │            ▼
    │   ┌─────────────────┐
    │   │ Checkpoint      │◄── 断点记录
    │   └────────┬────────┘
    │            │
    └────────────┤
                 │
                 ▼
          ┌──────────────┐
          │ TaskManager  │──► 完成/失败
          └──────────────┘
                 │
                 ▼
          ┌──────────────┐
          │ EventSystem  │──► 通知用户
          └──────────────┘
```

#### 1.6.2 上下文管理数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│                         上下文生命周期                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  生成                          存储                        检索    │
│   │                             │                             │     │
│   ▼                             ▼                             ▼     │
│ ┌──────────┐              ┌─────────────┐              ┌──────────┐│
│ │ LLM/工具 │ ───────►     │   热存储    │ ─────────►  │  查询    ││
│ │ 生成内容 │              │ (SQLite)    │             │  引擎    ││
│ └──────────┘              └──────┬──────┘              └────┬─────┘│
│                                  │                          │      │
│                                  │ 过期/归档                 │      │
│                                  ▼                          │      │
│                           ┌─────────────┐                   │      │
│                           │   冷存储    │ ◄────────────────┘      │
│                           │ (文件系统)  │                        │
│                           └─────────────┘                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 1.6.3 定时任务数据流

```
Cron 触发 / 事件触发
        │
        ▼
┌─────────────────┐
│   Scheduler     │──► 检查到期任务
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 智能体自主模式  │ ◄── 发送建议执行消息
│ 或              │
│ 强制执行模式    │ ◄── 强制创建任务
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ TaskManager     │──► 创建定时任务实例
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ TaskOrchestrator│──► 分配给智能体执行
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 执行完成后      │──► 更新状态、发送报告
└─────────────────┘
```

## 2. 核心模块

### 2.1 ProjectAgent
- 系统主入口类
- 协调各个组件
- 管理任务和智能体
- 提供统一 API

### 2.2 TaskManager
- 任务生命周期管理
- 任务状态追踪
- 任务编号和分类管理

### 2.3 ToolRegistry
- 工具注册和管理
- 工具执行调度
- 工具结果处理

### 2.4 RoleManager
- 角色提示词管理（Markdown文件）
- 角色创建
- 角色提示词加载和变量替换

### 2.5 AgentMgr
- 智能体创建和管理
- 智能体状态检查
- 智能体重启

### 2.6 LLMService
- LLM 服务抽象
- 多服务商支持
- 故障转移机制
- Token 使用统计

### 2.7 RuleManager
- 规则文件管理（Markdown文件）
- 规则优先级处理
- 规则注入到角色提示词

## 3. 数据模型

### 3.1 任务模型
```typescript
interface Task {
  id: string;              // 格式 T001，项目内唯一
  category: string;        // 任务分类：REQ/ARCH/DEV/TEST/DOC等
  title: string;           // 任务标题
  description: string;     // 任务详细描述
  progress: string;        // 进度标记：大模型可更新的进度状态
  status: TaskStatus;      // pending | running | done
  agentId?: string;        // 执行任务的智能体ID
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

type TaskStatus = 'pending' | 'running' | 'done';
```

### 3.2 角色模型
```typescript
interface RoleDefinition {
  id: string;
  name: string;
  type: RoleType;
  description: string;
  systemPromptPath: string;  // Markdown文件路径：roles/{id}/system_prompt.md
  createdBy: 'system' | 'user' | 'llm';
  createdAt?: Date;
  enabled: boolean;
}
```

### 3.3 智能体模型
```typescript
interface Agent {
  id: string;
  roleId: string;              // 关联的角色定义
  projectId: string;           // 所属项目
  name: string;                // 智能体名称
  status: AgentStatus;         // idle | running | stopped
  currentTaskId?: string;      // 当前执行的任务
  llmProvider?: string;        // 使用的LLM服务商
  llmModel?: string;           // 使用的模型
  metadata: {
    createdAt: Date;
    lastActiveAt: Date;
    restartCount: number;      // 重启次数
  };
}

type AgentStatus = 'idle' | 'running' | 'stopped';
```

### 3.4 规则模型
```typescript
interface Rule {
  id: string;
  name: string;
  type: 'global' | 'project' | 'role';  // 规则类型
  filePath: string;                      // Markdown文件路径
  scope?: string;                        // 关联的项目或角色ID
  enabled: boolean;
}
```

### 3.5 项目模型
```typescript
interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  status: 'active' | 'archived';
  config: ProjectConfig;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    version?: string;
  };
}
```

## 4. 持久化设计

### 4.1 存储策略

| 数据类型 | 存储方式 | 位置 | 说明 |
|---------|---------|------|------|
| **结构化配置** | SQLite | `~/.agent-team/data.db` | 项目配置、智能体状态、断点记录 |
| **任务数据** | JSON | `~/.agent-team/projects/{id}/tasks/` | 按分类分目录存储 |
| **角色提示词** | Markdown | `~/.agent-team/roles/{roleId}/` | 角色系统提示词 |
| **规则文件** | Markdown | `~/.agent-team/rules/` | 规则定义 |
| **执行日志** | JSONL | `~/.agent-team/projects/{id}/logs/` | 结构化日志 |
| **大文件** | 原始文件 | `~/.agent-team/projects/{id}/artifacts/` | 图片、视频等 |

### 4.2 SQLite Schema 设计
```sql
-- 项目表
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  config TEXT,  -- JSON
  metadata TEXT, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 角色表
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  prompt_path TEXT NOT NULL,  -- Markdown文件路径
  created_by TEXT DEFAULT 'system',
  created_at DATETIME,
  enabled INTEGER DEFAULT 1
);

-- 智能体表
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'idle',
  current_task_id TEXT,
  llm_provider TEXT,
  llm_model TEXT,
  metadata TEXT, -- JSON
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- 任务表
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  progress TEXT,
  status TEXT DEFAULT 'pending',
  agent_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  completed_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- 断点表
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  checkpoint_type TEXT NOT NULL,
  data TEXT NOT NULL, -- JSON
  metadata TEXT NOT NULL, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_checkpoints_agent ON checkpoints(agent_id);
CREATE INDEX idx_checkpoints_task ON checkpoints(task_id);
```

### 4.3 重启恢复流程
```
系统启动
    │
    ├─→ 加载 SQLite 数据
    │   ├─→ 恢复所有智能体
    │   ├─→ 检查智能体状态
    │   └─→ 查找未完成任务
    │
    ├─→ 扫描断点记录
    │   ├─→ 筛选 'running' 状态的任务
    │   ├─→ 加载最近的 checkpoint
    │   │
    │   └─→ 恢复执行
    │       ├─→ 恢复上下文
    │       └─→ 继续执行
    │
    └─→ 注册事件监听
        └─→ 实时监控状态变化
```

### 4.4 数据一致性保障
- **事务性写入**：关键操作（checkpoint、状态变更）使用 SQLite 事务
- **定期清理**：自动清理过期 checkpoint
- **备份机制**：定期备份 SQLite

## 5. 安全架构

### 5.1 服务绑定与网络隔离
```typescript
interface ServerSecurityConfig {
  // 服务绑定配置
  host: '127.0.0.1' | 'localhost' | '0.0.0.0';  // 默认只监听本地
  port: number;  // 默认 3000

  // 是否允许远程访问
  allowRemoteAccess: boolean;

  // 可选：简单 Token 认证（如果需要远程访问）
  tokenAuth?: {
    enabled: boolean;
    token: string;  // Token 存储在环境变量或配置文件中
    tokenHeader: string;  // 默认 'X-Auth-Token'
  };
}
```

### 5.2 敏感数据保护

```typescript
interface SensitiveDataProtection {
  // API Key 加密存储
  apiKeyEncryption: {
    algorithm: 'AES-256-GCM';
    keyDerivation: 'PBKDF2';
  };

  // 日志脱敏
  logRedaction: {
    enabled: boolean;
    patterns: RegExp[];  // 匹配 API Key、Token 等敏感信息
    replacement: string;  // 替换为 '***'
  };

  // 敏感字段列表
  sensitiveFields: string[] = [
    'apiKey',
    'password',
    'token',
    'secret',
    'credential'
  ];

  // 数据导出脱敏
  exportSanitization: boolean;  // 导出数据时自动脱敏
}
```

### 5.3 工具调用安全

```typescript
interface ToolSecurityPolicy {
  // 危险操作确认
  dangerousOperations: {
    requireConfirmation: boolean;
    allowedOperations: string[];  // 允许的危险操作
    blockedOperations: string[];  // 禁止的操作
  };

  // 文件系统安全
  fileSystemSecurity: {
    allowedPaths: string[];  // 允许访问的目录
    blockedPaths: string[];  // 禁止访问的目录（如系统目录）
    maxFileSize: number;  // 最大文件大小限制
    allowDelete: boolean;  // 是否允许删除文件
    allowOverwrite: boolean;  // 是否允许覆盖文件
  };

  // Git 操作安全
  gitSecurity: {
    requireCommitMessage: boolean;
    allowedBranches: string[];  // 允许操作的分支
    blockedBranches: string[];  // 禁止操作的分支（如 main/prod）
    autoPush: boolean;  // 是否允许自动推送
    requirePushConfirmation: boolean;
  };

  // 浏览器安全
  browserSecurity: {
    allowedDomains: string[];  // 允许访问的域名
    blockedDomains: string[];  // 禁止访问的域名
    sandboxEnabled: boolean;  // 启用沙盒
    javascriptEnabled: boolean;  // 是否允许执行 JS
  };
}
```

### 5.4 审计日志

```typescript
interface AuditLog {
  id: string;
  timestamp: Date;
  user: string;  // 本地用户标识
  action: AuditAction;
  resource: string;  // 操作的资源
  details: {
    before?: any;
    after?: any;
    metadata?: Record<string, any>;
  };
  result: 'success' | 'failure';
  error?: string;
}

type AuditAction =
  | 'task.create'
  | 'task.update'
  | 'task.delete'
  | 'task.execute'
  | 'agent.create'
  | 'agent.delete'
  | 'config.update'
  | 'tool.execute'
  | 'file.write'
  | 'file.delete'
  | 'git.commit'
  | 'git.push'
  | 'api.call'
  | 'login'
  | 'logout';

// 审计日志存储
interface AuditLogStorage {
  retentionDays: number;  // 默认保留 90 天
  storageType: 'file' | 'sqlite' | 'external';
  exportEnabled: boolean;  // 支持导出
}
```

### 5.5 安全配置示例

```yaml
# ~/.agent-team/security.yaml
version: "1.0.0"

server:
  host: "127.0.0.1"  # 只监听本地
  port: 3000
  tokenAuth:
    enabled: false  # 本地使用不需要 Token

dataProtection:
  apiKeyEncryption: true
  logRedaction: true
  exportSanitization: true

toolSecurity:
  dangerousOperations:
    requireConfirmation: true
    blockedOperations:
      - "rm -rf /"
      - "format disk"
  fileSystemSecurity:
    allowedPaths:
      - "${projectPath}"
      - "~/.agent-team"
    blockedPaths:
      - "/etc"
      - "/root"
      - "/home/*/.ssh"
    maxFileSize: 100MB
    allowDelete: false
    allowOverwrite: false
  gitSecurity:
    requireCommitMessage: true
    blockedBranches:
      - "main"
      - "master"
      - "prod"
    requirePushConfirmation: true
  browserSecurity:
    blockedDomains:
      - "malicious.com"

auditLog:
  retentionDays: 90
  storageType: "sqlite"
  exportEnabled: true
```

## 6. 可观测性设计

### 6.1 日志规范

```typescript
interface LogConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
  output: {
    console: boolean;
    file: boolean;
    filePath: string;
  };
  rotation: {
    enabled: boolean;
    maxSize: string;  // 例如 '100MB'
    maxFiles: number;  // 保留的文件数量
    maxAge: string;  // 保留天数
  };
}

// 日志格式
interface LogEntry {
  timestamp: string;  // ISO 8601 格式
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  module: string;  // 模块名称
  message: string;
  traceId?: string;  // 链路追踪 ID
  spanId?: string;   // Span ID
  context?: {
    taskId?: string;
    agentId?: string;
    projectId?: string;
  };
  data?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}
```

### 6.2 指标采集

```typescript
interface MetricsConfig {
  enabled: boolean;
  collectionInterval: number;  // 毫秒，默认 5000
  exportFormat: 'prometheus' | 'json';

  // 核心指标定义
  metrics: {
    // 任务指标
    task: {
      total: number;           // 任务总数
      pending: number;         // 待执行
      running: number;         // 执行中
      completed: number;       // 已完成
      failed: number;          // 失败
      durationHistogram: Histogram;  // 执行时长分布
    };

    // 智能体指标
    agent: {
      count: number;           // 智能体总数
      byStatus: Record<string, number>;  // 按状态分类
      tasksProcessed: Counter; // 处理的任务数
      tokenUsage: Counter;     // Token 消耗
    };

    // LLM 指标
    llm: {
      requestTotal: Counter;   // 请求总数
      requestDuration: Histogram;  // 请求时长
      errorTotal: Counter;     // 错误总数
      byProvider: Record<string, {
        requestTotal: Counter;
        errorTotal: Counter;
      }>;
    };

    // 系统指标
    system: {
      memoryUsage: number;     // MB
      cpuUsage: number;        // 百分比
      activeConnections: number;
      queueSize: number;       // 等待队列长度
    };
  };
}

// 预定义指标列表
const METRICS = {
  // 任务指标
  TASK_TOTAL: 'agent_team_tasks_total',
  TASK_PENDING: 'agent_team_tasks_pending',
  TASK_RUNNING: 'agent_team_tasks_running',
  TASK_COMPLETED: 'agent_team_tasks_completed',
  TASK_FAILED: 'agent_team_tasks_failed',
  TASK_DURATION: 'agent_team_task_duration_seconds',

  // 智能体指标
  AGENT_COUNT: 'agent_team_agents_total',
  AGENT_TASKS_PROCESSED: 'agent_team_agent_tasks_processed_total',
  AGENT_TOKEN_USAGE: 'agent_team_agent_tokens_total',

  // LLM 指标
  LLM_REQUESTS_TOTAL: 'agent_team_llm_requests_total',
  LLM_REQUEST_DURATION: 'agent_team_llm_request_duration_seconds',
  LLM_ERRORS_TOTAL: 'agent_team_llm_errors_total',

  // 系统指标
  SYSTEM_MEMORY_USAGE: 'agent_team_memory_usage_bytes',
  SYSTEM_CPU_USAGE: 'agent_team_cpu_usage_percent',
  SYSTEM_ACTIVE_CONNECTIONS: 'agent_team_active_connections',
  SYSTEM_QUEUE_SIZE: 'agent_team_queue_size',
};
```

### 6.3 健康检查端点

```typescript
interface HealthCheckEndpoints {
  // 基础健康检查
  '/health': {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    uptime: number;
    checks: {
      database: boolean;  // SQLite 连接
      diskSpace: boolean; // 磁盘空间
      memoryUsage: boolean; // 内存使用
      llmProviders: Record<string, boolean>;  // 各 LLM 服务商
    };
  };

  // 详细健康信息
  '/health/details': {
    ...HealthCheckEndpoints['/health'],
    system: {
      memory: {
        used: number;
        total: number;
        threshold: number;
      };
      disk: {
        used: number;
        total: number;
        threshold: number;
      };
      cpu: {
        usage: number;
        threshold: number;
      };
    };
    dependencies: {
      sqlite: {
        status: 'connected' | 'disconnected';
        latency: number;
      };
      llmProviders: {
        name: string;
        status: 'available' | 'unavailable';
        latency?: number;
        error?: string;
      }[];
    };
  };

  // 指标端点（Prometheus 格式）
  '/metrics': {
    contentType: 'text/plain; version=0.0.4';
  };

  // 就绪检查
  '/ready': {
    ready: boolean;
    notReadyReasons?: string[];
  };
}
```

### 6.4 链路追踪

```typescript
interface TracingConfig {
  enabled: boolean;
  sampler: {
    type: 'always' | 'never' | 'ratio';
    ratio: number;  // 0-1，采样比例
  };
  propagation: 'b3' | 'w3c';
  output: {
    console: boolean;
    file: boolean;
    filePath: string;
  };
}

// 追踪上下文
interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  baggage: Record<string, string>;
}

// Span 定义
interface Span {
  name: string;
  type: 'internal' | 'llm' | 'tool' | 'workflow';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: Date;
  endTime?: Date;
  status: 'ok' | 'error';
  attributes: Record<string, any>;
  events: SpanEvent[];
  spans: Span[];  // 子 Span
}

interface SpanEvent {
  name: string;
  timestamp: Date;
  attributes?: Record<string, any>;
}
```

### 6.5 可观测性仪表板

```typescript
interface DashboardConfig {
  refreshInterval: number;  // 毫秒，默认 5000
  widgets: DashboardWidget[];
}

interface DashboardWidget {
  id: string;
  type: 'chart' | 'stat' | 'table' | 'log';
  title: string;
  position: { x: number; y: number; w: number; h: number };
  config: Record<string, any>;
}

// 预定义仪表板布局
const DEFAULT_DASHBOARD: DashboardConfig = {
  refreshInterval: 5000,
  widgets: [
    // 系统概览
    { id: 'system-stats', type: 'stat', title: '系统状态',
      position: { x: 0, y: 0, w: 3, h: 2 } },
    { id: 'memory-usage', type: 'chart', title: '内存使用',
      position: { x: 3, y: 0, w: 3, h: 2 } },

    // 任务概览
    { id: 'task-stats', type: 'stat', title: '任务统计',
      position: { x: 6, y: 0, w: 3, h: 2 } },
    { id: 'task-chart', type: 'chart', title: '任务趋势',
      position: { x: 9, y: 0, w: 3, h: 2 } },

    // 智能体状态
    { id: 'agent-stats', type: 'stat', title: '智能体状态',
      position: { x: 0, y: 2, w: 4, h: 2 } },
    { id: 'agent-list', type: 'table', title: '智能体列表',
      position: { x: 4, y: 2, w: 8, h: 2 } },

    // LLM 指标
    { id: 'llm-stats', type: 'stat', title: 'LLM 统计',
      position: { x: 0, y: 4, w: 3, h: 2 } },
    { id: 'llm-latency', type: 'chart', title: 'LLM 延迟',
      position: { x: 3, y: 4, w: 3, h: 2 } },
    { id: 'llm-errors', type: 'chart', title: 'LLM 错误',
      position: { x: 6, y: 4, w: 3, h: 2 } },

    // 日志
    { id: 'recent-logs', type: 'log', title: '最近日志',
      position: { x: 0, y: 6, w: 12, h: 3 } },
  ],
};
```

## 7. 容错与弹性设计

### 7.1 熔断机制

```typescript
interface CircuitBreakerConfig {
  // 熔断器配置
  failureThreshold: number;  // 失败次数阈值，默认 5
  successThreshold: number;  // 成功次数阈值（半开状态），默认 2
  timeout: number;  // 熔断时长（毫秒），默认 30000
  halfOpenMaxCalls: number;  // 半开状态下的最大调用数，默认 3

  // 监控配置
  monitoring: {
    windowSize: number;  // 监控窗口大小（毫秒），默认 60000
    minimumCalls: number;  // 最小调用数后才计算熔断，默认 10
  };
}

// 熔断器状态
type CircuitBreakerState = 'closed' | 'open' | 'half-open';

interface CircuitBreaker {
  name: string;
  state: CircuitBreakerState;
  stats: {
    totalCalls: number;
    failedCalls: number;
    successfulCalls: number;
    rejectedCalls: number;
    lastFailureTime?: Date;
    lastSuccessTime?: Date;
  };

  // 方法
  async execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): CircuitBreakerState;
  getStats(): CircuitBreakerStats;
  reset(): void;
}

// LLM 服务熔断器示例
const LLM_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000,  // LLM 服务熔断时间更长
  monitoring: {
    windowSize: 60000,
    minimumCalls: 5,
  },
};
```

### 7.2 降级策略

```typescript
interface DegradationStrategy {
  // 降级触发条件
  trigger: {
    type: 'circuit_breaker' | 'timeout' | 'error_rate' | 'resource_exhausted';
    threshold: number;
  };

  // 降级动作
  action: DegradationAction;
}

type DegradationAction =
  | { type: 'use_fallback_model'; fallbackModel: string }
  | { type: 'reduce_context'; maxTokens: number }
  | { type: 'skip_optional_tools'; tools: string[] }
  | { type: 'queue_task'; maxQueueSize: number }
  | { type: 'return_error'; message: string };

// 预定义降级策略
const DEGRADATION_STRATEGIES: DegradationStrategy[] = [
  {
    trigger: { type: 'circuit_breaker', threshold: 1 },
    action: { type: 'use_fallback_model', fallbackModel: 'claude-haiku' }
  },
  {
    trigger: { type: 'error_rate', threshold: 0.3 },  // 30% 错误率
    action: { type: 'reduce_context', maxTokens: 4000 }
  },
  {
    trigger: { type: 'resource_exhausted', threshold: 0.9 },  // 90% 内存使用
    action: { type: 'skip_optional_tools', tools: ['browser', 'image-generation'] }
  },
  {
    trigger: { type: 'timeout', threshold: 3 },  // 连续 3 次超时
    action: { type: 'queue_task', maxQueueSize: 10 }
  },
];
```

### 7.3 限流策略

```typescript
interface RateLimitConfig {
  // 全局限流
  global: {
    maxRequestsPerMinute: number;  // 默认 1000
    maxConcurrentRequests: number;  // 默认 10
  };

  // 按 LLM 服务商限流
  byProvider: Record<string, {
    requestsPerMinute: number;
    tokensPerMinute: number;
    maxConcurrent: number;
  }>;

  // 按智能体限流
  byAgent: {
    maxTasksPerHour: number;  // 默认 100
    maxTokensPerHour: number;
  };

  // 突发流量处理
  burst: {
    enabled: boolean;
    maxBurstSize: number;  // 默认 5
    burstCooldown: number;  // 毫秒，默认 1000
  };
}

// 限流计数器
interface RateLimitCounter {
  key: string;
  count: number;
  resetAt: Date;
}

// 限流结果
type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;  // 如果被限流，建议等待时间
};
```

### 7.4 重试策略

```typescript
interface RetryConfig {
  // 重试次数
  maxRetries: number;  // 默认 3

  // 重试间隔
  initialDelay: number;  // 毫秒，默认 1000
  maxDelay: number;  // 毫秒，默认 60000
  delayMultiplier: number;  // 延迟倍数，默认 2

  // 指数退避
  exponentialBackoff: boolean;
  jitter: boolean;  // 添加随机抖动

  // 可重试错误
  retryableErrors: string[];  // 错误类型列表

  // 不可重试错误
  nonRetryableErrors: string[] = [
    'authentication_error',
    'permission_denied',
    'invalid_request'
  ];
}

// 重试决策
interface RetryDecision {
  shouldRetry: boolean;
  delay: number;
  reason: string;
}

// 重试策略配置示例
const LLM_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  delayMultiplier: 2,
  exponentialBackoff: true,
  jitter: true,
  retryableErrors: [
    'rate_limit_exceeded',
    'service_unavailable',
    'timeout',
    'network_error',
    'context_length_exceeded'
  ],
};

const TOOL_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  initialDelay: 500,
  maxDelay: 10000,
  delayMultiplier: 2,
  exponentialBackoff: true,
  jitter: true,
  retryableErrors: [
    'timeout',
    'network_error',
    'temporary_failure'
  ],
};
```

### 7.5 故障恢复流程

```
故障检测
    │
    ├─→ LLM 服务故障
    │   ├─→ 检查熔断器状态
    │   ├─→ 切换到备用服务商
    │   └─→ 如果全部不可用，触发降级策略
    │
    ├─→ 工具调用失败
    │   ├─→ 检查是否可重试
    │   ├─→ 可重试 → 执行重试策略
    │   └─→ 不可重试 → 记录错误，返回用户
    │
    ├─→ 任务执行失败
    │   ├─→ 检查 checkpoint
    │   ├─→ 记录失败原因
    │   └─→ 通知用户或自动重试
    │
    └─→ 系统资源不足
        ├─→ 检测资源使用率
        ├─→ 触发降级策略
        └─→ 发送告警通知
```

### 7.6 告警配置

```typescript
interface AlertConfig {
  // 告警通道
  channels: {
    console: boolean;
    file: boolean;
    webhook?: {
      url: string;
      headers?: Record<string, string>;
    };
  };

  // 告警规则
  rules: AlertRule[];
}

interface AlertRule {
  id: string;
  name: string;
  condition: AlertCondition;
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
  cooldown: number;  // 告警间隔（毫秒）
  channels: string[];  // 告警通道列表
}

interface AlertCondition {
  type: 'metric' | 'event' | 'status';
  metric?: {
    name: string;
    operator: '>' | '<' | '>=' | '<=' | '==';
    value: number;
    duration: number;  // 持续时间
  };
  event?: {
    type: string;
    count: number;
    duration: number;
  };
  status?: {
    component: string;
    status: string;
  };
}

// 预定义告警规则
const ALERT_RULES: AlertRule[] = [
  {
    id: 'task_failure_rate',
    name: '任务失败率过高',
    condition: {
      type: 'metric',
      metric: {
        name: 'agent_team_tasks_failed',
        operator: '>',
        value: 10,
        duration: 300000  // 5 分钟内
      }
    },
    severity: 'warning',
    enabled: true,
    cooldown: 600000,  // 10 分钟
    channels: ['console', 'file']
  },
  {
    id: 'llm_error_rate',
    name: 'LLM 错误率过高',
    condition: {
      type: 'metric',
      metric: {
        name: 'agent_team_llm_errors_total',
        operator: '>',
        value: 5,
        duration: 300000
      }
    },
    severity: 'critical',
    enabled: true,
    cooldown: 300000,
    channels: ['console', 'file']
  },
  {
    id: 'memory_usage',
    name: '内存使用率过高',
    condition: {
      type: 'metric',
      metric: {
        name: 'agent_team_memory_usage_percent',
        operator: '>=',
        value: 85,
        duration: 60000
      }
    },
    severity: 'warning',
    enabled: true,
    cooldown: 300000,
    channels: ['console', 'file']
  },
  {
    id: 'task_stuck',
    name: '任务卡住',
    condition: {
      type: 'status',
      component: 'task',
      status: 'stuck'
    },
    severity: 'warning',
    enabled: true,
    cooldown: 600000,
    channels: ['console', 'file']
  },
];
```

## 8. 扩展性设计

### 8.1 插件架构

```typescript
// 插件接口
interface Plugin {
  // 插件元数据
  metadata: {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    dependencies?: Record<string, string>;
  };

  // 生命周期钩子
  lifecycle: {
    onLoad?: (context: PluginContext) => Promise<void>;
    onUnload?: () => Promise<void>;
    onUpgrade?: (fromVersion: string) => Promise<void>;
  };

  // 扩展点
  extensions: {
    // 扩展工具
    tools?: ToolDefinition[];

    // 扩展角色
    roles?: RoleDefinition[];

    // 扩展适配器
    adapters?: LLMAdapter[];

    // 扩展事件处理器
    eventHandlers?: Array<{
      event: string;
      handler: EventHandler;
    }>;

    // 扩展 UI 组件
    uiComponents?: UIComponent[];

    // 扩展命令
    commands?: CommandDefinition[];
  };

  // 配置
  config?: {
    schema: z.ZodSchema;
    default?: Record<string, any>;
  };
}

// 插件上下文
interface PluginContext {
  pluginId: string;
  services: {
    llmService: LLMService;
    taskManager: TaskManager;
    eventSystem: EventSystem;
    configManager: ConfigManager;
  };
  config: {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
  };
}

// 插件管理器
interface PluginManager {
  // 插件注册
  register(plugin: Plugin): void;
  unregister(pluginId: string): void;

  // 插件发现
  discover(paths: string[]): Promise<Plugin[]>;
  load(pluginId: string): Promise<void>;
  unload(pluginId: string): Promise<void>;

  // 插件查询
  getPlugin(pluginId: string): Plugin | null;
  getPlugins(): Plugin[];
  getPluginsByExtension(extensionPoint: string): Plugin[];

  // 插件状态
  getPluginStatus(pluginId: string): 'loaded' | 'unloaded' | 'error';
}

// 插件目录结构
const PLUGIN_STRUCTURE = `
plugins/
├── my-plugin/
│   ├── package.json          # 插件元数据
│   ├── src/
│   │   └── index.ts          # 插件入口
│   ├── dist/
│   │   └── index.js          # 编译后代码
│   ├── package.json          # 依赖配置
│   └── README.md             # 插件文档
`;
```

### 8.2 事件扩展

```typescript
// 自定义事件类型
type CustomEvent =
  | 'plugin:loaded'
  | 'plugin:unloaded'
  | 'custom:task_completed'
  | 'custom:report_generated'
  | 'custom:user_action';

// 事件扩展点
interface EventExtensionPoint {
  name: string;
  description: string;
  payloadSchema: z.ZodSchema;
}

// 预定义扩展点
const EVENT_EXTENSION_POINTS: EventExtensionPoint[] = [
  {
    name: 'task.lifecycle',
    description: '任务生命周期事件',
    payloadSchema: z.object({
      taskId: z.string(),
      status: z.enum(['created', 'started', 'completed', 'failed']),
      metadata: z.record(z.any()).optional()
    })
  },
  {
    name: 'agent.lifecycle',
    description: '智能体生命周期事件',
    payloadSchema: z.object({
      agentId: z.string(),
      status: z.enum(['created', 'started', 'stopped', 'error']),
      metadata: z.record(z.any()).optional()
    })
  },
  {
    name: 'llm.request',
    description: 'LLM 请求事件',
    payloadSchema: z.object({
      provider: z.string(),
      model: z.string(),
      requestId: z.string(),
      duration: z.number()
    })
  },
];

// 事件订阅器扩展
interface EventSubscriberExtension {
  id: string;
  name: string;
  events: string[];
  handler: (event: any) => Promise<void>;
  priority: number;  // 优先级，数值越小越先执行
  filters?: Record<string, any>;  // 事件过滤条件
}
```

### 8.3 LLM 服务商扩展

```typescript
// 适配器注册接口
interface LLMAdapterRegistry {
  // 注册适配器
  register(provider: string, adapterClass: Class<LLMAdapter>): void;
  unregister(provider: string): void;

  // 获取适配器
  getAdapter(provider: string): LLMAdapter | null;
  getSupportedProviders(): string[];

  // 适配器发现
  discover(paths: string[]): Promise<string[]>;
  loadAdapter(provider: string): Promise<LLMAdapter>;
}

// 新增 LLM 服务商示例
interface NewProviderAdapter extends LLMAdapter {
  // 特定于新提供商的方法
  getModelList(): Promise<ModelInfo[]>;
  getPricing(model: string): PricingInfo;
}

// 注册新提供商
llmAdapterRegistry.register('custom-provider', CustomProviderAdapter);

// 配置文件示例
llm:
  providers:
    custom-provider:
      name: "自定义提供商"
      provider: "custom"
      apiKey: "${CUSTOM_API_KEY}"
      baseURL: "https://api.custom.com/v1"
      enabled: true
      models:
        custom-model:
          model: "custom-model-v1"
          maxTokens: 4096
```

### 8.4 工具扩展

```typescript
// 工具注册接口
interface ToolRegistryExtension {
  // 注册工具
  register(tool: ToolDefinition): void;
  unregister(name: string): void;

  // 工具发现
  discover(paths: string[]): Promise<string[]>;
  loadTool(name: string): Promise<ToolDefinition>;

  // 工具分类
  getCategories(): string[];
  getToolsByCategory(category: string): ToolDefinition[];
}

// 自定义工具示例
const customTool: ToolDefinition = {
  id: 'custom-database-query',
  name: '数据库查询',
  description: '执行自定义数据库查询',
  category: 'database',
  parameters: z.object({
    query: z.string().describe('SQL 查询语句'),
    params: z.array(z.any).optional().describe('查询参数'),
    timeout: z.number().optional().describe('超时时间（毫秒）')
  }),
  returns: {
    type: 'json',
    description: '查询结果 JSON'
  },
  constraints: {
    dangerous: true,
    requireConfirmation: true
  },
  examples: [
    {
      input: { query: 'SELECT * FROM users LIMIT 10' },
      output: { users: [...] }
    }
  ]
};
```

### 8.5 配置扩展

```typescript
// 配置扩展点
interface ConfigExtensionPoint {
  name: string;
  schema: z.ZodSchema;
  mergeStrategy: 'override' | 'merge' | 'append';
}

// 配置扩展示例
const CONFIG_EXTENSIONS: ConfigExtensionPoint[] = [
  {
    name: 'plugins',
    schema: z.object({
      enabled: z.array(z.string()),
      paths: z.array(z.string()),
      settings: z.record(z.any()).optional()
    }),
    mergeStrategy: 'merge'
  },
  {
    name: 'custom.metrics',
    schema: z.object({
      enabled: z.boolean(),
      customMetrics: z.array(z.object({
        name: z.string(),
        type: z.enum(['counter', 'gauge', 'histogram']),
        query: z.string()
      }))
    }),
    mergeStrategy: 'override'
  }
];

// 配置热加载
interface ConfigHotReload {
  enabled: boolean;
  watchPaths: string[];
  onChange: (config: any) => void;
  debounceMs: number;  // 防抖时间
}
```

### 8.6 扩展开发指南

```typescript
// 扩展开发模板
const PLUGIN_TEMPLATE = `
// 1. 创建插件入口文件
import { Plugin, PluginContext } from '@agent-team/core';

export default class MyPlugin implements Plugin {
  metadata = {
    id: 'my-plugin',
    name: '我的插件',
    version: '1.0.0',
    description: '插件描述',
    author: '开发者'
  };

  async onLoad(context: PluginContext): Promise<void> {
    // 初始化逻辑
    console.log('插件加载:', this.metadata.name);
  }

  async onUnload(): Promise<void> {
    // 清理逻辑
    console.log('插件卸载:', this.metadata.name);
  }

  extensions = {
    tools: [/* 工具定义 */],
    roles: [/* 角色定义 */],
    eventHandlers: [
      {
        event: 'task:completed',
        handler: async (event) => {
          // 处理逻辑
        }
      }
    ]
  };
}

// 2. 导出插件
export default MyPlugin;

// 3. 在 package.json 中声明
{
  "name": "agent-team-plugin-my-plugin",
  "version": "1.0.0",
  "main": "dist/index.js",
  "agent-team": {
    "plugin": {
      "entry": "dist/index.js"
    }
  }
}
`;
```

## 9. 定时任务与调度机制

### 5.1 调度设计
定时汇报、定时检查等通过**任务调度器**实现：

```typescript
interface ScheduledTask {
  id: string;
  projectId: string;
  agentId: string;       // 执行任务的智能体
  type: ScheduledTaskType;
  cronExpression: string; // Cron 表达式
  config: {
    enabled: boolean;
    timeout?: number;
    retryPolicy?: {
      maxRetries: number;
      interval: number;
    };
  };
  lastRun?: {
    timestamp: Date;
    status: 'success' | 'failed';
    result?: any;
  };
  nextRun: Date;
  metadata: {
    createdAt: Date;
    createdBy: 'system' | 'user';
  };
}

type ScheduledTaskType =
  | 'progress-report'    // 进度汇报
  | 'health-check'       // 健康检查
  | 'context-cleanup'    // 上下文清理
  | 'resource-monitor'   // 资源监控
  | 'custom-report';     // 自定义汇报
```

### 5.2 调度执行流程
```
Scheduler（调度器）
    │
    ├─→ 维护任务队列（内存 + SQLite 持久化）
    │   │
    │   └─→ Cron 解析
    │       └─→ 计算下次执行时间
    │
    ├─→ 事件触发
    │   │
    │   ├─→ 触发时间到达
    │   │   └─→ 创建 Task，分配给对应 Agent
    │   │
    │   └─→ 触发条件满足
    │       └─→ Agent 根据上下文决定是否执行
    │
    └─→ 执行模式
        │
        ├─→ **智能体自主模式**（推荐）
        │   ├─→ 调度器发送"建议执行"消息给 Agent
        │   ├─→ Agent 根据当前状态判断是否执行
        │   └─→ Agent 决定执行时间
        │
        └─→ **强制执行模式**
            ├─→ 调度器强制创建任务
            └─→ Agent 必须执行
```

### 5.3 内置定时任务
| 任务类型 | 默认调度 | 执行者 | 说明 |
|---------|---------|-------|------|
| 进度汇报 | 每 4 小时 | Project Manager | 项目进度汇总 |
| 健康检查 | 每小时 | System Monitor | 系统健康状态 |
| 上下文清理 | 每天凌晨 | System | 清理过期上下文 |
| 资源监控 | 每 5 分钟 | System | 监控资源使用 |

## 6. 大模型工具调用框架

### 6.1 核心挑战
大模型调用工具是**非确定性**的，需要框架约束：
- 避免无限循环调用工具
- 避免调用不存在的工具
- 避免传递错误参数
- 避免超出预算/配额

### 6.2 工具调用约束框架

```
┌─────────────────────────────────────────────────────────┐
│                    Tool Call Framework                   │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │ Tool Schema │  │ Call Guard  │  │ Result      │      │
│  │ Registry    │  │ Validator   │  │ Processor   │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
│         │              │              │                  │
│         └──────────────┼──────────────┘                  │
│                        ▼                                  │
│              ┌─────────────────┐                          │
│              │ Orchestrator    │                          │
│              │ (控制调用流程)   │                          │
│              └─────────────────┘                          │
└─────────────────────────────────────────────────────────┘
```

### 6.3 Tool Schema Registry
```typescript
interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      required?: boolean;
      enum?: string[];
    }>;
    required: string[];
  };
  returns: {
    type: string;
    description: string;
  };
  constraints?: {
    maxTokens?: number;
    timeout?: number;
    dangerous?: boolean;
    confirmBeforeCall?: boolean;
  };
  examples?: Array<{
    input: any;
    output: any;
  }>;
}
```

### 6.4 Call Guard Validator
```typescript
class CallGuardValidator {
  // 1. 工具存在性检查
  validateToolExists(toolName: string): boolean

  // 2. 参数 Schema 验证
  validateParameters(toolName: string, params: any): ValidationResult

  // 3. 频率限制
  checkRateLimit(agentId: string, toolName: string): boolean

  // 4. 配额检查
  checkQuota(agentId: string, toolName: string): boolean

  // 5. 危险操作确认
  async requireConfirmation(toolName: string, params: any): Promise<boolean>
}
```

### 6.5 Tool Usage Policy Engine
```typescript
interface PolicyRule {
  id: string;
  name: string;
  condition: (context: PolicyContext) => boolean;
  action: 'allow' | 'deny' | 'modify' | 'log';
  modifier?: (toolCall: ToolCall) => ToolCall;
}

class PolicyEngine {
  rules: PolicyRule[];

  evaluate(toolCall: ToolCall, context: PolicyContext): PolicyResult {
    // 按优先级执行规则
    for (const rule of this.rules) {
      if (rule.condition(context)) {
        const result = this.applyRule(rule, toolCall);
        if (result.action === 'deny') return result;
      }
    }
    return { action: 'allow', toolCall };
  }
}
```

### 6.6 内置策略规则
| 规则 | 条件 | 动作 |
|-----|------|------|
| 工具存在性 | 工具未注册 | deny |
| 参数必填 | 缺少必需参数 | deny |
| 危险操作 | dangerous=true | confirm |
| 频率限制 | 单工具调用 > N 次/分钟 | deny + log |
| 预算控制 | 预计花费 > 剩余预算 | modify (降低 maxTokens) |
| 循环检测 | 相同工具调用序列重复 | deny + log |
| 上下文溢出 | 上下文 > 阈值 | modify (截断历史) |

### 6.7 工具调用执行流程
```
1. LLM 输出工具调用
          │
          ▼
2. Schema Validation（验证工具和参数）
          │
          ├─→ 失败 → 返回错误给 LLM，重试
          │
          ▼
3. Policy Engine 检查
          │
          ├─→ deny → 记录日志，返回拒绝原因
          ├─→ confirm → 等待用户确认或超时自动拒绝
          │
          ▼
4. 频率/配额检查
          │
          ├─→ 超限 → 排队等待或返回重试建议
          │
          ▼
5. 执行工具调用
          │
          ▼
6. 结果处理
          │
          ├─→ 格式化输出
          ├─→ 记录执行日志
          ├─→ 更新配额统计
          │
          ▼
7. 返回结果给 LLM
```

### 6.8 结果 Processor
```typescript
interface ToolResultProcessor {
  // 结果标准化
  standardize(result: any, toolSchema: ToolSchema): StandardResult

  // 结果裁剪（防止过长输出）
  truncate(result: StandardResult, maxTokens: number): StandardResult

  // 结果敏感信息过滤
  sanitize(result: StandardResult): StandardResult

  // 结果缓存（避免重复调用）
  cache(result: StandardResult): string

  // 生成用户友好的错误消息
  formatError(error: any): string
}
```

## 7. API 设计

### 4.1 任务 API
- `developFeature(options)`：开发功能（一站式）
- `execute(task)`：执行单个任务
- `executeWorkflow(id)`：执行工作流
- `useTool(name, params)`：使用工具

### 4.2 配置 API
- `loadConfig()`：加载配置
- `getConfig()`：获取配置
- `setPromptConfigPath(paths)`：设置提示词配置路径
- `setLLMConfigPath(path)`：设置 LLM 配置路径

### 4.3 事件 API
- `on(event, listener)`：注册事件监听器
- `off(event, listener)`：移除事件监听器
- `emit(event, data)`：触发事件

### 4.4 配置检查 API
- `runConfigCheck()`：运行配置检查
- `getConfigStatus()`：获取配置状态

### 4.5 工作流调试 API
- `loadWorkflow(id)`：加载工作流
- `setBreakpoint(stepId)`：设置断点
- `stepNext()`：单步执行
- `getState()`：获取调试状态

### 4.6 项目管理 API
- `createProject(name, path, config?)`：创建项目
- `listProjects()`：列出所有项目
- `getProject(id)`：获取项目详情
- `updateProject(id, updates)`：更新项目
- `deleteProject(id, options?)`：删除项目
- `switchProject(id)`：切换项目
- `getProjectStats(id)`：获取项目统计
- `getProjectTasks(id)`：获取项目任务列表
- `getProjectWorkflows(id)`：获取项目工作流列表
- `getProjectHistory(id, options?)`：获取项目执行历史
- `archiveProject(id)`：归档项目
- `restoreProject(id)`：恢复项目

## 5. Web API 端点

### 5.1 角色相关
- `GET /api/roles`：获取所有角色
- `GET /api/config`：获取系统配置

### 5.2 任务相关
- `GET /api/tasks`：获取所有任务
- `GET /api/tasks/:id`：获取单个任务
- `POST /api/tasks`：创建任务
- `PUT /api/tasks/:id/status`：更新任务状态
- `POST /api/tasks/:id/execute`：执行任务
- `DELETE /api/tasks/:id`：删除任务
- `POST /api/tasks/chat`：对话式任务创建
- `POST /api/tasks/:id/chat`：对话式任务执行

### 5.3 统计信息
- `GET /api/stats`：获取统计信息

### 5.4 工作流相关
- `GET /api/workflows`：获取所有工作流
- `POST /api/workflows/:id/execute`：执行工作流

### 5.5 工具相关
- `GET /api/tools`：获取可用工具列表

### 5.6 项目管理相关
- `GET /api/projects`：获取项目列表
- `GET /api/projects/:id`：获取项目详情
- `POST /api/projects`：创建项目
- `PUT /api/projects/:id`：更新项目
- `DELETE /api/projects/:id`：删除项目
- `POST /api/projects/:id/switch`：切换项目
- `GET /api/projects/:id/stats`：获取项目统计
- `GET /api/projects/:id/tasks`：获取项目任务列表
- `GET /api/projects/:id/workflows`：获取项目工作流列表
- `GET /api/projects/:id/history`：获取项目执行历史
- `POST /api/projects/:id/archive`：归档项目
- `POST /api/projects/:id/restore`：恢复项目

## 6. 部署和运维

### 6.1 安装方式
- **npm 全局安装**：`npm install -g agent-team`
- **本地开发**：`npm install` + `npm link`
- **npx 使用**：`npx agent-team <command>`

### 6.2 配置初始化
- 支持交互式配置向导
- 支持配置文件模板
- 支持配置验证

### 6.3 监控和日志
- 支持日志文件输出
- 支持日志轮转
- 支持统计信息收集

### 6.4 服务器配置
- 支持通过环境变量配置端口和主机
- 默认端口：3000
- 默认主机：localhost
- 支持开发模式（自动重启）

## 7. 测试要求

### 7.1 单元测试
- 核心模块应有单元测试
- 测试覆盖率 > 80%
- 使用 Vitest 测试框架

### 7.2 集成测试
- 端到端流程测试
- API 接口测试
- CLI 命令测试

### 7.3 性能测试
- 并发任务执行测试
- 大文件处理测试
- LLM 调用超时测试

## 8. 文档要求

### 8.1 用户文档
- 快速入门指南
- 配置指南
- 角色管理指南
- 提示词管理指南
- 规则管理指南
- AI Agent 使用指南
- 工作流指南
- 自由输入指南
- 交互式模式指南

### 8.2 API 文档
- 完整的 API 参考
- 代码示例
- 最佳实践

### 8.3 开发者文档
- 架构设计文档
- 扩展开发指南
- 贡献指南

## 9. 未来规划

### 9.1 短期计划
- 插件系统支持
- 更多 LLM 服务商支持
- 性能优化

### 9.2 中期计划
- 可视化工作流编辑器
- 团队协作功能
- 任务模板市场
- 项目模板市场
- 项目导入/导出功能
- 项目对比和合并功能

### 9.3 长期计划
- 分布式执行
- 多项目管理
- 企业级功能

---

**文档版本**：1.6.0
**最后更新**：2026-01-31
**维护者**：Project Agent Team

## 附录：变更记录

### v1.6.0 (2026-01-31)
- **移除 CLI 模块**：根据需求调整，暂不实现命令行工具
- **简化任务管理**：移除任务依赖、优先级、子任务概念，状态简化为 pending/running/done
- **移除 WorkflowEngine**：工作流改为角色提示词的一部分，不再有独立的工作流引擎
- **移除 Scheduler**：移除定时任务调度功能
- **简化上下文管理**：移除复杂的上下文存储结构，简化断点机制
- **项目状态简化**：状态从 active/paused/archived/deleted 简化为 active/archived
- **规则改为 Markdown**：规则存储从数据库改为 Markdown 文件，优先级为 project > role > global
- **LLM 配置简化**：用户仅需提供 API Key，其他配置由系统预设
- **角色提示词改为 Markdown**：角色提示词存储为 Markdown 文件
- **项目结构调整**：移除 cli/ 和 prompts/ 目录，roles/ 目录存储角色提示词，rules/ 存储规则文件

### v1.5.0 (2025-01-31)
- **安全架构**：新增服务绑定与网络隔离、敏感数据保护（API Key 加密、日志脱敏）、工具调用安全、审计日志
- **可观测性设计**：新增日志规范（格式、级别、轮转）、指标采集（任务、智能体、LLM、系统指标）、健康检查端点（/health、/metrics、/ready）、链路追踪、仪表板配置
- **容错与弹性设计**：新增熔断机制（LLM 服务熔断器配置）、降级策略（按错误率/资源使用率降级）、限流策略（全局/按服务商/按智能体限流）、重试策略（指数退避、抖动）、故障恢复流程、告警配置
- **扩展性设计**：新增插件架构（Plugin 接口、插件管理器）、事件扩展（自定义事件类型、扩展点）、LLM 服务商扩展（适配器注册、新增提供商示例）、工具扩展（自定义工具注册）、配置扩展（配置热加载、扩展点）

### v1.4.0 (2025-01-31)
- **架构分层设计**：新增六边形架构分层（用户接口层 → 应用层 → 领域层 → 基础设施层）
- **功能模块详细设计**：新增所有核心模块的职责、主要方法、状态机设计
- **模块概览表格**：列出模块路径、职责、依赖关系
- **模块依赖关系图**：使用 ASCII 图展示模块间依赖关系
- **数据流设计**：新增任务执行数据流、上下文管理数据流、定时任务数据流

### v1.3.0 (2025-01-31)
- **LLM 服务封装架构**：新增完整的 LLM Adapter Layer 设计
- **统一抽象接口**：定义 ChatRequest、ChatResponse、EmbedRequest、EmbedResponse 统一接口
- **适配器接口**：定义 LLMAdapter 接口和 LLMAdapterFactory 工厂
- **服务商适配器实现**：详细设计 OpenAI、Anthropic Claude、Qwen、GLM 等适配器
- **HTTP 客户端层**：封装速率限制、错误解析、错误映射机制
- **错误统一处理**：定义 ErrorCode 枚举和 LLMErrorHandler 错误处理器
- **Token 统计与计费**：新增 TokenManager 设计和成本计算

### v1.2.0 (2025-01-31)
- **角色与智能体关系**：明确 Role（行为模板）与 AgentInstance（运行实例）的区分和关联
- **智能体状态模型**：新增 AgentState 数据模型，定义 7 种状态
- **任务断点模型**：新增 TaskCheckpoint，支持 5 种断点类型和完整恢复数据
- **持久化设计**：采用 SQLite + JSON + Markdown 分层存储，定义完整 Schema 和重启恢复流程
- **定时任务调度**：新增 ScheduledTask 模型，设计智能体自主模式和强制执行模式
- **大模型工具调用框架**：新增 Tool Schema Registry、Call Guard Validator、Policy Engine，定义完整调用约束流程

### v1.1.0 (2025-01-31)
- **新增 DynamicRoleFactory 模块**：支持动态角色创建和管理
- **角色模型扩展**：新增 `createdBy`、`createdAt`、`llmModel`、`generationContext` 字段
- **新增工具模型**：定义 ToolDefinition 接口及浏览器工具、图像视频生成工具配置
