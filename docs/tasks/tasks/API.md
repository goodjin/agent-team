# 模块 API 接口设计

## 目录

- [4. 基础设施层 API](#4-基础设施层-api)
  - [4.1 LLM 服务 API](#41-llm-服务-api)
  - [4.2 工具系统 API](#42-工具系统-api)
  - [4.3 配置管理 API](#43-配置管理-api)
  - [4.4 类型定义 API](#44-类型定义-api)
  - [4.5 工具函数 API](#45-工具函数-api)
- [3. 领域层 API](#3-领域层-api)
  - [3.1 AI Agent API](#31-ai-agent-api)
  - [3.2 角色管理 API](#32-角色管理-api)
  - [3.3 规则管理 API](#33-规则管理-api)
- [2. 应用层 API](#2-应用层-api)
  - [2.1 核心模块 API](#21-核心模块-api)
- [1. 用户接口层 API](#1-用户接口层-api)
  - [1.1 服务器 API](#11-服务器-api)

---

# 4. 基础设施层 API

## 4.1 LLM 服务 API

### 4.1.1 LLMService 接口

```typescript
// src/services/llm/llm-service.ts

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

interface ChatResponse {
  id: string;
  model: string;
  choices: {
    index: number;
    message: {
      role: 'assistant';
      content: string;
      toolCalls?: ToolCall[];
    };
    finishReason: string;
  }[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface TokenStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface ProviderInfo {
  name: string;
  enabled: boolean;
  models: string[];
}

interface LLMService {
  // 对话接口
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<ChatResponse>;

  // 提供商管理
  getAvailableProviders(): ProviderInfo[];
  getDefaultProvider(): string;
  setDefaultProvider(provider: string): void;

  // 故障转移
  failover(provider: string): boolean;
  getCurrentProvider(): string;

  // 统计
  getStats(): TokenStats;
  resetStats(): void;

  // 健康检查
  healthCheck(provider?: string): Promise<boolean>;
}
```

### 4.1.2 LLMAdapter 接口

```typescript
// src/services/llm/adapter.ts

interface LLMAdapter {
  readonly provider: string;
  readonly supportedModels: string[];

  // 对话
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<ChatResponse>;

  // 嵌入（可选）
  embed(input: string | string[]): Promise<number[][]>;

  // 提供商特定功能
  getModelList(): { id: string; name: string; maxTokens: number }[];
  getPricing(model: string): { input: number; output: number };

  // 健康检查
  healthCheck(): Promise<boolean>;
}

interface LLMAdapterFactory {
  createAdapter(config: ProviderConfig): LLMAdapter;
  getAdapter(provider: string): LLMAdapter | null;
  registerAdapter(provider: string, adapterClass: Class<LLMAdapter>): void;
  getRegisteredProviders(): string[];
}
```

### 4.1.3 配置类型

```typescript
// src/services/llm/types.ts

interface ProviderConfig {
  name: string;
  provider: string;
  apiKey: string;
  baseURL?: string;
  enabled: boolean;
  models: {
    [modelName: string]: {
      model: string;
      maxTokens?: number;
      temperature?: number;
      description?: string;
    };
  };
}

interface LLMConfig {
  defaultProvider: string;
  providers: { [providerName: string]: ProviderConfig };
  fallbackOrder?: string[];
}
```

---

## 4.2 工具系统 API

### 4.2.1 ToolRegistry 接口

```typescript
// src/tools/tool-registry.ts

type ToolCategory = 'file' | 'git' | 'code' | 'browser' | 'ai-generation' | 'custom';

interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: any;
}

interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: ToolParameter[];
  returnFormat: string;
  version?: string;
  enabled?: boolean;
}

interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    executionTime: number;
    tokenUsage?: {
      input: number;
      output: number;
    };
  };
}

interface ToolRegistry {
  // 工具注册
  register(tool: ToolDefinition): void;
  unregister(name: string): boolean;

  // 工具查询
  getTool(name: string): ToolDefinition | null;
  getTools(filters?: {
    category?: ToolCategory;
    enabled?: boolean;
  }): ToolDefinition[];
  getToolsByCategory(category: ToolCategory): ToolDefinition[];
  getAllTools(): ToolDefinition[];

  // 工具执行
  execute(name: string, params: Record<string, any>): Promise<ToolResult>;
  executeAsync(name: string, params: Record<string, any>): Promise<ToolResult>;

  // 参数验证
  validateParams(name: string, params: Record<string, any>): {
    valid: boolean;
    errors?: string[];
  };
}
```

### 4.2.2 工具实现接口

```typescript
// src/tools/impl/file-tools.ts

interface FileToolParams {
  filePath: string;
  content?: string;
  pattern?: string;
  cwd?: string;
  ignore?: string[];
}

interface FileToolResult {
  read: { content: string };
  write: { success: boolean };
  search: { files: string[] };
  delete: { success: boolean };
  list: { entries: string[] };
}

interface FileTools {
  read(params: FileToolParams): Promise<ToolResult<FileToolResult['read']>>;
  write(params: FileToolParams): Promise<ToolResult<FileToolResult['write']>>;
  search(params: FileToolParams): Promise<ToolResult<FileToolResult['search']>>;
  delete(params: FileToolParams): Promise<ToolResult<FileToolResult['delete']>>;
  list(params: FileToolParams): Promise<ToolResult<FileToolResult['list']>>;
}

// src/tools/impl/git-tools.ts

interface GitToolParams {
  cwd?: string;
  message?: string;
  action?: 'list' | 'create' | 'delete';
  branchName?: string;
}

interface GitToolResult {
  status: { modified: string[]; branch: string };
  commit: { success: boolean; commitHash?: string };
  branch: { branches: string[] };
  pull: { success: boolean; changes?: any };
  push: { success: boolean };
}

interface GitTools {
  status(params: GitToolParams): Promise<ToolResult<GitToolResult['status']>>;
  commit(params: GitToolParams): Promise<ToolResult<GitToolResult['commit']>>;
  branch(params: GitToolParams): Promise<ToolResult<GitToolResult['branch']>>;
  pull(params: GitToolParams): Promise<ToolResult<GitToolResult['pull']>>;
  push(params: GitToolParams): Promise<ToolResult<GitToolResult['push']>>;
}
```

---

## 4.3 配置管理 API

### 4.3.1 ConfigManager 接口

```typescript
// src/config/config-manager.ts

interface ConfigCheckResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface AppConfig {
  llm: LLMConfig;
  project: {
    defaultPath: string;
  };
  server: {
    port: number;
    host: string;
  };
}

interface ConfigManager {
  // 加载配置
  loadConfig(): Promise<void>;
  reloadConfig(): Promise<void>;

  // 获取配置
  getConfig(): AppConfig;
  getLLMConfig(): LLMConfig;
  getServerConfig(): { port: number; host: string };

  // 获取特定配置
  getProviderConfig(providerName: string): ProviderConfig | null;
  getAPIKey(providerName: string): string | null;

  // 配置检查
  checkConfig(): ConfigCheckResult;

  // 环境变量
  getEnvOverride(key: string): string | null;
}
```

---

## 4.4 类型定义 API

### 4.4.1 导出类型

```typescript
// src/types/index.ts

// 通用类型
type Result<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
};

type AsyncResult<T> = Promise<Result<T>>;

// 项目类型
type ProjectStatus = 'active' | 'archived';

interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  status: ProjectStatus;
  config: ProjectConfig;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    version?: string;
  };
}

// 任务类型
type TaskStatus = 'pending' | 'running' | 'done';

interface Task {
  id: string;
  projectId: string;
  category: string;
  title: string;
  description: string;
  progress: string;
  status: TaskStatus;
  agentId?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// 智能体类型
type AgentStatus = 'idle' | 'running' | 'stopped';

interface Agent {
  id: string;
  roleId: string;
  projectId: string;
  name: string;
  status: AgentStatus;
  currentTaskId?: string;
  llmProvider?: string;
  llmModel?: string;
  metadata: {
    createdAt: Date;
    lastActiveAt: Date;
    restartCount: number;
  };
}

// 角色类型
type RoleType = 'product-manager' | 'project-manager' | 'architect' | 'developer' | 'tester' | 'doc-writer' | 'custom';

interface Role {
  id: string;
  name: string;
  type: RoleType;
  description: string;
  promptPath: string;
  createdBy: 'system' | 'user' | 'llm';
  createdAt?: Date;
  enabled: boolean;
}

// 规则类型
type RuleType = 'global' | 'project' | 'role';

interface Rule {
  id: string;
  name: string;
  type: RuleType;
  filePath: string;
  scope?: string;
  enabled: boolean;
}

// 事件类型
type EventType =
  | 'task.created'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'agent.created'
  | 'agent.stopped';

interface Event<T = any> {
  type: EventType;
  data: T;
  timestamp: Date;
}

interface EventHandler {
  (event: Event): void | Promise<void>;
}
```

---

## 4.5 工具函数 API

```typescript
// src/utils/file.ts

interface FileUtils {
  // 读取
  readFile(path: string): Promise<string>;

  // 写入
  writeFile(path: string, content: string): Promise<void>;

  // 检查
  exists(path: string): Promise<boolean>;
  isFile(path: string): Promise<boolean>;
  isDir(path: string): Promise<boolean>;

  // 目录操作
  mkdir(path: string, options?: { recursive: boolean }): Promise<void>;
  rmdir(path: string, options?: { recursive: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;

  // 删除
  unlink(path: string): Promise<void>;

  // 模式匹配
  glob(pattern: string, cwd?: string): Promise<string[]>;

  // 路径操作
  join(...paths: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  extname(path: string): string;

  // 权限
  chmod(path: string, mode: number): Promise<void>;
  stat(path: string): Promise<{
    size: number;
    mtime: Date;
    isFile: boolean;
    isDir: boolean;
  }>;
}
```

---

# 3. 领域层 API

## 3.1 AI Agent API

### 3.1.1 Agent 接口

```typescript
// src/ai/agent.ts

interface AgentConfig {
  id: string;
  roleId: string;
  projectId: string;
  name: string;
  llmProvider?: string;
  llmModel?: string;
}

interface AgentExecutionResult {
  success: boolean;
  output: string;
  toolCalls?: ToolCall[];
  progress?: string;
  error?: string;
  metadata?: {
    tokens: { prompt: number; completion: number; total: number };
    duration: number;
  };
}

interface Agent {
  // 初始化
  loadRolePrompt(roleId: string): Promise<void>;
  loadRules(projectId?: string, roleId?: string): Promise<void>;

  // 任务执行
  executeTask(task: Task): Promise<AgentExecutionResult>;
  executeTaskStream(task: Task): AsyncIterable<AgentExecutionResult>;

  // 对话
  chat(messages: ChatMessage[]): Promise<ChatResponse>;
  chatStream(messages: ChatMessage[]): AsyncIterable<ChatResponse>;

  // 工具使用
  useTool(name: string, params: Record<string, any>): Promise<ToolResult>;

  // 进度更新
  updateProgress(taskId: string, progress: string): Promise<void>;

  // 汇报
  reportToManager(task: Task): Promise<void>;

  // 状态管理
  getStatus(): AgentStatus;
  setStatus(status: AgentStatus): void;
  setCurrentTask(taskId: string | null): void;

  // 清理
  destroy(): void;
}
```

### 3.1.2 CheckpointManager 接口

```typescript
// src/ai/checkpoint.ts

type CheckpointType = 'step-complete' | 'tool-before' | 'tool-after' | 'context-snapshot';

interface CheckpointData {
  contextSnapshot?: {
    messages: ChatMessage[];
    loadedContextIds: string[];
  };
  toolCall?: {
    toolName: string;
    parameters: Record<string, any>;
    result?: any;
  };
  progress?: {
    completedSteps: string[];
    remainingSteps: string[];
    percentComplete: number;
  };
}

interface Checkpoint {
  id: string;
  taskId: string;
  agentId: string;
  projectId: string;
  checkpointType: CheckpointType;
  data: CheckpointData;
  metadata: {
    createdAt: Date;
    stepIndex: number;
    stepName: string;
  };
}

interface CheckpointManager {
  // 保存断点
  saveCheckpoint(
    taskId: string,
    agentId: string,
    projectId: string,
    type: CheckpointType,
    data: CheckpointData
  ): Promise<string>;

  // 加载断点
  loadLatestCheckpoint(taskId: string): Promise<Checkpoint | null>;
  loadCheckpoint(id: string): Promise<Checkpoint | null>;

  // 删除断点
  deleteCheckpoint(id: string): Promise<void>;
  deleteCheckpointsByTask(taskId: string): Promise<void>;

  // 查询
  getCheckpointsByTask(taskId: string): Promise<Checkpoint[]>;
  getCheckpointsByAgent(agentId: string): Promise<Checkpoint[]>;

  // 清理
  cleanupExpiredCheckpoints(maxAge?: number): Promise<number>;
}
```

---

## 3.2 角色管理 API

### 3.2.1 RoleManager 接口

```typescript
// src/roles/role-manager.ts

interface RoleManager {
  // 角色查询
  getRole(roleId: string): Promise<Role | null>;
  getRolePrompt(roleId: string): Promise<string | null>;
  getAllRoles(): Promise<Role[]>;
  listRoles(): Promise<{ id: string; name: string }[]>;

  // 角色创建
  createRole(role: {
    id: string;
    name: string;
    type: RoleType;
    description: string;
    systemPrompt: string;
  }): Promise<Role>;

  // 角色更新
  updateRolePrompt(roleId: string, systemPrompt: string): Promise<void>;

  // 角色删除
  deleteRole(roleId: string): Promise<void>;

  // 变量替换
  renderPrompt(template: string, variables: Record<string, string>): string;
}
```

---

## 3.3 规则管理 API

### 3.3.1 RuleManager 接口

```typescript
// src/rules/rule-manager.ts

interface RuleManager {
  // 规则查询
  getRule(ruleId: string): Promise<Rule | null>;
  getRuleContent(ruleId: string): Promise<string | null>;
  getAllRules(): Promise<Rule[]>;

  // 按范围查询
  getGlobalRules(): Promise<Rule[]>;
  getProjectRules(projectId: string): Promise<Rule[]>;
  getRoleRules(roleId: string): Promise<Rule[]>;

  // 规则合并
  getCombinedRules(options?: {
    projectId?: string;
    roleId?: string;
    enabledOnly?: boolean;
  }): Promise<string>;

  // 规则创建
  createRule(rule: {
    id: string;
    name: string;
    type: RuleType;
    content: string;
    scope?: string;
  }): Promise<Rule>;

  // 规则删除
  deleteRule(ruleId: string): Promise<void>;
}
```

---

# 2. 应用层 API

## 2.1 核心模块 API

### 2.1.1 TaskManager 接口

```typescript
// src/core/task-manager.ts

interface TaskManager {
  // 任务创建
  createTask(request: {
    description: string;
    projectId: string;
  }): Promise<Task>;

  // 任务查询
  getTask(id: string): Promise<Task | null>;
  getTasks(filters?: {
    projectId?: string;
    category?: string;
    status?: TaskStatus;
    agentId?: string;
  }): Promise<Task[]>;

  // 任务更新
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  updateProgress(id: string, progress: string): Promise<void>;

  // 任务状态
  startTask(id: string): Promise<void>;
  completeTask(id: string, result?: string): Promise<void>;
  failTask(id: string, error: string): Promise<void>;

  // 任务删除
  deleteTask(id: string): Promise<void>;

  // 统计
  getTaskStats(projectId: string): {
    total: number;
    pending: number;
    running: number;
    done: number;
  };

  // 任务编号
  getNextTaskId(): string;
}
```

### 2.1.2 AgentMgr 接口

```typescript
// src/core/agent-mgr.ts

interface AgentMgr {
  // 智能体创建
  createAgent(request: {
    roleId: string;
    projectId: string;
    name?: string;
    llmProvider?: string;
    llmModel?: string;
  }): Promise<Agent>;

  // 智能体查询
  getAgent(id: string): Promise<Agent | null>;
  getAgents(filters?: {
    projectId?: string;
    roleId?: string;
    status?: AgentStatus;
  }): Promise<Agent[]>;
  getAgentsByRole(roleId: string): Promise<Agent[]>;
  getAgentsByStatus(status: AgentStatus): Promise<Agent[]>;

  // 智能体状态
  setAgentStatus(id: string, status: AgentStatus): Promise<void>;
  setCurrentTask(id: string, taskId: string | null): Promise<void>;

  // 智能体重启
  restartAgent(id: string): Promise<void>;
  incrementRestartCount(id: string): Promise<void>;

  // 智能体检查
  checkAgentStatus(id: string): Promise<{
    status: AgentStatus;
    lastActiveAt: Date;
    needsRestart: boolean;
  }>;

  // 智能体删除
  deleteAgent(id: string): Promise<void>;
}
```

### 2.1.3 EventSystem 接口

```typescript
// src/core/event-system.ts

interface EventSystem {
  // 事件监听
  on(eventType: EventType, handler: EventHandler): void;
  off(eventType: EventType, handler: EventHandler): void;
  once(eventType: EventType, handler: EventHandler): void;

  // 事件派发
  emit(eventType: EventType, data: any): void;

  // 监听器管理
  getListeners(eventType: EventType): EventHandler[];
  removeAllListeners(eventType?: EventType): void;

  // 统计
  getEventStats(): {
    [eventType: string]: { count: number; handlers: number };
  };
}
```

### 2.1.4 ProjectAgent 主入口

```typescript
// src/core/project-agent.ts

interface ProjectAgent {
  // 项目信息
  readonly projectId: string;
  readonly taskManager: TaskManager;
  readonly agentMgr: AgentMgr;
  readonly eventSystem: EventSystem;

  // 任务管理
  createTask(description: string): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  getTasks(filters?: {
    category?: string;
    status?: TaskStatus;
  }): Promise<Task[]>;
  startTask(id: string): Promise<void>;
  completeTask(id: string): Promise<void>;

  // 智能体管理
  createAgent(roleId: string): Promise<Agent>;
  getAgent(id: string): Promise<Agent | null>;
  getAgents(filters?: { status?: AgentStatus }): Promise<Agent[]>;
  restartAgent(id: string): Promise<void>;

  // 角色和规则
  getRolePrompt(roleId: string): Promise<string>;
  getRules(options?: {
    projectId?: string;
    roleId?: string;
  }): Promise<string>;

  // 事件监听
  on(event: EventType, handler: EventHandler): void;
  off(event: EventType, handler: EventHandler): void;

  // 生命周期
  destroy(): void;
}
```

---

# 1. 用户接口层 API

## 1.1 服务器 API

### 1.1.1 Express 应用配置

```typescript
// src/server/index.ts

interface ServerConfig {
  port: number;
  host: string;
}

interface Server {
  readonly app: Express;
  readonly config: ServerConfig;

  start(): Promise<void>;
  stop(): Promise<void>;
  getApp(): Express;
}
```

### 1.1.2 路由接口

```typescript
// src/server/routes/projects.ts

interface ProjectRoutes {
  // GET /api/projects
  getProjects(): Promise<{
    success: boolean;
    data: Project[];
  }>;

  // GET /api/projects/:id
  getProject(id: string): Promise<{
    success: boolean;
    data: Project | null;
  }>;

  // POST /api/projects
  createProject(body: {
    name: string;
    path: string;
    description?: string;
  }): Promise<{
    success: boolean;
    data: Project;
  }>;

  // PATCH /api/projects/:id/status
  updateProjectStatus(id: string, body: {
    status: ProjectStatus;
  }): Promise<{
    success: boolean;
    data: Project;
  }>;

  // DELETE /api/projects/:id
  deleteProject(id: string): Promise<{
    success: boolean;
    message: string;
  }>;
}

// src/server/routes/tasks.ts

interface TaskRoutes {
  // GET /api/projects/:projectId/tasks
  getTasks(projectId: string, query: {
    category?: string;
    status?: TaskStatus;
  }): Promise<{
    success: boolean;
    data: Task[];
  }>;

  // GET /api/projects/:projectId/tasks/:id
  getTask(projectId: string, id: string): Promise<{
    success: boolean;
    data: Task | null;
  }>;

  // POST /api/projects/:projectId/tasks
  createTask(projectId: string, body: {
    description: string;
  }): Promise<{
    success: boolean;
    data: Task;
  }>;

  // PATCH /api/projects/:projectId/tasks/:id/status
  updateTaskStatus(projectId: string, id: string, body: {
    status: TaskStatus;
  }): Promise<{
    success: boolean;
    data: Task;
  }>;

  // DELETE /api/projects/:projectId/tasks/:id
  deleteTask(projectId: string, id: string): Promise<{
    success: boolean;
  }>;
}

// src/server/routes/roles.ts

interface RoleRoutes {
  // GET /api/roles
  getRoles(): Promise<{
    success: boolean;
    data: Role[];
  }>;

  // GET /api/roles/:id
  getRole(id: string): Promise<{
    success: boolean;
    data: Role | null;
  }>;

  // POST /api/roles
  createRole(body: {
    id: string;
    name: string;
    type: RoleType;
    description: string;
  }): Promise<{
    success: boolean;
    data: Role;
  }>;

  // PATCH /api/roles/:id
  updateRole(id: string, body: {
    systemPromptPath?: string;
  }): Promise<{
    success: boolean;
    data: Role;
  }>;

  // DELETE /api/roles/:id
  deleteRole(id: string): Promise<{
    success: boolean;
  }>;
}

// src/server/routes/agents.ts

interface AgentRoutes {
  // GET /api/agents
  getAgents(query?: {
    projectId?: string;
    roleId?: string;
    status?: AgentStatus;
  }): Promise<{
    success: boolean;
    data: Agent[];
  }>;

  // GET /api/agents/:id
  getAgent(id: string): Promise<{
    success: boolean;
    data: Agent | null;
  }>;

  // POST /api/agents
  createAgent(body: {
    roleId: string;
    projectId: string;
    name?: string;
  }): Promise<{
    success: boolean;
    data: Agent;
  }>;

  // POST /api/agents/:id/restart
  restartAgent(id: string): Promise<{
    success: boolean;
    data: Agent;
  }>;
}
```

---

# Mock 示例

## Jest Mock 示例

```typescript
// __mocks__/llm-service.ts
const mockChat = jest.fn();
const mockChatStream = jest.fn();
const mockGetAvailableProviders = jest.fn();
const mockFailover = jest.fn();

jest.mock('../src/services/llm/llm-service', () => ({
  createLLMService: jest.fn(() => ({
    chat: mockChat,
    chatStream: mockChatStream,
    getAvailableProviders: mockGetAvailableProviders,
    failover: mockFailover,
    getDefaultProvider: jest.fn(() => 'openai'),
    getStats: jest.fn(() => ({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })),
    healthCheck: jest.fn(() => Promise.resolve(true)),
  })),
}));
```

## TypeScript Interface 模拟

```typescript
// tests/mocks/types.ts

export const createMockLLMService = (overrides?: Partial<LLMService>): LLMService => ({
  chat: jest.fn(),
  chatStream: jest.fn(),
  getAvailableProviders: jest.fn(() => []),
  getDefaultProvider: jest.fn(() => 'openai'),
  setDefaultProvider: jest.fn(),
  failover: jest.fn(() => true),
  getCurrentProvider: jest.fn(() => 'openai'),
  getStats: jest.fn(() => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })),
  resetStats: jest.fn(),
  healthCheck: jest.fn(() => Promise.resolve(true)),
  ...overrides,
});

export const createMockTaskManager = (overrides?: Partial<TaskManager>): TaskManager => ({
  createTask: jest.fn(),
  getTask: jest.fn(() => Promise.resolve(null)),
  getTasks: jest.fn(() => Promise.resolve([])),
  updateTask: jest.fn(),
  updateProgress: jest.fn(),
  startTask: jest.fn(),
  completeTask: jest.fn(),
  failTask: jest.fn(),
  deleteTask: jest.fn(),
  getTaskStats: jest.fn(() => ({ total: 0, pending: 0, running: 0, done: 0 })),
  getNextTaskId: jest.fn(() => 'T001'),
  ...overrides,
});

export const createMockAgentMgr = (overrides?: Partial<AgentMgr>): AgentMgr => ({
  createAgent: jest.fn(),
  getAgent: jest.fn(() => Promise.resolve(null)),
  getAgents: jest.fn(() => Promise.resolve([])),
  getAgentsByRole: jest.fn(() => Promise.resolve([])),
  getAgentsByStatus: jest.fn(() => Promise.resolve([])),
  setAgentStatus: jest.fn(),
  setCurrentTask: jest.fn(),
  restartAgent: jest.fn(),
  incrementRestartCount: jest.fn(),
  checkAgentStatus: jest.fn(() => Promise.resolve({ status: 'idle', lastActiveAt: new Date(), needsRestart: false })),
  deleteAgent: jest.fn(),
  ...overrides,
});
```
