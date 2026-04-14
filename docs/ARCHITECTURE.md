# Agent Team 架构设计文档

**版本**: 1.0.0
**对应 PRD**: docs/PRD.md v1.0.0
**生效日期**: 2026-02-20

---

## 文档说明

本文档是 Agent Team 系统的架构设计文档，严格对应 PRD 文档的章节结构，为每个 PRD 章节提供架构实现方案。所有代码实现必须严格遵循本文档的架构规范。

---

## 1. 产品愿景架构

### 1.1 系统定位（对应 PRD 1.1）

Agent Team 采用**分层架构**实现以任务为中心的多智能体协作系统：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              用户界面层 (04)                              │
│                    提供 Web UI 和 CLI 交互入口                            │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────┐
│                           应用服务层 (03)                                 │
│                 Task/Agent/Log/Artifact 服务协调                         │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────┐
│                           领域核心层 (02)                                 │
│                    Task/Agent/Tool 领域模型                              │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────┐
│                          基础设施层 (01)                                  │
│              File Store / LLM Client / Event Bus / Logger                │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 价值主张实现（对应 PRD 1.2）

| 价值点 | 架构实现 |
|--------|----------|
| **任务驱动** | 领域层 Task Domain 为核心，所有服务围绕任务生命周期展开 |
| **智能协作** | Agent Domain 通过 Event Bus 实现多智能体异步协作 |
| **全程可视** | Log Service + WebSocket 实现执行过程实时推送 |
| **即开即用** | Tool Domain 内置工具集，通过注册表模式动态加载 |

### 1.3 目标用户场景（对应 PRD 1.3）

架构设计针对个人开发者和独立创作者，采用**单机文件存储**简化部署：
- 无需外部数据库依赖
- 数据可视化（JSON 格式）
- 轻量级部署（单 Node.js 进程）

---

## 2. 核心理念架构

### 2.1 任务即中心架构（对应 PRD 2.1）

系统所有功能围绕任务展开，架构数据流：

```
用户创建任务
    │
    ▼
┌─────────────────┐
│ Task Service    │ ──▶ Task Domain ──▶ File Store（持久化）
│   (03-02)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Task Split      │ ──▶ 创建子任务
│   (02-01)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Agent Service   │ ──▶ │ Agent Domain    │ ──▶ 多智能体并行执行
│   (03-03)       │     │   (02-02)       │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Log Service     │ ──▶ │ Event Bus       │ ──▶ │ WebSocket       │ ──▶ 用户界面
│   (03-04)       │     │   (01-03)       │     │   (01-07)       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│ Artifact Service│ ──▶ File Store（成品存储）
│   (03-05)       │
└─────────────────┘
```

### 2.2 四大核心维度架构（对应 PRD 2.2）

| 维度 | 架构组件 | 实现模块 |
|------|----------|----------|
| **执行过程** | 执行状态追踪 | Task Domain (02-01) + Log Service (03-04) |
| **任务拆分** | 子任务管理 | Task Split (02-01) + Task Service (03-02) |
| **日志体现** | 日志系统 | Log Service (03-04) + Logger (01-05) |
| **成品体现** | 成品管理 | Artifact Service (03-05) + File Store (01-01) |

---

## 3. 任务模型架构

### 3.1 任务数据结构架构（对应 PRD 3.1）

**领域实体设计（02-01 Task Domain）**:

```typescript
// src/domain/task/task.entity.ts
interface Task {
  // ========== 基础信息 ==========
  id: string;                    // 全局唯一标识
  title: string;                 // 任务标题
  description: string;           // 任务描述
  status: TaskStatus;            // 当前状态

  // ========== 执行配置 ==========
  role: string;                  // 执行角色标识符
  parentId?: string;             // 父任务ID（子任务）
  dependencies: string[];        // 依赖的任务ID列表

  // ========== 时间追踪 ==========
  createdAt: Date;               // 创建时间
  startedAt?: Date;              // 开始执行时间
  completedAt?: Date;            // 完成时间

  // ========== 执行结果 ==========
  artifactIds: string[];         // 产出的成品ID列表
  logIds: string[];              // 执行日志ID列表
  subtaskIds: string[];          // 子任务ID列表
}
```

**存储实现（01-01 File Store）**:

```
data/
├── tasks/
│   ├── task-{id}.json          # 任务元数据（Task 结构）
│   └── index.json              # 任务索引（id → 文件路径映射）
```

### 3.2 任务生命周期架构（对应 PRD 3.2）

**状态机实现（02-01 Task Domain）**:

```typescript
// src/domain/task/task-state-machine.ts
class TaskStateMachine {
  private transitions: Map<TaskStatus, TaskStatus[]> = new Map([
    ['pending', ['running']],
    ['running', ['paused', 'completed', 'failed']],
    ['paused', ['running']],
    ['failed', ['pending']]
  ]);

  canTransition(from: TaskStatus, to: TaskStatus): boolean {
    const allowed = this.transitions.get(from) || [];
    return allowed.includes(to);
  }

  async transition(
    taskId: string,
    toStatus: TaskStatus,
    eventBus: IEventBus
  ): Promise<void> {
    const task = await this.taskRepo.findById(taskId);

    if (!this.canTransition(task.status, toStatus)) {
      throw new InvalidStateTransitionError(task.status, toStatus);
    }

    const oldStatus = task.status;
    task.status = toStatus;

    // 更新完成时间
    if (toStatus === 'completed' || toStatus === 'failed') {
      task.completedAt = new Date();
    }

    await this.taskRepo.save(task);

    // 发布状态变更事件
    await eventBus.publish({
      id: generateId(),
      type: 'task.status_changed',
      timestamp: new Date(),
      payload: {
        taskId,
        oldStatus,
        newStatus: toStatus
      }
    });
  }
}
```

**状态流转架构图**:

```
                    ┌─────────────┐
                    │   pending   │
                    └──────┬──────┘
                           │ 开始执行
                           ▼
┌─────────┐        ┌─────────────┐        ┌───────────┐
│ paused  │◀───────│   running   │───────▶│ completed │
└────┬────┘  暂停   └──────┬──────┘  完成  └───────────┘
     │                    │
     └────────────────────┤ 恢复
                          │
                          ▼
                   ┌─────────────┐
                   │   failed    │
                   └──────┬──────┘
                          │ 重试
                          └────────▶ pending
```

---

## 4. 执行过程架构

### 4.1 标准执行流程架构（对应 PRD 4.1）

**7步执行流程的组件映射**:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 1: 任务接收                                                     │
│ 组件: API Gateway (03-01) + Task Service (03-02)                    │
│ 职责: 解析请求、参数校验、创建任务实体                               │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│ Step 2: 任务分析                                                     │
│ 组件: Task Domain (02-01)                                           │
│ 职责: 评估复杂度（基于描述长度、关键词匹配）                         │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│ Step 3: 任务拆分（条件执行）                                         │
│ 组件: Task Split (02-01)                                            │
│ 职责: 根据复杂度策略拆分子任务                                       │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│ Step 4: 任务分配                                                     │
│ 组件: Agent Domain (02-02) - Role Matcher                           │
│ 职责: 根据任务描述匹配角色，创建 Agent 实例                          │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│ Step 5: 并行执行                                                     │
│ 组件: Agent Service (03-03) + Scheduler (01-08)                     │
│ 职责: 调度无依赖子任务并行执行                                       │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│ Step 6: 结果汇总                                                     │
│ 组件: Task Service (03-02)                                          │
│ 职责: 收集子任务结果，整合输出                                       │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│ Step 7: 成品交付                                                     │
│ 组件: Artifact Service (03-05)                                      │
│ 职责: 收集产出文件，关联到任务                                       │
└─────────────────────────────────────────────────────────────────────┘
```

**执行管道实现**:

```typescript
// src/application/task/task-execution-pipeline.ts
class TaskExecutionPipeline {
  constructor(
    private taskDomain: ITaskDomainService,
    private agentService: IAgentService,
    private logService: ILogService,
    private artifactService: IArtifactService,
    private eventBus: IEventBus
  ) {}

  async execute(taskId: string): Promise<void> {
    // Step 1 & 2: 获取任务并分析
    const task = await this.taskDomain.getTask(taskId);
    const complexity = await this.analyzeComplexity(task);

    // Step 3: 任务拆分（如果需要）
    if (complexity.level !== 'simple') {
      await this.taskDomain.splitTask(taskId, complexity.strategy);
    }

    // Step 4 & 5: 分配并执行
    const subtasks = await this.taskDomain.getSubtasks(taskId);
    const executableTasks = subtasks.filter(t => t.status === 'pending');

    await Promise.all(
      executableTasks.map(subtask => this.executeSubtask(subtask))
    );

    // Step 6: 结果汇总
    const results = await this.gatherResults(taskId);

    // Step 7: 成品交付
    await this.artifactService.collectArtifacts(taskId);

    // 标记完成
    await this.taskDomain.transitionStatus(taskId, 'completed');
  }

  private async executeSubtask(subtask: Task): Promise<void> {
    // 创建 Agent 并执行
    const agent = await this.agentService.createAgent(
      subtask.id,
      subtask.role
    );

    await this.agentService.execute(agent.id);
  }
}
```

### 4.2 执行状态追踪架构（对应 PRD 4.2）

**追踪数据流**:

```
Agent 执行
    │
    ├──▶ Token 消耗 ──────▶ Metrics (01-06) ────▶ 统计存储
    │
    ├──▶ 工具调用 ────────▶ Log Service (03-04) ──▶ logs/task-{id}/
    │
    ├──▶ 中间产物 ────────▶ Artifact Service (03-05) ──▶ artifacts/task-{id}/
    │
    └──▶ 状态变更 ────────▶ Event Bus (01-03) ────▶ WebSocket (01-07) ──▶ 客户端
```

**追踪实现组件**:

| 追踪项 | 架构组件 | 存储位置 |
|--------|----------|----------|
| 当前步骤 | Log Service (03-04) | logs/task-{id}/{date}.log |
| 已用时间 | Task Domain (02-01) | tasks/task-{id}.json |
| Token消耗 | Metrics (01-06) | metrics/token-usage.json |
| 工具调用 | Log Service (03-04) | logs/task-{id}/{date}.log |
| 中间产物 | Artifact Service (03-05) | artifacts/task-{id}/ |

---

## 5. 任务拆分架构

### 5.1 拆分触发架构（对应 PRD 5.1）

**复杂度评估组件（02-01 Task Domain）**:

```typescript
// src/domain/task/complexity-analyzer.ts
class ComplexityAnalyzer {
  analyze(task: Task): ComplexityResult {
    const indicators = [
      this.checkDescriptionLength(task.description),
      this.checkKeywords(task.description),
      this.checkFileReferences(task.description)
    ];

    const score = indicators.reduce((sum, i) => sum + i.score, 0);

    if (score < 30) {
      return { level: 'simple', strategy: null };
    } else if (score < 70) {
      return { level: 'medium', strategy: 'role-based' };
    } else {
      return { level: 'complex', strategy: 'module-based' };
    }
  }

  private checkDescriptionLength(desc: string): IndicatorResult {
    const length = desc.length;
    if (length < 100) return { score: 10 };
    if (length < 500) return { score: 30 };
    return { score: 50 };
  }
}
```

### 5.2 拆分策略架构（对应 PRD 5.2）

**策略实现（02-01 Task Domain）**:

```typescript
// src/domain/task/split-strategies/
interface SplitStrategy {
  split(task: Task): Task[];
}

// 策略1: 按角色拆分
class RoleBasedSplitStrategy implements SplitStrategy {
  private roleFlows: Record<string, string[]> = {
    'fullstack': ['product-manager', 'architect', 'backend-dev', 'frontend-dev', 'tester']
  };

  split(task: Task): Task[] {
    const roles = this.roleFlows[task.role] || ['product-manager', 'backend-dev'];

    return roles.map((role, index) => ({
      id: generateId(),
      title: `[${task.title}] ${role} 阶段`,
      description: `${role} 负责的工作`,
      role,
      parentId: task.id,
      dependencies: index > 0 ? [roles[index - 1]] : [],
      status: 'pending',
      createdAt: new Date(),
      artifacts: [],
      logs: []
    }));
  }
}

// 策略2: 按模块拆分
class ModuleBasedSplitStrategy implements SplitStrategy {
  split(task: Task): Task[] {
    // 使用 LLM 分析模块边界
    const modules = this.analyzeModules(task.description);

    return modules.map(module => ({
      id: generateId(),
      title: `[${task.title}] ${module.name}`,
      description: module.description,
      role: module.suggestedRole,
      parentId: task.id,
      dependencies: module.dependencies,
      status: 'pending',
      createdAt: new Date(),
      artifacts: [],
      logs: []
    }));
  }
}
```

### 5.3 子任务依赖架构（对应 PRD 5.3）

**依赖管理（02-01 Task Domain）**:

```typescript
// src/domain/task/dependency-manager.ts
class DependencyManager {
  // 检测循环依赖
  hasCycle(tasks: Task[]): boolean {
    const graph = this.buildGraph(tasks);
    const visited = new Set<string>();
    const recStack = new Set<string>();

    for (const task of tasks) {
      if (this.hasCycleDFS(task.id, graph, visited, recStack)) {
        return true;
      }
    }
    return false;
  }

  // 获取可执行的任务（依赖已满足）
  getExecutableTasks(tasks: Task[]): Task[] {
    const completedIds = new Set(
      tasks.filter(t => t.status === 'completed').map(t => t.id)
    );

    return tasks.filter(task =>
      task.status === 'pending' &&
      task.dependencies.every(depId => completedIds.has(depId))
    );
  }

  // 构建依赖图
  private buildGraph(tasks: Task[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    for (const task of tasks) {
      graph.set(task.id, task.dependencies || []);
    }
    return graph;
  }
}
```

**依赖执行架构**:

```
子任务依赖图

    [Task A]
       │
    ┌──┴──┐
    ▼     ▼
[Task B] [Task C]
    │
    ▼
[Task D]

执行顺序:
1. Task A 完成
2. Task B 和 Task C 并行执行（无相互依赖）
3. Task D 等待 Task B 完成后执行
```

---

## 6. 日志架构

### 6.1 日志类型架构（对应 PRD 6.1）

**日志组件分层**:

```
┌─────────────────────────────────────────────────────────────┐
│ 写入层: Logger (01-05)                                       │
│ - 提供统一的日志写入接口                                     │
│ - 支持结构化日志输出                                         │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 服务层: Log Service (03-04)                                  │
│ - 业务日志写入                                               │
│ - 日志查询                                                   │
│ - 日志归档                                                   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 存储层: File Store (01-01)                                   │
│ data/logs/task-{id}/{date}.log                              │
└─────────────────────────────────────────────────────────────┘
```

**日志存储结构**:

```
data/logs/
└── task-{id}/
    ├── 2026-02-20.log      # 系统日志
    ├── 2026-02-20.execution.log  # 执行日志
    └── 2026-02-20.operation.log  # 操作日志
```

### 6.2 日志数据结构架构（对应 PRD 6.2）

**存储格式（JSON Lines）**:

```json
// data/logs/task-xxx/2026-02-20.log
{"timestamp":"2026-02-20T10:00:00Z","level":"info","taskId":"task-xxx","type":"status_change","content":"任务状态变更为 running","metadata":{"oldStatus":"pending","newStatus":"running"}}
{"timestamp":"2026-02-20T10:00:05Z","level":"info","taskId":"task-xxx","agentId":"agent-yyy","type":"thought","content":"分析任务复杂度...","metadata":{}}
{"timestamp":"2026-02-20T10:00:10Z","level":"info","taskId":"task-xxx","agentId":"agent-yyy","type":"tool_call","content":"调用 read_file","metadata":{"tool":"read_file","params":{"path":"/src/index.ts"}}}
```

### 6.3 时间线视图架构（对应 PRD 6.3）

**查询实现（Log Service 03-04）**:

```typescript
// src/application/log/log-service.ts
class LogService {
  async getTimeline(taskId: string, options: TimelineOptions): Promise<TimelineEntry[]> {
    const logs = await this.logRepo.findByTaskId(taskId, {
      startTime: options.startTime,
      endTime: options.endTime,
      order: 'asc'
    });

    return logs.map(log => ({
      timestamp: log.timestamp,
      icon: this.getIconForType(log.type),
      description: log.content,
      details: log.metadata,
      level: log.level
    }));
  }

  private getIconForType(type: LogType): string {
    const icons: Record<LogType, string> = {
      'thought': '💭',
      'action': '⚡',
      'tool_call': '🔧',
      'tool_result': '✅',
      'milestone': '🏁',
      'status_change': '🔄',
      'error': '❌'
    };
    return icons[type] || '📝';
  }
}
```

---

## 7. 成品架构

### 7.1 成品类型架构（对应 PRD 7.1）

**成品管理组件（03-05 Artifact Service）**:

```
┌─────────────────────────────────────────────────────────────┐
│ Artifact Service (03-05)                                     │
│ ┌────────────┐  ┌────────────┐  ┌────────────┐             │
│ │ 自动收集   │  │ 版本管理   │  │ 下载服务   │             │
│ │ Collector  │  │ Versioner  │  │ Downloader │             │
│ └─────┬──────┘  └─────┬──────┘  └─────┬──────┘             │
│       │               │               │                     │
│       └───────────────┼───────────────┘                     │
│                       ▼                                     │
│              ┌────────────────┐                            │
│              │ File Store (01-01)                         │
│              └────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

**存储目录结构**:

```
data/artifacts/
└── task-{id}/
    ├── code/               # 代码文件
    │   └── user-login.ts
    ├── docs/               # 文档
    │   └── 20260220-架构设计.md
    ├── tests/              # 测试文件
    │   └── user-login.test.ts
    └── others/             # 其他文件
```

### 7.2 成品管理架构（对应 PRD 7.2）

**自动收集实现**:

```typescript
// src/application/artifact/artifact-collector.ts
class ArtifactCollector {
  constructor(
    private fileStore: IFileStore,
    private artifactRepo: IArtifactRepository,
    private eventBus: IEventBus
  ) {
    // 订阅文件创建事件
    this.eventBus.subscribe('file.created', this.onFileCreated.bind(this));
  }

  private async onFileCreated(event: DomainEvent): Promise<void> {
    const { taskId, filePath, fileSize } = event.payload;

    const artifact: Artifact = {
      id: generateId(),
      taskId,
      type: this.classifyFile(filePath),
      name: path.basename(filePath),
      path: filePath,
      size: fileSize,
      mimeType: mime.lookup(filePath) || 'application/octet-stream',
      createdAt: new Date(),
      checksum: await this.calculateChecksum(filePath)
    };

    await this.artifactRepo.save(artifact);

    // 发布成品创建事件
    await this.eventBus.publish({
      id: generateId(),
      type: 'artifact.created',
      timestamp: new Date(),
      payload: artifact
    });
  }

  private classifyFile(filePath: string): ArtifactType {
    const ext = path.extname(filePath);
    const dir = path.dirname(filePath);

    if (['.ts', '.js', '.py', '.java'].includes(ext)) return 'code';
    if (['.md', '.doc', '.docx'].includes(ext)) return 'document';
    if (['.test.ts', '.spec.ts'].some(s => filePath.includes(s))) return 'test';
    if (['.json', '.yaml', '.yml'].includes(ext)) return 'config';
    if (['.png', '.jpg', '.svg'].includes(ext)) return 'diagram';
    return 'data';
  }
}
```

**版本管理实现**:

```
data/artifacts/task-{id}/
├── code/
│   ├── user-login.ts              # 当前版本
│   └── .versions/
│       ├── user-login.ts.v1       # 历史版本1
│       ├── user-login.ts.v2       # 历史版本2
│       └── ...
```

---

## 8. 角色系统架构

### 8.1 内置角色架构（对应 PRD 8.1）

**角色定义存储**:

```
data/roles/
├── task-master.json
├── product-manager.json
├── architect.json
├── backend-dev.json
├── frontend-dev.json
└── tester.json
```

**角色数据结构**:

```typescript
// src/domain/agent/role.entity.ts
interface Role {
  id: string;                    // 角色唯一标识
  name: string;                  // 角色名称
  description: string;           // 角色描述

  // 系统提示词
  systemPrompt: string;          // 角色系统提示词

  // 能力配置
  allowedTools: string[];        // 允许使用的工具列表
  maxTokensPerTask: number;      // 单个任务最大Token数

  // 执行参数
  temperature: number;           // 创造性参数
  timeout: number;               // 执行超时（秒）
}
```

### 8.2 角色匹配架构（对应 PRD 8.2）

**匹配器实现（02-02 Agent Domain）**:

```typescript
// src/domain/agent/role-matcher.ts
class RoleMatcher {
  private rules: MatchingRule[] = [
    {
      keywords: ['需求', 'prd', '产品'],
      role: 'product-manager'
    },
    {
      keywords: ['架构', '设计', '技术方案'],
      role: 'architect'
    },
    {
      keywords: ['前端', 'ui', '界面', 'react', 'vue'],
      role: 'frontend-dev'
    },
    {
      keywords: ['后端', 'api', '接口', '数据库'],
      role: 'backend-dev'
    },
    {
      keywords: ['测试', '用例', '质量', 'bug'],
      role: 'tester'
    }
  ];

  match(taskDescription: string): string {
    const desc = taskDescription.toLowerCase();

    for (const rule of this.rules) {
      if (rule.keywords.some(kw => desc.includes(kw))) {
        return rule.role;
      }
    }

    return 'task-master'; // 默认角色（v10 分析由主控承担）
  }
}
```

### 8.3 角色定义架构（对应 PRD 8.3）

**Agent 生命周期（02-02 Agent Domain）**:

```
创建 Agent
    │
    ▼
┌─────────────────┐
│ 初始化上下文    │ ◀── 加载 Role.systemPrompt
│                 │ ◀── 加载 Task 上下文
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 执行任务        │ ──▶ LLM Client (01-02)
│                 │ ◀── 工具调用结果
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 完成/失败       │ ──▶ 发布执行结果事件
└─────────────────┘
```

---

## 9. API 架构

### 9.1 REST API 架构（对应 PRD 9.1）

**API Gateway 架构（03-01）**:

```
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway (03-01)                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │   路由分发  │  │  请求校验  │  │  限流控制  │            │
│  │  Router    │  │ Validator  │  │ Rate Limiter│           │
│  └─────┬──────┘  └────────────┘  └────────────┘            │
│        │                                                    │
│        ▼                                                    │
│  ┌────────────────────────────────────────────────────┐   │
│  │              Controller 层                          │   │
│  │  POST /api/tasks      ──▶ TaskController.create   │   │
│  │  GET  /api/tasks/:id  ──▶ TaskController.get      │   │
│  │  GET  /api/tasks/:id/logs ──▶ LogController.query │   │
│  └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**路由实现**:

```typescript
// src/application/api/routes/task.routes.ts
const taskRouter = Router();

// 任务管理
taskRouter.post('/', taskController.create);
taskRouter.get('/:id', taskController.get);
taskRouter.get('/:id/logs', logController.getByTaskId);
taskRouter.get('/:id/artifacts', artifactController.getByTaskId);
taskRouter.get('/:id/subtasks', taskController.getSubtasks);
taskRouter.post('/:id/retry', taskController.retry);
taskRouter.post('/:id/pause', taskController.pause);
taskRouter.post('/:id/resume', taskController.resume);
```

### 9.2 WebSocket 实时推送架构（对应 PRD 9.2）

**实时推送架构**:

```
┌─────────────────────────────────────────────────────────────┐
│ 服务端                                                       │
│                                                             │
│  Event Bus (01-03)                                          │
│       │                                                     │
│       ├──▶ task.status_changed                              │
│       ├──▶ log.entry_created                                │
│       ├──▶ artifact.created                                 │
│       └──▶ subtask.created                                  │
│       │                                                     │
│       ▼                                                     │
│  WebSocket Manager (01-07)                                  │
│       │                                                     │
│       └──▶ 按 taskId 广播给订阅的客户端                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ WebSocket 连接
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 客户端                                                       │
│  useWebSocket hook                                          │
│       │                                                     │
│       ├──▶ 监听 status_change ──▶ 更新任务状态显示          │
│       ├──▶ 监听 log_entry     ──▶ 追加日志到时间线          │
│       └──▶ 监听 artifact_created ──▶ 更新成品列表           │
└─────────────────────────────────────────────────────────────┘
```

**WebSocket 事件格式**:

```typescript
// src/infrastructure/websocket/websocket-manager.ts
interface WebSocketEvent {
  type: 'status_change' | 'log_entry' | 'artifact_created' | 'subtask_created' | 'progress_update' | 'error';
  timestamp: string;
  data: any;
}

class WebSocketManager {
  private clients: Map<string, WebSocket[]> = new Map(); // taskId -> clients

  broadcast(taskId: string, event: WebSocketEvent): void {
    const clients = this.clients.get(taskId) || [];
    const message = JSON.stringify(event);

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
}
```

---

## 10. 数据存储架构

### 10.1 存储目录结构架构（对应 PRD 10.1）

**文件系统存储架构**:

```
data/
├── tasks/                      # 任务数据 (01-01 File Store)
│   ├── task-{id}.json          # 任务元数据
│   └── index.json              # 任务索引（加速查询）
│
├── logs/                       # 日志数据 (01-05 Logger)
│   └── task-{id}/
│       └── {date}.log          # 按日期分片
│
├── artifacts/                  # 成品文件 (03-05 Artifact Service)
│   └── task-{id}/
│       ├── code/               # 代码文件
│       ├── docs/               # 文档
│       ├── tests/              # 测试文件
│       └── others/             # 其他文件
│
├── cache/                      # 缓存数据
│   └── agent-context/          # 智能体上下文
│
└── roles/                      # 角色定义 (02-02 Agent Domain)
    ├── task-master.json
    ├── product-manager.json
    └── ...
```

### 10.2 持久化策略架构（对应 PRD 10.2）

**持久化实现**:

| 数据类型 | 架构组件 | 持久化策略 | 实现代码 |
|----------|----------|------------|----------|
| 任务数据 | File Store (01-01) | 立即持久化 | `fs.writeFileSync()` + `fsync` |
| 日志数据 | Logger (01-05) | 批量写入 | 内存缓冲 + 定时刷新 |
| 成品文件 | File Store (01-01) | 立即持久化 | 写入时立即 `fsync` |
| 缓存数据 | Memory | 不持久化 | 内存存储 |

**批量写入实现**:

```typescript
// src/infrastructure/logger/batch-logger.ts
class BatchLogger {
  private buffer: LogEntry[] = [];
  private flushInterval = 5000; // 5秒
  private maxBufferSize = 100;  // 100条

  constructor() {
    setInterval(() => this.flush(), this.flushInterval);
  }

  async log(entry: LogEntry): Promise<void> {
    this.buffer.push(entry);

    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    // 按任务分组写入
    const grouped = this.groupByTask(entries);
    for (const [taskId, logs] of grouped) {
      await this.writeToFile(taskId, logs);
    }
  }
}
```

---

## 11. 用户界面架构

### 11.1 任务列表页架构（对应 PRD 11.1）

**前端架构（04-01 Web UI）**:

```
src/ui/web/
├── pages/
│   └── TaskList/
│       ├── index.tsx           # 页面组件
│       ├── TaskCard.tsx        # 任务卡片组件
│       ├── FilterBar.tsx       # 状态筛选器
│       └── useTaskList.ts      # 数据获取 hook
```

**数据流**:

```
TaskList 页面
    │
    ├──▶ useTaskList hook
    │       │
    │       ├──▶ GET /api/tasks
    │       │
    │       └──▶ WebSocket 订阅实时更新
    │
    ├──▶ TaskCard 组件列表
    │
    └──▶ 新建任务按钮 ──▶ 跳转到任务创建页
```

### 11.2 任务详情页架构（对应 PRD 11.2）

**Tab 组件架构**:

```
TaskDetail 页面
    │
    ├──▶ Tab: 概览
    │       ├── 任务基本信息
    │       ├── 当前状态
    │       └── 进度条
    │
    ├──▶ Tab: 执行日志
    │       ├── Timeline 组件
    │       ├── LogFilter 组件
    │       └── useWebSocket 实时推送
    │
    ├──▶ Tab: 子任务
    │       ├── SubtaskList 组件
    │       └── DependencyGraph 组件
    │
    └──▶ Tab: 成品
            ├── ArtifactList 组件
            ├── FilePreview 组件
            └── DownloadButton 组件
```

**时间线组件实现**:

```typescript
// src/ui/web/components/Timeline/index.tsx
interface TimelineProps {
  taskId: string;
}

export const Timeline: React.FC<TimelineProps> = ({ taskId }) => {
  const { entries, loading } = useTimeline(taskId);
  const { events } = useWebSocket(taskId); // 实时更新

  return (
    <div className="timeline">
      {entries.map(entry => (
        <TimelineItem
          key={entry.id}
          time={entry.timestamp}
          icon={entry.icon}
          description={entry.description}
          details={entry.details}
          level={entry.level}
        />
      ))}
    </div>
  );
};
```

---

## 12. 里程碑与验收架构

### 12.1 开发里程碑架构（对应 PRD 12.1）

**Phase 1: 任务核心架构（Week 1-2）**:

| 功能 | 架构实现 | 关键模块 |
|------|----------|----------|
| 任务CRUD | File Store (01-01) + Task Service (03-02) | 文件读写优化 |
| 任务状态机 | Task Domain (02-01) | TaskStateMachine |
| 基础执行引擎 | Agent Service (03-03) | 单任务执行管道 |
| 执行日志 | Logger (01-05) + Log Service (03-04) | 批量写入 |

**Phase 2: 任务拆分架构（Week 3）**:

| 功能 | 架构实现 | 关键模块 |
|------|----------|----------|
| 智能任务拆分 | Task Domain (02-01) | ComplexityAnalyzer |
| 子任务依赖 | Task Domain (02-01) | DependencyManager |
| 并行执行 | Scheduler (01-08) | 并发控制 |
| 结果汇总 | Task Service (03-02) | 结果聚合器 |

**Phase 3: 成品与展示架构（Week 4）**:

| 功能 | 架构实现 | 关键模块 |
|------|----------|----------|
| 成品自动收集 | Artifact Service (03-05) | ArtifactCollector |
| 任务时间线 | Log Service (03-04) | 时间线查询 |
| Web界面 | Web UI (04-01) | React 组件 |
| 实时推送 | WebSocket (01-07) | WebSocketManager |

**Phase 4: 角色系统架构（Week 5）**:

| 功能 | 架构实现 | 关键模块 |
|------|----------|----------|
| 角色定义 | Agent Domain (02-02) | Role 实体 |
| 角色匹配 | Agent Domain (02-02) | RoleMatcher |
| 多角色协作 | Event Bus (01-03) | 事件驱动 |
| 端到端测试 | 全栈测试 | 集成测试套件 |

### 12.2 性能指标架构（对应 PRD 12.2）

**性能优化架构**:

| 指标 | 目标值 | 架构优化方案 |
|------|--------|--------------|
| 任务创建延迟 < 100ms | ✅ | 异步持久化 + 内存索引 |
| 日志查询速度 < 500ms | ✅ | 按日期分片 + 索引缓存 |
| 任务列表加载 < 300ms | ✅ | 分页查询 + 缓存 |
| 并发任务数 >= 10个 | ✅ | Scheduler 并发控制 |
| 简单任务耗时 < 60秒 | ✅ | 并行执行优化 |
| 实时推送延迟 < 1秒 | ✅ | WebSocket + 内存事件 |

### 12.3 质量指标架构（对应 PRD 12.3）

**质量保证架构**:

```
┌─────────────────────────────────────────────────────────────┐
│ 单元测试 (Domain Layer 02)                                   │
│ - Task State Machine 测试                                    │
│ - Role Matcher 测试                                          │
│ - Dependency Manager 测试                                    │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│ 集成测试 (Application Layer 03)                                      │
│ - Task Service 集成测试                                              │
│ - Agent Service 集成测试                                             │
│ - API 端点测试                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│ E2E 测试 (Full Stack)                                                │
│ - 完整任务执行流程                                                   │
│ - WebSocket 实时推送                                                 │
│ - 文件上传下载                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 13. 安全架构

### 13.1 数据安全架构（对应 PRD 13.1）

**安全措施**:

| 安全项 | 架构实现 | 所在模块 |
|--------|----------|----------|
| 敏感配置加密 | 加密存储 | Config Manager (01-04) |
| 日志脱敏 | 敏感信息过滤 | Logger (01-05) |
| 成品访问控制 | 权限检查 | Artifact Service (03-05) |

### 13.2 执行安全架构（对应 PRD 13.2）

**安全控制**:

| 安全项 | 架构实现 | 所在模块 |
|--------|----------|----------|
| 危险操作确认 | 确认对话框 | Tool Domain (02-03) |
| 代码执行沙箱 | 受限执行环境 | Tool Domain (02-03) |
| 网络请求白名单 | 域名限制 | LLM Client (01-02) |

---

## 附录A: 分层架构参考

### 完整模块清单

| 层次 | 编号 | 模块名称 | 说明 | 对应 PRD |
|------|------|----------|------|----------|
| 基础设施层 | 01-01 | File Store | 文件存储管理 | 3.1, 7.2, 10.1 |
| 基础设施层 | 01-02 | LLM Client | LLM 服务客户端 | 4.2 |
| 基础设施层 | 01-03 | Event Bus | 事件发布订阅 | 3.2, 4.2, 9.2 |
| 基础设施层 | 01-04 | Config Manager | 配置管理 | 13.1 |
| 基础设施层 | 01-05 | Logger | 日志记录 | 6.1, 6.2, 10.2 |
| 基础设施层 | 01-06 | Metrics | 指标收集 | 4.2, 12.2 |
| 基础设施层 | 01-07 | WebSocket | 实时通信 | 9.2, 11.2 |
| 基础设施层 | 01-08 | Scheduler | 任务调度 | 4.1, 5.3, 12.2 |
| 领域核心层 | 02-01 | Task Domain | 任务领域模型 | 3, 4, 5 |
| 领域核心层 | 02-02 | Agent Domain | 智能体领域模型 | 8 |
| 领域核心层 | 02-03 | Tool Domain | 工具领域模型 | 13.2 |
| 应用服务层 | 03-01 | API Gateway | API 网关 | 9.1 |
| 应用服务层 | 03-02 | Task Service | 任务应用服务 | 3, 4, 5 |
| 应用服务层 | 03-03 | Agent Service | 智能体应用服务 | 4, 8 |
| 应用服务层 | 03-04 | Log Service | 日志应用服务 | 6 |
| 应用服务层 | 03-05 | Artifact Service | 成品应用服务 | 7 |
| 用户界面层 | 04-01 | Web UI | Web 界面 | 11 |
| 用户界面层 | 04-02 | CLI Tool | 命令行工具 | 11 |

---

## 附录B: 架构决策记录

### ADR-001: 使用文件系统作为存储

**决策**: 使用文件系统而非数据库存储数据

**原因**:
- 简化部署，无需数据库服务
- 数据可视化，便于调试
- 符合个人开发者使用场景

**影响**:
- 需要自行实现索引和查询
- 并发性能受限

### ADR-002: 四层分层架构

**决策**: 采用四层架构（基础设施/领域/应用/UI）

**原因**:
- 职责清晰，便于维护
- 领域层独立，易于测试
- 支持未来扩展

### ADR-003: 事件驱动通信

**决策**: 层间通过事件总线异步通信

**原因**:
- 解耦模块依赖
- 支持实时推送
- 便于扩展新功能

---

## 附录C: 变更日志

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|----------|------|
| 1.0.0 | 2026-02-20 | 初始版本，章节与 PRD 1:1 对应 | Architecture Designer |

---

**文档结束**

*本文档是 Agent Team 系统的架构设计基准，所有代码实现必须遵循本文档的分层和模块规范。本文档章节严格对应 PRD 文档，确保架构设计与产品需求一致。*
