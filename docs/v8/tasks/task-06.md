# Task 06: ProjectKnowledgeBase - 项目隔离 + Markdown I/O

**优先级**: P1
**预计工时**: 4h
**阶段**: Phase 2
**依赖**: Task 3（VectorStore 完整实现）

---

## 目标

实现 ProjectKnowledgeBase，在 VectorStore 基础上提供项目级知识管理能力，包括：项目隔离（每个项目独立存储）、版本控制（每次更新保存快照）、混合搜索（语义 + 关键词）、Markdown 导入导出。

---

## 实现步骤

### Step 1: ProjectKnowledgeBase 基础结构（0.5h）

```typescript
// src/knowledge/project-kb.ts

import * as fs from 'fs';
import * as path from 'path';
import type { VectorStore } from './vector-store';
import type {
  KnowledgeEntry, KnowledgeCategory, SearchQuery, SearchResult,
  ListFilter, StoreStats, KBOptions
} from './types';

export class ProjectKnowledgeBase {
  private store: VectorStore;
  private projectRoot: string;
  private options: Required<KBOptions>;

  constructor(projectRoot: string, options: KBOptions = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      namespace: options.namespace ?? 'global',
      semanticWeight: options.semanticWeight ?? 0.7,
      maxVocabSize: options.maxVocabSize ?? 10000,
      episodeCapacity: options.episodeCapacity ?? 1000,
      tokenBudget: options.tokenBudget ?? 1000,
      debounceMs: options.debounceMs ?? 500,
    };

    // 每个项目有独立的 VectorStore 实例（独立文件路径）
    const storagePath = path.join(projectRoot, '.agent-memory', 'knowledge-store.json');
    // 确保目录存在
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });

    // 动态导入避免循环依赖
    const { VectorStore } = require('./vector-store');
    this.store = new VectorStore({
      storagePath,
      maxVocabSize: this.options.maxVocabSize,
      debounceMs: this.options.debounceMs,
    });
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
  }

  // 委托 CRUD 到 VectorStore
  async add(input: Parameters<VectorStore['add']>[0]): ReturnType<VectorStore['add']> {
    return this.store.add({ namespace: this.options.namespace, ...input });
  }

  async get(id: string) { return this.store.get(id); }
  async update(id: string, patch: Parameters<VectorStore['update']>[1]) { return this.store.update(id, patch); }
  async delete(id: string) { return this.store.delete(id); }
  async list(filter?: ListFilter) { return this.store.list({ namespace: this.options.namespace, ...filter }); }
  async flush() { return this.store.flush(); }
}
```

### Step 2: 版本控制增强（0.5h）

版本控制已在 Task 1 中实现（`update()` 自动保存 `versions` 快照）。本 Task 在此基础上添加版本查询和回滚接口：

```typescript
// 获取版本历史
async getVersionHistory(id: string): Promise<VersionSnapshot[]> {
  const entry = await this.store.get(id);
  if (!entry) throw new Error(`知识条目 ${id} 不存在`);
  return entry.versions;
}

// 回滚到指定版本
async rollback(id: string, targetVersion: number, operatorId: string = 'manual'): Promise<KnowledgeEntry> {
  const entry = await this.store.get(id);
  if (!entry) throw new Error(`知识条目 ${id} 不存在`);

  const snapshot = entry.versions.find(v => v.version === targetVersion);
  if (!snapshot) throw new Error(`版本 ${targetVersion} 不存在`);

  // 回滚操作本身也创建新版本（可审计）
  return this.store.update(id, {
    title: snapshot.title,
    content: snapshot.content,
    // changedBy 记录回滚操作
  });
  // 注意：update() 内部会自动将当前版本保存到 versions
}
```

### Step 3: 混合搜索（0.5h）

VectorStore 的 `search()` 已支持 `searchMode: 'hybrid'`（Task 3 实现）。ProjectKnowledgeBase 的 `search()` 方法默认使用混合模式，并应用项目命名空间过滤：

```typescript
async search(query: Omit<SearchQuery, 'namespace'>): Promise<SearchResult[]> {
  return this.store.search({
    ...query,
    namespace: this.options.namespace,
    searchMode: query.searchMode ?? 'hybrid',
    semanticWeight: query.semanticWeight ?? this.options.semanticWeight,
  });
}
```

### Step 4: Markdown 导出（1h）

```typescript
async exportMarkdown(filter?: {
  category?: KnowledgeCategory;
  tags?: string[];
  outputPath?: string;
}): Promise<string> {
  const { entries, total } = await this.store.list({
    category: filter?.category,
    tags: filter?.tags,
    status: 'active',
    pageSize: 100,  // 分批导出
  });

  // 获取所有条目（分页）
  const allEntries: KnowledgeEntry[] = [...entries];
  if (total > 100) {
    let page = 2;
    while (allEntries.length < total) {
      const { entries: batch } = await this.store.list({
        category: filter?.category,
        tags: filter?.tags,
        status: 'active',
        page,
        pageSize: 100,
      });
      allEntries.push(...batch);
      page++;
    }
  }

  const projectId = path.basename(this.projectRoot);
  const now = new Date().toISOString().slice(0, 10);

  const lines: string[] = [
    `# 知识库导出 - ${projectId}`,
    `导出时间: ${now}`,
    `总条目数: ${allEntries.length}`,
    '',
  ];

  for (const entry of allEntries) {
    const createdDate = entry.createdAt.slice(0, 10);
    const updatedDate = entry.updatedAt.slice(0, 10);
    const tagsStr = entry.tags.join(', ') || '（无标签）';
    const sourceRef = entry.source.taskId ?? (entry.source.manual ? 'manual' : '未知');

    lines.push(`## [${entry.category}] ${entry.title}`);
    lines.push(`**标签**: ${tagsStr}`);
    lines.push(`**创建**: ${createdDate} | **更新**: ${updatedDate}`);
    lines.push(`**来源**: ${sourceRef}`);
    lines.push('');
    lines.push(entry.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const markdown = lines.join('\n');

  if (filter?.outputPath) {
    await fs.promises.writeFile(filter.outputPath, markdown, 'utf8');
  }

  return markdown;
}
```

### Step 5: Markdown 导入（1h）

```typescript
interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  warnings: string[];
}

async importMarkdown(
  source: string,  // Markdown 内容或文件路径
  options: { operator?: string } = {}
): Promise<ImportResult> {
  let content = source;
  if (fs.existsSync(source)) {
    content = await fs.promises.readFile(source, 'utf8');
  }

  const result: ImportResult = { imported: 0, skipped: 0, failed: 0, warnings: [] };

  // 解析 Markdown：按 ## 分割条目
  const sections = content.split(/\n## /);
  // 跳过第一段（文件头部：标题、导出时间、总条目数）
  const entrySections = sections.slice(1);

  for (const section of entrySections) {
    try {
      const entry = this.parseMarkdownEntry('## ' + section);
      if (!entry) {
        result.failed++;
        result.warnings.push(`无法解析条目：${section.slice(0, 50)}...`);
        continue;
      }

      // 增量导入：检查相似条目（title + category 相同则跳过）
      const existing = await this.store.list({ category: entry.category, pageSize: 100 });
      const duplicate = existing.entries.find(
        e => e.title === entry.title && e.status === 'active'
      );

      if (duplicate) {
        result.skipped++;
        continue;
      }

      await this.store.add({
        ...entry,
        namespace: this.options.namespace,
        source: { manual: true },
      });
      result.imported++;
    } catch (e) {
      result.failed++;
      result.warnings.push(`导入失败：${(e as Error).message}`);
    }
  }

  return result;
}

private parseMarkdownEntry(section: string): Omit<KnowledgeEntry, 'id' | 'embedding' | 'embeddingModel' | 'namespace' | 'version' | 'versions' | 'status' | 'createdAt' | 'updatedAt' | 'accessedAt'> | null {
  // 解析 ## [{category}] {title}
  const headerMatch = section.match(/^## \[([^\]]+)\] (.+)$/m);
  if (!headerMatch) return null;

  const [, categoryRaw, title] = headerMatch;
  const VALID_CATEGORIES: KnowledgeCategory[] = ['code', 'error-solution', 'best-practice', 'decision', 'context', 'other'];
  const category: KnowledgeCategory = VALID_CATEGORIES.includes(categoryRaw as KnowledgeCategory)
    ? (categoryRaw as KnowledgeCategory)
    : 'other';

  // 解析标签：**标签**: tag1, tag2
  const tagsMatch = section.match(/\*\*标签\*\*:\s*(.+)/);
  const tags = tagsMatch
    ? tagsMatch[1].split(',').map(t => t.trim()).filter(t => t && t !== '（无标签）')
    : [];

  // 解析来源
  const sourceMatch = section.match(/\*\*来源\*\*:\s*(.+)/);
  const sourceRef = sourceMatch?.[1]?.trim();

  // 提取正文（元数据之后，--- 之前）
  const contentMatch = section.match(/\*\*来源\*\*:.+?\n\n([\s\S]*?)(?:\n---|\s*$)/);
  const content = contentMatch?.[1]?.trim() ?? '';

  if (!content) return null;

  return {
    title: title.trim(),
    content,
    summary: content.slice(0, 200),
    category,
    tags,
    source: {
      taskId: sourceRef && sourceRef !== 'manual' && sourceRef !== '未知' ? sourceRef : undefined,
      manual: sourceRef === 'manual',
    },
    quality: { confidence: 0.5, verified: false, usageCount: 0, successRate: 0 },
  };
}
```

### Step 6: 统计接口（0.5h）

```typescript
async stats(): Promise<StoreStats & { projectRoot: string }> {
  const baseStats = await this.store.getStats();
  return {
    ...baseStats,
    projectRoot: this.projectRoot,
  };
}

// 重置知识库（清空所有数据）
async reset(): Promise<void> {
  const { entries } = await this.store.list({ pageSize: 100 });
  // 软删除所有条目
  for (const entry of entries) {
    await this.store.delete(entry.id);
  }
  await this.store.flush();
}
```

---

## 验收标准

- [ ] 不同 `projectRoot` 的知识库完全隔离（独立文件路径）
- [ ] `stats()` 返回：总条数、各类别条数、存储大小
- [ ] `getVersionHistory()` 返回指定条目的版本列表
- [ ] `rollback()` 将条目恢复到指定版本，且回滚本身创建新版本
- [ ] 单个条目最多保留 20 个历史版本
- [ ] `search()` 默认使用混合搜索（semantic_weight=0.7 可配置）
- [ ] `exportMarkdown()` 输出人类可读的 Markdown 文件
- [ ] 导出的 Markdown 包含标签、创建/更新时间、来源
- [ ] `importMarkdown()` 支持增量导入（title+category 相同则跳过）
- [ ] 导入时无效格式记录 warning 并跳过，不中断整体导入
- [ ] `reset()` 软删除所有条目
- [ ] 单元测试：`tests/v8/unit/project-kb.test.ts`
