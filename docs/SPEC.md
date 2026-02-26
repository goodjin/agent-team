# Agent Team 技术规约文档（Spec）

**版本**: 1.0.0
**对应 PRD**: docs/PRD.md v1.0.0
**生成日期**: 2026-02-20
**文档级别**: 开发基准文档

---

## 文档说明

本文档是根据 PRD v1.0.0 生成的技术规约，作为开发和测试的基准。所有代码实现必须严格遵循本文档的规约。

**与 PRD 章节对应关系**:
- 本文档章节编号与 PRD 章节一一对应
- 每节内容是对 PRD 对应章节的技术实现规约
- 不允许偏离 PRD 定义的需求

---

## 1. 产品愿景（技术实现规约）

### 1.1 核心定位的技术支撑

**系统定位**: 以任务为中心的多智能体协作系统

**技术实现要点**:
- 所有数据模型必须以 Task 为核心实体
- 所有业务逻辑必须围绕任务生命周期展开
- 系统架构必须支持任务驱动的事件流

### 1.2 价值主张的技术实现

| PRD 价值点 | 技术实现要求 |
|------------|--------------|
| 任务驱动 | Task 表为主表，所有操作通过 taskId 关联 |
| 智能协作 | AgentService 支持多角色并行执行 |
| 全程可视 | LogEntry 实时记录，WebSocket 推送 |
| 即开即用 | 内置角色配置，默认工具集预加载 |

### 1.3 目标用户的技术适配

- **个人开发者**: 单用户模式，本地文件存储
- **技术专家**: 丰富的工具集，可扩展的工具系统
- **独立创作者**: 简洁的 Web UI，CLI 支持

---

## 2. 核心理念（技术实现规约）

### 2.1 任务即中心的技术实现

**流程实现**:
```
用户创建任务 → TaskService.createTask() → 持久化到 Task Store
       ↓
任务智能拆分 → TaskDomain.splitTask() → 生成 Subtask 列表
       ↓
多智能体协作执行 → AgentService.execute() → 并行/串行执行
       ↓
执行过程记录日志 → LogService.write() → 实时写入 Log Store
       ↓
产出成品交付 → ArtifactService.collect() → 关联到 Task
```

**原则检查**: 任何新功能必须通过 "任务关联性检查"，即该功能必须能通过 taskId 关联到具体任务。

### 2.2 四大核心维度的技术实现

| PRD 维度 | 技术实现 | 验收标准对应 |
|----------|----------|--------------|
| **执行过程** | LogEntry 类型: thought/action/tool_call | 每个步骤写入日志 |
| **任务拆分** | Task.parentId + Task.dependencies | 支持子任务树查询 |
| **日志体现** | LogService 时间线 API | /tasks/:id/timeline 接口 |
| **成品体现** | Artifact 表关联 Task | 文件自动关联 taskId |

---

## 3. 任务模型规范（技术实现规约）

### 3.1 任务数据结构（对应 PRD 3.1）

**强制实现**:
```typescript
// PRD 3.1 定义的数据结构必须完全实现
interface Task {
  // 基础信息（必填）- PRD 3.1 要求
  id: string;                    // 格式: task-{uuid}
  title: string;                 // 长度: 1-100字符，Zod 验证
  description: string;           // 长度: 1-5000字符，Zod 验证
  status: TaskStatus;            // 五态枚举

  // 执行配置（必填）- PRD 3.1 要求
  role: string;                  // 角色标识符
  parentId?: string;             // 父任务ID
  dependencies: string[];        // 依赖任务ID列表

  // 时间追踪（自动）- PRD 3.1 要求
  createdAt: string;             // ISO 8601，系统自动生成
  startedAt?: string;            // 状态变 running 时自动写入
  completedAt?: string;          // 状态变 completed/failed 时自动写入

  // 执行结果（运行时）- PRD 3.1 要求
  artifacts: string[];           // 存储 artifactIds
  logs: string[];                // 存储 logIds
}

type TaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';
```

**存储实现**:
- 存储格式: JSON 文件
- 路径: `data/tasks/task-{id}.json`
- 索引: `data/tasks/index.json` 维护 id 列表

### 3.2 任务生命周期（对应 PRD 3.2）

**状态机实现代码**:
```typescript
class TaskStateMachine {
  // PRD 3.2 定义的状态转换图
  private transitions: Map<TaskStatus, TaskStatus[]> = new Map([
    ['pending', ['running']],
    ['running', ['paused', 'completed', 'failed']],
    ['paused', ['running']],
    ['failed', ['pending']]
  ]);

  // PRD 3.2 状态转换规则验证
  canTransition(from: TaskStatus, to: TaskStatus): boolean {
    const allowed = this.transitions.get(from) || [];
    return allowed.includes(to);
  }

  // PRD 3.2 状态转换执行
  async transition(taskId: string, toStatus: TaskStatus): Promise<void> {
    const task = await this.getTask(taskId);
    if (!this.canTransition(task.status, toStatus)) {
      throw new Error(`INVALID_STATE_TRANSITION: ${task.status} -> ${toStatus}`);
    }
    // 执行转换
    task.status = toStatus;
    await this.saveTask(task);
    // 记录日志
    await this.logStatusChange(taskId, task.status, toStatus);
  }
}
```

### 3.3 任务命名规范（对应 PRD 3.3）

**验证规则**:
```typescript
const taskTitleSchema = z.string()
  .min(1, "标题不能为空")
  .max(100, "标题不能超过100字符")
  .regex(/^[\u4e00-\u9fa5a-zA-Z0-9\s\-_[\](){}]+$/, "标题包含非法字符");

// 子任务标题格式验证: [{父任务标题}] {动词}{名词}
const subtaskTitleSchema = z.string()
  .regex(/^\[[^\]]+\]\s+.+$/, "子任务标题必须符合格式: [父任务] 子任务描述");
```

---

## 4. 执行过程规范（技术实现规约）

### 4.1 标准执行流程（对应 PRD 4.1）

**7步流程的技术实现**:

```typescript
class TaskExecutionPipeline {
  // PRD 4.1 Step 1: 任务接收
  async step1_receive(taskId: string): Promise<TaskIntent> {
    const task = await this.taskRepo.get(taskId);
    // 验证参数
    const validated = taskSchema.parse(task);
    return { taskId, intent: this.parseIntent(validated.description) };
  }

  // PRD 4.1 Step 2: 任务分析
  async step2_analyze(taskId: string): Promise<ComplexityReport> {
    const analysis = await this.llmClient.analyze(task.description);
    return {
      complexity: analysis.complexity, // 'simple' | 'medium' | 'complex'
      shouldSplit: analysis.complexity !== 'simple'
    };
  }

  // PRD 4.1 Step 3: 任务拆分（条件执行）
  async step3_split(taskId: string, report: ComplexityReport): Promise<Task[]> {
    if (!report.shouldSplit) return [];
    // PRD 5.2 拆分策略实现
    return await this.taskDomain.splitTask(taskId, report.complexity);
  }

  // PRD 4.1 Step 4: 任务分配
  async step4_assign(taskId: string): Promise<Agent> {
    const task = await this.taskRepo.get(taskId);
    // PRD 8.2 角色匹配规则实现
    const roleId = this.roleMatcher.match(task.description);
    return await this.agentService.createAgent(taskId, roleId);
  }

  // PRD 4.1 Step 5: 并行执行
  async step5_execute(taskIds: string[]): Promise<void> {
    // 检查依赖（PRD 5.3）
    const executableTasks = await this.filterByDependencies(taskIds);
    // 并行执行
    await Promise.all(executableTasks.map(id => this.executeTask(id)));
  }

  // PRD 4.1 Step 6: 结果汇总
  async step6_aggregate(parentTaskId: string): Promise<AggregationReport> {
    const subtasks = await this.taskRepo.getSubtasks(parentTaskId);
    return {
      results: subtasks.map(t => t.result),
      artifacts: subtasks.flatMap(t => t.artifacts)
    };
  }

  // PRD 4.1 Step 7: 成品交付
  async step7_deliver(taskId: string): Promise<Artifact[]> {
    const artifacts = await this.artifactService.collect(taskId);
    await this.taskRepo.updateArtifacts(taskId, artifacts);
    return artifacts;
  }
}
```

### 4.2 执行状态追踪（对应 PRD 4.2）

**追踪项实现**:

| PRD 追踪项 | 技术实现 | 存储位置 |
|------------|----------|----------|
| 当前步骤 | LogEntry.type='milestone' | logs/task-{id}/{date}.log |
| 已用时间 | Task.stats.durationMs | Task 实体 |
| Token消耗 | Task.stats.tokenConsumed | Task 实体 |
| 工具调用 | LogEntry.type='tool_call' | 日志文件 |
| 中间产物 | Artifact.type='temp' | artifacts/task-{id}/temp/ |

---

## 5. 任务拆分规范（技术实现规约）

### 5.1 拆分触发条件（对应 PRD 5.1）

**复杂度评估算法**:
```typescript
function evaluateComplexity(task: Task): Complexity {
  // PRD 5.1 判断标准实现
  const codeLines = this.estimateCodeLines(task.description);

  if (codeLines < 50) return 'simple';
  if (codeLines <= 200) return 'medium';
  return 'complex';
}

// PRD 5.1 拆分策略映射
const splitStrategyMap: Record<Complexity, number> = {
  'simple': 0,   // 不拆分
  'medium': 3,   // 拆分为2-3个
  'complex': 5   // 拆分为4-6个
};
```

### 5.2 拆分策略（对应 PRD 5.2）

**三种策略实现**:

```typescript
interface SplitStrategy {
  name: string;
  split(task: Task): Promise<Task[]>;
}

// PRD 5.2 策略1: 按角色拆分
class RoleBasedSplitStrategy implements SplitStrategy {
  async split(task: Task): Promise<Task[]> {
    // 产品分析 → 架构设计 → 编码实现
    return [
      { title: `${task.title} - 需求分析`, role: 'product-manager' },
      { title: `${task.title} - 架构设计`, role: 'architect' },
      { title: `${task.title} - 编码实现`, role: 'backend-dev' }
    ];
  }
}

// PRD 5.2 策略2: 按模块拆分
class ModuleBasedSplitStrategy implements SplitStrategy {
  async split(task: Task): Promise<Task[]> {
    // 解析模块列表
    const modules = await this.llmClient.extractModules(task.description);
    return modules.map(m => ({
      title: `${task.title} - ${m.name}模块`,
      role: this.matchRole(m.type)
    }));
  }
}

// PRD 5.2 策略3: 按步骤拆分
class StepBasedSplitStrategy implements SplitStrategy {
  async split(task: Task): Promise<Task[]> {
    // 设计数据库 → 写API → 写前端
    const steps = await this.llmClient.extractSteps(task.description);
    return steps.map((s, i) => ({
      title: `${task.title} - 步骤${i+1}: ${s.name}`,
      role: s.role,
      dependencies: i > 0 ? [/* 上一步 */] : []
    }));
  }
}
```

### 5.3 子任务依赖规范（对应 PRD 5.3）

**依赖验证实现**:
```typescript
class DependencyValidator {
  // PRD 5.3 依赖规则验证
  async validate(taskId: string, dependencies: string[]): Promise<void> {
    // 规则1: 不允许循环依赖
    if (await this.hasCyclicDependency(taskId, dependencies)) {
      throw new Error('CYCLIC_DEPENDENCY');
    }

    // 规则2: 单个任务最多依赖5个
    if (dependencies.length > 5) {
      throw new Error('TOO_MANY_DEPENDENCIES');
    }

    // 规则3: 依赖关系创建后不变（执行期间检查）
    // 在任务执行前验证依赖是否已完成
  }

  private async hasCyclicDependency(taskId: string, deps: string[]): Promise<boolean> {
    const visited = new Set<string>();
    const dfs = async (id: string): Promise<boolean> => {
      if (id === taskId) return true;
      if (visited.has(id)) return false;
      visited.add(id);
      const task = await this.taskRepo.get(id);
      for (const dep of task.dependencies) {
        if (await dfs(dep)) return true;
      }
      return false;
    };
    return Promise.all(deps.map(d => dfs(d))).then(r => r.some(Boolean));
  }
}
```

---

## 6. 日志规范（技术实现规约）

### 6.1 日志类型（对应 PRD 6.1）

**类型实现**:
```typescript
// PRD 6.1 日志类型定义
enum LogType {
  SYSTEM = 'system',      // PRD: 系统日志
  EXECUTION = 'execution', // PRD: 执行日志
  OPERATION = 'operation'  // PRD: 操作日志
}

enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

// PRD 6.1 保留期限实现
const retentionPolicy = {
  [LogType.SYSTEM]: 30 * 24 * 60 * 60 * 1000,    // 30天
  [LogType.EXECUTION]: 90 * 24 * 60 * 60 * 1000, // 90天
  [LogType.OPERATION]: 180 * 24 * 60 * 60 * 1000 // 180天
};
```

### 6.2 日志数据结构（对应 PRD 6.2）

**强制实现 PRD 6.2 定义的结构**:
```typescript
interface LogEntry {
  // PRD 6.2 基础信息
  id: string;                    // 格式: log-{uuid}
  timestamp: string;             // ISO 8601, UTC
  level: 'debug' | 'info' | 'warn' | 'error';

  // PRD 6.2 关联信息
  taskId: string;
  agentId?: string;
  userId?: string;

  // PRD 6.2 日志内容
  type: 'thought' | 'action' | 'tool_call' | 'tool_result' |
        'milestone' | 'status_change' | 'error';
  content: string;               // 长度: 1-10000字符
  metadata?: Record<string, any>;// 最大1KB
}
```

**存储实现**:
- 格式: JSON Lines
- 路径: `data/logs/task-{taskId}/{YYYY-MM-DD}.log`
- 索引: 按 taskId + timestamp

### 6.3 时间线视图规范（对应 PRD 6.3）

**API 实现**:
```typescript
// GET /api/tasks/:id/timeline
class TimelineService {
  async getTimeline(taskId: string): Promise<TimelineEntry[]> {
    const logs = await this.logRepo.query({
      taskId,
      orderBy: 'timestamp',
      order: 'asc'
    });

    return logs.map(log => ({
      time: formatTime(log.timestamp),  // HH:MM:SS
      icon: this.getIcon(log.type),      // 📝 🔍 ✂️ 等
      title: this.formatTitle(log),
      detail: log.content,
      link: log.metadata?.artifactId
        ? `/artifacts/${log.metadata.artifactId}`
        : undefined
    }));
  }
}
```

---

## 7. 成品规范（技术实现规约）

### 7.1 成品类型（对应 PRD 7.1）

**强制实现 PRD 7.1 定义的类型**:
```typescript
// PRD 7.1 Artifact 类型定义
interface Artifact {
  id: string;                    // 格式: art-{uuid}
  taskId: string;                // PRD: 关联任务ID

  // PRD 7.1 定义的6种类型
  type: 'code' | 'document' | 'diagram' | 'test' | 'config' | 'data';

  name: string;                  // 长度: 1-255字符
  path: string;                  // 相对路径
  size: number;                  // 字节数
  mimeType: string;
  createdAt: string;             // ISO 8601
  checksum: string;              // SHA256
}
```

### 7.2 成品管理规范（对应 PRD 7.2）

**功能实现**:

| PRD 功能 | 技术实现 |
|----------|----------|
| 自动收集 | FileWatcher 监听文件创建，5秒内关联 |
| 版本追踪 | Artifact.version 字段，最多10个版本 |
| 快速访问 | GET /api/tasks/:id/artifacts 接口 |
| 导出打包 | 生成 ZIP，保持目录结构 |

```typescript
class ArtifactService {
  // PRD 7.2 自动收集
  async autoCollect(taskId: string, filePath: string): Promise<Artifact> {
    const artifact = await this.createArtifact(taskId, filePath);
    await this.taskRepo.addArtifact(taskId, artifact.id);
    return artifact;
  }

  // PRD 7.2 版本追踪
  async createVersion(artifactId: string, newPath: string): Promise<Artifact> {
    const old = await this.artifactRepo.get(artifactId);
    if (old.version >= 10) {
      await this.archiveOldestVersion(old.taskId);
    }
    return this.createArtifact(old.taskId, newPath, {
      version: old.version + 1,
      previousVersionId: old.id
    });
  }
}
```

### 7.3 成品命名规范（对应 PRD 7.3）

**验证规则**:
```typescript
const artifactNameSchemas = {
  // PRD 7.3 代码文件: {模块}-{功能}.{扩展名}
  code: z.string().regex(/^[a-z-]+\.[a-z]+$/),

  // PRD 7.3 文档: {日期}-{标题}.md
  document: z.string().regex(/^\d{8}-[^\/\\:*?"<>|]+\.md$/),

  // PRD 7.3 图表: {主题}-{类型}.png
  diagram: z.string().regex(/^[^\/\\:*?"<>|]+-(流程图|架构图|时序图)\.png$/),

  // PRD 7.3 测试: {模块}.test.{扩展名}
  test: z.string().regex(/^[a-z-]+\.test\.[a-z]+$/)
};
```

---

## 8. 角色系统规范（技术实现规约）

### 8.1 内置角色（对应 PRD 8.1）

**强制实现 PRD 8.1 定义的6个角色**:
```typescript
// PRD 8.1 内置角色定义
const BUILTIN_ROLES: Role[] = [
  {
    id: 'task-analyzer',
    name: '任务分析师',
    description: '分析任务、决定拆分策略',
    systemPrompt: readFileSync('roles/task-analyzer/system_prompt.md'),
    allowedTools: ['analyze-code', 'file-read'],
    maxTokensPerTask: 4000
  },
  {
    id: 'product-manager',
    name: '产品经理',
    description: '需求分析、PRD编写',
    systemPrompt: readFileSync('roles/product-manager/system_prompt.md'),
    allowedTools: ['file-write', 'web-search'],
    maxTokensPerTask: 4000
  },
  {
    id: 'architect',
    name: '架构师',
    description: '技术方案、架构设计',
    systemPrompt: readFileSync('roles/architect/system_prompt.md'),
    allowedTools: ['analyze-code', 'file-write', 'diagram-generate'],
    maxTokensPerTask: 4000
  },
  {
    id: 'backend-dev',
    name: '后端开发',
    description: 'API开发、业务逻辑',
    systemPrompt: readFileSync('roles/backend-dev/system_prompt.md'),
    allowedTools: ['file-read', 'file-write', 'code-execute', 'git-commit'],
    maxTokensPerTask: 4000
  },
  {
    id: 'frontend-dev',
    name: '前端开发',
    description: 'UI实现、组件开发',
    systemPrompt: readFileSync('roles/frontend-dev/system_prompt.md'),
    allowedTools: ['file-read', 'file-write', 'code-execute', 'git-commit'],
    maxTokensPerTask: 4000
  },
  {
    id: 'tester',
    name: '测试工程师',
    description: '测试计划、用例执行',
    systemPrompt: readFileSync('roles/tester/system_prompt.md'),
    allowedTools: ['file-read', 'file-write', 'code-execute', 'run-tests'],
    maxTokensPerTask: 4000
  }
];
```

### 8.2 角色匹配规则（对应 PRD 8.2）

**强制实现 PRD 8.2 定义的匹配函数**:
```typescript
// PRD 8.2 角色匹配规则实现
function matchRole(task: Task): string {
  const desc = task.description.toLowerCase();

  // PRD 8.2: 需求相关
  if (desc.includes('需求') || desc.includes('prd') || desc.includes('产品')) {
    return 'product-manager';
  }

  // PRD 8.2: 架构相关
  if (desc.includes('架构') || desc.includes('设计') || desc.includes('技术方案')) {
    return 'architect';
  }

  // PRD 8.2: 前端相关
  if (desc.includes('前端') || desc.includes('ui') || desc.includes('界面')) {
    return 'frontend-dev';
  }

  // PRD 8.2: 后端相关
  if (desc.includes('后端') || desc.includes('api') || desc.includes('接口')) {
    return 'backend-dev';
  }

  // PRD 8.2: 测试相关
  if (desc.includes('测试') || desc.includes('用例') || desc.includes('质量')) {
    return 'tester';
  }

  // PRD 8.2: 默认角色
  return 'task-analyzer';
}
```

### 8.3 角色定义规范（对应 PRD 8.3）

**强制实现 PRD 8.3 定义的结构**:
```typescript
// PRD 8.3 Role 数据结构
interface Role {
  id: string;                    // 角色唯一标识
  name: string;                  // 角色名称
  description: string;           // 角色描述

  // PRD 8.3 系统提示词
  systemPrompt: string;

  // PRD 8.3 能力配置
  allowedTools: string[];        // 允许使用的工具列表
  maxTokensPerTask: number;      // 单个任务最大Token数

  // PRD 8.3 执行参数
  temperature?: number;          // 默认: 0.7
  timeout?: number;              // 默认: 300秒
}
```

---

## 9. API 规范（技术实现规约）

### 9.1 REST API（对应 PRD 9.1）

**强制实现 PRD 9.1 定义的所有接口**:

```typescript
// PRD 9.1 任务管理接口
class TaskController {
  // POST /api/tasks
  async createTask(req: CreateTaskRequest): Promise<Task> {
    // PRD 3.1 数据结构验证
    const validated = createTaskSchema.parse(req);
    return this.taskService.create(validated);
  }

  // GET /api/tasks/:id
  async getTask(taskId: string): Promise<TaskDetail> {
    const task = await this.taskService.get(taskId);
    return {
      ...task,
      // PRD 3.1 要求返回 artifacts 和 logs
      artifacts: await this.artifactService.getByTask(taskId),
      subtasks: await this.taskService.getSubtasks(taskId)
    };
  }

  // GET /api/tasks/:id/logs
  async getTaskLogs(taskId: string, query: LogQuery): Promise<LogEntry[]> {
    // PRD 6.2 日志数据结构返回
    return this.logService.query({ taskId, ...query });
  }

  // GET /api/tasks/:id/artifacts
  async getTaskArtifacts(taskId: string): Promise<Artifact[]> {
    // PRD 7.1 成品类型返回
    return this.artifactService.getByTask(taskId);
  }

  // POST /api/tasks/:id/retry
  async retryTask(taskId: string): Promise<{ status: 'pending' }> {
    // PRD 3.2 状态转换: failed -> pending
    await this.taskService.transitionStatus(taskId, 'pending');
    return { status: 'pending' };
  }

  // POST /api/tasks/:id/pause
  async pauseTask(taskId: string): Promise<{ status: 'paused' }> {
    // PRD 3.2 状态转换: running -> paused
    await this.taskService.transitionStatus(taskId, 'paused');
    return { status: 'paused' };
  }

  // POST /api/tasks/:id/resume
  async resumeTask(taskId: string): Promise<{ status: 'running' }> {
    // PRD 3.2 状态转换: paused -> running
    await this.taskService.transitionStatus(taskId, 'running');
    return { status: 'running' };
  }
}
```

### 9.2 WebSocket 实时推送（对应 PRD 9.2）

**强制实现 PRD 9.2 定义的事件类型**:
```typescript
// PRD 9.2 WebSocket 事件类型
type WSEvent =
  | StatusChangeEvent    // PRD: status_change
  | LogEntryEvent        // PRD: log_entry
  | ArtifactCreatedEvent // PRD: artifact_created
  | SubtaskCreatedEvent  // PRD: subtask_created
  | ProgressUpdateEvent  // PRD: progress_update
  | ErrorEvent;          // PRD: error

// 事件推送实现
class WebSocketService {
  async broadcastTaskStatus(taskId: string, oldStatus: TaskStatus, newStatus: TaskStatus) {
    this.broadcast(taskId, {
      type: 'status_change',  // PRD 9.2 定义
      timestamp: new Date().toISOString(),
      data: { oldStatus, newStatus }
    });
  }

  async broadcastLogEntry(taskId: string, log: LogEntry) {
    this.broadcast(taskId, {
      type: 'log_entry',  // PRD 9.2 定义
      timestamp: new Date().toISOString(),
      data: log
    });
  }
}
```

---

## 10. 数据存储规范（技术实现规约）

### 10.1 存储目录结构（对应 PRD 10.1）

**强制实现 PRD 10.1 定义的目录结构**:
```
data/
├── tasks/                      # PRD 10.1 任务数据
│   ├── task-{id}.json          # 任务元数据
│   └── index.json              # 任务索引
│
├── logs/                       # PRD 10.1 日志数据
│   └── task-{id}/
│       └── {YYYY-MM-DD}.log    # 按日期分片
│
├── artifacts/                  # PRD 10.1 成品文件
│   └── task-{id}/
│       ├── code/               # PRD 7.1 code 类型
│       ├── docs/               # PRD 7.1 document 类型
│       ├── tests/              # PRD 7.1 test 类型
│       └── others/             # 其他类型
│
└── cache/                      # PRD 10.1 缓存数据
    └── agent-context/          # 智能体上下文缓存
```

### 10.2 持久化策略（对应 PRD 10.2）

**强制实现 PRD 10.2 定义的策略**:

| PRD 数据类型 | PRD 策略 | 技术实现 |
|--------------|----------|----------|
| 任务数据 | 立即持久化 | fs.writeFileSync + flush |
| 日志数据 | 批量写入 | 5秒或100条批量 flush |
| 成品文件 | 立即持久化 | fs.copyFile + checksum |
| 缓存数据 | 不持久化 | 内存存储，重启清空 |

```typescript
class PersistenceManager {
  // PRD 10.2 任务数据立即持久化
  async saveTaskImmediate(task: Task): Promise<void> {
    const path = `data/tasks/task-${task.id}.json`;
    await fs.writeFile(path, JSON.stringify(task, null, 2));
    await fs.sync(path); // 强制刷盘
  }

  // PRD 10.2 日志数据批量写入
  private logBuffer: Map<string, LogEntry[]> = new Map();

  async bufferLog(log: LogEntry): Promise<void> {
    const key = log.taskId;
    if (!this.logBuffer.has(key)) {
      this.logBuffer.set(key, []);
    }
    this.logBuffer.get(key)!.push(log);

    // 批量条件: 5秒或100条
    if (this.logBuffer.get(key)!.length >= 100) {
      await this.flushLogs(key);
    }
  }
}
```

---

## 11. 用户界面规范（技术实现规约）

### 11.1 任务列表页（对应 PRD 11.1）

**强制实现 PRD 11.1 要求的元素**:

```typescript
// TaskList 组件必须包含 PRD 11.1 要求的元素
interface TaskListPageProps {
  // PRD 11.1: 新建任务按钮
  onCreateTask: () => void;

  // PRD 11.1: 状态筛选器
  filters: {
    status: ('all' | 'running' | 'completed' | 'failed')[];
  };

  // PRD 11.1: 任务列表
  tasks: TaskCardProps[];
}

// PRD 11.1 任务卡片信息
interface TaskCardProps {
  title: string;           // PRD: {标题}
  status: TaskStatus;      // PRD: [{状态}]
  role: string;            // PRD: 角色: {角色名}
  duration: number;        // PRD: 耗时: {时间}
  artifactCount: number;   // PRD: 产出: {N}个文件
}
```

### 11.2 任务详情页（对应 PRD 11.2）

**强制实现 PRD 11.2 要求的 Tab**:

```typescript
// TaskDetail 组件必须包含 PRD 11.2 要求的4个Tab
enum TaskDetailTab {
  OVERVIEW = 'overview',    // PRD: 概览
  LOGS = 'logs',            // PRD: 执行日志
  SUBTASKS = 'subtasks',    // PRD: 子任务
  ARTIFACTS = 'artifacts'   // PRD: 成品
}

// PRD 11.2 时间线视图要求
interface TimelineProps {
  // PRD: 按时间倒序排列
  entries: TimelineEntry[];

  // PRD: 支持展开/折叠详情
  expandable: boolean;

  // PRD: 错误日志高亮显示
  highlightErrors: boolean;

  // PRD: 支持跳转到关联文件
  onArtifactClick: (artifactId: string) => void;
}
```

---

## 12. 里程碑与验收（技术实现规约）

### 12.1 开发里程碑（对应 PRD 12.1）

**Phase 1 技术实现（对应 PRD 12.1 Phase 1）**:

| PRD 功能 | 技术实现 | PRD 验收标准 |
|----------|----------|--------------|
| 任务CRUD | TaskController + TaskService | 接口响应<100ms |
| 任务状态机 | TaskStateMachine | 状态转换正确 |
| 基础执行引擎 | TaskExecutionPipeline | 简单任务60秒内完成 |
| 执行日志 | LogService | 每个步骤都有日志 |

**Phase 2 技术实现（对应 PRD 12.1 Phase 2）**:

| PRD 功能 | 技术实现 | PRD 验收标准 |
|----------|----------|--------------|
| 智能任务拆分 | TaskDomain.splitTask() | 拆分为2-5个子任务 |
| 子任务依赖 | DependencyValidator | 无循环依赖 |
| 并行执行 | Promise.all() | 无依赖任务同时执行 |
| 结果汇总 | step6_aggregate() | 子任务结果正确汇总 |

**Phase 3 技术实现（对应 PRD 12.1 Phase 3）**:

| PRD 功能 | 技术实现 | PRD 验收标准 |
|----------|----------|--------------|
| 成品自动收集 | FileWatcher + ArtifactService | 文件自动关联 |
| 任务时间线 | TimelineService | 视图正确 |
| Web界面 | React + Ant Design | 响应式 |
| 实时推送 | WebSocketService | 延迟<1秒 |

**Phase 4 技术实现（对应 PRD 12.1 Phase 4）**:

| PRD 功能 | 技术实现 | PRD 验收标准 |
|----------|----------|--------------|
| 角色定义 | RoleRegistry (6个内置角色) | 角色可用 |
| 角色匹配 | matchRole() 函数 | 准确率>80% |
| 多角色协作 | AgentService 上下文传递 | 上下文正确传递 |
| 端到端测试 | E2E Test Suite | 完整场景通过 |

### 12.2 性能指标（对应 PRD 12.2）

**监控实现**:
```typescript
// PRD 12.2 性能指标监控
class PerformanceMonitor {
  // PRD: 任务创建延迟 < 100ms
  async measureTaskCreation(): Promise<number> {
    const start = Date.now();
    await this.taskService.create({ title: 'test', description: 'test' });
    return Date.now() - start;
  }

  // PRD: 日志查询速度 < 500ms (1000条)
  async measureLogQuery(): Promise<number> {
    const start = Date.now();
    await this.logService.query({ limit: 1000 });
    return Date.now() - start;
  }

  // PRD: 并发任务数 >= 10个
  async measureConcurrency(): Promise<number> {
    const tasks = Array(10).fill(null).map((_, i) =>
      this.taskService.create({ title: `task-${i}`, description: 'test' })
    );
    const running = await Promise.all(tasks);
    return running.filter(t => t.status === 'running').length;
  }
}
```

### 12.3 质量指标（对应 PRD 12.3）

**验收检查**:
```typescript
// PRD 12.3 质量指标检查
class QualityChecker {
  // PRD: 单元测试覆盖率 >= 80%
  async checkCoverage(): Promise<boolean> {
    const report = await this.testRunner.getCoverageReport();
    return report.lines.pct >= 80;
  }

  // PRD: 接口测试通过率 100%
  async checkApiTests(): Promise<boolean> {
    const results = await this.testRunner.runApiTests();
    return results.every(r => r.passed);
  }

  // PRD: 任务成功率 >= 95%
  async checkTaskSuccessRate(): Promise<boolean> {
    const stats = await this.taskService.getStats();
    const rate = stats.completed / (stats.completed + stats.failed);
    return rate >= 0.95;
  }
}
```

---

## 13. 安全规范（技术实现规约）

### 13.1 数据安全（对应 PRD 13.1）

**PRD 13.1 实现**:
```typescript
// PRD 13.1: 敏感配置加密存储
class SecureConfig {
  async saveApiKey(provider: string, apiKey: string): Promise<void> {
    const encrypted = await this.encrypt(apiKey);
    await this.configStore.set(`llm.${provider}.apiKey`, encrypted);
  }

  // PRD 13.1: 日志中不得包含敏感信息
  sanitizeLog(log: LogEntry): LogEntry {
    const sensitivePattern = /api[_-]?key|password|token/i;
    if (sensitivePattern.test(log.content)) {
      return { ...log, content: '[REDACTED]' };
    }
    return log;
  }
}
```

### 13.2 执行安全（对应 PRD 13.2）

**PRD 13.2 实现**:
```typescript
// PRD 13.2: 危险操作需要确认
class DangerousOperationGuard {
  dangerousTools = ['delete-file', 'git-push', 'execute-code'];

  async beforeToolExecute(toolName: string, params: any): Promise<boolean> {
    if (this.dangerousTools.includes(toolName)) {
      // 需要用户确认
      return await this.requestUserConfirmation(toolName, params);
    }
    return true;
  }
}
```

---

## 附录A: 变更日志

| 版本 | 日期 | 变更内容 | 对应 PRD 章节 |
|------|------|----------|---------------|
| 1.0.0 | 2026-02-20 | 初始版本，章节与 PRD 完全对应 | 全部 |

---

## 附录B: 与 PRD 章节对照表

| Spec 章节 | PRD 章节 | 对应关系 |
|-----------|----------|----------|
| 1. 产品愿景 | 1. 产品愿景 | 技术实现规约 |
| 2. 核心理念 | 2. 核心理念 | 技术实现规约 |
| 3. 任务模型规范 | 3. 任务模型规范 | 数据结构 + 状态机实现 |
| 4. 执行过程规范 | 4. 执行过程规范 | 执行流程代码 |
| 5. 任务拆分规范 | 5. 任务拆分规范 | 拆分策略实现 |
| 6. 日志规范 | 6. 日志规范 | 日志服务实现 |
| 7. 成品规范 | 7. 成品规范 | 成品服务实现 |
| 8. 角色系统规范 | 8. 角色系统规范 | 角色配置实现 |
| 9. API 规范 | 9. API 规范 | 接口实现代码 |
| 10. 数据存储规范 | 10. 数据存储规范 | 存储实现 |
| 11. 用户界面规范 | 11. 用户界面规范 | UI 组件实现 |
| 12. 里程碑与验收 | 12. 里程碑与验收 | 测试实现 |
| 13. 安全规范 | 13. 安全规范 | 安全措施实现 |

---

**文档结束**

*本文档章节与 PRD 文档严格一一对应，所有技术实现必须遵循对应 PRD 章节的需求定义。*
