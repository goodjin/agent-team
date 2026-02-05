# Agent Team v3 文档索引

> 任务工作目录管理功能 - 系统升级文档

## 文档概览

| 文档 | 描述 | 状态 |
|------|------|------|
| [01-requirements](./01-requirements.md) | 需求分析文档 | ✅ 完成 |
| [02-architecture](./02-architecture.md) | 架构设计文档 | ✅ 完成 |
| [03-tasks](./03-tasks.md) | 开发任务拆分 | ✅ 完成 |

## 功能概述

本版本为 Agent Team 系统增加**任务工作目录管理**功能，实现：

- 每个任务拥有独立的工作目录
- 默认在 `workspace/{task-id}` 下工作
- 所有文件读写操作必须在工作目录内进行
- 提示词中自动注入工作目录信息

## 快速开始

### 1. 创建带工作目录的任务

```typescript
const task = taskManager.createTask({
  title: '开发新功能',
  assignedRole: 'developer',
  input: {
    workDir: {
      path: './custom-path',  // 可选，不指定则使用默认
      preserve: true,          // 可选，任务完成后保留目录
    }
  }
});
```

### 2. 验证路径是否在工作目录内

```typescript
const result = workDirManager.validatePath(taskId, 'src/main.py');
if (!result.valid) {
  console.error(result.error);
}
```

### 3. 调用文件工具

```typescript
await toolRegistry.execute('write-file', {
  filePath: 'src/main.py',  // 相对于工作目录
  content: code,
  taskId: taskId,  // 自动验证路径
});
```

## 目录结构

```
docs/v3/
├── README.md                    # 本索引文件
├── 01-requirements.md          # 需求分析
├── 02-architecture.md           # 架构设计
└── 03-tasks.md                  # 任务拆分
```

## 任务清单

| ID | 任务 | 优先级 | 状态 |
|----|------|--------|------|
| TASK-001 | WorkDirManager 核心组件开发 | P0 | pending |
| TASK-002 | 文件工具路径验证 | P0 | pending |
| TASK-003 | 角色提示词工作目录注入 | P1 | pending |
| TASK-004 | API 端点开发 | P1 | pending |
| TASK-005 | 集成测试 | P1 | pending |

## 核心 API

### WorkDirManager

```typescript
// 创建工作目录
createWorkDir(config: WorkDirConfig): Promise<WorkDirState>

// 验证路径
validatePath(taskId: string, filePath: string): WorkDirValidationResult

// 获取工作目录状态
getWorkDir(taskId: string): WorkDirState | null

// 清理工作目录
cleanupWorkDir(taskId: string): Promise<void>
```

### REST API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/tasks/:taskId/work-dir` | 获取工作目录信息 |
| POST | `/api/tasks/:taskId/work-dir/validate` | 验证路径 |
| DELETE | `/api/tasks/:taskId/work-dir` | 清理工作目录 |

## 默认目录结构

```
workspace/{task-id}/
├── src/              # 源代码
├── tests/            # 测试文件
├── docs/             # 文档
├── output/           # 生成物
└── .agent-state/     # 状态文件
```

## 安全机制

1. **路径验证**: 所有文件操作前检查是否在工作目录内
2. **路径遍历防护**: 阻止 `../` 路径遍历攻击
3. **白名单**: 可配置允许访问的根目录文件

## 向下兼容

- 工作目录功能可选启用
- 旧任务不受影响
- API 向后兼容

## 相关链接

- [主文档](../README.md)
- [架构设计](./02-architecture.md)
- [开发任务](./03-tasks.md)
