# Task 01: KnowledgeEntry 类型系统 + VectorStore 基础

**优先级**: P0
**预计工时**: 4h
**阶段**: Phase 1
**依赖**: 无

---

## 目标

建立整个知识库系统的类型基础和 VectorStore 的骨架（不含向量化，向量化在 Task 2 实现）。本任务完成后，VectorStore 可以完整执行 CRUD 操作和文件持久化，但 `embedding` 字段暂时为空数组。

---

## 实现步骤

### Step 1: 创建类型定义文件（1h）

创建 `src/knowledge/types.ts`，定义以下类型：

```typescript
// 知识分类
export type KnowledgeCategory =
  | 'code'
  | 'error-solution'
  | 'best-practice'
  | 'decision'
  | 'context'
  | 'other';

// 版本快照
export interface VersionSnapshot {
  version: number;
  timestamp: string;      // ISO 8601
  content: string;
  title: string;
  changedBy: string;      // agentId 或 'manual'
}

// 知识条目（完整结构）
export interface KnowledgeEntry {
  id: string;             // UUID v4
  namespace: string;      // 默认 'global'
  title: string;          // <= 100 字符
  content: string;        // Markdown 格式
  summary: string;        // <= 200 字符
  category: KnowledgeCategory;
  tags: string[];
  embedding: number[];    // TF-IDF 向量，Task 2 填充
  embeddingModel: string; // 'tfidf-v1' 或 'none'
  source: {
    taskId?: string;
    agentId?: string;
    tool?: string;
    manual?: boolean;
  };
  quality: {
    confidence: number;   // 0-1
    verified: boolean;
    usageCount: number;
    successRate: number;  // 0-1
  };
  version: number;        // 从 1 开始
  versions: VersionSnapshot[];  // 最多 20 个
  status: 'active' | 'deleted' | 'archived';
  createdAt: string;
  updatedAt: string;
  accessedAt: string;
}

// 情景记录
export interface EpisodeRecord {
  id: string;
  taskId: string;
  agentId: string;
  taskDescription: string;   // <= 500 字符
  executionSummary: string;  // <= 500 字符
  outcome: 'success' | 'failure' | 'partial';
  duration: number;          // 毫秒
  toolsUsed: string[];
  knowledgeUsed: string[];
  startedAt: string;
  completedAt: string;
}

// 搜索查询
export interface SearchQuery {
  text: string;
  category?: KnowledgeCategory;
  tags?: string[];
  namespace?: string;
  topK?: number;          // 默认 5，1-50
  threshold?: number;     // 默认 0.3
  searchMode?: 'semantic' | 'keyword' | 'hybrid';
  semanticWeight?: number; // hybrid 模式，默认 0.7
  dateRange?: { from?: string; to?: string };
}

// 搜索结果
export interface SearchResult {
  entry: KnowledgeEntry;
  score: number;          // 0-1
  matchType: 'semantic' | 'keyword' | 'hybrid';
}

// 列表过滤
export interface ListFilter {
  category?: KnowledgeCategory;
  tags?: string[];
  namespace?: string;
  status?: 'active' | 'deleted' | 'archived';
  dateRange?: { from?: string; to?: string };
  page?: number;          // 从 1 开始
  pageSize?: number;      // 默认 20，1-100
}

// 统计信息
export interface StoreStats {
  total: number;
  active: number;
  byCategory: Partial<Record<KnowledgeCategory, number>>;
  storageSizeBytes: number;
  lastUpdated: string;
}

// VectorStore 配置
export interface VectorStoreOptions {
  storagePath: string;
  maxVocabSize?: number;   // TF-IDF 词汇表上限，默认 10000
  debounceMs?: number;     // 写入防抖，默认 500
}
```

### Step 2: 实现 VectorStore 骨架（2h）

创建 `src/knowledge/vector-store.ts`：

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  KnowledgeEntry, KnowledgeCategory, SearchQuery, SearchResult,
  ListFilter, StoreStats, VersionSnapshot, VectorStoreOptions
} from './types';

interface StoreFile {
  version: string;
  metadata: {
    projectId: string;
    createdAt: string;
    updatedAt: string;
    totalEntries: number;
    embedderConfig: { type: string; version: string };
  };
  entries: KnowledgeEntry[];
}

export class VectorStore {
  private index: Map<string, KnowledgeEntry> = new Map();
  private storagePath: string;
  private tmpPath: string;
  private debounceTimer: NodeJS.Timeout | null = null;
  private dirty: boolean = false;
  private options: Required<VectorStoreOptions>;

  constructor(options: VectorStoreOptions) { /* ... */ }

  // 初始化（从文件加载）
  async initialize(): Promise<void> { /* ... */ }

  // CRUD
  async add(input: CreateEntryInput): Promise<KnowledgeEntry> { /* ... */ }
  async get(id: string): Promise<KnowledgeEntry | null> { /* ... */ }
  async update(id: string, patch: UpdateEntryPatch): Promise<KnowledgeEntry> { /* ... */ }
  async delete(id: string): Promise<void> { /* 软删除 */ }
  async list(filter?: ListFilter): Promise<{ entries: KnowledgeEntry[]; total: number }> { /* ... */ }

  // 搜索（Task 3 实现）
  async search(query: SearchQuery): Promise<SearchResult[]> {
    throw new Error('Not implemented - Task 3');
  }

  // 向量化（Task 2 实现）
  vectorize(text: string): number[] {
    return []; // 占位，Task 2 实现
  }

  // 统计
  async getStats(): Promise<StoreStats> { /* ... */ }

  // 持久化
  async flush(): Promise<void> { /* 强制写入 */ }
  private scheduleSave(): void { /* 防抖写入 */ }
  private async atomicWrite(): Promise<void> {
    // 写入临时文件，再 rename
    // fs.writeFileSync(this.tmpPath, JSON.stringify(data, null, 2))
    // fs.renameSync(this.tmpPath, this.storagePath)
  }
}
```

**CRUD 实现要点**：
- `add`：生成 UUID v4（`crypto.randomUUID()`），设置 `version=1, versions=[], status='active'`，调用 `vectorize()` 获取 embedding
- `update`：先将当前版本快照推入 `versions`，版本数超 20 时删除最旧，更新字段，重新向量化
- `delete`：只将 `status` 设为 `'deleted'`，不从 Map 中删除，更新 `updatedAt`
- `list`：从 Map 中过滤，支持分页（`slice`）

### Step 3: 文件持久化实现（0.5h）

**防抖写入**：

```typescript
private scheduleSave(): void {
  this.dirty = true;
  if (this.debounceTimer) clearTimeout(this.debounceTimer);
  this.debounceTimer = setTimeout(() => {
    this.atomicWrite().catch(console.error);
  }, this.options.debounceMs);
}
```

**原子写入**：

```typescript
private async atomicWrite(): Promise<void> {
  const data: StoreFile = {
    version: '1.0.0',
    metadata: {
      projectId: path.basename(path.dirname(this.storagePath)),
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString(),
      totalEntries: this.index.size,
      embedderConfig: { type: 'tfidf', version: '1.0' },
    },
    entries: Array.from(this.index.values()),
  };
  const json = JSON.stringify(data, null, 2);
  await fs.promises.writeFile(this.tmpPath, json, 'utf8');
  await fs.promises.rename(this.tmpPath, this.storagePath);
  this.dirty = false;
}
```

**进程退出前强制写入**：

```typescript
// 在 constructor 中注册
process.on('exit', () => {
  if (this.dirty) {
    // 同步写入（exit 事件中不能用异步）
    const data = this.buildStoreFile();
    fs.writeFileSync(this.tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(this.tmpPath, this.storagePath);
  }
});
```

**注意**：注册 exit 处理器时需要防止重复注册（多个 VectorStore 实例的情况）。

### Step 4: 创建统一导出（0.5h）

创建 `src/knowledge/index.ts`：

```typescript
export { VectorStore } from './vector-store';
export { KnowledgeExtractor } from './extractor';        // Task 4
export { AgentMemory } from './agent-memory';            // Task 5
export { ProjectKnowledgeBase } from './project-kb';     // Task 6
export * from './types';
```

注意：extractor/agent-memory/project-kb 在后续 Task 中创建，此时用空占位导出或条件导出。

---

## 文件结构

```
src/knowledge/
├── types.ts         ← Task 1 创建
├── vector-store.ts  ← Task 1 骨架，Task 2/3 完善
└── index.ts         ← Task 1 创建
```

---

## 验收标准

- [ ] `src/knowledge/types.ts` 中所有类型定义完整，TypeScript 编译无错误
- [ ] `VectorStore.add()` 创建条目，`get()` 可按 ID 检索
- [ ] `VectorStore.update()` 自动保存前一版本到 `versions`，版本数超 20 时删除最旧
- [ ] `VectorStore.delete()` 执行软删除（status='deleted'），不物理删除
- [ ] `VectorStore.list()` 支持分页，pageSize 范围 1-100
- [ ] 文件写入使用原子写入（临时文件 + rename）
- [ ] 防抖写入：500ms 内多次修改只触发一次写入
- [ ] 进程退出前通过 `process.on('exit')` 触发同步写入
- [ ] 目录不存在时自动创建（`fs.mkdirSync(dir, { recursive: true })`）
- [ ] 单元测试：`tests/v8/unit/vector-store.test.ts` 覆盖以上所有操作
