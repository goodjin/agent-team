# Agent Team v9.0 产品需求文档（PRD）

**版本**: 9.0.0
**状态**: 草案
**作者**: 产品经理
**创建日期**: 2026-02-13
**上一版本**: v8.0（知识库记忆：VectorStore/KnowledgeExtractor/AgentMemory/ProjectKnowledgeBase）

---

## 1. 版本概述

### 1.1 背景与动机

Agent Team 经过八个版本的演进，已构建起完整的多智能体执行内核（v5）、工具生态（v6）、可观测性（v7）和持久化记忆（v8）。然而，这套系统存在一个根本性的设计约束：**系统是封闭的**。

具体表现在：

- **工具集固定**：添加新工具必须修改核心代码，重新构建和部署，无法在运行时动态扩展
- **角色（Prompt）僵化**：Agent 的 system prompt 在版本发布后固定不变，无法根据项目特点自动优化
- **经验无法转化为能力提升**：v8 记录了失败和成功的知识，但 Agent 不会主动调整执行策略
- **缺乏生态入口**：用户和团队积累的工具、最佳实践难以标准化共享

### 1.2 版本主题

**v9.0 主题：自进化与插件生态（Self-Evolution & Plugin Ecosystem）**

v9.0 的核心目标是将 Agent Team 从"封闭的单体系统"进化为"开放的可扩展平台"，让用户能够通过插件机制贡献工具和角色，让 Agent 能够基于历史经验自我完善。

### 1.3 版本目标

| 目标 | 度量标准 | 目标值 |
|------|---------|--------|
| 插件加载成功率 | 合法插件首次加载成功率 | >= 99% |
| 动态工具热更新延迟 | 工具文件修改到生效的时间 | <= 3 秒 |
| 自评估覆盖率 | 有自评估记录的任务比例 | >= 95% |
| Prompt 优化提升率 | A/B 测试中优化版本成功率提升 | >= 5% |

---

## 2. 核心理念

### 2.1 插件优先（Plugin-First）

系统的扩展点应当通过插件机制暴露，而非要求修改核心代码。每一个新工具、新角色、新生命周期钩子都应当可以以插件形式独立交付：

```
┌─────────────────────────────────────────────────┐
│              Agent Team Core（不可修改）           │
│  AgentLoop / MasterAgent / SubAgent / Memory     │
├─────────────────────────────────────────────────┤
│              Plugin Runtime（插件运行时）           │
│  PluginLoader → PluginSandbox → PluginRegistry   │
├──────────────┬──────────────┬────────────────────┤
│  Tool Plugin │  Role Plugin │  Hook Plugin        │
│  自定义工具   │  自定义角色  │  生命周期钩子         │
└──────────────┴──────────────┴────────────────────┘
```

### 2.2 自我完善（Self-Evolution）

Agent 应当是一个持续改进的系统。每次任务执行后，系统自动评估执行质量，将评估结果反馈给 Prompt 优化器，形成"执行 → 评估 → 优化 → 再执行"的闭环：

```
任务执行
  │
  └─→ SelfEvaluator（质量评估：效率 / 质量 / 资源）
            │
            ↓
      PromptOptimizer（分析历史评估 → 生成 Prompt 变体）
            │
            ↓
      A/B 测试（新旧 Prompt 并行运行）
            │
            ↓
      统计显著性验证 → 采纳最优版本
```

### 2.3 生态开放（Open Ecosystem）

插件不仅是系统的扩展机制，也是知识共享的载体。通过标准化的插件格式，团队成员可以将最佳实践封装为可复用的组件。

---

## 3. 功能需求

### 3.1 P0 功能：插件系统（PluginSystem）

**功能描述**：提供完整的插件生命周期管理能力，包括插件定义、加载、沙箱执行和依赖解析，是 v9.0 所有扩展能力的基础设施。

#### 3.1.1 插件定义格式

**需求**：
- 每个插件由一个目录组成，目录内包含 `plugin.json`（元数据）和实现代码
- `plugin.json` 遵循第 4 节定义的 JSON Schema
- 插件类型：`tool`（工具插件）、`role`（角色插件）、`hook`（生命周期钩子插件）
- 插件入口文件为 ESM 模块（`.js` 或 `.ts` 经编译后的 `.js`）

**目录结构示例**：
```
plugins/
└── my-tool/
    ├── plugin.json       # 插件元数据（必须）
    ├── index.js          # 插件入口（必须，ESM）
    └── README.md         # 插件说明（可选）
```

**验收标准**：
- [ ] `plugin.json` 格式验证失败时，加载器拒绝加载并输出明确错误信息
- [ ] 插件目录缺少 `index.js` 入口文件时，加载失败并给出提示
- [ ] `plugin.json` 中声明的依赖版本与实际安装版本不符时，输出警告但不阻止加载

#### 3.1.2 插件加载器（PluginLoader）

**需求**：
- 从配置的插件目录扫描并加载所有合法插件
- 使用 ESM 动态 `import()` 加载插件入口文件
- 加载顺序：优先加载无依赖插件，再加载有依赖的插件（拓扑排序）
- 支持运行时加载新插件（无需重启系统）
- 加载失败的插件不影响其他插件和系统核心的正常运行

**验收标准**：
- [ ] 启动时自动扫描 `plugins/` 目录，加载所有合法插件
- [ ] 运行时调用 `pluginLoader.load(pluginPath)` 可加载新插件，无需重启
- [ ] 插件加载时间 P99 <= 500ms（单个插件）
- [ ] 循环依赖（A 依赖 B，B 依赖 A）时，两个插件均拒绝加载并报错

#### 3.1.3 插件沙箱（PluginSandbox）

**需求**：
- 插件在受限环境中执行，防止意外修改核心系统状态
- 限制插件可访问的 Node.js 内置模块（黑名单机制）
- 禁止插件直接访问 `process.env` 中的敏感键（API Key 等）
- 插件执行超时保护（默认 30 秒，可配置）
- 插件抛出未捕获异常时，异常被隔离，不传播到宿主进程

**禁止访问的模块黑名单（默认）**：
```
child_process, cluster, worker_threads（系统级进程操作）
```

**验收标准**：
- [ ] 插件尝试调用黑名单模块时，抛出 `PluginSandboxError` 并记录警告日志
- [ ] 插件执行超时后，自动终止并返回超时错误，不阻塞主线程
- [ ] 插件内的未捕获异常被捕获，输出错误日志，系统继续正常运行
- [ ] 插件无法读取 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等敏感环境变量

#### 3.1.4 插件依赖管理

**需求**：
- 插件在 `plugin.json` 的 `dependencies` 字段声明对其他插件的依赖
- 加载器在加载前验证依赖插件已存在且版本兼容
- 依赖解析采用拓扑排序（Kahn 算法），确保加载顺序正确
- 支持可选依赖（`optionalDependencies`），缺失时不阻止加载

**验收标准**：
- [ ] 依赖插件未安装时，加载失败并指明缺少哪个依赖
- [ ] 依赖版本不满足 semver 约束时，输出兼容性警告
- [ ] 10 个插件（含3层依赖关系）的加载顺序与拓扑排序结果一致

---

### 3.2 P0 功能：动态工具注册（DynamicToolLoader）

**功能描述**：允许工具插件在系统运行时被加载、更新和卸载，工具变更立即对所有后续任务生效，无需重启。

#### 3.2.1 从插件动态加载工具

**需求**：
- 工具插件加载成功后，自动将工具注册到 v6 的 `ToolRegistry`
- 工具的接口规范与 v6 原生工具完全一致（`name`、`description`、`parameters`、`execute`）
- 动态加载的工具与内置工具在功能上无差异

**验收标准**：
- [ ] 工具插件加载后，Agent 在下一次任务中即可调用该工具
- [ ] 动态加载的工具出现在 `ToolRegistry.listTools()` 的返回列表中
- [ ] 动态工具的 `execute` 方法签名与 v6 `ITool` 接口完全兼容

#### 3.2.2 工具热更新

**需求**：
- 监听插件目录下工具文件的变化（使用 `fs.watch`）
- 文件变化后自动重新加载插件，更新 `ToolRegistry` 中的工具实现
- 热更新期间正在执行的工具调用不受影响（使用旧版本直到调用完成）
- 热更新事件记录到可观测性日志（v7 `StructuredLogger`）

**验收标准**：
- [ ] 修改工具插件的 `index.js` 文件后，3 秒内 `ToolRegistry` 中的工具实现更新
- [ ] 热更新期间正在进行的工具调用正常完成，不因更新中断
- [ ] 热更新失败（如语法错误）时，保留旧版本工具，输出错误日志

#### 3.2.3 工具版本管理

**需求**：
- `ToolRegistry` 支持同一工具名的多个版本共存
- 工具调用时默认使用最新版本，支持通过参数指定版本（`toolName@1.0.0`）
- 版本历史最多保留 3 个版本，超出时自动淘汰最旧版本

**验收标准**：
- [ ] 工具 v1.0.0 已注册时，加载 v1.1.0 后两个版本均可调用
- [ ] 不指定版本时，调用的是最新版本（semver 最高版本）
- [ ] 第 4 个版本加载时，最旧版本自动从 Registry 中移除

---

### 3.3 P1 功能：Agent 自评估（SelfEvaluator）

**功能描述**：在每次任务完成后自动对执行过程进行多维度质量评估，生成结构化评估报告，并将评估结果存入 v8 知识库供后续分析使用。

#### 3.3.1 任务完成后自动评估

**需求**：
- 监听 `task:completed` 和 `task:failed` 事件
- 分析任务的执行轨迹（来自 v7 Trace 数据）
- 生成三个维度的评估分数（各 1-10 分）：
  - **效率分**：工具调用次数 vs 任务复杂度基准，调用冗余扣分
  - **质量分**：任务输出是否满足预期，通过关键词和结构验证
  - **资源分**：Token 消耗 vs 历史同类任务均值，超出均值扣分
- 综合分 = 效率 × 0.3 + 质量 × 0.5 + 资源 × 0.2

**验收标准**：
- [ ] 任务完成后 3 秒内生成评估报告
- [ ] 评估报告包含三个维度分数及其计算依据
- [ ] 评估结果自动存入 v8 `VectorStore`（category: `evaluation`）
- [ ] 任务失败时，质量分自动为 0，其他维度正常评估

#### 3.3.2 历史评估趋势分析

**需求**：
- 提供 `SelfEvaluator.getTrend(agentId, days)` 接口
- 返回指定 Agent 最近 N 天的评分趋势（每天平均分）
- 识别连续下降趋势（连续 3 天平均分下降超过 10%）
- 下降趋势时触发 `evaluation:declining` 事件，供 `PromptOptimizer` 订阅

**验收标准**：
- [ ] 执行 10 次任务后，`getTrend` 能返回有意义的趋势数据
- [ ] 连续下降检测逻辑与评估结果数据一致
- [ ] 趋势数据可按 Agent 维度独立查询

#### 3.3.3 基于评估的优化建议

**需求**：
- 当单项维度分数连续低于 5 分（连续 3 次以上），生成对应的优化建议
- 建议内容基于规则：
  - 效率分低 → 建议减少工具调用步骤、合并相似查询
  - 质量分低 → 建议细化任务拆分、增加输出验证步骤
  - 资源分低 → 建议压缩 prompt 长度、减少对话轮次
- 建议以事件形式发出，由 `PromptOptimizer` 或用户订阅

**验收标准**：
- [ ] 效率分连续 3 次低于 5 时，生成效率优化建议
- [ ] 优化建议包含具体的调整方向，不是泛泛而谈
- [ ] 优化建议记录到可观测性日志

---

### 3.4 P1 功能：提示词自优化（PromptOptimizer）

**功能描述**：分析历史任务的 system prompt 执行效果，自动生成优化变体，通过 A/B 测试验证效果，推荐最优版本。

#### 3.4.1 Prompt 版本管理

**需求**：
- 为每个 Agent 角色维护 Prompt 版本历史
- 每个版本包含：版本号、Prompt 内容、创建时间、来源（人工/自动优化）
- 存储在 v8 `ProjectKnowledgeBase`（category: `prompt-version`）

**验收标准**：
- [ ] `PromptOptimizer.getVersionHistory(agentId)` 返回版本列表
- [ ] 每次 Prompt 变更自动创建新版本，版本号单调递增
- [ ] 版本历史最多保留 20 个版本

#### 3.4.2 自动生成优化变体

**需求**：
- 订阅 `evaluation:declining` 事件，触发 Prompt 优化流程
- 基于以下策略生成变体（选择其中一种或组合）：
  - **精简策略**：删除冗余说明，减少 prompt 长度 10-20%
  - **强化约束策略**：在 prompt 中增加对低分维度的显式约束
  - **示例注入策略**：从 v8 知识库中检索成功案例，注入 few-shot 示例
- 每次最多生成 2 个变体（避免测试资源浪费）

**验收标准**：
- [ ] 收到 `evaluation:declining` 事件后 10 秒内生成变体
- [ ] 生成的变体与原 prompt 有实质性差异（非空格变化）
- [ ] 变体生成过程记录到日志（选用了哪种策略，为什么）

#### 3.4.3 A/B 测试执行

**需求**：
- A/B 测试配置：每 N 次任务（默认 N=10）中，A 版本使用 6 次，B 版本使用 4 次（60/40 分配）
- 对每个任务记录使用的 Prompt 版本和对应的 `SelfEvaluator` 评分
- 每次 A/B 测试至少累积 20 个样本才进行统计判断

**验收标准**：
- [ ] A/B 流量分配比例误差 <= 5%（统计意义上）
- [ ] 每个任务的 Prompt 版本与评估结果正确关联
- [ ] 样本数不足时，不做统计结论，继续收集数据

#### 3.4.4 效果统计与推荐

**需求**：
- 使用 Welch t-test 判断两个版本的综合评分差异是否显著（p-value < 0.05）
- 差异显著且 B 版本更优时，推荐采纳 B 版本（发出 `prompt:improvement-ready` 事件）
- 推荐采纳后，需人工确认才生效（不自动替换）
- 差异不显著时，保留当前版本，丢弃变体

**验收标准**：
- [ ] 统计检验结果（p-value、效果大小）记录在推荐报告中
- [ ] 推荐操作需调用 `PromptOptimizer.adoptVersion(agentId, versionId)` 确认
- [ ] 采纳新版本后，旧版本进入历史存档（不删除）

---

### 3.5 P2 功能：插件市场（PluginRegistry）

**功能描述**：提供本地化的插件索引和发现机制，让用户能够快速找到并安装可用的插件。

#### 3.5.1 本地插件索引

**需求**：
- 维护一个 YAML 格式的本地插件索引文件（`plugins/registry.yaml`）
- 索引包含每个插件的：名称、版本、描述、类型、作者、安装路径
- 插件加载时自动更新索引

**registry.yaml 格式**：
```yaml
version: "1.0"
updated_at: "2026-02-12T00:00:00Z"
plugins:
  - name: "http-request"
    version: "1.2.0"
    type: "tool"
    description: "发送 HTTP 请求并返回响应结果"
    author: "team-internal"
    path: "./plugins/http-request"
    installed_at: "2026-02-10T10:00:00Z"
    usage_count: 42
    avg_score: 8.3
```

**验收标准**：
- [ ] 插件加载/卸载时，`registry.yaml` 自动更新
- [ ] `PluginRegistry.list()` 返回与 `registry.yaml` 一致的插件列表
- [ ] 索引文件支持人工编辑（不依赖二进制格式）

#### 3.5.2 插件发现与安装

**需求**：
- `PluginRegistry.install(pluginPath)` 从本地目录安装插件（复制到 `plugins/` 目录并加载）
- 安装前验证 `plugin.json` 格式合法性
- 安装时检测同名插件冲突，提示用户是否覆盖

**验收标准**：
- [ ] 从合法的插件目录安装，安装后立即可用（无需重启）
- [ ] 安装重复名称插件时，输出冲突提示，不自动覆盖
- [ ] 安装失败时，不修改现有插件目录状态（原子性）

#### 3.5.3 插件评分与使用统计

**需求**：
- 每次工具插件被调用后，自动累加 `usage_count`
- 将 `SelfEvaluator` 的质量分关联到对应的工具插件，计算 `avg_score`（滚动平均）
- 提供 `PluginRegistry.getStats(pluginName)` 接口查询统计数据

**验收标准**：
- [ ] 工具调用 10 次后，`usage_count` 准确为 10
- [ ] `avg_score` 与最近 100 次调用的 `SelfEvaluator` 质量分均值一致（误差 <= 0.1）
- [ ] 统计数据持久化到 `registry.yaml`，重启后保留

---

## 4. 插件格式规范（plugin.json Schema）

### 4.1 完整 Schema 定义

```typescript
interface PluginManifest {
  // 基础标识（必填）
  name: string;              // 插件唯一名称，格式：kebab-case，如 "http-request"
  version: string;           // 语义化版本号，如 "1.0.0"
  type: PluginType;          // 插件类型

  // 描述信息（必填）
  description: string;       // 插件描述（<= 200 字符）
  author: string;            // 作者标识

  // 入口（必填）
  main: string;              // 入口文件路径（相对于 plugin.json），如 "index.js"

  // 依赖声明（可选）
  dependencies?: {
    [pluginName: string]: string; // semver 版本约束，如 ">=1.0.0 <2.0.0"
  };
  optionalDependencies?: {
    [pluginName: string]: string;
  };

  // 沙箱配置（可选）
  sandbox?: {
    allowedModules?: string[];    // 额外允许的 Node.js 内置模块（白名单追加）
    timeout?: number;             // 执行超时（毫秒，默认 30000）
    memoryLimit?: number;         // 内存限制（MB，默认无限制）
  };

  // 工具插件专属配置（type === 'tool' 时必填）
  tool?: {
    toolName: string;             // 注册到 ToolRegistry 的工具名称
    category: string;             // 工具分类，如 "network"、"file"、"data"
  };

  // 角色插件专属配置（type === 'role' 时必填）
  role?: {
    roleName: string;             // 角色名称
    agentTypes: string[];         // 适用的 Agent 类型，如 ["master", "sub"]
    promptFile: string;           // Prompt 文件路径（相对于 plugin.json）
  };

  // 钩子插件专属配置（type === 'hook' 时必填）
  hook?: {
    events: LifecycleEvent[];     // 订阅的生命周期事件
    priority?: number;            // 钩子执行优先级（数字越小越先执行，默认 100）
  };

  // 元信息（可选）
  homepage?: string;             // 插件主页 URL
  license?: string;              // 许可证，如 "MIT"
  keywords?: string[];           // 关键词，用于插件搜索
}

type PluginType = 'tool' | 'role' | 'hook';

type LifecycleEvent =
  | 'task:before'      // 任务开始前
  | 'task:after'       // 任务结束后
  | 'tool:before'      // 工具调用前
  | 'tool:after'       // 工具调用后
  | 'llm:before'       // LLM 调用前
  | 'llm:after';       // LLM 调用后
```

### 4.2 合法示例

**工具插件示例**（`plugins/http-request/plugin.json`）：
```json
{
  "name": "http-request",
  "version": "1.2.0",
  "type": "tool",
  "description": "发送 HTTP 请求并返回响应结果，支持 GET/POST/PUT/DELETE",
  "author": "team-internal",
  "main": "index.js",
  "dependencies": {},
  "sandbox": {
    "timeout": 10000
  },
  "tool": {
    "toolName": "http_request",
    "category": "network"
  },
  "license": "MIT",
  "keywords": ["http", "network", "api"]
}
```

**角色插件示例**（`plugins/code-reviewer/plugin.json`）：
```json
{
  "name": "code-reviewer",
  "version": "1.0.0",
  "type": "role",
  "description": "专注于代码质量审查的 SubAgent 角色，覆盖安全、性能、可读性三个维度",
  "author": "team-internal",
  "main": "index.js",
  "role": {
    "roleName": "CodeReviewer",
    "agentTypes": ["sub"],
    "promptFile": "prompts/code-reviewer.md"
  },
  "license": "MIT"
}
```

**钩子插件示例**（`plugins/audit-logger/plugin.json`）：
```json
{
  "name": "audit-logger",
  "version": "1.0.0",
  "type": "hook",
  "description": "在每次工具调用前后记录审计日志，用于合规审查",
  "author": "team-internal",
  "main": "index.js",
  "hook": {
    "events": ["tool:before", "tool:after"],
    "priority": 10
  },
  "license": "MIT"
}
```

### 4.3 入口文件规范

插件 `main` 文件必须是 ESM 模块，导出符合对应类型接口的对象：

**工具插件入口（`index.js`）**：
```javascript
// ESM 动态 import 格式
export default {
  name: 'http_request',
  description: '发送 HTTP 请求',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '目标 URL' },
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], default: 'GET' }
    },
    required: ['url']
  },
  async execute(params) {
    // 实现逻辑
    return { status: 200, body: '...' };
  }
};
```

---

## 5. 技术约束

### 5.1 语言与运行时

| 约束 | 说明 |
|------|------|
| TypeScript | 严格模式（`strict: true`），类型覆盖率 > 90% |
| Node.js | >= 18.0.0（使用 `fs.watch`、ESM 动态 `import()`） |
| 模块系统 | ESM（与 v5-v8 保持一致，插件必须使用 ESM 格式） |

### 5.2 向后兼容性约束（不可违反）

| 约束 | 说明 |
|------|------|
| v5 接口兼容 | `MasterAgent`、`SubAgent`、`AgentLoop` 的所有公开接口保持不变 |
| v6 接口兼容 | `ToolRegistry`、`ToolPipeline`、`ITool` 接口保持不变；动态工具通过 `ToolRegistry.register()` 注册 |
| v7 接口兼容 | `StructuredLogger`、`TracingSystem`、`MetricsCollector` 接口保持不变 |
| v8 接口兼容 | `VectorStore`、`AgentMemory`、`ProjectKnowledgeBase` 接口保持不变 |
| 现有配置兼容 | 不引入必填的破坏性配置项；所有 v9 新配置项均有默认值 |

### 5.3 插件技术约束

| 约束 | 说明 |
|------|------|
| ESM 格式强制 | 插件入口文件必须是 ESM（`export default`），禁止 CommonJS |
| 动态 import | 宿主使用 ESM 动态 `import()` 加载插件，不使用 `require()` |
| 无外部网络 | 插件安装不从外部网络下载代码（本地文件系统安装） |
| 无数据库依赖 | 插件不得引入需要外部数据库服务的依赖 |

### 5.4 新增依赖约束

v9.0 允许新增的依赖：

```json
{
  "yaml": "用于解析 registry.yaml（轻量级，若项目已有则复用）",
  "semver": "用于插件版本约束解析（Node.js 生态标准库）"
}
```

v9.0 不引入：
- 插件隔离不使用 `vm2`、`isolated-vm` 等沙箱库（使用白名单模块检查实现轻量隔离）
- 不引入外部插件仓库服务（npm registry、GitHub 等）
- 不引入 A/B 测试框架（自行实现轻量统计）

### 5.5 性能约束

| 指标 | 约束 |
|------|------|
| 插件加载时间 | 单个插件 P99 <= 500ms |
| 工具热更新延迟 | 文件变化到生效 <= 3 秒 |
| 自评估耗时 | 任务完成后 <= 3 秒生成评估报告 |
| PromptOptimizer 变体生成 | <= 10 秒 |
| 插件系统内存开销 | 10 个插件总内存增量 <= 50MB |

---

## 6. 里程碑

### Phase 1：插件基础设施（Week 1-2）

**目标**：实现插件系统的核心基础设施，支持工具插件的加载和热更新

| 任务编号 | 任务名称 | 优先级 | 预计工时 | 输出产物 |
|---------|---------|--------|---------|---------|
| T1 | 实现 PluginLoader（扫描、ESM 动态加载、拓扑排序） | P0 | 3d | `src/v9/plugin/PluginLoader.ts` |
| T2 | 实现 PluginSandbox（黑名单检查、超时保护、异常隔离） | P0 | 2d | `src/v9/plugin/PluginSandbox.ts` |
| T3 | 实现 DynamicToolLoader（工具注册、热更新、版本管理） | P0 | 3d | `src/v9/tool/DynamicToolLoader.ts` |

**Phase 1 验收标准**：
- 3 个工具插件可正式加载并被 Agent 调用
- 修改工具文件 3 秒内热更新生效
- 单元测试覆盖率 >= 80%

---

### Phase 2：自进化能力（Week 3-4）

**目标**：实现 Agent 自评估和 Prompt 自优化的完整闭环

| 任务编号 | 任务名称 | 优先级 | 预计工时 | 输出产物 |
|---------|---------|--------|---------|---------|
| T4 | 实现 SelfEvaluator（三维度评分、趋势分析、优化建议） | P1 | 3d | `src/v9/eval/SelfEvaluator.ts` |
| T5 | 实现 PromptOptimizer（版本管理、变体生成、A/B 测试） | P1 | 4d | `src/v9/optimizer/PromptOptimizer.ts` |

**Phase 2 验收标准**：
- 执行 20 次任务后，SelfEvaluator 趋势分析返回有意义数据
- A/B 测试流量分配误差 <= 5%
- Prompt 优化建议基于实际评估数据生成，非随机内容

---

### Phase 3：插件市场与集成（Week 5）

**目标**：实现本地插件市场，完成系统集成与端到端测试

| 任务编号 | 任务名称 | 优先级 | 预计工时 | 输出产物 |
|---------|---------|--------|---------|---------|
| T6 | 实现 PluginRegistry（YAML 索引、安装流程、统计） | P2 | 2d | `src/v9/registry/PluginRegistry.ts` |
| T7 | plugin.json Schema 验证器 + 3 个示例插件 | P0 | 1d | `src/v9/plugin/PluginValidator.ts`, `plugins/examples/` |
| T8 | 端到端集成测试（插件加载 → 工具调用 → 自评估 → Prompt 优化） | P0 | 2d | `tests/v9/` |

**Phase 3 验收标准**：
- 完整 E2E 场景：加载工具插件 → Agent 调用 → 自评估 → 趋势触发 → 生成变体
- 与 v5-v8 集成无回归（现有测试全部通过）
- 3 个示例插件覆盖三种插件类型（tool/role/hook）

---

### 里程碑汇总

```
Week 1-2: Phase 1 完成
  插件系统可用（加载/沙箱/热更新）
  工具插件可替代硬编码工具注册

Week 3-4: Phase 2 完成
  自评估闭环运行
  A/B 测试框架可收集数据

Week 5: Phase 3 完成 → v9.0.0 发布
  插件市场本地索引可用
  所有 E2E 测试通过
  与 v5-v8 兼容性验证完毕
```

---

## 附录

### A. 与前序版本的关系

```
v5（多智能体核心）
  MasterAgent/SubAgent ─────→ 注入 PluginLoader（Role Plugin 作用于角色初始化）

v6（工具生态）
  ToolRegistry ──────────────→ DynamicToolLoader 向其动态注册工具
  ITool 接口 ────────────────→ 工具插件实现此接口（兼容）

v7（可观测性）
  StructuredLogger ──────────→ PluginLoader/SelfEvaluator 记录操作日志
  TracingSystem ─────────────→ SelfEvaluator 读取 Trace 数据计算效率分

v8（知识库与记忆）
  VectorStore ───────────────→ SelfEvaluator 存储评估结果
  ProjectKnowledgeBase ──────→ PromptOptimizer 存储 Prompt 版本历史和 A/B 测试结果
```

### B. 开放问题（待决策）

| 问题 | 选项 A | 选项 B | 建议 |
|------|--------|--------|------|
| 沙箱实现深度 | 仅模块黑名单检查 | 使用 Node.js `vm` 模块真正隔离 | v9.0 先用黑名单检查，轻量可行；v9.1 根据安全需求升级 |
| Prompt A/B 测试触发 | 仅在评分下降时触发 | 定期（每周）主动触发 | 评分下降时触发，避免无必要的测试资源消耗 |
| 插件角色的 Prompt 优先级 | 覆盖系统内置 Prompt | 追加到系统 Prompt 后 | 追加模式更安全，不破坏内置约束 |
| 多版本工具的默认策略 | 始终用最新版本 | 由 ToolRegistry 配置项控制 | 默认最新版本，提供配置项支持固定版本场景 |
