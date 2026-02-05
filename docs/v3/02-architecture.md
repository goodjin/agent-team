# 任务工作目录管理 - 架构设计

## 1. 系统架构概览

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent Team System                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐   │
│  │   Client     │    │  Workflow   │    │   TaskManager   │   │
│  │   (API/CLI)  │───▶│   Engine    │───▶│                 │   │
│  └─────────────┘    └─────────────┘    │                 │   │
│                                          │                 │   │
│  ┌─────────────┐    ┌─────────────┐    │  WorkDirManager │   │
│  │   Roles     │◀───│ TaskManager │◀───│                 │   │
│  │ (LLM Calls) │    │             │    │                 │   │
│  └─────────────┘    └─────────────┘    └─────────────────┘   │
│                            │                     ▲            │
│                            ▼                     │            │
│                   ┌─────────────────┐            │            │
│                   │   ToolRegistry  │────────────┘            │
│                   │   (File Tools) │                         │
│                   └─────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 核心组件

| 组件 | 职责 | 位置 |
|-----|------|-----|
| WorkDirManager | 工作目录生命周期管理 | core/work-dir-manager.ts |
| TaskManager | 任务执行协调 | core/task-manager.ts |
| WorkflowEngine | 工作流编排 | core/workflow-engine.ts |
| ToolRegistry | 工具注册与执行 | tools/tool-registry.ts |
| File Tools | 文件读写操作 | tools/file-tools.ts |
| Role Base | 提示词注入 | roles/base.ts |

## 2. 组件设计

### 2.1 WorkDirManager

```typescript
// src/core/work-dir-manager.ts

export interface WorkDirConfig {
  taskId: string;
  basePath?: string;        // 默认: workspace
  customPath?: string;      // 自定义路径
  structure?: string[];     // 自定义目录结构
}

export interface WorkDirState {
  taskId: string;
  rootPath: string;
  structure: WorkDirStructure;
  createdAt: Date;
  lastAccessedAt: Date;
  files: string[];
}

export interface WorkDirStructure {
  src: string;
  tests: string;
  docs: string;
  output: string;
  state: string;  // .agent-state
}

export class WorkDirManager {
  // 核心方法
  createWorkDir(config: WorkDirConfig): WorkDirState;
  getWorkDir(taskId: string): WorkDirState | null;
  validatePath(taskId: string, filePath: string): boolean;
  getRelativePath(taskId: string, absolutePath: string): string;
  cleanupWorkDir(taskId: string): Promise<void>;
  listFiles(taskId: string): string[];
}
```

#### 2.1.1 目录结构生成

```typescript
private createStructure(rootPath: string, template?: string[]): WorkDirStructure {
  const structure: WorkDirStructure = {
    src: path.join(rootPath, 'src'),
    tests: path.join(rootPath, 'tests'),
    docs: path.join(rootPath, 'docs'),
    output: path.join(rootPath, 'output'),
    state: path.join(rootPath, '.agent-state'),
  };

  // 创建所有目录
  for (const dir of Object.values(structure)) {
    fs.mkdir(dir, { recursive: true });
  }

  return structure;
}
```

### 2.2 文件工具路径验证

```typescript
// src/tools/file-tools.ts

export class WriteFileTool extends BaseTool {
  constructor(private workDirManager: WorkDirManager) {
    super({
      name: 'write-file',
      dangerous: true,
      schema: z.object({
        filePath: z.string(),
        content: z.string(),
        encoding: z.string().optional(),
        createDirs: z.boolean().optional(),
      }),
    });
  }

  protected async executeImpl(params: {
    filePath: string;
    content: string;
    taskId?: string;
  }): Promise<ToolResult> {
    const { filePath, content, taskId } = params;

    // 路径验证
    if (taskId && !this.workDirManager.validatePath(taskId, filePath)) {
      return {
        success: false,
        error: `安全错误: 路径越界\n当前工作目录: ${this.workDirManager.getWorkDir(taskId)?.rootPath}\n请求路径: ${filePath}`,
      };
    }

    // 继续文件写入逻辑...
  }
}
```

### 2.3 角色提示词注入

```typescript
// src/roles/base.ts

export abstract class BaseRole {
  protected buildWorkDirPrompt(workDir: string, structure: WorkDirStructure): string {
    return `
## 工作目录信息
当前任务工作目录: ${workDir}

目录结构:
- ${structure.src}/ - 源代码文件
- ${structure.tests}/ - 测试文件
- ${structure.docs}/ - 文档文件
- ${structure.output}/ - 生成物
- ${structure.state}/ - 状态文件（自动生成）

重要提示:
1. 所有文件操作必须在此工作目录内进行
2. 使用相对路径时，相对于工作目录根目录
3. 创建新文件时请放在适当的子目录中

当前目录内容:
${this.listDirectoryContents(workDir)}
`.trim();
  }

  private listDirectoryContents(dir: string): string {
    // 列出目录内容...
  }
}
```

## 3. 数据模型

### 3.1 Task 输入扩展

```typescript
// src/types/index.ts

interface TaskInput {
  variables?: Record<string, any>;
  stepConfig?: Record<string, any>;
  stepOutputs?: Record<string, any>;

  // 新增: 工作目录配置
  workDir?: {
    path?: string;           // 自定义路径，不指定则使用默认
    template?: 'default' | 'minimal' | 'custom';
    customTemplate?: string[]; // 自定义模板
    preserve?: boolean;      // 任务完成后保留目录
  };
}
```

### 3.2 WorkDirState 存储

```typescript
interface WorkDirState {
  taskId: string;
  rootPath: string;
  structure: {
    src: string;
    tests: string;
    docs: string;
    output: string;
    state: string;
  };
  createdAt: Date;
  lastAccessedAt: Date;
  files: string[];  // 已创建的文件列表
  metadata: {
    createdBy: string;
    totalSize: number;
    fileCount: number;
  };
}
```

## 4. API 设计

### 4.1 新增 API

#### 4.1.1 获取任务工作目录

```http
GET /api/tasks/:taskId/work-dir
```

响应:
```json
{
  "success": true,
  "data": {
    "taskId": "task-123",
    "rootPath": "/project/workspace/task-123",
    "structure": {
      "src": "/project/workspace/task-123/src",
      "tests": "/project/workspace/task-123/tests"
    },
    "files": ["src/main.py", "tests/test_main.py"]
  }
}
```

#### 4.1.2 验证路径

```http
POST /api/tasks/:taskId/work-dir/validate
Body: { "path": "src/main.py" }
```

响应:
```json
{
  "success": true,
  "data": {
    "valid": true,
    "resolvedPath": "/project/workspace/task-123/src/main.py"
  }
}
```

### 4.2 现有 API 扩展

#### 4.2.1 创建任务 (扩展)

```http
POST /api/tasks
Body: {
  "title": "开发任务",
  "assignedRole": "developer",
  "input": {
    "workDir": {
      "path": "./custom-path",  // 可选
      "preserve": true          // 可选
    }
  }
}
```

## 5. 工作流程

### 5.1 任务创建流程

```
用户/API 请求
    │
    ▼
TaskManager.createTask(input)
    │
    ├─ 检查 input.workDir 配置
    │
    ▼
WorkDirManager.createWorkDir(config)
    │
    ├─ 生成 task-id (如果未提供)
    ├─ 计算工作目录路径
    │   └─ 默认: {basePath}/{task-id}
    │   └─ 自定义: path.resolve(projectRoot, customPath)
    │
    ├─ 创建目录结构
    │
    ▼
返回 WorkDirState
    │
    ▼
Task 创建完成，workDir 注入任务上下文
```

### 5.2 任务执行流程

```
任务开始执行
    │
    ▼
BaseRole.execute()
    │
    ├─ 构建提示词
    │   │
    │   ▼
    │   buildTaskPrompt()
    │       │
    │       ├─ 获取 workDirInfo
    │       │   │
    │       │   ▼
    │       │   WorkDirManager.getWorkDir(taskId)
    │       │
    │       ▼
    │   buildWorkDirPrompt()  ← 注入工作目录信息
    │
    ├─ 调用 LLM
    │
    ├─ 工具执行
    │   │
    │   ▼
    │   ToolRegistry.execute(toolName, params)
    │       │
    │       ├─ 注入 taskId
    │       │
    │       ▼
    │   FileTools.execute(params)
    │       │
    │       ▼
    │   validatePath(taskId, filePath)  ← 路径验证
    │
    ▼
返回结果
```

## 6. 安全设计

### 6.1 路径验证算法

```typescript
function validatePath(workDir: string, targetPath: string): boolean {
  // 解析为绝对路径
  const resolvedTarget = path.resolve(targetPath);
  const resolvedWorkDir = path.resolve(workDir);

  // 检查是否在工作目录下
  if (!resolvedTarget.startsWith(resolvedWorkDir + path.sep)) {
    return false;
  }

  // 检查路径遍历攻击
  const relative = path.relative(resolvedWorkDir, resolvedTarget);
  if (relative.startsWith('..')) {
    return false;
  }

  return true;
}
```

### 6.2 白名单机制

```typescript
const PROJECT_ROOT_WHITELIST = [
  '.agent-team/',
  'prompts/',
  'docs/',
];

function isWhitelisted(filePath: string): boolean {
  const relative = path.relative(process.cwd(), filePath);
  return WHITELIST.some(prefix => relative.startsWith(prefix));
}
```

### 6.3 符号链接处理

```typescript
async function resolveRealPath(filePath: string): Promise<string> {
  const stats = await fs.lstat(filePath);

  if (stats.isSymbolicLink()) {
    // 拒绝符号链接或解析到真实路径
    const realPath = await fs.readlink(filePath);
    return path.resolve(path.dirname(filePath), realPath);
  }

  return filePath;
}
```

## 7. 性能考虑

### 7.1 目录创建优化

- 使用 `fs.mkdir({ recursive: true })` 原子性创建
- 目录结构缓存: 避免重复创建
- 延迟创建: 按需创建子目录

### 7.2 路径验证优化

- 路径缓存: 缓存 workDir 解析结果
- 批量验证: 支持批量路径验证
- 延迟统计: 文件统计延迟到任务完成时

## 8. 兼容性设计

### 8.1 向后兼容

- `workDir` 参数可选，不指定则行为不变
- 现有 API 无需修改
- 现有角色自动获得工作目录提示

### 8.2 迁移策略

- 渐进式: 新任务自动使用工作目录
- 旧任务: 不影响，继续使用原行为
- 可配置: 可全局开关工作目录功能

## 9. 测试策略

### 9.1 单元测试

- WorkDirManager: 路径计算、验证逻辑
- FileTools: 路径验证、错误处理
- BaseRole: 提示词注入

### 9.2 集成测试

- 完整任务执行流程
- 跨目录文件操作
- 路径遍历攻击防护

### 9.3 端到端测试

- API 调用流程
- 工作流执行
- 文件读写验证
