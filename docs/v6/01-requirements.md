# Agent Team v6.0 - 产品需求文档（PRD）

**版本**: 6.0.0
**日期**: 2026-02-10
**状态**: 待开发
**负责人**: 产品团队

---

## 一、版本概述

### 1.1 核心目标

**v6.0 主题：工具生态系统增强（Tool Ecosystem Enhancement）**

v5.0 建立了完整的多智能体协作框架（AgentLoop、TokenManager、ContextCompressor、MasterAgent、SubAgent、AgentCommunicator），但 Agent 可用的工具仍局限于基础文件操作。

v6.0 的核心目标是**大幅扩展 Agent 的工具能力边界**，使 Agent 能够：

- 访问互联网，搜索最新信息
- 获取任意网页内容并提取结构化数据
- 安全执行 Shell 命令，与系统环境交互
- 在隔离沙箱中运行代码并获取执行结果
- 通过统一注册表管理所有工具的生命周期与权限
- 将多个工具编排成流水线，实现复杂任务的自动化

### 1.2 与 v5 的关系

| 维度 | v5.0 | v6.0 |
|------|------|------|
| 核心能力 | 多智能体协作框架 | 工具生态系统增强 |
| Agent 工具 | 基础文件读写 | Web 搜索、内容获取、Shell 执行、代码沙箱 |
| 工具管理 | 简单注册表 | 完整的权限控制、发现机制、版本管理 |
| 工具编排 | 无 | 工具流水线（Pipeline）支持 |
| 依赖关系 | 完全继承 v4 | 完全继承 v5，不破坏现有接口 |

### 1.3 关键改进

1. **能力突破**：Agent 从"只能操作本地文件"升级为"可以感知和操作互联网"
2. **安全增强**：Shell 执行和代码运行引入沙箱隔离，防止越权操作
3. **统一管理**：所有工具通过 ToolRegistry 统一注册、发现、鉴权
4. **组合能力**：ToolPipeline 允许将多个工具串联，支持复杂工作流
5. **向后兼容**：v5 的所有工具和接口保持不变，v6 只是扩展

---

## 二、核心理念

### 2.1 工具即能力边界

Agent 的智能水平上限由其工具集决定。没有 Web 搜索工具，Agent 无法获取实时信息；没有代码执行工具，Agent 无法验证自己生成的代码是否正确。v6.0 通过系统性扩展工具集，直接提升 Agent 的实际解决问题能力。

### 2.2 安全与能力的平衡

强大的工具必然带来安全风险。v6.0 坚持以下原则：

- **最小权限**：每个工具仅拥有完成任务所需的最小权限
- **明确隔离**：Shell 执行和代码运行在受控环境中进行，不影响宿主系统
- **可审计**：所有工具调用必须产生可追溯的日志
- **用户确认**：危险操作（如删除文件、网络请求）在首次使用时需要用户授权

### 2.3 工具的可组合性

单一工具的能力有限，但工具之间的组合可以产生指数级的能力提升。v6.0 的 ToolPipeline 设计允许：

```
Web Search → 获取搜索结果
  → Web Content Fetcher → 获取详情页内容
  → Code Sandbox (Node.js) → 解析并处理数据
  → File Write → 保存结果
```

---

## 三、功能需求

### 3.1 P0 核心功能（必须实现）

#### 3.1.1 Web Search 工具（WebSearchTool）

**功能描述**：
允许 Agent 通过搜索引擎 API 查询互联网信息，获取结构化的搜索结果列表。

**核心能力**：
1. 支持多搜索引擎适配器（Bing Search API、DuckDuckGo、Serper.dev）
2. 返回标题、URL、摘要的结构化结果
3. 支持结果数量限制（默认 10 条，最大 50 条）
4. 支持语言和地区过滤参数
5. 结果缓存（同一查询在 5 分钟内不重复请求）
6. 请求超时控制（默认 10 秒）
7. 速率限制（防止超出 API 配额）

**接口定义**：
```typescript
interface WebSearchParams {
  query: string;           // 搜索关键词
  limit?: number;          // 结果数量，默认 10，最大 50
  language?: string;       // 语言，默认 'zh-CN'
  region?: string;         // 地区，默认 'CN'
  freshness?: 'day' | 'week' | 'month' | 'any';  // 结果新鲜度
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

**技术要求**：
- 使用现有 HTTP 客户端（fetch / axios）调用搜索 API
- API Key 通过配置文件管理（`config/tools.yaml`）
- 搜索引擎可按优先级 fallback（主引擎失败时自动切换备用引擎）
- 结果中的 URL 在返回前做安全校验（过滤恶意域名黑名单）

**验收标准**：
- 给定关键词，能返回不少于 5 条有效搜索结果
- 缓存机制生效：相同查询在 5 分钟内只发起一次 API 请求
- 超时控制生效：API 无响应时 10 秒后返回错误
- 单元测试覆盖率 > 80%

---

#### 3.1.2 Web Content Fetcher（WebFetchTool）

**功能描述**：
允许 Agent 通过 URL 获取网页内容，并转换为 Agent 友好的纯文本或 Markdown 格式。

**核心能力**：
1. 获取 HTML 页面并提取正文内容（去除广告、导航、脚注等噪声）
2. 将 HTML 转换为 Markdown 格式，保留标题、列表、代码块等结构
3. 支持 JSON/XML API 响应的直接返回
4. 支持最大内容长度限制（默认 50,000 字符，防止过大内容撑爆 Token）
5. 请求超时控制（默认 15 秒）
6. User-Agent 配置（伪装为普通浏览器）
7. 基础的 robots.txt 遵守机制

**接口定义**：
```typescript
interface WebFetchParams {
  url: string;                            // 目标 URL
  format?: 'markdown' | 'text' | 'raw';  // 输出格式，默认 'markdown'
  maxLength?: number;                     // 最大字符数，默认 50000
  timeout?: number;                       // 超时秒数，默认 15
  extractMainContent?: boolean;           // 是否提取主要内容，默认 true
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

**技术要求**：
- 使用 `node-html-parser` 或 `cheerio` 解析 HTML
- 使用 `turndown` 将 HTML 转换为 Markdown
- 内容截断时在末尾标注"[内容已截断，原文共 N 字符]"
- 对非 HTTP 200 响应返回明确错误信息
- 禁止访问 localhost、内网 IP（防止 SSRF 攻击）

**验收标准**：
- 给定公开 URL，能返回可读的 Markdown 格式内容
- 超过 maxLength 的内容被正确截断并标注
- 尝试访问 localhost/127.0.0.1 返回安全错误
- 单元测试覆盖率 > 80%

---

#### 3.1.3 Shell Executor（ShellExecutorTool）

**功能描述**：
允许 Agent 安全执行 Shell 命令，获取命令的标准输出和错误输出。

**核心能力**：
1. 执行任意 Shell 命令（bash/sh）
2. 超时控制（默认 30 秒，最大 300 秒）
3. 工作目录指定（默认在任务工作空间目录内）
4. 环境变量注入
5. 标准输出和标准错误分别捕获
6. 退出码返回
7. 命令黑名单机制（禁止执行高危命令）
8. 输出大小限制（默认最大 100,000 字符）

**接口定义**：
```typescript
interface ShellExecuteParams {
  command: string;            // 要执行的命令
  cwd?: string;               // 工作目录（相对于任务工作空间）
  env?: Record<string, string>; // 额外的环境变量
  timeout?: number;           // 超时秒数，默认 30，最大 300
  maxOutputSize?: number;     // 输出最大字符数，默认 100000
}

interface ShellExecuteResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  executionTime: number;      // 毫秒
  truncated: boolean;
}
```

**安全策略**：

危险命令黑名单（禁止执行，返回安全错误）：
```
rm -rf /
dd if=
:(){ :|:& };:   # fork bomb
chmod -R 777 /
mkfs.*
```

危险命令警告列表（首次执行需要用户确认）：
```
rm -rf
sudo
curl | sh
wget | sh
npm install -g
pip install
```

**技术要求**：
- 使用 Node.js `child_process.spawn`（不使用 `exec`，防止 shell injection）
- 命令参数通过数组传递，不通过字符串拼接
- 执行路径限制在任务工作空间目录内（防止访问宿主系统敏感目录）
- 所有命令执行记录到审计日志

**验收标准**：
- `echo "hello"` 能正确返回 stdout
- 超时命令在设定时间后被强制终止
- 黑名单命令被拒绝执行并返回明确错误
- 执行目录被限制在工作空间内
- 单元测试覆盖率 > 80%

---

### 3.2 P1 重要功能（第二阶段实现）

#### 3.2.1 Code Sandbox（CodeSandboxTool）

**功能描述**：
允许 Agent 在隔离环境中执行 Node.js 或 Python 代码片段，并获取执行结果。与 Shell Executor 的区别在于：Code Sandbox 针对代码执行场景优化，提供更好的错误信息、执行环境隔离和依赖管理。

**核心能力**：
1. 支持 Node.js（v18+）代码执行
2. 支持 Python（v3.10+）代码执行
3. 执行时间限制（默认 30 秒）
4. 内存限制（默认 256MB）
5. 标准输出捕获（`console.log` / `print` 的输出）
6. 运行时错误捕获（包含行号和堆栈）
7. 返回值捕获（最后一个表达式的值）
8. 基础标准库可用（禁止 `fs`、`net`、`child_process` 等系统模块）

**接口定义**：
```typescript
interface CodeExecuteParams {
  code: string;               // 要执行的代码
  language: 'nodejs' | 'python';
  timeout?: number;           // 超时秒数，默认 30
  memoryLimit?: number;       // 内存限制 MB，默认 256
  stdin?: string;             // 标准输入
}

interface CodeExecuteResponse {
  success: boolean;
  output: string;             // stdout 输出
  error?: string;             // 错误信息（包含堆栈）
  returnValue?: any;          // 最后表达式的值（仅 Node.js）
  executionTime: number;      // 毫秒
  memoryUsed?: number;        // MB
  timedOut: boolean;
}
```

**技术实现方案**：

Node.js 沙箱方案：
- 使用 `vm2` 或 Node.js 原生 `vm` 模块创建隔离 context
- 注入安全的全局变量（console、Math、JSON、setTimeout 等）
- 禁用 `require`、`process`、`__dirname` 等危险访问

Python 沙箱方案：
- 使用独立的 Python 进程执行（`child_process.spawn('python3', ...)`）
- 通过 `-c` 参数传入代码
- 设置资源限制（`resource` 模块）

**验收标准**：
- Node.js `1 + 1` 返回 2
- Python `print("hello")` 返回正确 stdout
- `require('fs')` 在 Node.js 沙箱中被拒绝
- 超时代码在设定时间后被终止
- 运行时错误包含行号信息
- 单元测试覆盖率 > 80%

---

#### 3.2.2 Tool Registry（ToolRegistry 增强）

**功能描述**：
v5 的 ToolRegistry 是简单的工具存储和查找机制。v6 将其升级为完整的工具生命周期管理系统，支持工具发现、权限控制、版本管理和健康监控。

**核心能力**：
1. **工具注册与注销**：支持动态注册和注销工具
2. **工具分类与标签**：按类别（web、shell、code、file、llm）和标签组织工具
3. **权限控制**：每个工具定义所需权限级别，Agent 只能调用被授权的工具
4. **工具发现接口**：支持按关键词、分类、能力描述搜索工具
5. **工具健康检查**：定期检查工具可用性（ping 外部 API、检查依赖）
6. **调用统计**：记录每个工具的调用次数、成功率、平均耗时
7. **工具元数据**：每个工具包含名称、描述、参数 Schema、示例、版本信息

**工具权限级别**：
```typescript
enum ToolPermission {
  READ_ONLY = 'read_only',      // 只读操作（文件读取、Web 搜索）
  WRITE = 'write',              // 写入操作（文件写入）
  NETWORK = 'network',          // 网络访问（Web 请求）
  SHELL = 'shell',              // Shell 执行
  CODE_EXECUTION = 'code_exec', // 代码执行
  SYSTEM = 'system',            // 系统级操作（危险）
}
```

**接口定义**：
```typescript
interface ToolDefinition {
  name: string;
  version: string;
  description: string;
  category: ToolCategory;
  tags: string[];
  permissions: ToolPermission[];
  parameters: z.ZodSchema;      // Zod Schema 参数验证
  examples: ToolExample[];
  healthCheck?: () => Promise<boolean>;
  execute: (params: any) => Promise<any>;
}

interface ToolRegistryQuery {
  keyword?: string;
  category?: ToolCategory;
  tags?: string[];
  permissions?: ToolPermission[];  // 只返回具有指定权限的工具
}
```

**验收标准**：
- 工具注册后可通过名称精确查找
- 按分类查询返回正确的工具子集
- 权限过滤生效：低权限 Agent 无法获取高权限工具
- 健康检查在配置的时间间隔内自动执行
- 调用统计数据准确
- 单元测试覆盖率 > 80%

---

#### 3.2.3 Tool Pipeline（ToolPipeline）

**功能描述**：
允许将多个工具组合成流水线，前一个工具的输出自动作为后一个工具的输入（部分或全部），实现复杂的多步骤自动化任务。

**核心能力**：
1. **顺序执行**：工具按定义顺序执行，支持数据传递
2. **条件分支**：根据前一步结果决定执行哪个分支
3. **并行执行**：无依赖关系的工具步骤并行执行
4. **数据映射**：通过 JSONPath 表达式将前一步的输出映射到下一步的输入
5. **错误处理**：支持步骤失败时的 fallback 策略（跳过、重试、终止）
6. **执行跟踪**：记录每个步骤的输入、输出、耗时

**Pipeline 定义示例**：
```typescript
const pipeline: PipelineDefinition = {
  name: 'research-and-summarize',
  description: '搜索并总结网页内容',
  steps: [
    {
      id: 'search',
      tool: 'web_search',
      params: { query: '{{input.topic}}', limit: 5 },
    },
    {
      id: 'fetch',
      tool: 'web_fetch',
      // 对 search 结果的每个 URL 执行 fetch（fan-out）
      forEach: '{{search.results[*].url}}',
      params: { url: '{{item}}', format: 'markdown' },
    },
    {
      id: 'summarize',
      tool: 'llm_summarize',
      params: { content: '{{fetch[*].content}}' },
    },
  ],
};
```

**接口定义**：
```typescript
interface PipelineStep {
  id: string;
  tool: string;
  params: Record<string, any>;    // 支持模板变量 {{stepId.field}}
  forEach?: string;               // fan-out：对数组中每个元素执行
  condition?: string;             // 条件表达式，为 false 时跳过此步骤
  onError?: 'skip' | 'retry' | 'fail';
  maxRetries?: number;
}

interface PipelineExecuteResult {
  success: boolean;
  steps: StepExecuteResult[];
  output: any;                    // 最后一步的输出
  totalTime: number;
}
```

**验收标准**：
- 两步顺序 Pipeline 能正确传递数据
- `forEach` 能对数组中每个元素并行执行工具
- 步骤失败时 `onError: 'skip'` 正确跳过继续执行
- 执行轨迹记录完整（每步的输入输出）
- 单元测试覆盖率 > 80%

---

### 3.3 P2 可选功能（第三阶段，视资源决定）

#### 3.3.1 RSS/Feed 订阅工具（RSSFeedTool）

允许 Agent 订阅 RSS/Atom Feed，获取最新文章列表。适用于监控新闻、博客更新等场景。

**核心能力**：
- 解析 RSS 2.0 和 Atom 1.0 格式
- 返回最新 N 篇文章（标题、链接、摘要、发布时间）
- 本地缓存（避免频繁请求同一 Feed）

**验收标准**：
- 给定 RSS URL，返回结构化文章列表
- 缓存在配置的 TTL 内有效

---

#### 3.3.2 Screenshot 工具（ScreenshotTool）

允许 Agent 对网页进行截图，用于视觉内容分析或验证。

**核心能力**：
- 使用 Puppeteer/Playwright 对 URL 截图
- 支持全页面截图或视口截图
- 截图保存到任务工作空间

**技术要求**：
- 依赖 Puppeteer（`puppeteer-core` + Chromium）
- 截图超时 30 秒

**验收标准**：
- 给定 URL，在工作空间生成 PNG 截图文件

---

#### 3.3.3 数据库查询工具（DatabaseQueryTool）

允许 Agent 对配置的数据库执行只读 SQL 查询。

**核心能力**：
- 支持 SQLite、PostgreSQL、MySQL
- 严格限制为 SELECT 语句（禁止 INSERT/UPDATE/DELETE/DROP）
- 结果行数限制（最多 1000 行）
- 查询超时（默认 30 秒）

**验收标准**：
- SELECT 查询成功执行并返回结果
- INSERT 语句被拒绝执行

---

## 四、技术约束

### 4.1 语言与运行时

- **TypeScript**: 严格模式（`strict: true`），类型覆盖率 > 90%
- **Node.js**: v18 LTS 或以上（支持原生 `fetch`、`vm` 模块）
- **模块系统**: ESM（与 v5 保持一致）

### 4.2 依赖约束

新增依赖必须满足：
- 维护活跃（近 6 个月有更新）
- 无已知高危安全漏洞
- MIT / Apache 2.0 / BSD 许可证

**允许新增的依赖**：
```json
{
  "node-html-parser": "解析 HTML",
  "turndown": "HTML 转 Markdown",
  "cheerio": "HTML 内容提取（备选）",
  "vm2": "Node.js 代码沙箱（如果原生 vm 不满足需求）",
  "node-cron": "定时健康检查"
}
```

**禁止新增的依赖**：
- 任何 headless browser（P2 的 Screenshot 工具除外）
- 任何数据库 ORM（P2 的 Database 工具使用轻量驱动）

### 4.3 向后兼容性

- v5 的所有公开接口（`MasterAgent`、`SubAgent`、`AgentLoop`、`ToolExecutor`）保持不变
- v5 的工具（FileReadTool、FileWriteTool 等）继续可用
- v6 新工具通过 ToolRegistry 的新注册接口添加，不修改现有代码

### 4.4 安全约束

- Shell Executor 的工作目录必须限制在任务工作空间内，禁止 `../` 路径穿越
- Web Fetch 禁止访问私有 IP 范围（10.x.x.x、172.16.x.x-172.31.x.x、192.168.x.x）
- 代码沙箱禁止访问文件系统和网络
- 所有工具的 API Key 从环境变量或配置文件读取，不硬编码

---

## 五、非功能需求

### 5.1 性能要求

| 工具 | 期望响应时间 | 超时上限 |
|------|-------------|---------|
| WebSearchTool | < 3 秒（API 正常时） | 10 秒 |
| WebFetchTool | < 5 秒（普通页面） | 15 秒 |
| ShellExecutorTool | 取决于命令 | 300 秒 |
| CodeSandboxTool | < 5 秒（简单代码） | 30 秒 |

### 5.2 可靠性要求

1. 所有网络相关工具必须实现重试机制（网络错误最多重试 3 次）
2. 工具失败不影响 Agent 的继续执行（工具错误返回结构化错误信息）
3. 工具健康检查失败时，ToolRegistry 将该工具标记为不可用

### 5.3 可观测性要求

1. 每次工具调用记录：工具名、参数摘要、耗时、成功/失败、错误信息
2. ToolRegistry 提供工具使用统计接口
3. 日志格式与 v5 保持一致（结构化 JSON，包含 `taskId`、`agentId`、`toolName`）

---

## 六、文件结构规划

```
src/
├── tools/                          # 工具系统（v5 基础上扩展）
│   ├── tool-registry.ts            # ToolRegistry 增强版（v6 更新）
│   ├── tool-executor.ts            # 工具执行器（v5 保持不变）
│   ├── tool-pipeline.ts            # 工具流水线（v6 新增）
│   ├── builtin/                    # 内置工具目录
│   │   ├── file-read.ts            # 文件读取（v5 保持）
│   │   ├── file-write.ts           # 文件写入（v5 保持）
│   │   ├── web-search.ts           # Web 搜索（v6 新增）
│   │   ├── web-fetch.ts            # Web 内容获取（v6 新增）
│   │   ├── shell-executor.ts       # Shell 执行（v6 新增）
│   │   └── code-sandbox.ts         # 代码沙箱（v6 新增）
│   └── adapters/                   # 搜索引擎适配器
│       ├── search-adapter.ts       # 适配器基类
│       ├── bing-search.ts          # Bing 适配器
│       └── serper-search.ts        # Serper.dev 适配器
│
config/
│   └── tools.yaml                  # 工具配置（API Key、权限白名单等）
│
tests/
│   └── tools/
│       ├── web-search.test.ts
│       ├── web-fetch.test.ts
│       ├── shell-executor.test.ts
│       ├── code-sandbox.test.ts
│       ├── tool-registry.test.ts
│       └── tool-pipeline.test.ts
```

---

## 七、里程碑计划

### Phase 1: 网络工具（Week 1-2）

**目标**：让 Agent 能够访问互联网

**任务清单**：
- 任务 1：工具配置系统（`config/tools.yaml` + 配置加载器）
- 任务 2：搜索引擎适配器层（Bing/Serper 适配器 + 缓存）
- 任务 3：WebSearchTool 实现与测试
- 任务 4：WebFetchTool 实现与测试（HTML 解析 + Markdown 转换）

**验收标准**：
- Agent 能通过工具搜索关键词并获取结果
- Agent 能获取指定 URL 的内容（Markdown 格式）
- 所有安全限制（SSRF 防护）生效
- 所有新工具的单元测试通过

---

### Phase 2: 执行能力（Week 3）

**目标**：让 Agent 能够执行命令和代码

**任务清单**：
- 任务 5：ShellExecutorTool 实现与测试（含黑名单机制）
- 任务 6：Node.js 代码沙箱实现与测试
- 任务 7：Python 代码沙箱实现与测试

**验收标准**：
- Agent 能执行基础 Shell 命令并获取输出
- Agent 能运行 Node.js/Python 代码片段
- 所有安全限制（超时、路径限制、模块禁用）生效
- 所有新工具的单元测试通过

---

### Phase 3: 工具生态系统（Week 4）

**目标**：完成工具管理和编排能力

**任务清单**：
- 任务 8：ToolRegistry 增强（权限控制、发现接口、健康检查、统计）
- 任务 9：ToolPipeline 实现（顺序执行、数据映射、错误处理）
- 任务 10：端到端集成测试 + 文档更新

**验收标准**：
- ToolRegistry 权限控制正确隔离高危工具
- ToolPipeline 能成功执行两步以上的工具流水线
- 端到端测试：Agent 使用 Pipeline 完成"搜索 → 获取内容 → 总结"任务
- 所有新功能的单元测试通过

---

## 八、验收标准汇总

| 功能 | 优先级 | 关键验收标准 |
|------|--------|------------|
| WebSearchTool | P0 | 返回有效搜索结果；缓存生效；超时控制生效 |
| WebFetchTool | P0 | 返回 Markdown 格式内容；SSRF 防护生效；内容截断标注 |
| ShellExecutorTool | P0 | 命令执行返回正确输出；黑名单拒绝；路径限制生效 |
| CodeSandboxTool | P1 | Node.js/Python 执行成功；危险模块被禁；超时终止 |
| ToolRegistry 增强 | P1 | 权限过滤正确；健康检查自动执行；统计数据准确 |
| ToolPipeline | P1 | 数据传递正确；forEach 并行执行；错误处理策略生效 |
| RSSFeedTool | P2 | 解析 RSS 返回文章列表 |
| ScreenshotTool | P2 | 生成截图文件到工作空间 |
| DatabaseQueryTool | P2 | SELECT 成功；非 SELECT 被拒绝 |

---

## 九、风险与依赖

### 9.1 技术风险

1. **搜索 API 费用**：商业搜索 API（Bing、Serper）按调用计费
   - 缓解措施：强制缓存、限制单次搜索结果数量、支持免费替代方案（DuckDuckGo）

2. **代码沙箱安全性**：Node.js `vm` 模块存在已知的逃逸风险
   - 缓解措施：禁用 `__proto__`、使用 `vm2`（更严格的沙箱）、添加执行时间和内存硬限制

3. **Shell 命令安全**：黑名单方式本质上是不完整的
   - 缓解措施：明确文档说明这是开发/测试场景工具，生产环境应在 Docker 容器内运行

4. **HTML 解析质量**：不同网站的 HTML 结构差异大，内容提取准确度不一
   - 缓解措施：支持 `format: 'raw'` 返回原始 HTML，由 Agent 自行处理

### 9.2 外部依赖

| 依赖 | 用途 | 风险 |
|------|------|------|
| Bing Search API / Serper.dev | Web 搜索 | 商业服务，可能限流或收费 |
| `node-html-parser` / `cheerio` | HTML 解析 | 低风险，成熟库 |
| `turndown` | HTML → Markdown | 低风险，成熟库 |
| `vm2`（可选） | 代码沙箱 | 需关注安全更新 |

### 9.3 暂不实现的功能

以下功能在 v6.0 中**不实现**：

1. 完整的 Docker 容器沙箱（v7 考虑）
2. 工具市场 / 插件系统（v7 考虑）
3. 工具的 A/B 测试机制
4. 分布式工具执行
5. WebSocket 实时工具结果推送（使用现有 SSE 机制）

---

## 十、成功标准

### 10.1 功能标准

1. Agent 可以通过 WebSearchTool 获取实时互联网信息
2. Agent 可以通过 WebFetchTool 获取并理解任意网页内容
3. Agent 可以通过 ShellExecutorTool 执行系统命令并获取结果
4. Agent 可以通过 CodeSandboxTool 验证自己生成的代码
5. 所有 P0 工具都集成到 ToolRegistry 并可通过权限控制访问
6. ToolPipeline 能成功执行至少 3 步工具链

### 10.2 质量标准

1. 所有新增模块单元测试覆盖率 > 80%
2. 无因工具执行导致的内存泄漏
3. 所有安全策略（SSRF 防护、路径限制、模块禁用）通过安全测试
4. 代码符合 TypeScript 严格模式，无 `any` 类型滥用

### 10.3 体验标准

1. 工具错误信息具有明确的可操作性（告诉 Agent 为什么失败、怎么修正）
2. 长时间运行的工具（Shell/Code）有进度反馈
3. ToolRegistry 的工具发现接口对 Agent 友好（清晰的描述和示例）

---

**文档结束**
