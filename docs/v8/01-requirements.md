# Agent Team v8.0 产品需求文档（PRD）

**版本**: 8.0.0
**状态**: 草案
**作者**: 产品经理
**创建日期**: 2026-02-12
**上一版本**: v7.0（可观测性：StructuredLogger/TracingSystem/Metrics/WorkflowCheckpoint）

---

## 1. 版本概述

### 1.1 背景与动机

Agent Team 经过七个版本的演进，已具备多智能体协作（v5）、工具生态（v6）、可观测性（v7）等核心能力。然而，当前系统存在一个根本性缺陷：**每次任务执行都是无状态的**，Agent 无法从过去的经验中学习，无法积累知识，无法跨任务共享信息。

这导致以下问题：
- 重复性任务效率低下，每次从零开始
- 遇到相同错误时无法自动应用已知解决方案
- SubAgent 之间的知识孤岛现象严重
- 项目上下文在任务间完全丢失

### 1.2 版本主题

**v8.0 主题：知识库与持久化记忆（Knowledge Base & Persistent Memory）**

为 Agent 系统引入三层记忆模型，让 Agent 具备持续学习和知识积累的能力，从"无状态执行者"进化为"有经验的智能体"。

### 1.3 版本目标

| 目标 | 度量标准 | 目标值 |
|------|---------|--------|
| 知识复用率 | 重复任务中检索到相关知识的比例 | >= 70% |
| 知识提取精度 | 自动提取知识的准确率 | >= 80% |
| 检索延迟 | P99 知识检索时间 | <= 200ms |
| 记忆注入覆盖 | LLM 调用中有记忆注入的比例 | >= 90% |

---

## 2. 核心理念：三层记忆模型

参考人类认知科学中的记忆分层理论，v8.0 为 Agent 引入三层记忆架构：

```
┌─────────────────────────────────────────────────────┐
│                   三层记忆模型                        │
├─────────────────────────────────────────────────────┤
│  Layer 1: 工作记忆（Working Memory）                  │
│  - 范围：当前任务执行期间                              │
│  - 容量：整个对话上下文（AgentLoop 已实现）            │
│  - 生命周期：任务结束即清除                            │
│  - 示例：当前工具调用结果、中间推理步骤                 │
├─────────────────────────────────────────────────────┤
│  Layer 2: 情景记忆（Episodic Memory）                 │
│  - 范围：历史任务摘要                                 │
│  - 容量：最近 N 条任务记录（可配置）                   │
│  - 生命周期：持久化，按时间衰减                        │
│  - 示例：2026-02-10 完成了 API 开发，使用了 Express    │
├─────────────────────────────────────────────────────┤
│  Layer 3: 长期记忆（Long-term Memory）                │
│  - 范围：结构化知识条目                               │
│  - 容量：无限制（文件持久化）                          │
│  - 生命周期：永久，支持版本控制                        │
│  - 示例：最佳实践、错误解决方案、技术决策               │
└─────────────────────────────────────────────────────┘
```

### 2.1 记忆流转机制

```
任务执行
  │
  ├─→ 工作记忆（实时）
  │     │
  │     └─→ 任务完成时 → KnowledgeExtractor 提取
  │                           │
  │               ┌───────────┴────────────┐
  │               ↓                        ↓
  │         情景记忆（任务摘要）      长期记忆（知识条目）
  │
  └─→ 下一个任务开始时 → AgentMemory 检索
                              │
                    注入 system prompt
```

---

## 3. 功能需求

### 3.1 P0 功能：向量化知识存储（VectorStore）

**功能描述**：提供知识条目的向量化存储和相似度检索能力，是整个知识库系统的底层基础设施。

#### 3.1.1 文本向量化

**需求**：
- 支持两种向量化策略：本地 TF-IDF 和 LLM Embedding API
- 默认使用 TF-IDF（离线，无 API 费用）
- 配置项 `embedder: 'tfidf' | 'openai' | 'custom'`
- 向量维度：TF-IDF 动态维度，OpenAI text-embedding-3-small 为 1536 维

**验收标准**：
- [ ] TF-IDF 向量化可在离线环境运行
- [ ] 同一文本多次向量化结果一致（幂等）
- [ ] 向量化延迟 P99 <= 50ms（TF-IDF）
- [ ] 支持中英文混合文本

#### 3.1.2 向量相似度检索

**需求**：
- 使用余弦相似度（Cosine Similarity）计算文本相关性
- 支持 Top-K 检索（默认 K=5）
- 支持相似度阈值过滤（默认 threshold=0.3）
- 支持按知识类别过滤检索

**验收标准**：
- [ ] 相同语义的文本相似度 >= 0.7
- [ ] 完全不相关的文本相似度 <= 0.2
- [ ] Top-K 检索支持 K 值范围：1-50
- [ ] 检索延迟 P99 <= 200ms（10,000 条知识库）

#### 3.1.3 知识条目 CRUD

**需求**：
- Create：创建知识条目，自动计算向量
- Read：按 ID 精确查询
- Update：更新内容，重新计算向量，保留历史版本
- Delete：软删除（标记 deleted，不物理删除）
- List：分页列表，支持按类别、标签、时间过滤

**验收标准**：
- [ ] 所有 CRUD 操作完成后立即持久化
- [ ] Update 操作自动保存前一版本到 `versions` 数组
- [ ] Delete 操作保留数据（软删除），支持恢复
- [ ] List 操作支持分页（pageSize 1-100）

#### 3.1.4 文件持久化

**需求**：
- 存储格式：JSON 文件
- 默认路径：`{project_root}/.agent-memory/knowledge-store.json`
- 支持自定义存储路径
- 写入策略：异步写入，带防抖（debounce 500ms）
- 启动时自动加载，关闭时强制同步写入

**验收标准**：
- [ ] 进程异常退出后数据不丢失（使用临时文件 + rename 原子写入）
- [ ] 存储文件支持手动编辑（格式化 JSON）
- [ ] 文件大小超过 50MB 时触发压缩归档

---

### 3.2 P0 功能：知识提取器（KnowledgeExtractor）

**功能描述**：监听 Agent 的任务执行过程，自动从执行结果中提取有价值的知识条目。

#### 3.2.1 从任务结果提取知识

**需求**：
- 监听 `task:completed` 事件
- 分析任务输入、工具调用序列、最终输出
- 提取：使用了哪些工具、采用了什么方案、结果如何
- 生成结构化知识条目

**验收标准**：
- [ ] 任务完成后 <= 2 秒内完成知识提取
- [ ] 提取的知识条目有明确的 `source.taskId` 引用
- [ ] 重复知识（相似度 > 0.9）自动合并而非重复创建

#### 3.2.2 从错误中提取经验

**需求**：
- 监听 `task:failed`、`tool:error` 事件
- 提取错误信息、错误上下文、恢复方案
- 知识类型标记为 `error-solution`
- 关联错误堆栈的关键信息（脱敏处理）

**验收标准**：
- [ ] 捕获所有 Error 类型的异常
- [ ] 错误知识包含：错误类型、触发条件、解决方案
- [ ] 敏感信息（API Key、密码）自动脱敏

#### 3.2.3 从成功方案中提取最佳实践

**需求**：
- 识别被多次成功使用的方案（执行 >= 3 次，成功率 >= 80%）
- 自动升级为 `best-practice` 类型知识
- 为最佳实践打 `verified` 标签

**验收标准**：
- [ ] 最佳实践识别算法可配置（次数阈值、成功率阈值）
- [ ] 升级为最佳实践时发送 `knowledge:promoted` 事件

#### 3.2.4 知识分类

**需求**：
- 自动分类为以下类型：
  - `code`：代码片段、实现方案
  - `error-solution`：错误及其解决方案
  - `best-practice`：验证过的最佳实践
  - `decision`：技术决策及其理由
  - `context`：项目上下文信息
- 支持多标签（tags）

**验收标准**：
- [ ] 自动分类准确率 >= 70%（基于关键词规则）
- [ ] 支持手动修正分类
- [ ] 每个知识条目至少有一个分类

---

### 3.3 P1 功能：Agent 记忆系统（AgentMemory）

**功能描述**：为每个 Agent（包括 MasterAgent 和 SubAgent）提供统一的记忆管理接口，实现三层记忆的协调管理。

#### 3.3.1 短期记忆（Working Memory）

**需求**：
- 复用 AgentLoop 现有的上下文管理
- 增加结构化标注（标记哪些是工具结果、哪些是推理步骤）
- 支持上下文摘要压缩（超过 token 限制时自动摘要）

**验收标准**：
- [ ] 与 AgentLoop 现有实现无缝集成，不破坏现有功能
- [ ] 上下文超过 80% token 限制时自动触发摘要压缩

#### 3.3.2 长期记忆（Long-term Memory）

**需求**：
- 基于 VectorStore 实现
- 每个 Agent 可有独立命名空间或共享全局命名空间
- 支持记忆的增加、检索、更新

**验收标准**：
- [ ] MasterAgent 和 SubAgent 可访问同一个知识库
- [ ] 支持 `namespace` 隔离（可选）

#### 3.3.3 情景记忆（Episodic Memory）

**需求**：
- 每次任务完成时自动记录情景摘要
- 摘要内容：任务ID、时间戳、任务描述、执行摘要、结果状态、耗时
- 最多保留最近 1000 条情景记录
- 支持按时间范围和关键词搜索情景记忆

**验收标准**：
- [ ] 情景记忆自动持久化到文件
- [ ] 支持查询："最近7天做了什么任务"
- [ ] 情景摘要压缩到 <= 500 字符

#### 3.3.4 工作记忆注入（Memory Injection）

**需求**：
- 在每次 LLM API 调用前执行记忆检索
- 检索当前任务相关的长期记忆（Top-5）
- 检索最近相关情景记忆（最近3条）
- 将检索结果注入 system prompt 的指定位置
- 注入内容有 token 预算限制（默认 1000 tokens）

**注入格式**：
```
[相关知识]
1. [best-practice] 使用 Express.js 时应设置 helmet 中间件防止常见 Web 漏洞
2. [error-solution] TypeError: Cannot read property 'x' of undefined -> 检查对象初始化

[近期情景]
- 2026-02-10: 完成了用户认证模块开发，使用 JWT，耗时 2h
```

**验收标准**：
- [ ] 记忆注入对 Agent 逻辑透明（通过 middleware 实现）
- [ ] 注入内容不超过配置的 token 预算
- [ ] 无相关记忆时不注入空内容

---

### 3.4 P1 功能：项目知识库（ProjectKnowledgeBase）

**功能描述**：在 VectorStore 基础上提供项目级别的知识管理能力，包含版本控制、搜索 API 和导入导出。

#### 3.4.1 项目级知识管理

**需求**：
- 每个项目有独立的知识库实例
- 项目知识库路径：`{project_root}/.agent-memory/`
- 支持知识库初始化、重置、统计

**验收标准**：
- [ ] 不同项目的知识库完全隔离
- [ ] 提供 `stats()` 方法返回：总条数、各类别条数、存储大小

#### 3.4.2 知识版本控制

**需求**：
- 每次 Update 操作自动创建版本快照
- 版本存储在条目的 `versions` 数组中
- 支持查看版本历史
- 支持回滚到指定版本

**验收标准**：
- [ ] 版本快照包含：版本号、时间戳、修改前的内容
- [ ] 单个条目最多保留 20 个历史版本（超出自动删除最旧版本）
- [ ] 回滚操作本身也创建新版本（可审计）

#### 3.4.3 知识搜索 API

**需求**：
- 语义搜索：基于向量相似度
- 关键词搜索：基于文本匹配（全文搜索）
- 混合搜索：语义 + 关键词加权组合
- 过滤条件：类别、标签、时间范围、来源

**验收标准**：
- [ ] 搜索 API 统一返回格式（score + entry）
- [ ] 混合搜索权重可配置（semantic_weight: 0-1）
- [ ] 空知识库时搜索返回空数组，不报错

#### 3.4.4 知识导入/导出

**需求**：
- 导出格式：Markdown 文件（人类可读）
- 导入支持：Markdown 格式、JSON 格式
- 导出时包含元数据（创建时间、类别、标签）
- 支持选择性导出（按类别、标签过滤）

**Markdown 导出格式**：
```markdown
# 知识库导出 - Agent Team
导出时间: 2026-02-12
总条目数: 42

## [best-practice] 使用 helmet 保护 Express 应用
**标签**: express, security, nodejs
**创建**: 2026-02-10 | **更新**: 2026-02-11
**来源**: task-abc123

使用 Express.js 时应在应用初始化时添加 helmet 中间件...
```

**验收标准**：
- [ ] 导出的 Markdown 文件可被人类直接阅读和编辑
- [ ] 导入操作支持增量导入（跳过已存在的条目）
- [ ] 导入时验证数据格式，无效条目跳过并记录警告

---

### 3.5 P2 功能：知识库 REST API

**功能描述**：提供 HTTP REST API，允许外部工具和系统访问知识库。

#### 3.5.1 CRUD 端点

```
POST   /api/v1/knowledge          创建知识条目
GET    /api/v1/knowledge/:id      获取单个条目
PUT    /api/v1/knowledge/:id      更新条目
DELETE /api/v1/knowledge/:id      删除条目（软删除）
GET    /api/v1/knowledge          列表查询（分页）
```

#### 3.5.2 搜索端点

```
POST   /api/v1/knowledge/search   语义/关键词/混合搜索
GET    /api/v1/knowledge/search?q=xxx  简单关键词搜索
```

#### 3.5.3 统计端点

```
GET    /api/v1/knowledge/stats    知识库统计信息
GET    /api/v1/knowledge/export   导出（查询参数控制格式和过滤）
POST   /api/v1/knowledge/import   导入
```

**验收标准**：
- [ ] 所有端点返回标准 JSON 格式（code/data/message）
- [ ] 错误响应包含明确的错误码和描述
- [ ] API 支持 CORS（用于 Web 工具集成）
- [ ] 默认端口 3001，可配置

---

## 4. 数据模型

### 4.1 KnowledgeEntry（知识条目）

```typescript
interface KnowledgeEntry {
  // 基础标识
  id: string;                    // UUID v4
  namespace: string;             // 命名空间，默认 'global'

  // 内容
  title: string;                 // 知识标题（简短，<= 100 字符）
  content: string;               // 知识正文（Markdown 格式）
  summary: string;               // 自动生成的摘要（<= 200 字符）

  // 分类
  category: KnowledgeCategory;   // 知识类别
  tags: string[];                // 标签列表

  // 向量
  embedding: number[];           // 向量表示（维度取决于 embedder）
  embeddingModel: string;        // 使用的向量化模型标识

  // 来源追溯
  source: {
    taskId?: string;             // 来源任务 ID
    agentId?: string;            // 来源 Agent ID
    tool?: string;               // 来源工具名
    manual?: boolean;            // 是否手动创建
  };

  // 质量指标
  quality: {
    confidence: number;          // 置信度 0-1（自动提取时较低）
    verified: boolean;           // 是否经过验证
    usageCount: number;          // 被检索并使用的次数
    successRate: number;         // 作为方案被采用后的成功率
  };

  // 版本控制
  version: number;               // 当前版本号（从 1 开始）
  versions: VersionSnapshot[];   // 历史版本快照

  // 状态
  status: 'active' | 'deleted' | 'archived';

  // 时间戳
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
  accessedAt: string;            // 最后访问时间
}

type KnowledgeCategory =
  | 'code'           // 代码片段、实现方案
  | 'error-solution' // 错误及解决方案
  | 'best-practice'  // 验证过的最佳实践
  | 'decision'       // 技术决策
  | 'context'        // 项目上下文
  | 'other';         // 其他

interface VersionSnapshot {
  version: number;
  timestamp: string;
  content: string;
  title: string;
  changedBy: string;   // agentId 或 'manual'
}
```

### 4.2 EpisodeRecord（情景记录）

```typescript
interface EpisodeRecord {
  id: string;
  taskId: string;
  agentId: string;

  // 任务信息
  taskDescription: string;      // 任务原始描述（截断到 500 字符）
  executionSummary: string;     // 执行摘要（自动生成，<= 500 字符）
  outcome: 'success' | 'failure' | 'partial';

  // 统计
  duration: number;             // 执行时长（毫秒）
  toolsUsed: string[];          // 使用的工具列表
  knowledgeUsed: string[];      // 使用的知识条目 ID 列表

  // 时间
  startedAt: string;
  completedAt: string;
}
```

### 4.3 VectorStore 文件格式

```json
{
  "version": "1.0.0",
  "metadata": {
    "projectId": "agent-team",
    "createdAt": "2026-02-12T00:00:00Z",
    "updatedAt": "2026-02-12T12:00:00Z",
    "totalEntries": 42,
    "embedderConfig": {
      "type": "tfidf",
      "version": "1.0"
    }
  },
  "entries": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "namespace": "global",
      "title": "使用 helmet 保护 Express 应用",
      "content": "...",
      "summary": "Express 应用安全最佳实践：使用 helmet 中间件",
      "category": "best-practice",
      "tags": ["express", "security"],
      "embedding": [0.12, 0.34, ...],
      "embeddingModel": "tfidf-v1",
      "source": { "taskId": "task-abc123", "manual": false },
      "quality": {
        "confidence": 0.85,
        "verified": true,
        "usageCount": 7,
        "successRate": 0.95
      },
      "version": 2,
      "versions": [
        {
          "version": 1,
          "timestamp": "2026-02-10T10:00:00Z",
          "content": "...",
          "title": "Express 安全配置",
          "changedBy": "agent-master-001"
        }
      ],
      "status": "active",
      "createdAt": "2026-02-10T10:00:00Z",
      "updatedAt": "2026-02-11T15:30:00Z",
      "accessedAt": "2026-02-12T09:00:00Z"
    }
  ]
}
```

### 4.4 TF-IDF 向量化说明

为满足"不使用外部向量数据库"的技术约束，采用本地 TF-IDF 向量化：

```
向量维度 = 词汇表大小（动态，初始 0，随知识库增长）
相似度计算 = 余弦相似度（dot_product / (norm_a * norm_b)）
词汇处理 = 分词（中英文）+ 停用词过滤 + 词干化（英文）
IDF 更新 = 每次增删条目时重新计算全局 IDF
```

注意：当知识库较大时，TF-IDF 向量维度可能较高，可配置词汇表上限（默认 10,000 词）。

---

## 5. 技术约束

### 5.1 强制约束（不可违反）

| 约束 | 说明 |
|------|------|
| 不使用外部向量数据库 | 禁止引入 Pinecone、Weaviate、Chroma、Milvus 等外部向量数据库 |
| 纯 Node.js 实现 | 所有功能使用 Node.js 原生能力和已有依赖实现 |
| 文件存储 | 持久化只使用本地文件系统（JSON 文件），不引入数据库 |
| 向量计算本地化 | 余弦相似度计算在本地完成，不调用外部计算服务 |

### 5.2 推荐技术选型

| 功能 | 推荐方案 | 备选方案 |
|------|---------|---------|
| 向量化 | 自实现 TF-IDF | OpenAI text-embedding-3-small API |
| 文件 I/O | Node.js `fs/promises` | - |
| JSON 序列化 | 内置 `JSON.stringify/parse` | - |
| 分词 | 自实现（空格+标点分词） | `natural` npm 包 |
| HTTP API (P2) | `fastify` 或 Node.js `http` | `express` |

### 5.3 性能约束

| 指标 | 约束 |
|------|------|
| 内存占用（知识库 10,000 条） | <= 200MB |
| 启动加载时间（知识库 10,000 条） | <= 3 秒 |
| 检索延迟 P99（10,000 条） | <= 200ms |
| 知识提取延迟 | <= 2 秒/任务 |

### 5.4 兼容性约束

- Node.js 版本：>= 18.0.0
- 与 v5/v6/v7 现有接口完全向后兼容
- AgentMemory 通过 middleware 模式集成，不修改 AgentLoop 核心逻辑

---

## 6. 里程碑

### Phase 1：存储基础设施（Week 1-2）

**目标**：实现知识存储和向量检索的底层能力

| 任务编号 | 任务名称 | 优先级 | 预计工时 | 输出产物 |
|---------|---------|--------|---------|---------|
| T1 | 实现 TF-IDF 向量化引擎 | P0 | 2d | `src/v8/embedders/TFIDFEmbedder.ts` |
| T2 | 实现 VectorStore（CRUD + 余弦相似度检索） | P0 | 3d | `src/v8/store/VectorStore.ts` |
| T3 | 实现文件持久化（原子写入 + 防抖） | P0 | 1d | `src/v8/store/FileStorage.ts` |

**Phase 1 验收标准**：
- VectorStore 可在 10,000 条数据下 200ms 内完成检索
- 进程崩溃不丢失数据
- 单元测试覆盖率 >= 80%

---

### Phase 2：知识管理层（Week 3-4）

**目标**：实现知识提取、Agent 记忆系统和项目知识库

| 任务编号 | 任务名称 | 优先级 | 预计工时 | 输出产物 |
|---------|---------|--------|---------|---------|
| T4 | 实现 KnowledgeExtractor（监听事件 + 自动提取） | P0 | 3d | `src/v8/extractor/KnowledgeExtractor.ts` |
| T5 | 实现 AgentMemory（三层记忆 + 注入 middleware） | P1 | 3d | `src/v8/memory/AgentMemory.ts` |
| T6 | 实现 ProjectKnowledgeBase（版本控制 + 导入导出） | P1 | 2d | `src/v8/kb/ProjectKnowledgeBase.ts` |

**Phase 2 验收标准**：
- Agent 执行任务后自动提取知识
- 记忆注入对现有 AgentLoop 透明
- 支持 Markdown 格式导出

---

### Phase 3：集成与 API（Week 5）

**目标**：完成系统集成、REST API 和端到端测试

| 任务编号 | 任务名称 | 优先级 | 预计工时 | 输出产物 |
|---------|---------|--------|---------|---------|
| T7 | 实现知识库 REST API | P2 | 2d | `src/v8/api/KnowledgeAPI.ts` |
| T8 | 端到端集成测试 + 性能基准测试 | P0 | 2d | `tests/v8/` |

**Phase 3 验收标准**：
- 完整 E2E 测试通过（模拟多任务知识积累场景）
- 性能基准测试达标（见第 5.3 节）
- 与 v5/v6/v7 集成无回归

---

### 里程碑汇总

```
Week 1-2: Phase 1 完成
  ✓ VectorStore 可用
  ✓ 文件持久化稳定

Week 3-4: Phase 2 完成
  ✓ 知识自动提取运行
  ✓ Agent 记忆注入生效
  ✓ 项目知识库 API 可用

Week 5: Phase 3 完成 → v8.0.0 发布
  ✓ REST API 可用
  ✓ 所有测试通过
  ✓ 性能指标达标
```

---

## 附录

### A. 与前序版本的关系

```
v5（多智能体核心）
  AgentLoop ─────────────────→ AgentMemory（短期记忆复用）
  MasterAgent/SubAgent ──────→ 注入 AgentMemory

v6（工具生态）
  ToolPipeline ──────────────→ KnowledgeExtractor（监听工具执行结果）

v7（可观测性）
  TracingSystem ─────────────→ 为知识提取提供执行上下文
  StructuredLogger ──────────→ 记录知识操作日志
  WorkflowCheckpoint ────────→ 情景记忆的执行摘要来源
```

### B. 开放问题（待决策）

| 问题 | 选项 A | 选项 B | 建议 |
|------|--------|--------|------|
| TF-IDF 词汇表更新策略 | 增量更新（新词加入） | 定期全量重建 | 增量更新，每 100 条触发全量重建 |
| 记忆命名空间 | 全局共享 | Agent 级别隔离 | 默认共享，支持隔离配置 |
| 情景记忆存储位置 | 独立文件 | 与知识库合并 | 独立文件（避免污染知识库） |
| P2 API 认证 | 无认证（本地开发） | Token 认证 | v8.0 无认证，v8.1 加入 |
