# Agent Team v8.0 - 知识库架构设计

**版本**: 8.0.0
**状态**: 设计稿
**作者**: 系统架构师
**创建日期**: 2026-02-12

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Agent Team v8.0 架构                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   Layer 3: 长期记忆（Long-term Memory）       │    │
│  │                                                               │    │
│  │   ┌──────────────────┐    ┌──────────────────────────────┐  │    │
│  │   │  VectorStore     │    │  ProjectKnowledgeBase         │  │    │
│  │   │  (TF-IDF 检索)   │◄───│  (版本控制 / 搜索 / I/O)     │  │    │
│  │   │  vectors.json    │    │  .agent-memory/               │  │    │
│  │   └──────────────────┘    └──────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              ▲                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  Layer 2: 情景记忆（Episodic Memory）         │    │
│  │                                                               │    │
│  │   ┌──────────────────┐    ┌──────────────────────────────┐  │    │
│  │   │  AgentMemory     │    │  KnowledgeExtractor           │  │    │
│  │   │  (记忆注入 MW)   │    │  (事件监听 / 自动提取)        │  │    │
│  │   │  episodes.json   │    │  task:completed / tool:error  │  │    │
│  │   └──────────────────┘    └──────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              ▲                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  Layer 1: 工作记忆（Working Memory）          │    │
│  │                                                               │    │
│  │   ┌──────────────────┐    ┌──────────────────────────────┐  │    │
│  │   │  AgentLoop       │    │  MasterAgent / SubAgent       │  │    │
│  │   │  (现有实现)       │    │  (现有实现)                    │  │    │
│  │   │  对话上下文       │    │  任务执行 + 事件发射           │  │    │
│  │   └──────────────────┘    └──────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   REST API 层（P1）                           │    │
│  │   KnowledgeAPI  /api/v1/knowledge  port:3001                 │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 核心模块

### VectorStore (`src/knowledge/vector-store.ts`)

VectorStore 是整个知识库系统的底层存储引擎，负责知识条目的 CRUD 操作、TF-IDF 向量化和余弦相似度检索。

**数据模型**：

```typescript
interface KnowledgeEntry {
  id: string;                    // UUID v4
  namespace: string;             // 命名空间，默认 'global'
  title: string;                 // 知识标题（<= 100 字符）
  content: string;               // 知识正文（Markdown）
  summary: string;               // 自动摘要（<= 200 字符）
  category: KnowledgeCategory;   // 知识分类
  tags: string[];                // 标签列表
  embedding: number[];           // TF-IDF 向量
  embeddingModel: string;        // 'tfidf-v1'
  source: {
    taskId?: string;
    agentId?: string;
    tool?: string;
    manual?: boolean;
  };
  quality: {
    confidence: number;          // 0-1
    verified: boolean;
    usageCount: number;
    successRate: number;
  };
  version: number;
  versions: VersionSnapshot[];   // 最多 20 个历史版本
  status: 'active' | 'deleted' | 'archived';
  createdAt: string;             // ISO 8601
  updatedAt: string;
  accessedAt: string;
}
```

**TF-IDF 向量化算法**：

```
1. 分词：中英文混合分词（空格 + 标点分割）
2. 停用词过滤：过滤常见无意义词（的、了、的、is、the、a 等）
3. TF 计算：词频 = 词在文档中出现次数 / 文档总词数
4. IDF 计算：逆文档频率 = log(总文档数 / 含该词的文档数 + 1)
5. TF-IDF 向量：每个词的 TF * IDF 值
6. 词汇表：动态维护，上限 10,000 词
7. IDF 更新策略：增量更新（每次 CRUD），每 100 次操作触发全量重建
```

**余弦相似度**：

```
cosine(a, b) = dot(a, b) / (norm(a) * norm(b))
dot(a, b) = sum(a[i] * b[i])
norm(v) = sqrt(sum(v[i]^2))
```

**文件持久化**：

- 存储路径：`{workspace}/.agent-memory/knowledge-store.json`
- 写入策略：防抖异步写入（debounce 500ms）+ 进程退出前强制同步写入
- 原子写入：写入临时文件 `.knowledge-store.json.tmp`，完成后 `rename` 到正式路径
- 内存索引：`Map<id, KnowledgeEntry>`，启动时从文件加载

**核心方法**：

```typescript
class VectorStore {
  async add(entry: Omit<KnowledgeEntry, 'id' | 'embedding' | 'createdAt' | 'updatedAt' | 'accessedAt' | 'version' | 'versions'>): Promise<KnowledgeEntry>
  async get(id: string): Promise<KnowledgeEntry | null>
  async update(id: string, patch: Partial<KnowledgeEntry>): Promise<KnowledgeEntry>
  async delete(id: string): Promise<void>  // 软删除
  async search(query: SearchQuery): Promise<SearchResult[]>
  async list(filter: ListFilter): Promise<{ entries: KnowledgeEntry[]; total: number }>
  async getStats(): Promise<StoreStats>
  async flush(): Promise<void>  // 强制持久化
}
```

---

### KnowledgeExtractor (`src/knowledge/extractor.ts`)

KnowledgeExtractor 以观察者模式挂接到 AgentLoop/MasterAgent 的事件系统，从任务执行过程中自动提取知识。

**监听的事件**：

```
task:completed  -> 提取成功方案、工具使用模式
task:failed     -> 提取错误经验和恢复方案
tool:error      -> 提取工具错误和解决方案
knowledge:usage -> 更新知识条目的 usageCount 和 successRate
```

**知识提取规则**（基于正则和关键词）：

```typescript
const EXTRACTION_RULES = {
  'error-solution': [
    /Error:.*\n.*(?:解决|fix|resolved|solution)/i,
    /TypeError|ReferenceError|SyntaxError/,
    /ENOENT|EACCES|ECONNREFUSED/,
  ],
  'best-practice': [
    /(?:建议|推荐|应该|should|recommend|best practice)/i,
    /(?:注意|warning|avoid|不要)/i,
  ],
  'code': [
    /```[\s\S]+```/,
    /function\s+\w+|class\s+\w+|const\s+\w+\s*=/,
  ],
  'decision': [
    /(?:选择|决定|采用|选型|chosen|decided)/i,
    /(?:因为|原因|理由|because|reason)/i,
  ],
};
```

**自动分类逻辑**：

```
1. 遍历 EXTRACTION_RULES 中的每个类别
2. 计算匹配分数（匹配条数 / 规则总条数）
3. 选择得分最高的类别（>= 0.3 阈值）
4. 无匹配则归类为 'context'
```

**重复知识合并**：

- 计算新知识与现有知识的余弦相似度
- 相似度 > 0.9 时：更新现有条目的 `usageCount`，不创建新条目
- 相似度 0.7-0.9 时：创建新条目，但添加 `related` 标签引用

**敏感信息脱敏**：

```typescript
const SENSITIVE_PATTERNS = [
  /[A-Za-z0-9_\-]{20,}(?=["'\s])/g,     // API Key 样式
  /password['":\s]+[^\s'"]+/gi,           // 密码
  /token['":\s]+[^\s'"]+/gi,              // Token
  /Bearer\s+[^\s'"]+/gi,                 // Bearer Token
];
```

---

### AgentMemory (`src/knowledge/agent-memory.ts`)

AgentMemory 是三层记忆系统的统一接口，为每个 Agent 提供记忆管理能力，并通过 middleware 模式注入 LLM 调用。

**情景记忆（Episodic Memory）**：

```typescript
interface EpisodeRecord {
  id: string;
  taskId: string;
  agentId: string;
  taskDescription: string;    // <= 500 字符
  executionSummary: string;   // <= 500 字符，自动生成
  outcome: 'success' | 'failure' | 'partial';
  duration: number;           // ms
  toolsUsed: string[];
  knowledgeUsed: string[];    // 本次检索使用的知识 ID
  startedAt: string;
  completedAt: string;
}
```

- 存储路径：`{workspace}/.agent-memory/episodes.json`（独立文件，不污染知识库）
- 容量限制：最多 1000 条，超出时删除最旧记录
- 持久化：与 VectorStore 相同的原子写入策略

**记忆注入接口**：

```typescript
class AgentMemory {
  // 核心注入接口：在 LLM 调用前获取相关上下文
  async getRelevantContext(query: string, budget: number): Promise<string>

  // 记录任务完成
  async recordEpisode(episode: Omit<EpisodeRecord, 'id'>): Promise<void>

  // 查询情景记忆
  async searchEpisodes(filter: EpisodeFilter): Promise<EpisodeRecord[]>

  // 上下文压缩（超过 80% token 限制时触发）
  async compressContext(messages: Message[]): Promise<Message[]>
}
```

**注入格式**（注入到 system prompt）：

```
[相关知识]
1. [best-practice] {title}: {summary}
2. [error-solution] {title}: {summary}

[近期情景]
- {date}: {executionSummary} ({outcome})
```

**Token 预算控制**：

```
总预算：1000 tokens（可配置）
分配：长期记忆 700 tokens + 情景记忆 300 tokens
截断策略：按 score 从高到低选取，超预算时截断末尾条目
无内容时：不注入任何内容（不添加空白块）
```

---

### ProjectKnowledgeBase (`src/knowledge/project-kb.ts`)

ProjectKnowledgeBase 在 VectorStore 基础上提供项目级管理能力，包括项目隔离、版本控制和 Markdown I/O。

**项目隔离**：

```typescript
class ProjectKnowledgeBase {
  private vectorStore: VectorStore;  // 每个项目独立实例
  private projectRoot: string;

  constructor(projectRoot: string, options?: KBOptions)
  // 路径：{projectRoot}/.agent-memory/knowledge-store.json
}
```

**混合搜索**（语义 + 关键词）：

```
混合分数 = semantic_weight * cosine_score + (1 - semantic_weight) * keyword_score
semantic_weight 默认 0.7
keyword_score = 匹配关键词数 / 查询词总数（全文搜索）
最终结果按混合分数降序排列，去重
```

**Markdown 导出格式**：

```markdown
# 知识库导出 - {projectId}
导出时间: {ISO 8601}
总条目数: {n}

## [{category}] {title}
**标签**: {tag1}, {tag2}
**创建**: {date} | **更新**: {date}
**来源**: {taskId}

{content}

---
```

**Markdown 导入解析**：

```
1. 按 ## 分割条目
2. 解析元数据（标签、日期、来源）
3. 提取 category（从 [] 中读取）
4. 提取 content（元数据之后的内容）
5. 检查重复（title + category 相同则跳过）
6. 无效格式记录 warning，跳过
```

---

## TypeScript 接口定义

```typescript
// src/knowledge/types.ts

export type KnowledgeCategory =
  | 'code'
  | 'error-solution'
  | 'best-practice'
  | 'decision'
  | 'context'
  | 'other';

export interface KnowledgeEntry {
  id: string;
  namespace: string;
  title: string;
  content: string;
  summary: string;
  category: KnowledgeCategory;
  tags: string[];
  embedding: number[];
  embeddingModel: string;
  source: {
    taskId?: string;
    agentId?: string;
    tool?: string;
    manual?: boolean;
  };
  quality: {
    confidence: number;
    verified: boolean;
    usageCount: number;
    successRate: number;
  };
  version: number;
  versions: VersionSnapshot[];
  status: 'active' | 'deleted' | 'archived';
  createdAt: string;
  updatedAt: string;
  accessedAt: string;
}

export interface VersionSnapshot {
  version: number;
  timestamp: string;
  content: string;
  title: string;
  changedBy: string;
}

export interface EpisodeRecord {
  id: string;
  taskId: string;
  agentId: string;
  taskDescription: string;
  executionSummary: string;
  outcome: 'success' | 'failure' | 'partial';
  duration: number;
  toolsUsed: string[];
  knowledgeUsed: string[];
  startedAt: string;
  completedAt: string;
}

export interface SearchQuery {
  text: string;
  category?: KnowledgeCategory;
  tags?: string[];
  namespace?: string;
  topK?: number;              // 默认 5，范围 1-50
  threshold?: number;         // 相似度阈值，默认 0.3
  searchMode?: 'semantic' | 'keyword' | 'hybrid';
  semanticWeight?: number;    // hybrid 模式下语义权重，默认 0.7
  dateRange?: {
    from?: string;
    to?: string;
  };
}

export interface SearchResult {
  entry: KnowledgeEntry;
  score: number;              // 0-1
  matchType: 'semantic' | 'keyword' | 'hybrid';
}

export interface ListFilter {
  category?: KnowledgeCategory;
  tags?: string[];
  namespace?: string;
  status?: 'active' | 'deleted' | 'archived';
  dateRange?: { from?: string; to?: string };
  page?: number;
  pageSize?: number;          // 默认 20，范围 1-100
}

export interface StoreStats {
  total: number;
  byCategory: Record<KnowledgeCategory, number>;
  byStatus: Record<string, number>;
  storageSizeBytes: number;
  lastUpdated: string;
}

export interface EpisodeFilter {
  agentId?: string;
  outcome?: 'success' | 'failure' | 'partial';
  dateRange?: { from?: string; to?: string };
  keyword?: string;
  limit?: number;             // 默认 10
}

export interface KBOptions {
  namespace?: string;         // 默认 'global'
  semanticWeight?: number;    // 混合搜索权重，默认 0.7
  maxVocabSize?: number;      // TF-IDF 词汇表上限，默认 10000
  episodeCapacity?: number;   // 情景记忆最大条数，默认 1000
  tokenBudget?: number;       // 记忆注入 token 预算，默认 1000
  debounceMs?: number;        // 写入防抖时间，默认 500
}
```

---

## 文件结构

```
src/knowledge/
├── types.ts           - 所有 TypeScript 类型定义
├── vector-store.ts    - TF-IDF 向量存储（CRUD + 余弦检索 + 持久化）
├── extractor.ts       - 知识提取器（事件监听 + 规则提取 + 分类）
├── agent-memory.ts    - Agent 记忆系统（三层记忆 + 注入 middleware）
├── project-kb.ts      - 项目知识库（项目隔离 + 混合搜索 + Markdown I/O）
└── index.ts           - 统一导出

src/knowledge/api/
└── knowledge-api.ts   - REST API（fastify，/api/v1/knowledge）

tests/v8/
├── unit/
│   ├── vector-store.test.ts
│   ├── tfidf.test.ts
│   ├── extractor.test.ts
│   ├── agent-memory.test.ts
│   └── project-kb.test.ts
└── e2e/
    ├── knowledge-accumulation.test.ts
    └── memory-injection.test.ts

{workspace}/.agent-memory/
├── knowledge-store.json    - 知识条目存储（VectorStore）
└── episodes.json           - 情景记忆存储（AgentMemory）
```

---

## 关键架构决策

### 决策 1：TF-IDF 而非 Embedding API

**选择**：默认 TF-IDF，可选 OpenAI Embedding
**理由**：满足"无外部向量数据库"约束，离线可用，无 API 费用，对中英文均有效
**权衡**：语义理解能力弱于 Embedding，但对技术文档（错误信息、代码片段）效果足够

### 决策 2：独立文件存储而非嵌入现有存储

**选择**：`.agent-memory/knowledge-store.json` + `.agent-memory/episodes.json`
**理由**：避免污染现有存储，支持手动编辑，格式化 JSON 便于调试
**权衡**：多一个文件，但职责更清晰

### 决策 3：Middleware 模式注入，不修改 AgentLoop

**选择**：AgentMemory 作为 middleware，在 LLM 调用前拦截并注入
**理由**：满足"与 v5/v6/v7 向后兼容"约束，AgentLoop 核心逻辑不变
**权衡**：需要 AgentLoop 支持 middleware 钩子（如果没有，需最小化改动添加）

### 决策 4：情景记忆独立文件

**选择**：`episodes.json` 独立于 `knowledge-store.json`
**理由**：PRD 附录 B 建议独立存储，且情景记忆无需向量化，避免混入 VectorStore
**权衡**：多一个文件 I/O，但逻辑更清晰

### 决策 5：词汇表增量更新 + 阈值触发全量重建

**选择**：增量更新，每 100 次 CRUD 操作触发全量 IDF 重建
**理由**：PRD 附录 B 建议，平衡实时性和性能
**权衡**：全量重建时（~10,000 条）耗时约 500ms，可异步执行

### 决策 6：REST API 使用 Node.js 原生 http 模块

**选择**：Node.js `http` 模块（非 fastify/express）
**理由**：无新依赖，满足"纯 Node.js"约束，P1 功能不需要高性能框架
**权衡**：路由代码稍多，但依赖为零

### 决策 7：REST API 降级为 P1（PRD 标注为 P2）

**选择**：将 REST API 列为 Task 7（P1），与其他 P1 任务同期实现
**理由**：REST API 依赖 VectorStore 和 ProjectKnowledgeBase，在 Phase 3 实现顺序合理

---

## 模块依赖关系

```
types.ts
  ↑
vector-store.ts ─────────────────────────┐
  ↑                                      │
extractor.ts (依赖 vector-store + types)  │
  ↑                                      │
agent-memory.ts (依赖 vector-store)       │
  ↑                                      │
project-kb.ts (依赖 vector-store + types) │
  ↑                                      │
knowledge-api.ts (依赖 project-kb) ───────┘
  ↑
index.ts (统一导出)
```

**外部依赖**（仅读，不修改）：
- `src/ai/agent-loop.ts` - AgentMemory middleware 挂接点
- `src/ai/master-agent.ts` - KnowledgeExtractor 事件监听挂接点
- `src/ai/sub-agent.ts` - KnowledgeExtractor 事件监听挂接点

---

## 性能设计

| 操作 | 设计目标 | 实现策略 |
|------|---------|---------|
| TF-IDF 向量化（单条） | <= 50ms P99 | 内存词汇表，无 I/O |
| 余弦相似度检索（10K 条） | <= 200ms P99 | 内存 Map 全量计算，可加速为 Top-K 堆 |
| 知识写入（含持久化） | <= 10ms（内存），500ms（磁盘） | 防抖异步写入 |
| 记忆注入（LLM 调用前） | <= 50ms | 异步 + 结果缓存（TTL 60s） |
| 启动加载（10K 条） | <= 3s | 流式解析 JSON |

---

## 集成示例

```typescript
// 初始化知识库（在项目启动时）
import { ProjectKnowledgeBase, KnowledgeExtractor, AgentMemory } from './src/knowledge';

const kb = new ProjectKnowledgeBase(process.cwd());
const extractor = new KnowledgeExtractor(kb);
const agentMemory = new AgentMemory(kb);

// 挂接到 MasterAgent 事件
masterAgent.on('task:completed', (event) => extractor.onTaskCompleted(event));
masterAgent.on('task:failed', (event) => extractor.onTaskFailed(event));

// AgentLoop 记忆注入（middleware）
agentLoop.use(async (ctx, next) => {
  const context = await agentMemory.getRelevantContext(ctx.currentTask, 1000);
  if (context) {
    ctx.systemPrompt += `\n\n${context}`;
  }
  await next();
});
```
