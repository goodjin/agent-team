# 任务拆分 - 任务工作目录管理功能

## 任务总览

| ID | 任务名称 | 优先级 | 预估工时 | 依赖 | 状态 |
|----|---------|--------|---------|------|------|
| TASK-001 | WorkDirManager 核心组件开发 | P0 | 4h | - | pending |
| TASK-002 | 文件工具路径验证 | P0 | 3h | TASK-001 | pending |
| TASK-002 | 角色提示词工作目录注入 | P1 | 2h | TASK-001 | pending |
| TASK-004 | API 端点开发 | P1 | 2h | TASK-001 | pending |
| TASK-005 | 集成测试 | P1 | 2h | 全部 | pending |

---

## TASK-001: WorkDirManager 核心组件开发

### 任务描述

开发工作目录管理器核心组件，负责工作目录的创建、验证、生命周期管理。

### 交付物

- `src/core/work-dir-manager.ts` - 核心管理器实现
- `src/types/work-dir.ts` - 类型定义
- `tests/unit/work-dir-manager.test.ts` - 单元测试

### 详细设计

#### 1. 类型定义 (src/types/work-dir.ts)

```typescript
export interface WorkDirConfig {
  taskId: string;
  basePath?: string;        // 默认: workspace
  customPath?: string;      // 自定义路径
  template?: 'default' | 'minimal' | 'custom';
  customDirs?: string[];    // 自定义目录列表
  preserve?: boolean;       // 完成后是否保留
}

export interface WorkDirStructure {
  root: string;
  src: string;
  tests: string;
  docs: string;
  output: string;
  state: string;
}

export interface WorkDirState {
  taskId: string;
  rootPath: string;
  structure: WorkDirStructure;
  createdAt: Date;
  lastAccessedAt: Date;
  files: string[];
  metadata: {
    totalSize: number;
    fileCount: number;
  };
}

export interface WorkDirValidationResult {
  valid: boolean;
  resolvedPath?: string;
  error?: string;
}
```

#### 2. 核心实现 (src/core/work-dir-manager.ts)

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';

export class WorkDirManager {
  private states: Map<string, WorkDirState> = new Map();
  private readonly DEFAULT_BASE = 'workspace';
  private readonly DEFAULT_STRUCTURE = ['src', 'tests', 'docs', 'output'];

  async createWorkDir(config: WorkDirConfig): Promise<WorkDirState> {
    const { taskId, basePath = this.DEFAULT_BASE, customPath } = config;

    // 计算根路径
    const rootPath = customPath
      ? path.resolve(process.cwd(), customPath)
      : path.join(process.cwd(), basePath, taskId);

    // 创建目录结构
    const structure = await this.createDirectoryStructure(rootPath, config);

    // 初始化状态
    const state: WorkDirState = {
      taskId,
      rootPath,
      structure,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      files: [],
      metadata: {
        totalSize: 0,
        fileCount: 0,
      },
    };

    // 保存状态
    this.states.set(taskId, state);

    // 写入 .agent-state/meta.json
    await this.writeMetaFile(state);

    return state;
  }

  private async createDirectoryStructure(
    rootPath: string,
    config: WorkDirConfig
  ): Promise<WorkDirStructure> {
    const dirs = config.template === 'custom'
      ? config.customDirs || this.DEFAULT_STRUCTURE
      : this.DEFAULT_STRUCTURE;

    for (const dir of dirs) {
      await fs.mkdir(path.join(rootPath, dir), { recursive: true });
    }

    // 创建状态目录
    await fs.mkdir(path.join(rootPath, '.agent-state'), { recursive: true });

    return {
      root: rootPath,
      src: path.join(rootPath, 'src'),
      tests: path.join(rootPath, 'tests'),
      docs: path.join(rootPath, 'docs'),
      output: path.join(rootPath, 'output'),
      state: path.join(rootPath, '.agent-state'),
    };
  }

  validatePath(taskId: string, filePath: string): WorkDirValidationResult {
    const state = this.states.get(taskId);
    if (!state) {
      return { valid: false, error: `任务工作目录不存在: ${taskId}` };
    }

    const resolvedPath = path.resolve(filePath);
    const normalizedPath = path.normalize(resolvedPath);

    // 检查是否在工作目录下
    if (!normalizedPath.startsWith(state.rootPath + path.sep)) {
      return {
        valid: false,
        error: `安全错误: 路径越界\n当前工作目录: ${state.rootPath}\n请求路径: ${filePath}`,
      };
    }

    // 检查路径遍历
    const relative = path.relative(state.rootPath, normalizedPath);
    if (relative.startsWith('..') || relative === '..') {
      return { valid: false, error: '路径遍历攻击检测' };
    }

    return { valid: true, resolvedPath };
  }

  getWorkDir(taskId: string): WorkDirState | null {
    return this.states.get(taskId) || null;
  }

  async cleanupWorkDir(taskId: string): Promise<void> {
    const state = this.states.get(taskId);
    if (state && !state.metadata.preserve) {
      await fs.rm(state.rootPath, { recursive: true, force: true });
      this.states.delete(taskId);
    }
  }

  private async writeMetaFile(state: WorkDirState): Promise<void> {
    const metaPath = path.join(state.structure.state, 'meta.json');
    await fs.writeFile(metaPath, JSON.stringify({
      taskId: state.taskId,
      createdAt: state.createdAt,
      structure: Object.keys(state.structure).filter(k => k !== 'root'),
    }, null, 2));
  }
}

export const workDirManager = new WorkDirManager();
```

### 验收标准

- [ ] `createWorkDir()` 创建正确目录结构
- [ ] `validatePath()` 正确验证工作目录内路径
- [ ] `validatePath()` 拒绝工作目录外路径
- [ ] `getWorkDir()` 返回正确状态
- [ ] `cleanupWorkDir()` 清理目录
- 单元测试覆盖率 > 80%

### 技术要点

- 使用 `fs/promises` 异步 API
- 路径处理使用 `path.resolve` 和 `path.normalize`
- 并发安全: 使用 Map 存储状态

---

## TASK-002: 文件工具路径验证

### 任务描述

修改文件读写工具，增加工作目录路径验证，确保所有文件操作都在工作目录内进行。

### 交付物

- `src/tools/file-tools.ts` - 修改后的文件工具
- `tests/integration/file-validation.test.ts` - 集成测试

### 详细设计

#### 1. 工具注册扩展

```typescript
// 在 ToolRegistry 中注入 workDirManager
export class ToolRegistry {
  private workDirManager: WorkDirManager;

  constructor(workDirManager: WorkDirManager) {
    this.workDirManager = workDirManager;
    this.registerTools();
  }

  private registerTools(): void {
    this.tools.set('write-file', new WriteFileTool(this.workDirManager));
    this.tools.set('read-file', new ReadFileTool(this.workDirManager));
    this.tools.set('search-files', new SearchFilesTool(this.workDirManager));
    this.tools.set('delete-file', new DeleteFileTool(this.workDirManager));
  }
}
```

#### 2. WriteFileTool 路径验证

```typescript
export class WriteFileTool extends BaseTool {
  constructor(private workDirManager: WorkDirManager) {
    super({
      name: 'write-file',
      dangerous: true,
      schema: z.object({
        filePath: z.string().min(1, '文件路径不能为空'),
        content: z.string(),
        encoding: z.string().optional().default('utf-8'),
        createDirs: z.boolean().optional().default(true),
        taskId: z.string().optional(),  // 可选，验证工作目录
      }),
    });
  }

  protected async executeImpl(params: {
    filePath: string;
    content: string;
    encoding?: string;
    createDirs?: boolean;
    taskId?: string;
  }): Promise<ToolResult> {
    const { filePath, content, encoding, createDirs, taskId } = params;

    // 路径验证
    if (taskId) {
      const validation = this.workDirManager.validatePath(taskId, filePath);
      if (!validation.valid) {
        return {
          success: false,
          error: `❌ 安全错误: 路径越界\n\n当前工作目录: ${this.workDirManager.getWorkDir(taskId)?.rootPath}\n请求路径: ${filePath}\n\n只能在工作目录内进行文件操作。`,
        };
      }
    }

    try {
      if (createDirs) {
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
      }

      await fs.writeFile(filePath, content, { encoding: encoding as BufferEncoding });

      const stats = await fs.stat(filePath);

      return {
        success: true,
        data: {
          path: filePath,
          size: stats.size,
          bytesWritten: content.length,
        },
        metadata: {
          lastModified: stats.mtime,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
```

#### 3. ReadFileTool 路径验证

```typescript
export class ReadFileTool extends BaseTool {
  constructor(private workDirManager: WorkDirManager) {
    super({
      name: 'read-file',
      dangerous: false,
      schema: z.object({
        filePath: z.string().min(1, '文件路径不能为空'),
        encoding: z.string().optional().default('utf-8'),
        taskId: z.string().optional(),
      }),
    });
  }

  protected async executeImpl(params: {
    filePath: string;
    encoding?: string;
    taskId?: string;
  }): Promise<ToolResult> {
    const { filePath, encoding, taskId } = params;

    // 路径验证
    if (taskId) {
      const validation = this.workDirManager.validatePath(taskId, filePath);
      if (!validation.valid) {
        return {
          success: false,
          error: `❌ 安全错误: 路径越界\n\n当前工作目录: ${this.workDirManager.getWorkDir(taskId)?.rootPath}\n请求路径: ${filePath}`,
        };
      }
    }

    // 继续读取逻辑...
  }
}
```

### 验收标准

- [ ] `write-file` 工具验证工作目录路径
- [ ] `read-file` 工具验证工作目录路径
- [ ] `search-files` 工具限制在工作目录内
- [ ] `delete-file` 工具验证工作目录路径
- [ ] 路径越界返回明确错误信息
- [ ] 集成测试覆盖所有工具

---

## TASK-003: 角色提示词工作目录注入

### 任务描述

修改 BaseRole 类，在提示词中注入工作目录信息。

### 交付物

- `src/roles/base.ts` - 修改后的基础角色类
- `src/roles/mixins/work-dir-prompt.ts` - 工作目录提示词混入
- `tests/unit/role-prompt.test.ts` - 单元测试

### 详细设计

#### 1. 工作目录提示词模板

```typescript
// src/roles/mixins/work-dir-prompt.ts

export function buildWorkDirPrompt(
  workDir: string,
  structure: WorkDirStructure,
  files: string[]
): string {
  const fileList = files.length > 0
    ? files.map(f => `- ${f}`).join('\n')
    : '- (暂无文件)';

  return `
## 工作目录信息

**重要**: 所有文件操作必须在此目录下进行！

**工作目录**: \`${workDir}\`

### 目录结构
| 目录 | 用途 |
|-----|------|
| \`src/\` | 源代码文件 |
| \`tests/\` | 测试文件 |
| \`.agent-state/\` | 自动生成的状态文件 |

### 当前文件列表
${fileList}

### 注意事项
1. 使用相对路径时，相对于工作目录根目录
2. 创建新文件时请放在适当的子目录中
3. 不要修改工作目录外的任何文件
4. 确保文件路径以工作目录为根
`.trim();
}

export function buildFilePathHint(filePath: string, workDir: string): string {
  const relative = path.relative(workDir, filePath);
  if (relative.startsWith('..')) {
    return `⚠️ 警告: 文件路径 "${filePath}" 不在工作目录内!\n请使用工作目录内的路径。`;
  }
  return '';
}
```

#### 2. BaseRole 修改

```typescript
export abstract class BaseRole {
  protected workDirManager: WorkDirManager;

  constructor(
    definition: RoleDefinition,
    llmService: LLMService,
    workDirManager?: WorkDirManager
  ) {
    this.definition = definition;
    this.llmService = llmService;
    this.workDirManager = workDirManager || new WorkDirManager();
  }

  protected getWorkDirPrompt(task: Task): string {
    const taskId = task.metadata?.taskId || task.id;
    const workDirState = this.workDirManager.getWorkDir(taskId);

    if (!workDirState) {
      return '';
    }

    const { WorkDirPromptBuilder } = await import('../mixins/work-dir-prompt.js');
    return WorkDirPromptBuilder.build(
      workDirState.rootPath,
      workDirState.structure,
      workDirState.files
    );
  }

  protected async buildTaskPrompt(task: Task, context: ExecutionContext): Promise<string> {
    const basePrompt = await this.buildTaskPromptImpl(task, context);

    // 注入工作目录信息
    const workDirPrompt = this.getWorkDirPrompt(task);

    if (workDirPrompt) {
      return `${basePrompt}\n\n${workDirPrompt}`;
    }

    return basePrompt;
  }

  protected abstract buildTaskPromptImpl(task: Task, context: ExecutionContext): Promise<string>;
}
```

### 验收标准

- [ ] 所有角色提示词包含工作目录信息
- [ ] 工作目录结构正确显示
- [ ] 已有文件列表正确显示
- [ ] 未配置工作目录时无额外输出
- [ ] 单元测试覆盖提示词生成

---

## TASK-004: API 端点开发

### 任务描述

开发工作目录管理的 REST API 端点。

### 交付物

- `src/server/routes/work-dir.ts` - API 路由
- `tests/api/work-dir.api.test.ts` - API 测试

### 详细设计

#### 1. API 路由定义

```typescript
// src/server/routes/work-dir.ts

import { Router, Request, Response } from 'express';
import { WorkDirManager } from '../../core/work-dir-manager.js';

export function createWorkDirRouter(workDirManager: WorkDirManager): Router {
  const router = Router();

  // GET /api/tasks/:taskId/work-dir
  router.get('/tasks/:taskId/work-dir', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const state = workDirManager.getWorkDir(taskId);

      if (!state) {
        return res.status(404).json({
          success: false,
          error: `工作目录不存在: ${taskId}`,
        });
      }

      res.json({
        success: true,
        data: {
          taskId: state.taskId,
          rootPath: state.rootPath,
          structure: {
            src: state.structure.src,
            tests: state.structure.tests,
            docs: state.structure.docs,
            output: state.structure.output,
          },
          files: state.files,
          createdAt: state.createdAt,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // POST /api/tasks/:taskId/work-dir/validate
  router.post('/tasks/:taskId/work-dir/validate', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { path: filePath } = req.body;

      const result = workDirManager.validatePath(taskId, filePath);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // DELETE /api/tasks/:taskId/work-dir
  router.delete('/tasks/:taskId/work-dir', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { force } = req.query;

      await workDirManager.cleanupWorkDir(taskId);

      res.json({
        success: true,
        data: { cleaned: true },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  return router;
}
```

### 验收标准

- [ ] GET /api/tasks/:taskId/work-dir 返回正确信息
- [ ] POST /api/tasks/:taskId/work-dir/validate 正确验证路径
- [ ] DELETE /api/tasks/:taskId/work-dir 清理目录
- [ ] 错误处理返回 4xx/5xx 状态码
- [ ] API 测试覆盖率 > 90%

---

## TASK-005: 集成测试

### 任务描述

编写完整的集成测试，验证工作目录功能的端到端流程。

### 交付物

- `tests/integration/work-dir.integration.test.ts` - 集成测试

### 测试场景

```typescript
describe('WorkDir Integration Tests', () => {
  it('should create work dir and validate path', async () => {
    // 1. 创建任务工作目录
    const state = await workDirManager.createWorkDir({
      taskId: 'test-task-1',
    });

    // 2. 验证路径
    const validResult = workDirManager.validatePath('test-task-1', 'src/main.py');
    expect(validResult.valid).toBe(true);

    // 3. 拒绝越界路径
    const invalidResult = workDirManager.validatePath('test-task-1', '../other/file.py');
    expect(invalidResult.valid).toBe(false);
  });

  it('should write and read files within work dir', async () => {
    // 1. 创建工作目录
    const state = await workDirManager.createWorkDir({
      taskId: 'test-task-2',
    });

    // 2. 写入文件
    const writeResult = await toolRegistry.execute('write-file', {
      filePath: path.join(state.rootPath, 'test.txt'),
      content: 'Hello World',
      taskId: 'test-task-2',
    });

    expect(writeResult.success).toBe(true);

    // 3. 读取文件
    const readResult = await toolRegistry.execute('read-file', {
      filePath: path.join(state.rootPath, 'test.txt'),
      taskId: 'test-task-2',
    });

    expect(readResult.success).toBe(true);
    expect(readResult.data.content).toBe('Hello World');
  });

  it('should reject file operations outside work dir', async () => {
    const result = await toolRegistry.execute('write-file', {
      filePath: '/etc/passwd',
      content: 'hacked',
      taskId: 'non-existent',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('安全错误');
  });
});
```

---

## 依赖关系图

```
TASK-001 (WorkDirManager)
    │
    ├──────────────────┬──────────────────┐
    │                  │                  │
    ▼                  ▼                  ▼
TASK-002          TASK-003          TASK-004
(文件工具)         (角色提示词)        (API)
    │                  │                  │
    └──────────────────┴──────────────────┘
                         │
                         ▼
                    TASK-005
                   (集成测试)
```

---

## 验收检查清单

### 代码质量
- [ ] TypeScript 严格模式通过
- [ ] ESLint 检查通过
- [ ] 单元测试覆盖率 > 80%
- [ ] API 测试覆盖率 > 90%

### 功能完整性
- [ ] 工作目录自动创建
- [ ] 路径验证工作正常
- [ ] 错误信息清晰明确
- [ ] 向后兼容旧任务

### 安全性
- [ ] 路径遍历攻击防护
- [ ] 符号链接处理
- [ ] 白名单机制（如需要）
