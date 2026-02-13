# Agent Team v9.0 架构设计

**版本**: 9.0.0
**作者**: 系统架构师
**创建日期**: 2026-02-13
**基于**: 01-requirements.md

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        插件生态层 (Plugin Ecosystem)                  │
│                                                                      │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│   │  Tool Plugin │  │  Role Plugin │  │      Hook Plugin          │  │
│   │  (工具插件)   │  │  (角色插件)   │  │    (生命周期钩子插件)       │  │
│   │  index.js    │  │  index.js    │  │      index.js             │  │
│   │  plugin.json │  │  plugin.json │  │      plugin.json          │  │
│   └──────┬───────┘  └──────┬───────┘  └───────────┬──────────────┘  │
└──────────┼─────────────────┼──────────────────────┼─────────────────┘
           │                 │                        │
┌──────────▼─────────────────▼────────────────────────▼─────────────────┐
│                      核心系统层 (Plugin Runtime)                        │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    PluginLoader (src/plugins/loader.ts)          │  │
│  │   扫描 plugins/ → 验证 plugin.json → 拓扑排序 → ESM import()      │  │
│  └───────────────────────────┬─────────────────────────────────────┘  │
│                               │                                        │
│  ┌────────────────────────────▼────────────────────────────────────┐  │
│  │                   PluginSandbox (src/plugins/sandbox.ts)         │  │
│  │   模块黑名单检查 → 超时保护 → 异常隔离 → 环境变量过滤               │  │
│  └───────────────────────────┬─────────────────────────────────────┘  │
│                               │                                        │
│  ┌──────────────┬─────────────▼──────────────┬───────────────────┐    │
│  │PluginRegistry│  DynamicToolLoader           │  SelfEvaluator   │    │
│  │(registry.ts) │  (dynamic-tool-loader.ts)   │  (evaluator.ts)  │    │
│  └──────────────┘  └────────────┬────────────┘  └───────┬────────┘    │
│                                 │                         │            │
│                        ┌────────▼──────┐       ┌──────────▼─────────┐ │
│                        │  ToolRegistry │       │  PromptOptimizer   │ │
│                        │   (v6, 复用)  │       │  (optimizer.ts)    │ │
│                        └───────────────┘       └────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
           │                                               │
┌──────────▼───────────────────────────────────────────────▼────────────┐
│                      基础设施层 (v5-v8 不变)                            │
│                                                                        │
│   v5: MasterAgent / SubAgent / AgentLoop                               │
│   v6: ToolRegistry / ToolPipeline / ITool                              │
│   v7: StructuredLogger / TracingSystem / MetricsCollector              │
│   v8: VectorStore / AgentMemory / ProjectKnowledgeBase                 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 核心模块

### PluginLoader (`src/plugins/loader.ts`)

**职责**：插件发现、验证、排序和加载。

**设计要点**：

- **扫描阶段**：读取 `plugins/` 目录下所有子目录，查找 `plugin.json` 文件
- **验证阶段**：调用 `PluginValidator` 校验 manifest 格式，失败时跳过并记录错误
- **拓扑排序**：基于 `dependencies` 字段构建有向图，使用 Kahn 算法（BFS）排序；检测环形依赖
- **加载阶段**：按拓扑顺序使用 ESM 动态 `import()` 加载入口文件
- **错误隔离**：单个插件加载失败通过 `try-catch` 捕获，不影响其他插件；失败插件记入 `failedPlugins` 集合
- **运行时加载**：提供 `load(pluginPath: string)` 方法，支持不重启加载新插件

**关键接口**：

```typescript
class PluginLoader extends EventEmitter {
  async scanAndLoad(pluginsDir: string): Promise<LoadResult>
  async load(pluginPath: string): Promise<PluginInstance>
  async unload(pluginName: string): Promise<void>
  getLoaded(): Map<string, PluginInstance>
  getFailed(): Map<string, Error>
}

interface LoadResult {
  loaded: PluginInstance[]
  failed: Array<{ path: string; error: Error }>
  skipped: string[]
}
```

---

### PluginSandbox (`src/plugins/sandbox.ts`)

**职责**：为插件执行提供轻量级安全隔离。

**设计要点**：

- **模块黑名单**：拦截 `import` 时检查模块名，禁止访问 `child_process`、`cluster`、`worker_threads`；通过 Proxy 包装 import 函数实现拦截
- **超时保护**：使用 `Promise.race([pluginInit, timeout(5000)])` 限制插件初始化时间（5 秒）；工具执行超时默认 30 秒（可配置）
- **异常捕获**：所有插件生命周期调用（`activate`、`deactivate`、`execute`）均包裹在 `try-catch` 中
- **环境变量过滤**：向插件注入 `process.env` 的代理对象，过滤掉 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等敏感键
- **沙箱实现策略**：v9.0 采用轻量白名单/黑名单检查（不引入 `vm2`/`isolated-vm`），符合需求文档决策

**关键接口**：

```typescript
class PluginSandbox {
  constructor(config: SandboxConfig)
  async execute<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T>
  createRestrictedImport(allowedModules?: string[]): RestrictedImport
  createSafeEnv(sensitiveKeys: string[]): NodeJS.ProcessEnv
}

class PluginSandboxError extends Error {
  readonly blockedModule: string
}
```

---

### DynamicToolLoader (`src/plugins/dynamic-tool-loader.ts`)

**职责**：桥接插件系统与现有 ToolRegistry，管理工具的动态注册、热更新和版本控制。

**设计要点**：

- **继承/包装 ToolRegistry**：不修改 v6 `ToolRegistry` 代码；通过组合方式包装，调用 `ToolRegistry.register()` 注册动态工具
- **fs.watch 监听**：监听 `plugins/` 目录下文件变化，变化后触发重新加载；使用防抖（300ms）避免文件保存时的多次触发
- **热更新安全**：正在执行的工具调用持有旧实现引用，新工具替换后新调用使用新版本（引用更新，不中断运行中的调用）
- **版本管理**：`Map<toolName, VersionedTool[]>` 最多保留 3 个版本；版本 key 格式为 `toolName@version`；超出时删除 semver 最旧版本
- **日志记录**：热更新事件通过 v7 `StructuredLogger` 记录

**关键接口**：

```typescript
class DynamicToolLoader {
  constructor(registry: ToolRegistry, logger: StructuredLogger)
  async registerToolPlugin(plugin: PluginInstance): Promise<void>
  async unregisterToolPlugin(pluginName: string): Promise<void>
  startWatching(pluginsDir: string): void
  stopWatching(): void
  getVersionHistory(toolName: string): VersionedTool[]
}

interface VersionedTool {
  version: string
  tool: ITool
  registeredAt: Date
  pluginName: string
}
```

---

### SelfEvaluator (`src/evolution/evaluator.ts`)

**职责**：任务完成后自动进行多维度质量评估，形成自进化数据基础。

**设计要点**：

- **事件驱动**：监听 `AgentLoop` 发出的 `task:completed` 和 `task:failed` 事件
- **三维评分算法**：
  - 效率分（权重 0.3）：`10 - clamp((实际工具调用次数 - 基准调用次数) * 2, 0, 9)`
  - 质量分（权重 0.5）：关键词匹配 + 输出结构验证，失败任务固定 0 分
  - 资源分（权重 0.2）：`10 - clamp((actualTokens / avgTokens - 1) * 5, 0, 9)`
- **综合分**：`efficiency * 0.3 + quality * 0.5 + resource * 0.2`
- **持久化**：评估结果以 JSONL 格式追加到 `.agent-memory/evaluations.jsonl`，同时存入 v8 `VectorStore`（category: `evaluation`）
- **趋势分析**：`getTrend(agentId, days)` 查询最近 N 天每日平均分；连续 3 天下降超 10% 触发 `evaluation:declining` 事件
- **优化建议**：单维度连续 3 次低于 5 分时生成规则驱动的优化建议，以事件形式发出

**关键接口**：

```typescript
class SelfEvaluator extends EventEmitter {
  constructor(vectorStore: VectorStore, tracing: TracingSystem, logger: StructuredLogger)
  async evaluate(taskResult: TaskResult): Promise<EvaluationReport>
  async getTrend(agentId: string, days: number): Promise<TrendData>
  async getSuggestions(agentId: string): Promise<OptimizationSuggestion[]>
}
```

---

### PromptOptimizer (`src/evolution/prompt-optimizer.ts`)

**职责**：基于历史评估数据优化 Agent system prompt，通过 A/B 测试验证效果。

**设计要点**：

- **版本管理**：Prompt 版本存储在 v8 `ProjectKnowledgeBase`（category: `prompt-version`）；最多保留 20 个版本
- **订阅触发**：订阅 `SelfEvaluator` 的 `evaluation:declining` 事件，10 秒内生成优化变体
- **三种优化策略**：
  - 精简策略：正则去除冗余空行和重复说明，目标缩减 10-20%
  - 强化约束策略：在低分维度对应位置插入显式约束语句
  - 示例注入策略：从 v8 `VectorStore` 检索历史高分任务，构造 few-shot 示例
- **A/B 测试**：60/40 流量分配（A:B），最少 20 样本后执行 Welch t-test（p < 0.05）
- **人工确认**：统计显著时发出 `prompt:improvement-ready` 事件，等待 `adoptVersion()` 调用确认

**关键接口**：

```typescript
class PromptOptimizer extends EventEmitter {
  constructor(knowledgeBase: ProjectKnowledgeBase, vectorStore: VectorStore)
  async getVersionHistory(agentId: string): Promise<PromptVersion[]>
  async generateVariants(agentId: string, reason: DecliningReason): Promise<PromptVariant[]>
  async runABTest(agentId: string, variantId: string): Promise<ABTestSession>
  async adoptVersion(agentId: string, versionId: string): Promise<void>
  selectPromptForTask(agentId: string, taskId: string): string
}
```

---

### PluginRegistry (`src/plugins/registry.ts`)

**职责**：维护本地插件索引，提供安装/卸载/统计接口。

**设计要点**：

- **YAML 索引**：持久化到 `plugins/registry.yaml`，使用 `yaml` 库解析（需求文档已允许引入）
- **自动更新**：插件加载/卸载时通过事件监听自动同步索引文件
- **安装原子性**：安装失败时回滚（删除已复制文件），不污染 `plugins/` 目录
- **使用统计**：`usage_count` 和 `avg_score` 实时更新到内存，定期（每 5 次调用或卸载时）持久化到 YAML

**关键接口**：

```typescript
class PluginRegistry {
  constructor(pluginsDir: string, loader: PluginLoader)
  async list(): Promise<PluginIndexEntry[]>
  async install(sourcePath: string, options?: InstallOptions): Promise<void>
  async uninstall(pluginName: string): Promise<void>
  async getStats(pluginName: string): Promise<PluginStats>
  recordUsage(pluginName: string, qualityScore: number): void
}
```

---

## TypeScript 接口定义

```typescript
// ---- 插件系统接口 ----

interface PluginManifest {
  name: string                    // kebab-case，唯一标识
  version: string                 // semver，如 "1.2.0"
  type: 'tool' | 'role' | 'hook'
  description: string             // <= 200 字符
  author: string
  main: string                    // 相对路径，如 "index.js"
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  sandbox?: {
    allowedModules?: string[]
    timeout?: number              // 毫秒，默认 30000
    memoryLimit?: number          // MB
  }
  tool?: { toolName: string; category: string }
  role?: { roleName: string; agentTypes: string[]; promptFile: string }
  hook?: { events: LifecycleEvent[]; priority?: number }
  homepage?: string
  license?: string
  keywords?: string[]
}

interface PluginContext {
  manifest: PluginManifest
  pluginDir: string
  logger: StructuredLogger
  toolRegistry?: ToolRegistry     // 仅 tool 插件注入
  env: NodeJS.ProcessEnv          // 过滤敏感键后的安全副本
}

interface PluginInstance {
  manifest: PluginManifest
  module: ESMModule
  context: PluginContext
  loadedAt: Date
  status: 'active' | 'error' | 'unloaded'
}

// ---- 工具版本管理接口 ----

interface VersionedTool {
  version: string                 // semver
  tool: ITool                     // v6 ITool 接口
  registeredAt: Date
  pluginName: string
  isActive: boolean               // 是否为当前默认版本
}

// ---- 自评估接口 ----

interface EvaluationReport {
  taskId: string
  agentId: string
  timestamp: Date
  scores: {
    efficiency: number            // 1-10
    quality: number               // 1-10（失败任务为 0）
    resource: number              // 1-10
    composite: number             // 加权综合分
  }
  breakdown: {
    toolCallCount: number
    expectedToolCalls: number
    tokenUsed: number
    avgHistoricalTokens: number
    outputKeywordsMatched: string[]
  }
  suggestions?: OptimizationSuggestion[]
}

interface OptimizationSuggestion {
  dimension: 'efficiency' | 'quality' | 'resource'
  severity: 'warning' | 'critical'
  message: string
  actionable: string[]            // 具体操作建议列表
}

// ---- Prompt 优化接口 ----

interface PromptVersion {
  versionId: string               // UUID
  agentId: string
  versionNumber: number           // 单调递增
  content: string                 // Prompt 完整内容
  createdAt: Date
  source: 'manual' | 'auto-optimized'
  strategy?: 'simplify' | 'reinforce' | 'few-shot'
  parentVersionId?: string        // 来源版本
  isActive: boolean
  isArchived: boolean
}

interface PromptVariant {
  variantId: string
  baseVersionId: string
  strategy: 'simplify' | 'reinforce' | 'few-shot'
  content: string
  createdAt: Date
  rationale: string               // 选择此策略的原因
}

interface ABTestSession {
  sessionId: string
  agentId: string
  controlVersionId: string        // A 组（当前版本）
  variantVersionId: string        // B 组（优化变体）
  trafficSplit: { a: number; b: number }  // 如 { a: 0.6, b: 0.4 }
  samples: ABTestSample[]
  status: 'collecting' | 'completed' | 'insufficient'
  result?: {
    pValue: number
    winner: 'a' | 'b' | 'no-difference'
    effectSize: number
  }
}
```

---

## 文件结构

```
agent-team/
├── src/
│   ├── plugins/                      # 插件系统核心
│   │   ├── loader.ts                 # PluginLoader：扫描、排序、加载
│   │   ├── sandbox.ts                # PluginSandbox：安全隔离
│   │   ├── dynamic-tool-loader.ts    # DynamicToolLoader：热更新与版本管理
│   │   ├── registry.ts               # PluginRegistry：YAML 索引与安装管理
│   │   ├── validator.ts              # PluginValidator：plugin.json Schema 验证
│   │   └── index.ts                  # 统一导出
│   │
│   ├── evolution/                    # 自进化模块
│   │   ├── evaluator.ts              # SelfEvaluator：三维度评分与趋势
│   │   ├── prompt-optimizer.ts       # PromptOptimizer：变体生成与 A/B 测试
│   │   └── index.ts                  # 统一导出
│   │
│   └── types/
│       └── plugin.ts                 # 共享 TypeScript 接口定义
│
├── plugins/                          # 示例插件目录（项目根）
│   ├── registry.yaml                 # 本地插件索引
│   ├── http-request/                 # 示例：工具插件
│   │   ├── plugin.json
│   │   └── index.js
│   ├── code-reviewer/                # 示例：角色插件
│   │   ├── plugin.json
│   │   ├── index.js
│   │   └── prompts/code-reviewer.md
│   └── audit-logger/                 # 示例：钩子插件
│       ├── plugin.json
│       └── index.js
│
├── tests/
│   └── v9/                           # v9 测试目录
│       ├── plugin-loader.test.ts
│       ├── plugin-sandbox.test.ts
│       ├── dynamic-tool-loader.test.ts
│       ├── self-evaluator.test.ts
│       ├── prompt-optimizer.test.ts
│       ├── plugin-registry.test.ts
│       └── e2e.test.ts               # 端到端集成测试
│
└── docs/
    └── v9/
        ├── 01-requirements.md
        ├── 02-architecture.md        # 本文件
        ├── 03-task-breakdown.md
        └── tasks/                    # 任务详情文档
            ├── task-01.md ~ task-08.md
```

---

## 关键架构决策

### 决策 1：轻量沙箱（黑名单检查，非 vm 模块）

**选择**：模块黑名单检查 + Proxy 拦截，不使用 `vm2`/`isolated-vm`

**理由**：需求文档明确禁止引入这些依赖；Node.js `vm` 模块提供的隔离在 ESM 环境下复杂且不稳定；v9.0 的威胁模型是"防止意外"而非"防止恶意"，黑名单检查足以满足

### 决策 2：DynamicToolLoader 组合而非继承 ToolRegistry

**选择**：组合模式（持有 `ToolRegistry` 引用，调用其 `register()` 接口）

**理由**：严格遵守 v5-v8 向后兼容约束，不修改 `ToolRegistry` 代码；组合模式允许 `DynamicToolLoader` 独立测试

### 决策 3：评估数据双写（JSONL + VectorStore）

**选择**：本地 `.agent-memory/evaluations.jsonl` + v8 `VectorStore`

**理由**：JSONL 提供快速本地查询（趋势计算）；VectorStore 支持跨任务语义检索（PromptOptimizer 需要检索相似历史任务）

### 决策 4：A/B 测试人工确认门控

**选择**：统计显著时发事件，需调用 `adoptVersion()` 人工确认

**理由**：Prompt 是 Agent 行为的核心，自动替换风险高；人工确认是安全阀，符合需求文档要求

### 决策 5：热更新防抖 300ms

**选择**：`fs.watch` 回调触发后等待 300ms 静默期再执行重载

**理由**：编辑器保存文件时常触发多次 `change` 事件（原子写入分多步），防抖避免重复加载；300ms 在 3 秒热更新延迟要求内有充足余量
