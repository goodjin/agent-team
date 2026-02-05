# v4 任务管理优化 - 架构设计

## 1. 系统架构

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      Agent Team v4                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Client     │  │  Scheduler  │  │   Persistence Layer    │ │
│  │ (API/CLI)    │──▶│  (Auto-run) │──▶│   (TaskStorage)       │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                           │                     ▲              │
│                           ▼                     │              │
│                   ┌─────────────────┐           │              │
│                   │  RetryManager   │───────────┘              │
│                   │  (重试机制)      │                          │
│                   └─────────────────┘                          │
├───────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    TaskManager                            │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐│ │
│  │  │ TaskStore   │ │ Executor    │ │ ProgressTracker     ││ │
│  │  │ (任务存储)   │ │ (执行器)    │ │ (进度追踪)          ││ │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘│ │
│  └─────────────────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    ResultsUI                             │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐│ │
│  │  │ FileTree    │ │ FilePreview │ │ WebPreview          ││ │
│  │  │ (目录树)     │ │ (文件预览)   │ │ (网页预览)          ││ │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘│ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 核心组件

| 组件 | 职责 | 位置 |
|-----|------|------|
| TaskPersistence | 任务持久化 | core/task-persistence.ts |
| TaskStorage | 任务存储管理 | core/task-storage.ts |
| AutoScheduler | 自动执行调度 | core/auto-scheduler.ts |
| RetryManager | 失败重试管理 | core/retry-manager.ts |
| ProgressTracker | 进度追踪 | core/progress-tracker.ts |
| ResultsUI | 结果展示UI | ui/results-ui.ts |
| FileTree | 目录树组件 | ui/file-tree.ts |
| FilePreview | 文件预览 | ui/file-preview.ts |

---

## 2. 数据模型

### 2.1 持久化任务

```typescript
// src/types/persistence.ts

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

### 2.2 任务存储

```typescript
// src/types/storage.ts

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

### 2.3 任务输出

```typescript
// src/types/output.ts

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
```

---

## 3. 组件设计

### 3.1 TaskPersistence

```typescript
// src/core/task-persistence.ts

import * as fs from 'fs/promises';
import * as path from 'path';

export interface PersistenceConfig {
  storagePath: string;
  backupPath?: string;
  autoSaveIntervalMs: number;
  maxBackupCount: number;
}

export class TaskPersistence {
  private config: PersistenceConfig;
  private pendingWrites: Map<string, Promise<void>> = new Map();
  private saveInterval?: NodeJS.Timeout;

  constructor(config: PersistenceConfig) {
    this.config = config;
  }

  async saveTask(task: PersistedTask): Promise<void> {
    const storage = await this.loadStorage();
    storage.tasks.set(task.id, task);
    storage.lastSavedAt = new Date();
    await this.saveStorage(storage);
  }

  async saveTasks(tasks: PersistedTask[]): Promise<void> {
    const storage = await this.loadStorage();
    for (const task of tasks) {
      storage.tasks.set(task.id, task);
    }
    storage.lastSavedAt = new Date();
    await this.saveStorage(storage);
  }

  async loadTasks(): Promise<PersistedTask[]> {
    const storage = await this.loadStorage();
    return Array.from(storage.tasks.values());
  }

  async deleteTask(taskId: string): Promise<void> {
    const storage = await this.loadStorage();
    storage.tasks.delete(taskId);
    await this.saveStorage(storage);
  }

  private async loadStorage(): Promise<TaskStorage> {
    const storagePath = this.config.storagePath;

    try {
      const data = await fs.readFile(storagePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return {
        version: '1.0',
        lastSavedAt: new Date(),
        tasks: new Map(),
        taskOrder: [],
        metadata: {
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          totalExecutions: 0,
        },
      };
    }
  }

  private async saveStorage(storage: TaskStorage): Promise<void> {
    const storagePath = this.config.storagePath;
    const tempPath = `${storagePath}.tmp`;

    await fs.writeFile(tempPath, JSON.stringify(storage, null, 2));
    await fs.rename(tempPath, storagePath);

    // 创建备份
    await this.createBackup(storagePath);
  }

  private async createBackup(sourcePath: string): Promise<void> {
    if (!this.config.backupPath) return;

    const timestamp = Date.now();
    const backupPath = path.join(
      this.config.backupPath,
      `tasks.${timestamp}.json`
    );

    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.copyFile(sourcePath, backupPath);

    // 清理旧备份
    await this.cleanupOldBackups();
  }

  private async cleanupOldBackups(): Promise<void> {
    if (!this.config.backupPath) return;

    const files = await fs.readdir(this.config.backupPath);
    const backups = files
      .filter(f => f.startsWith('tasks.'))
      .sort()
      .reverse();

    for (const file of backups.slice(this.config.maxBackupCount)) {
      await fs.unlink(path.join(this.config.backupPath, file));
    }
  }

  startAutoSave(tasks: () => PersistedTask[]): void {
    this.saveInterval = setInterval(async () => {
      try {
        await this.saveTasks(tasks());
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, this.config.autoSaveIntervalMs);
  }

  stopAutoSave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
  }
}
```

### 3.2 AutoScheduler

```typescript
// src/core/auto-scheduler.ts

import { EventEmitter } from 'events';
import { TaskManager } from './task-manager.js';
import { TaskScheduler } from './task-scheduler.js';

export interface SchedulerConfig {
  maxConcurrentTasks: number;
  checkIntervalMs: number;
  priorityEnabled: boolean;
}

export class AutoScheduler extends EventEmitter {
  private config: SchedulerConfig;
  private taskManager: TaskManager;
  private scheduler: TaskScheduler;
  private runningCount: number = 0;
  private checkInterval?: NodeJS.Timeout;

  constructor(
    config: SchedulerConfig,
    taskManager: TaskManager,
    scheduler: TaskScheduler
  ) {
    super();
    this.config = config;
    this.taskManager = taskManager;
    this.scheduler = scheduler;
  }

  start(): void {
    this.checkInterval = setInterval(() => {
      this.checkAndSchedule();
    }, this.config.checkIntervalMs);

    // 立即检查一次
    this.checkAndSchedule();

    this.emit('started');
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.emit('stopped');
  }

  private async checkAndSchedule(): Promise<void> {
    if (this.runningCount >= this.config.maxConcurrentTasks) {
      return;
    }

    // 获取可执行的任务
    const executableTasks = await this.getExecutableTasks();

    for (const task of executableTasks) {
      if (this.runningCount >= this.config.maxConcurrentTasks) {
        break;
      }

      await this.executeTask(task);
    }
  }

  private async getExecutableTasks(): Promise<PersistedTask[]> {
    const tasks = await this.taskManager.getAllTasks();

    return tasks
      .filter(task => {
        // 过滤已完成的
        if (task.status === 'completed') return false;

        // 过滤正在运行的
        if (task.status === 'running') return false;

        // 检查依赖
        const depsCompleted = task.dependencies.every(depId => {
          const dep = this.taskManager.getTask(depId);
          return dep?.status === 'completed';
        });

        return depsCompleted;
      })
      .sort((a, b) => {
        if (this.config.priorityEnabled) {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return 0;
      });
  }

  private async executeTask(task: PersistedTask): Promise<void> {
    this.runningCount++;

    try {
      await this.scheduler.scheduleTask(task.id);
    } finally {
      this.runningCount--;
      // 继续检查是否有任务可以执行
      this.checkAndSchedule();
    }
  }
}
```

### 3.3 RetryManager

```typescript
// src/core/retry-manager.ts

import { TaskManager } from './task-manager.js';

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatuses: TaskStatus[];
}

export class RetryManager {
  private config: RetryConfig;
  private taskManager: TaskManager;
  private retryQueue: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: RetryConfig, taskManager: TaskManager) {
    this.config = config;
    this.taskManager = taskManager;
  }

  async handleFailure(taskId: string, error: string): Promise<boolean> {
    const task = this.taskManager.getTask(taskId);
    if (!task) return false;

    const attemptCount = task.retryHistory.length + 1;

    if (attemptCount >= this.config.maxAttempts) {
      // 达到最大重试次数
      return false;
    }

    const delayMs = this.calculateDelay(attemptCount);

    // 记录重试历史
    const retryRecord: RetryRecord = {
      attemptNumber: attemptCount,
      failedAt: new Date(),
      error,
      delayMs,
    };

    task.retryHistory.push(retryRecord);
    task.status = 'retrying';

    // 安排重试
    this.scheduleRetry(taskId, delayMs);

    return true;
  }

  private calculateDelay(attemptNumber: number): number {
    const delay = this.config.initialDelayMs *
      Math.pow(this.config.backoffMultiplier, attemptNumber - 1);
    return Math.min(delay, this.config.maxDelayMs);
  }

  private scheduleRetry(taskId: string, delayMs: number): void {
    const timeout = setTimeout(async () => {
      await this.performRetry(taskId);
      this.retryQueue.delete(taskId);
    }, delayMs);

    this.retryQueue.set(taskId, timeout);
  }

  private async performRetry(taskId: string): Promise<void> {
    const task = this.taskManager.getTask(taskId);
    if (!task) return;

    task.status = 'pending';
    task.retryHistory.forEach((r, i) => {
      if (!r.retriedAt) {
        task.retryHistory[i].retriedAt = new Date();
      }
    });

    await this.taskManager.updateTask(taskId, { status: 'pending' });

    // 触发重新调度
    this.emit('retryScheduled', { taskId });
  }

  async manualRetry(taskId: string): Promise<boolean> {
    const task = this.taskManager.getTask(taskId);
    if (!task) return false;

    task.status = 'pending';
    task.retryHistory.push({
      attemptNumber: task.retryHistory.length + 1,
      failedAt: new Date(),
      error: 'Manual retry',
      delayMs: 0,
      retriedAt: new Date(),
      retriedBy: 'user',
    });

    this.emit('retryScheduled', { taskId });
    return true;
  }

  cancelRetry(taskId: string): boolean {
    const timeout = this.retryQueue.get(taskId);
    if (timeout) {
      clearTimeout(timeout);
      this.retryQueue.delete(taskId);
      return true;
    }
    return false;
  }

  getRetryInfo(taskId: string): RetryInfo | null {
    const task = this.taskManager.getTask(taskId);
    if (!task) return null;

    return {
      canRetry: task.retryHistory.length < this.config.maxAttempts,
      remainingAttempts: this.config.maxAttempts - task.retryHistory.length,
      nextRetryAt: task.retryHistory.length > 0 ?
        new Date(Date.now() + this.calculateDelay(task.retryHistory.length)) : null,
      retryHistory: task.retryHistory,
    };
  }
}
```

### 3.4 ResultsUI

```typescript
// src/ui/results-ui.ts

export interface ResultsUIConfig {
  maxFileSizeForPreview: number;
  supportedPreviewTypes: string[];
  iframeSandbox: string;
}

export class ResultsUI {
  private config: ResultsUIConfig;

  constructor(config?: Partial<ResultsUIConfig>) {
    this.config = {
      maxFileSizeForPreview: 1024 * 1024, // 1MB
      supportedPreviewTypes: ['html', 'md', 'json', 'txt', 'py', 'js', 'ts'],
      iframeSandbox: 'allow-scripts allow-same-origin',
      ...config,
    };
  }

  buildFileTree(files: OutputFile[]): FileTreeNode[] {
    const root: FileTreeNode = { name: '', path: '', type: 'directory', children: [] };

    for (const file of files) {
      const parts = file.path.split('/');
      let current = root;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        let child = current.children?.find(c => c.name === part && c.type === 'directory');

        if (!child) {
          child = {
            name: part,
            path: parts.slice(0, i + 1).join('/'),
            type: 'directory',
            children: [],
          };
          current.children?.push(child!);
        }
        current = child;
      }

      current.children?.push({
        name: parts[parts.length - 1],
        path: file.path,
        type: 'file',
        mimeType: file.mimeType,
        size: file.size,
        preview: file.preview,
      });
    }

    return root.children || [];
  }

  getFilePreview(file: OutputFile): PreviewResult {
    if (!file.content) {
      return { type: 'download' };
    }

    const ext = file.path.split('.').pop()?.toLowerCase();

    if (ext === 'html' && this.config.iframeSandbox) {
      return {
        type: 'iframe',
        content: file.content,
        sandbox: this.config.iframeSandbox,
      };
    }

    if (['md', 'markdown'].includes(ext || '')) {
      return { type: 'markdown', content: file.content };
    }

    if (['json', 'yaml', 'yml'].includes(ext || '')) {
      return {
        type: 'code',
        content: this.formatJSON(file.content),
        language: ext === 'json' ? 'json' : 'yaml',
      };
    }

    if (['py', 'js', 'ts', 'css', 'html'].includes(ext || '')) {
      return {
        type: 'code',
        content: file.content,
        language: ext || 'text',
      };
    }

    if (file.mimeType?.startsWith('image/')) {
      return { type: 'image', content: file.content };
    }

    return { type: 'text', content: file.content };
  }

  private formatJSON(content: string): string {
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  }
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children?: FileTreeNode[];
  mimeType?: string;
  size?: number;
  preview?: string;
}

export interface PreviewResult {
  type: 'code' | 'image' | 'markdown' | 'html' | 'text' | 'iframe' | 'download';
  content?: string;
  language?: string;
  sandbox?: string;
}
```

---

## 4. API 设计

### 4.1 任务 API 扩展

```typescript
// POST /api/tasks
// 请求体新增 autoExecute 字段
interface CreateTaskRequest {
  title: string;
  description: string;
  type?: TaskType;
  priority?: Priority;
  assignedRole?: string;
  dependencies?: string[];
  input?: TaskInput;
  autoExecute?: boolean;  // 新增: 是否自动执行，默认 true
  retryConfig?: RetryConfig;  // 新增: 重试配置
}

// GET /api/tasks/:id
// 响应新增 progress, retryHistory, isRecovered
interface TaskDetailResponse {
  success: boolean;
  data: {
    task: PersistedTask;
    retryInfo?: RetryInfo;
    canRetry: boolean;
  };
}

// POST /api/tasks/:id/retry
// 新增: 手动重试
interface RetryResponse {
  success: boolean;
  data: {
    taskId: string;
    attemptNumber: number;
    scheduledAt: Date;
  };
}

// GET /api/tasks/:id/output
// 新增: 获取任务成果
interface TaskOutputResponse {
  success: boolean;
  data: {
    output: TaskOutput;
    files: OutputFile[];
    webPreview?: WebPreview;
  };
}

// GET /api/tasks/:id/output/files/tree
// 新增: 获取文件树
interface FileTreeResponse {
  success: boolean;
  data: {
    tree: FileTreeNode[];
  };
}

// GET /api/tasks/:id/output/files/:path
// 新增: 获取文件内容预览
interface FilePreviewResponse {
  success: boolean;
  data: {
    file: OutputFile;
    preview: PreviewResult;
  };
}
```

---

## 5. 工作流程

### 5.1 任务创建和自动执行

```
用户请求 POST /api/tasks
    │
    ▼
TaskManager.createTask()
    │
    ├─ 保存任务到 TaskPersistence
    │
    ▼
任务状态: pending
    │
    ├─ autoExecute === true
    │   │
    │   ▼
    │   AutoScheduler 检测到新任务
    │       │
    │       ▼
    │   TaskScheduler.scheduleTask()
    │       │
    │       ▼
    │   任务开始执行
    │
    └─ autoExecute === false
        │
        ▼
    任务等待手动触发
```

### 5.2 持久化和恢复

```
服务启动
    │
    ▼
TaskPersistence.loadTasks()
    │
    ├─ 读取 tasks.json
    │
    ▼
恢复任务状态
    │
    ├─ 标记 isRecovered = true
    │
    ├─ 恢复 progress
    │
    └─ 恢复 executionRecords
    │
    ▼
AutoScheduler.start()
    │
    ▼
继续执行 pending 任务
```

### 5.3 失败重试

```
任务执行失败
    │
    ▼
RetryManager.handleFailure()
    │
    ├─ 检查重试次数
    │   │
    │   └─ 达到最大次数
    │       │
    │       ▼
    │   标记最终失败
    │       │
    │       ▼
    │   返回 false
    │
    ├─ 记录重试历史
    │
    ├─ 计算延迟时间
    │
    ▼
安排重试 (setTimeout)
    │
    ▼
重试时间到达
    │
    ▼
RetryManager.performRetry()
    │
    ├─ 更新任务状态
    │
    ├─ 更新重试历史
    │
    ▼
触发 AutoScheduler
    │
    ▼
重新执行任务
```

---

## 6. 文件结构

```
src/
├── core/
│   ├── task-persistence.ts    # 持久化核心
│   ├── task-storage.ts         # 存储管理
│   ├── auto-scheduler.ts       # 自动调度
│   ├── retry-manager.ts        # 重试管理
│   └── progress-tracker.ts     # 进度追踪
├── types/
│   ├── persistence.ts          # 持久化类型
│   ├── storage.ts              # 存储类型
│   └── output.ts              # 输出类型
├── ui/
│   ├── results-ui.ts           # 结果UI
│   ├── file-tree.ts           # 目录树
│   └── file-preview.ts        # 文件预览
└── server/
    └── routes/
        ├── tasks.ts            # 任务路由(扩展)
        └── task-output.ts      # 成果路由

tests/
└── integration/
    ├── task-persistence.test.ts
    ├── auto-scheduler.test.ts
    ├── retry-manager.test.ts
    └── results-ui.test.ts
```

---

## 7. 安全考虑

### 7.1 文件安全
- HTML 文件 iframe 预览时启用 sandbox
- 禁止执行恶意代码
- 文件大小限制

### 7.2 存储安全
- 任务数据加密存储
- 备份文件权限控制
- 防止数据泄露

### 7.3 API 安全
- 任务 ID 验证
- 越权访问检查
- 请求频率限制
