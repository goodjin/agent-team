# Agent Team v6.0 - 架构设计

**版本**: 6.0.0
**日期**: 2026-02-11
**状态**: 设计完成，待实现
**作者**: 系统架构师

---

## 整体架构（ASCII 图）

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Agent Team v6.0                              │
│                    工具生态系统（Tool Ecosystem）                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                          AgentLoop (v5 继承)                          │
│    MasterAgent  ←→  SubAgent  ←→  AgentCommunicator                 │
│                    ↓ 调用工具                                         │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│                       ToolRegistry (增强)                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ 权限控制  │  │ 工具发现  │  │ 健康检查  │  │   调用统计        │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    ToolPipeline（工具编排）                    │   │
│  │  step1 → step2 → step3  |  forEach(fan-out)  |  条件分支      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────┬───────────────────────────────────────────────────────────┘
          │ 注册 / 调用
┌─────────▼───────────────────────────────────────────────────────────┐
│                         工具层（Tools Layer）                         │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐             │
│  │ WebSearchTool │  │ WebFetchTool  │  │ShellExecutor  │             │
│  │  (P0, 网络)   │  │  (P0, 网络)   │  │  (P0, 系统)   │             │
│  └──────────────┘  └──────────────┘  └───────────────┘             │
│                                                                      │
│  ┌──────────────┐  ┌──────────────────────────────────────────┐    │
│  │CodeSandboxTool│  │  v5 内置工具（file-tools / git-tools）    │    │
│  │  (P1, 执行)   │  │  ReadFileTool / WriteFileTool / ...      │    │
│  └──────────────┘  └──────────────────────────────────────────┘    │
└─────────┬───────────────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────────────┐
│                      适配器层（Adapters Layer）                        │
│   SerperSearchAdapter  |  BingSearchAdapter  |  (可扩展更多适配器)     │
└─────────────────────────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────────────┐
│                       外部服务 / 系统资源                              │
│   Serper.dev API  |  Bing API  |  互联网  |  Shell  |  Node.js vm   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 核心模块

### ToolRegistry - 工具注册表

**职责**：工具生命周期管理，包括注册、发现、权限控制、健康检查和调用统计。

**文件位置**：`src/tools/tool-registry.ts`（在 v5 基础上增强）

**v6 新增能力**：
- 权限级别枚举（`ToolPermission`），控制哪些工具可被哪些 Agent 调用
- `query()` 方法：支持按关键词、分类、标签、权限多维搜索
- `healthCheck()` 机制：定期探活外部依赖（API 可达性）
- `getStats()` 增强：每个工具的调用次数、成功率、平均耗时
- 工具版本字段：`version: string`，为未来热更新预留

**关键接口**：

```typescript
// 权限级别
enum ToolPermission {
  READ_ONLY    = 'read_only',   // 文件读取、Web 搜索（只读）
  WRITE        = 'write',       // 文件写入
  NETWORK      = 'network',     // 网络请求
  SHELL        = 'shell',       // Shell 命令执行
  CODE_EXEC    = 'code_exec',   // 代码沙箱执行
  SYSTEM       = 'system',      // 系统级操作（最高危）
}

// 工具类别
enum ToolCategory {
  WEB    = 'web',
  SHELL  = 'shell',
  CODE   = 'code',
  FILE   = 'file',
  LLM    = 'llm',
  GIT    = 'git',
}

// 增强的工具定义（扩展 v5 的 ToolDefinition）
interface V6ToolDefinition extends ToolDefinition {
  version: string;
  category: ToolCategory;
  tags: string[];
  permissions: ToolPermission[];
  examples: ToolExample[];
  healthCheck?: () => Promise<boolean>;
}

// 工具查询条件
interface ToolRegistryQuery {
  keyword?: string;
  category?: ToolCategory;
  tags?: string[];
  permissions?: ToolPermission[];
}
```

---

### WebSearchTool

**职责**：通过搜索引擎 API 让 Agent 获取互联网实时信息。

**文件位置**：`src/tools/builtin/web-search.ts`

**技术选型**：
- HTTP 客户端：Node.js 原生 `fetch`（Node 18+ 内置，无需额外依赖）
- 主适配器：Serper.dev（Google 搜索代理，成本低、稳定）
- 备用适配器：Bing Search API（自动 fallback）
- 缓存：`Map<string, CacheEntry>` 内存缓存，TTL 5 分钟
- API Key 管理：从 `config/tools.yaml` 或环境变量读取

**核心接口**：

```typescript
interface WebSearchParams {
  query: string;
  limit?: number;          // 默认 10，最大 50
  language?: string;       // 默认 'zh-CN'
  region?: string;         // 默认 'CN'
  freshness?: 'day' | 'week' | 'month' | 'any';
}

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  source?: string;
}

interface WebSearchResponse {
  results: WebSearchResult[];
  totalEstimated: number;
  query: string;
  searchEngine: string;
}
```

**安全策略**：
- URL 黑名单过滤（拦截恶意域名）
- 速率限制：默认每分钟 20 次请求
- 结果 URL 校验：过滤非 http/https 协议

---

### WebFetchTool

**职责**：获取指定 URL 的网页内容，转换为 Agent 可读的 Markdown 或纯文本。

**文件位置**：`src/tools/builtin/web-fetch.ts`

**技术选型**：
- HTTP 客户端：Node.js 原生 `fetch`
- HTML 解析：`node-html-parser`（轻量，无 DOM 依赖）
- HTML 转 Markdown：`turndown`（成熟稳定，支持自定义规则）
- SSRF 防护：IP 段黑名单检查（私有 IP、回环地址）

**核心接口**：

```typescript
interface WebFetchParams {
  url: string;
  format?: 'markdown' | 'text' | 'raw';  // 默认 'markdown'
  maxLength?: number;                     // 默认 50000 字符
  timeout?: number;                       // 默认 15 秒
  extractMainContent?: boolean;           // 默认 true
}

interface WebFetchResponse {
  url: string;
  title?: string;
  content: string;
  format: 'markdown' | 'text' | 'raw';
  contentLength: number;
  truncated: boolean;
  statusCode: number;
  fetchedAt: string;
}
```

**安全策略**：
- 禁止访问私有 IP（10.x.x.x / 172.16-31.x.x / 192.168.x.x / 127.x.x.x）
- 禁止 file:// / ftp:// 等非 HTTP 协议
- 内容长度超限时截断并标注：`[内容已截断，原文共 N 字符]`
- User-Agent 伪装为标准浏览器

---

### ShellExecutorTool

**职责**：在受控环境中执行 Shell 命令，返回 stdout / stderr / 退出码。

**文件位置**：`src/tools/builtin/shell-executor.ts`

**技术选型**：
- 执行引擎：`child_process.spawn`（非 `exec`，避免 shell injection）
- 参数传递：数组形式（`['ls', '-la']`），不做字符串拼接
- 审计日志：结构化 JSON，记录命令、工作目录、耗时、退出码

**核心接口**：

```typescript
interface ShellExecuteParams {
  command: string;
  cwd?: string;                       // 相对于任务工作空间，默认为工作空间根
  env?: Record<string, string>;       // 追加的环境变量
  timeout?: number;                   // 默认 30 秒，最大 300 秒
  maxOutputSize?: number;             // 默认 100000 字符
}

interface ShellExecuteResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  executionTime: number;              // 毫秒
  truncated: boolean;
}
```

**安全策略**：

| 级别 | 命令示例 | 处理方式 |
|------|---------|---------|
| 黑名单（直接拒绝） | `rm -rf /`、`mkfs.*`、fork bomb | 返回 SECURITY_ERROR |
| 警告列表（需确认） | `rm -rf`、`sudo`、`curl \| sh` | 首次执行需用户授权 |
| 正常命令 | `ls`、`echo`、`git status` | 直接执行 |

- 工作目录强制限制在 `WorkDirManager` 管理的任务目录内
- 禁止 `../` 路径穿越

---

### CodeSandboxTool

**职责**：在隔离环境中执行 Node.js 代码片段，安全返回执行结果。

**文件位置**：`src/tools/builtin/code-sandbox.ts`

**技术选型**：
- Node.js 沙箱：Node.js 原生 `vm` 模块（`vm.runInNewContext`）
- 沙箱上下文：注入安全的全局变量（`console`、`Math`、`JSON`、`setTimeout`）
- 禁用危险访问：`require`、`process`、`__dirname`、`__filename` 不注入
- Python 执行：`child_process.spawn('python3', ['-c', code])`

**核心接口**：

```typescript
interface CodeExecuteParams {
  code: string;
  language: 'nodejs' | 'python';
  timeout?: number;           // 默认 30 秒
  memoryLimit?: number;       // 默认 256 MB（仅 Python 进程有效）
  stdin?: string;
}

interface CodeExecuteResponse {
  success: boolean;
  output: string;             // stdout 输出
  error?: string;             // 错误信息（含堆栈）
  returnValue?: any;          // 最后表达式的值（仅 Node.js）
  executionTime: number;      // 毫秒
  memoryUsed?: number;        // MB
  timedOut: boolean;
}
```

**安全策略**：
- Node.js：禁用 `require`、`process`、`fs`、`net`、`child_process`
- Python：通过独立子进程执行，设置 `--isolated` 标志
- 超时强制 kill（`AbortController` + `setTimeout`）

---

### ToolPipeline

**职责**：将多个工具串联成有向流水线，支持数据传递、条件分支、并行 fan-out。

**文件位置**：`src/tools/tool-pipeline.ts`

**核心接口**：

```typescript
interface PipelineStep {
  id: string;
  tool: string;
  params: Record<string, any>;    // 支持模板变量 {{stepId.field}}
  forEach?: string;               // fan-out：对数组每个元素执行
  condition?: string;             // 条件表达式，false 时跳过
  onError?: 'skip' | 'retry' | 'fail';
  maxRetries?: number;
}

interface PipelineDefinition {
  name: string;
  description: string;
  steps: PipelineStep[];
}

interface StepExecuteResult {
  stepId: string;
  tool: string;
  input: any;
  output: any;
  success: boolean;
  error?: string;
  duration: number;
}

interface PipelineExecuteResult {
  success: boolean;
  steps: StepExecuteResult[];
  output: any;                    // 最后一步的输出
  totalTime: number;
}
```

**模板变量解析**：
- `{{input.field}}`：引用 Pipeline 的初始输入
- `{{stepId.field}}`：引用某一步骤的输出字段
- `{{stepId[*].field}}`：引用 fan-out 步骤的所有输出（数组）

---

## TypeScript 接口定义总览

```typescript
// src/tools/builtin/web-search.ts
export class WebSearchTool extends BaseTool { ... }

// src/tools/builtin/web-fetch.ts
export class WebFetchTool extends BaseTool { ... }

// src/tools/builtin/shell-executor.ts
export class ShellExecutorTool extends BaseTool { ... }

// src/tools/builtin/code-sandbox.ts
export class CodeSandboxTool extends BaseTool { ... }

// src/tools/tool-pipeline.ts
export class ToolPipeline { ... }

// src/tools/adapters/search-adapter.ts
export interface SearchAdapter {
  search(params: WebSearchParams): Promise<WebSearchResponse>;
  name: string;
  isAvailable(): Promise<boolean>;
}

// src/tools/adapters/serper-search.ts
export class SerperSearchAdapter implements SearchAdapter { ... }

// src/tools/adapters/bing-search.ts
export class BingSearchAdapter implements SearchAdapter { ... }
```

---

## 文件结构规划

```
src/
└── tools/
    ├── tool-registry.ts          # ToolRegistry 增强（v5 基础上修改）
    ├── tool-executor.ts          # 不变（v5 保留）
    ├── tool-pipeline.ts          # 新增：工具流水线
    ├── base.ts                   # 不变（v5 保留）
    ├── tool-schema.ts            # 不变（v5 保留）
    ├── builtin/
    │   ├── web-search.ts         # 新增：Web 搜索
    │   ├── web-fetch.ts          # 新增：网页内容获取
    │   ├── shell-executor.ts     # 新增：Shell 执行
    │   └── code-sandbox.ts       # 新增：代码沙箱
    └── adapters/
        ├── search-adapter.ts     # 新增：搜索适配器接口
        ├── serper-search.ts      # 新增：Serper.dev 适配器
        └── bing-search.ts        # 新增：Bing 适配器

config/
└── tools.yaml                    # 新增：工具配置（API Key、权限等）

tests/
└── tools/
    ├── web-search.test.ts
    ├── web-fetch.test.ts
    ├── shell-executor.test.ts
    ├── code-sandbox.test.ts
    ├── tool-registry.test.ts
    └── tool-pipeline.test.ts
```

---

## 与 v5 集成方式

### 集成原则

1. **零破坏性**：v5 的 `ToolRegistry`、`ToolExecutor`、`BaseTool` 接口保持不变
2. **增量扩展**：v6 新工具通过 `ToolRegistry.register()` 注册，不修改 `registerDefaultTools()`
3. **权限层叠加**：在 `ToolRegistry` 的 `execute()` 方法前加入权限检查中间件

### AgentLoop 集成点

```
AgentLoop
  -> SubAgent.executeToolCall()
  -> ToolRegistry.execute(name, params)   // <- 在此处插入权限检查
  -> BaseTool.execute(params)
  -> BaseTool.executeImpl(params)         // <- v6 新工具实现此方法
```

### ToolRegistry 权限检查增强

在现有 `execute()` 方法中增加可选的权限参数：

```typescript
async execute(
  name: string,
  params: any,
  agentPermissions?: ToolPermission[]
): Promise<ToolResult> {
  const tool = this.tools.get(name);
  if (!tool) { /* ... */ }

  // v6 新增：权限检查
  const def = tool.getDefinition() as V6ToolDefinition;
  if (def.permissions && agentPermissions) {
    const hasPermission = def.permissions.every(p =>
      agentPermissions.includes(p)
    );
    if (!hasPermission) {
      return {
        success: false,
        error: `Permission denied: tool "${name}" requires [${def.permissions}]`,
      };
    }
  }
  // 原有逻辑继续...
}
```

### 新工具注册示例

```typescript
import { WebSearchTool } from './builtin/web-search.js';
import { WebFetchTool } from './builtin/web-fetch.js';
import { ShellExecutorTool } from './builtin/shell-executor.js';
import { CodeSandboxTool } from './builtin/code-sandbox.js';

// 在 ToolRegistry.registerDefaultTools() 或应用启动时调用
registry.register(new WebSearchTool(toolsConfig));
registry.register(new WebFetchTool(toolsConfig));
registry.register(new ShellExecutorTool(workDirManager));
registry.register(new CodeSandboxTool());
```

---

## 关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| HTTP 客户端 | Node.js 原生 `fetch` | Node 18+ 内置，零依赖 |
| HTML 解析 | `node-html-parser` | 轻量（无 DOM），速度快 |
| HTML 转 MD | `turndown` | 成熟，可扩展规则 |
| Node.js 沙箱 | 原生 `vm` 模块 | 内置无依赖；v2 可升级为 `vm2` |
| Python 沙箱 | `child_process.spawn` | 进程隔离最可靠 |
| 搜索适配器 | Serper.dev 主 + Bing 备 | 成本与可靠性平衡 |
| 缓存策略 | 内存 Map + TTL | 简单够用，重启后清空（可接受） |

---

**文档结束**
