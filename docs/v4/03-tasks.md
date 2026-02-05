# v4 任务管理优化 - 任务拆分

## 任务总览

| ID | 任务 | 优先级 | 预估工时 | 依赖 | 状态 |
|----|------|--------|---------|------|------|
| TASK-001 | 持久化类型定义 | P0 | 2h | - | pending |
| TASK-002 | TaskPersistence 核心 | P0 | 4h | TASK-001 | pending |
| TASK-003 | TaskManager 集成持久化 | P0 | 3h | TASK-002 | pending |
| TASK-004 | AutoScheduler 自动执行 | P0 | 4h | TASK-003 | pending |
| TASK-005 | RetryManager 重试机制 | P1 | 3h | TASK-003 | pending |
| TASK-006 | ResultsUI 成果展示 | P1 | 4h | - | pending |
| TASK-007 | API 端点扩展 | P1 | 2h | TASK-003 | pending |
| TASK-008 | ProgressTracker 进度追踪 | P1 | 2h | TASK-001 | pending |
| TASK-009 | 集成测试 | P1 | 4h | 全部 | pending |

---

## TASK-001: 持久化类型定义

### 任务描述
定义持久化相关的 TypeScript 类型，为后续开发奠定基础。

### 交付物
- `src/types/persistence.ts` - 持久化类型
- `src/types/storage.ts` - 存储类型
- `src/types/output.ts` - 输出类型

### 详细设计

#### 1. src/types/persistence.ts

```typescript
export interface PersistedTask {
  id: string;
  type: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignedRole?: string;
  ownerRole?: string;
  dependencies: string[];
  input: TaskInput;
  output?: TaskOutput;
  constraints?: TaskConstraints;
  metadata: TaskMetadata;
  progress: TaskProgress;
  executionRecords: ExecutionRecord[];
  retryHistory: RetryRecord[];
}

export interface TaskMetadata {
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt?: Date;
  completedAt?: Date;
  restartCount: number;
  isRecovered: boolean;
  recoveredFrom?: string;
}

export interface TaskProgress {
  currentStep?: string;
  completedSteps: string[];
  percentage: number;
  message?: string;
  lastCheckpointAt?: Date;
}

export interface RetryRecord {
  attemptNumber: number;
  failedAt: Date;
  error: string;
  errorStack?: string;
  delayMs: number;
  retriedAt?: Date;
  retriedBy?: string;
}

export interface ExecutionRecord {
  id: string;
  role: string;
  action: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  result?: ToolResult;
  tokensUsed?: TokenUsage;
  model?: string;
  provider?: string;
}
```

#### 2. src/types/storage.ts

```typescript
export interface TaskStorage {
  version: string;
  lastSavedAt: Date;
  tasks: Map<string, PersistedTask>;
  taskOrder: string[];
  metadata: StorageMetadata;
}

export interface StorageMetadata {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalExecutions: number;
  lastRecoveryAt?: Date;
}
```

#### 3. src/types/output.ts

```typescript
export interface TaskOutput {
  files: OutputFile[];
  summary?: string;
  webPreview?: WebPreview;
  metrics?: TaskMetrics;
}

export interface OutputFile {
  id: string;
  path: string;
  name: string;
  type: FileType;
  size: number;
  content?: string;
  mimeType?: string;
  preview?: 'code' | 'image' | 'markdown' | 'html' | 'json' | 'text';
}

export type FileType = 'source' | 'test' | 'doc' | 'config' | 'output' | 'other';

export interface WebPreview {
  type: 'iframe' | 'modal' | 'link';
  url?: string;
  content?: string;
  width?: string;
  height?: string;
}

export interface TaskMetrics {
  executionTime: number;
  tokenUsage?: TokenUsage;
  fileCount: number;
  totalSize: number;
}
```

### 验收标准
- [ ] `src/types/persistence.ts` 包含所有持久化类型
- [ ] `src/types/storage.ts` 包含存储类型
- [ ] `src/types/output.ts` 包含输出类型
- [ ] 类型定义通过 TypeScript 编译
- [ ] 单元测试验证类型正确性

### 技术要点
- 使用 `Map<string, PersistedTask>` 而非对象
- Date 类型正确序列化为 ISO 字符串
- 支持循环引用的类型安全

---

## TASK-002: TaskPersistence 核心实现

### 任务描述
实现任务持久化核心类，支持保存、加载、备份和自动保存。

### 交付物
- `src/core/task-persistence.ts` - 持久化核心
- `tests/unit/task-persistence.test.ts` - 单元测试

### 详细设计

```typescript
// src/core/task-persistence.ts

export interface PersistenceConfig {
  storagePath: string;
  backupPath?: string;
  autoSaveIntervalMs: number;
  maxBackupCount: number;
}

export class TaskPersistence {
  private config: PersistenceConfig;
  private saveInterval?: NodeJS.Timeout;

  constructor(config: PersistenceConfig) {
    this.config = config;
  }

  async saveTask(task: PersistedTask): Promise<void>
  async saveTasks(tasks: PersistedTask[]): Promise<void>
  async loadTasks(): Promise<PersistedTask[]>
  async deleteTask(taskId: string): Promise<void>
  async clear(): Promise<void>

  startAutoSave(tasks: () => PersistedTask[]): void
  stopAutoSave(): void

  private async loadStorage(): Promise<TaskStorage>
  private async saveStorage(storage: TaskStorage): Promise<void>
  private async createBackup(sourcePath: string): Promise<void>
}
```

### 验收标准
- [ ] `saveTask()` 正确保存单个任务
- [ ] `saveTasks()` 正确保存多个任务
- [ ] `loadTasks()` 正确恢复所有任务
- [ ] 自动备份功能正常
- [ ] 自动保存间隔正确
- [ ] 单元测试覆盖率 > 80%

### 技术要点
- 使用原子性写操作（先写临时文件再重命名）
- 异步不影响主线程
- 备份轮转机制

---

## TASK-003: TaskManager 集成持久化

### 任务描述
修改 TaskManager，在任务创建、状态变更时自动持久化。

### 交付物
- 修改 `src/core/task-manager.ts` - 集成持久化
- 修改 `src/types/index.ts` - 扩展 TaskInput 类型

### 详细设计

#### 1. TaskManager 修改

```typescript
// src/core/task-manager.ts

export class TaskManager {
  private persistence: TaskPersistence;

  constructor(eventSystem: EventSystem, persistence?: TaskPersistence) {
    this.eventSystem = eventSystem;
    this.persistence = persistence || new TaskPersistence({
      storagePath: './data/tasks.json',
      autoSaveIntervalMs: 30000,
      maxBackupCount: 5,
    });

    // 恢复任务
    this.restoreTasks();
  }

  private async restoreTasks(): Promise<void> {
    const tasks = await this.persistence.loadTasks();
    for (const task of tasks) {
      task.metadata.isRecovered = true;
      this.tasks.set(task.id, task);
    }
  }

  createTask(params: CreateTaskParams): Task {
    const task = { /* ... */ };

    // 自动持久化
    this.persistence.saveTask(this.toPersistedTask(task));

    this.emit('task:created', { task });
    return task;
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    super.updateTaskStatus(taskId, status);

    // 持久化状态变更
    const task = this.tasks.get(taskId);
    if (task) {
      await this.persistence.saveTask(this.toPersistedTask(task));
    }
  }

  private toPersistedTask(task: Task): PersistedTask {
    return {
      id: task.id,
      // ... 映射所有字段
    };
  }
}
```

#### 2. 扩展 TaskInput

```typescript
// src/types/index.ts

export interface TaskInput {
  variables?: Record<string, any>;
  stepConfig?: Record<string, any>;
  stepOutputs?: Record<string, any>;

  // v4 新增
  workDir?: TaskWorkDirConfig;
  autoExecute?: boolean;  // 是否自动执行，默认 true
  retryConfig?: RetryConfig;  // 重试配置
}
```

### 验收标准
- [ ] 任务创建时自动保存
- [ ] 任务状态变更时自动保存
- [ ] 服务启动时自动恢复任务
- [ ] 恢复的任务标记 `isRecovered = true`
- [ ] 支持 `autoExecute` 配置
- [ ] 支持 `retryConfig` 配置

### 技术要点
- 避免重复持久化（状态未变更时不保存）
- 持久化失败不影响主流程
- 异步持久化不阻塞任务执行

---

## TASK-004: AutoScheduler 自动执行

### 任务描述
实现任务自动调度器，任务创建后立即执行。

### 交付物
- `src/core/auto-scheduler.ts` - 自动调度器
- `tests/unit/auto-scheduler.test.ts` - 单元测试

### 详细设计

```typescript
// src/core/auto-scheduler.ts

export interface SchedulerConfig {
  maxConcurrentTasks: number;
  checkIntervalMs: number;
  priorityEnabled: boolean;
}

export class AutoScheduler extends EventEmitter {
  private config: SchedulerConfig;
  private taskManager: TaskManager;
  private runningCount: number = 0;

  start(): void
  stop(): void

  private async checkAndSchedule(): Promise<void>
  private async getExecutableTasks(): Promise<PersistedTask[]>
  private async executeTask(task: PersistedTask): Promise<void>
}
```

### 验收标准
- [ ] 任务创建后自动进入执行队列
- [ ] 无需人工点击立即执行
- [ ] 依赖任务完成后自动调度下游
- [ ] 支持优先级调度
- [ ] 最多 N 个任务并发执行
- [ ] 单元测试覆盖率 > 80%

### 技术要点
- 事件驱动而非轮询（优先使用事件）
- 竞态条件处理
- 并发数精确控制

---

## TASK-005: RetryManager 重试机制

### 任务描述
实现失败重试机制，支持手动和自动重试。

### 交付物
- `src/core/retry-manager.ts` - 重试管理器
- `tests/unit/retry-manager.test.ts` - 单元测试

### 详细设计

```typescript
// src/core/retry-manager.ts

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatuses: TaskStatus[];
}

export interface RetryInfo {
  canRetry: boolean;
  remainingAttempts: number;
  nextRetryAt: Date | null;
  retryHistory: RetryRecord[];
}

export class RetryManager {
  constructor(config: RetryConfig, taskManager: TaskManager)
  async handleFailure(taskId: string, error: string): Promise<boolean>
  async manualRetry(taskId: string): Promise<boolean>
  cancelRetry(taskId: string): boolean
  getRetryInfo(taskId: string): RetryInfo | null
}
```

### 验收标准
- [ ] 任务失败后自动安排重试
- [ ] 支持指数退避
- [ ] 达到最大次数后停止重试
- [ ] 支持手动重试
- [ ] 记录重试历史
- [ ] API 返回重试信息
- [ ] 单元测试覆盖率 > 80%

### 技术要点
- 重试队列持久化（重启后重试不丢失）
- 退避算法正确实现
- 防止重试风暴

---

## TASK-006: ResultsUI 成果展示

### 任务描述
实现任务成果展示 UI，支持目录树和文件预览。

### 交付物
- `src/ui/results-ui.ts` - 结果 UI
- `src/ui/file-tree.ts` - 目录树组件
- `src/ui/file-preview.ts` - 文件预览组件

### 详细设计

```typescript
// src/ui/results-ui.ts

export interface ResultsUIConfig {
  maxFileSizeForPreview: number;
  supportedPreviewTypes: string[];
  iframeSandbox: string;
}

export class ResultsUI {
  buildFileTree(files: OutputFile[]): FileTreeNode[]
  getFilePreview(file: OutputFile): PreviewResult
}
```

### 验收标准
- [ ] 按目录结构展示文件
- [ ] 支持代码高亮
- [ ] 支持图片预览
- [ ] 支持 HTML iframe 预览
- [ ] 支持 JSON/YAML 格式化
- [ ] 支持文件下载

### 技术要点
- 大文件不预览，只提供下载
- iframe sandbox 安全
- 递归构建目录树

---

## TASK-007: API 端点扩展

### 任务描述
扩展任务 API，支持持久化、重试、成果展示。

### 交付物
- `src/server/routes/tasks-v4.ts` - v4 任务路由（含所有 API）
- `tests/api/tasks-v4.test.ts` - API 测试

### API 端点完整列表

| 方法 | 路径 | 描述 | 处理器 |
|------|------|------|--------|
| GET | `/api/tasks/:id` | 获取任务详情（含进度） | getTaskDetail |
| GET | `/api/tasks/:id/progress` | 获取进度 | getProgress |
| POST | `/api/tasks/:id/retry` | 手动重试 | retryTask |
| GET | `/api/tasks/:id/retry-info` | 获取重试信息 | getRetryInfo |
| POST | `/api/tasks/:id/cancel-retry` | 取消重试 | cancelRetry |
| POST | `/api/tasks/:id/restore` | 恢复任务 | restoreTask |
| GET | `/api/tasks/:id/output` | 获取任务成果 | getTaskOutput |
| GET | `/api/tasks/:id/output/files/tree` | 获取文件树 | getFileTree |
| GET | `/api/tasks/:id/output/files/:path(*)` | 获取文件预览 | getFilePreview |
| GET | `/api/tasks/:id/execution-history` | 获取执行历史 | getExecutionHistory |

### 验收标准
- [ ] 所有 10 个 API 端点正常响应
- [ ] 错误处理返回 4xx/5xx
- [ ] API 文档完整（使用 @api 注解）
- [ ] API 测试覆盖率 > 90%
- [ ] GET /api/tasks/:id 包含 progress, retryHistory, isRecovered

---

## TASK-008: ProgressTracker 进度追踪

### 任务描述
实现任务进度追踪器，记录任务执行进度和检查点。

### 交付物
- `src/core/progress-tracker.ts` - 进度追踪器
- `tests/unit/progress-tracker.test.ts` - 单元测试

### 详细设计

```typescript
// src/core/progress-tracker.ts

export interface ProgressCheckpoint {
  id: string;
  taskId: string;
  step: string;
  message: string;
  percentage: number;
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface ProgressTrackerConfig {
  maxCheckpoints: number;
  autoCheckpoint: boolean;
}

export class ProgressTracker {
  private checkpoints: Map<string, ProgressCheckpoint[]> = new Map();
  private config: ProgressTrackerConfig;

  constructor(config?: Partial<ProgressTrackerConfig>) {
    this.config = {
      maxCheckpoints: 100,
      autoCheckpoint: true,
      ...config,
    };
  }

  async checkpoint(
    taskId: string,
    step: string,
    message: string,
    percentage: number,
    metadata?: Record<string, any>
  ): Promise<ProgressCheckpoint>

  async getCheckpoints(taskId: string): Promise<ProgressCheckpoint[]>

  async getLatestCheckpoint(taskId: string): Promise<ProgressCheckpoint | null>

  async clearCheckpoints(taskId: string): Promise<void>

  calculatePercentage(taskId: string): number
}
```

### 验收标准
- [ ] checkpoint() 正确创建检查点
- [ ] getCheckpoints() 返回历史检查点
- [ ] getLatestCheckpoint() 返回最新检查点
- [ ] 自动记录进度百分比
- [ ] 支持手动添加检查点
- [ ] 持久化检查点数据
- [ ] 单元测试覆盖率 > 80%

---

## TASK-009: 集成测试

### 任务描述
编写完整的集成测试，验证端到端流程。

### 交付物
- `tests/integration/task-full-lifecycle.test.ts` - 完整生命周期测试

### 测试场景

```typescript
describe('Task Full Lifecycle', () => {
  it('should create, execute, and persist task', async () => {
    // 1. 创建任务
    const task = await taskManager.createTask({
      title: 'Test Task',
      autoExecute: true,
    });

    // 2. 验证自动执行
    expect(task.status).toBe('running');

    // 3. 持久化验证
    const persisted = await persistence.loadTasks();
    expect(persisted.find(t => t.id === task.id)).toBeDefined();

    // 4. 完成验证
    taskManager.completeTask(task.id);
    expect(task.status).toBe('completed');
  });

  it('should recover tasks on restart', async () => {
    // 1. 创建任务并执行
    const task = await taskManager.createTask({
      title: 'Test Task',
      autoExecute: true,
    });

    // 2. 模拟重启
    await persistence.saveTasks([/* ... */]);
    const newTaskManager = new TaskManager(/* ... */);

    // 3. 恢复验证
    const recovered = newTaskManager.getTask(task.id);
    expect(recovered.metadata.isRecovered).toBe(true);
  });

  it('should retry failed task', async () => {
    // 1. 创建任务
    const task = await taskManager.createTask({
      title: 'Test Task',
      retryConfig: { maxAttempts: 3 },
    });

    // 2. 模拟失败
    retryManager.handleFailure(task.id, 'Network error');

    // 3. 验证重试安排
    const retryInfo = retryManager.getRetryInfo(task.id);
    expect(retryInfo.canRetry).toBe(true);
    expect(retryInfo.remainingAttempts).toBe(2);
  });
});
```

### 验收标准
- [ ] 完整生命周期测试
- [ ] 持久化和恢复测试
- [ ] 自动执行测试
- [ ] 重试机制测试
- [ ] 成果展示测试

---

## 依赖关系图

```
TASK-001 (持久化类型)
    │
    └───────────────────┬─────────────────────┐
                        │                     │
                        ▼                     ▼
              TASK-002 (持久化核心)   TASK-006 (ResultsUI)
                        │                     │
                        ▼                     │
              TASK-003 (TaskManager集成) ────┤
                        │                     │
            ┌───────────┴───────────┐        │
            │                       │        │
            ▼                       ▼        │
    TASK-004 (AutoScheduler)  TASK-008 (ProgressTracker)
            │                       │
            └───────────┬───────────┘
                        │
                        ├──────────────────┐
                        │                  │
                        ▼                  ▼
              TASK-005 (RetryManager)  TASK-007 (API)
                                          │
                                          └──────────────────┐
                                                                       │
                                                                       ▼
                                                            TASK-009 (集成测试)
```

---

## 验收检查清单

### 代码质量
- [ ] TypeScript 严格模式通过
- [ ] ESLint 检查通过
- [ ] 单元测试覆盖率 > 80%
- [ ] API 测试覆盖率 > 90%

### 功能完整性
- [ ] 任务持久化正常
- [ ] 自动执行正常
- [ ] 失败重试正常
- [ ] 成果展示正常

### 安全性
- [ ] iframe sandbox 启用
- [ ] 文件大小限制
- [ ] API 权限检查
