# Agent Team v4 文档索引

> 任务管理优化版本 - 持久化、自动执行、失败重试、成果展示

## 文档概览

| 文档 | 描述 | 状态 |
|------|------|------|
| [01-prd.md](./01-prd.md) | 产品需求文档 | ✅ 完成 |
| [02-architecture.md](./02-architecture.md) | 架构设计文档 | ✅ 完成 |
| [03-tasks.md](./03-tasks.md) | 开发任务拆分 | ✅ 完成 |

## 功能概述

本版本增加以下功能：

1. **任务持久化** - 任务状态自动保存到磁盘，重启后可恢复
2. **自动执行** - 任务创建后立即开始执行，无需人工干预
3. **失败重试** - 任务失败后支持一键重试，支持指数退避
4. **成果展示** - 支持目录结构展示和网页 iframe 预览

## 快速开始

### 1. 创建自动执行的任务

```typescript
const task = taskManager.createTask({
  title: '开发新功能',
  assignedRole: 'developer',
  input: {
    autoExecute: true,  // 自动执行
    retryConfig: {
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
    },
  },
});
```

### 2. 查看任务成果

```typescript
// 获取任务成果
const output = await taskOutputApi.getTaskOutput(taskId);

// 获取文件树
const tree = await taskOutputApi.getFileTree(taskId);

// 获取文件预览
const preview = await taskOutputApi.getFilePreview(taskId, 'src/main.py');
```

### 3. 重试失败的任务

```typescript
// 手动重试
await taskRetryApi.manualRetry(taskId);

// 获取重试信息
const retryInfo = await taskRetryApi.getRetryInfo(taskId);
```

## 核心 API

### TaskManager

```typescript
// 创建自动执行的任务
createTask(params: {
  title: string;
  description: string;
  input?: {
    autoExecute?: boolean;  // 默认 true
    retryConfig?: RetryConfig;
  };
}): Task
```

### TaskPersistence

```typescript
// 保存任务
saveTask(task: PersistedTask): Promise<void>

// 加载任务
loadTasks(): Promise<PersistedTask[]>

// 启动自动保存
startAutoSave(tasks: () => PersistedTask[]): void
```

### AutoScheduler

```typescript
// 启动调度器
start(): void

// 停止调度器
stop(): void
```

### RetryManager

```typescript
// 处理失败
handleFailure(taskId: string, error: string): Promise<boolean>

// 手动重试
manualRetry(taskId: string): Promise<boolean>

// 获取重试信息
getRetryInfo(taskId: string): RetryInfo
```

### ResultsUI

```typescript
// 构建文件树
buildFileTree(files: OutputFile[]): FileTreeNode[]

// 获取文件预览
getFilePreview(file: OutputFile): PreviewResult
```

## REST API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/tasks/:id` | 获取任务详情（含进度） |
| POST | `/api/tasks/:id/retry` | 手动重试 |
| GET | `/api/tasks/:id/retry-info` | 获取重试信息 |
| GET | `/api/tasks/:id/output` | 获取任务成果 |
| GET | `/api/tasks/:id/output/files/tree` | 获取文件树 |
| GET | `/api/tasks/:id/output/files/:path` | 获取文件预览 |

## 目录结构

```
docs/v4/
├── README.md                    # 本索引文件
├── 01-prd.md                   # 需求分析
├── 02-architecture.md           # 架构设计
└── 03-tasks.md                 # 任务拆分
```

## 任务清单

| ID | 任务 | 优先级 | 状态 |
|----|------|--------|------|
| TASK-001 | 持久化类型定义 | P0 | pending |
| TASK-002 | TaskPersistence 核心 | P0 | pending |
| TASK-003 | TaskManager 集成持久化 | P0 | pending |
| TASK-004 | AutoScheduler 自动执行 | P0 | pending |
| TASK-005 | RetryManager 重试机制 | P1 | pending |
| TASK-006 | ResultsUI 成果展示 | P1 | pending |
| TASK-007 | API 端点扩展 | P1 | pending |
| TASK-008 | 集成测试 | P1 | pending |

## 相关链接

- [主文档](../README.md)
- [v3 任务工作目录管理](../v3/README.md)
