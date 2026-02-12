import * as fs from 'fs';
import * as path from 'path';
import { VectorStore } from './vector-store.js';
import type {
  KnowledgeEntry,
  KnowledgeCategory,
  SearchQuery,
  SearchResult,
  ListFilter,
  StoreStats,
  KBOptions,
  VersionSnapshot,
} from './types.js';

export interface ProjectKBOptions extends KBOptions {
  baseDir?: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  warnings: string[];
}

export class ProjectKnowledgeBase {
  /** 多项目模式：projectId -> VectorStore */
  private stores = new Map<string, VectorStore>();
  private baseDir: string;

  constructor(options: ProjectKBOptions = {}) {
    this.baseDir = options.baseDir ?? path.join(process.cwd(), '.agent-kb');
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  /** 获取或创建项目的 VectorStore */
  getStore(projectId: string): VectorStore {
    if (!this.stores.has(projectId)) {
      const storeDir = path.join(this.baseDir, projectId);
      fs.mkdirSync(storeDir, { recursive: true });
      const store = new VectorStore({
        storagePath: path.join(storeDir, 'knowledge-store.json'),
        debounceMs: 500,
      });
      this.stores.set(projectId, store);
    }
    return this.stores.get(projectId)!;
  }

  /** 初始化指定项目的 store */
  async initializeProject(projectId: string): Promise<void> {
    const store = this.getStore(projectId);
    await store.initialize();
  }

  /** 跨项目搜索 */
  async searchAll(query: SearchQuery): Promise<Array<SearchResult & { projectId: string }>> {
    const allResults: Array<SearchResult & { projectId: string }> = [];

    for (const [projectId, store] of this.stores) {
      const results = await store.search(query);
      for (const r of results) {
        allResults.push({ ...r, projectId });
      }
    }

    // 按分数降序排序
    allResults.sort((a, b) => b.score - a.score);

    const topK = query.topK ?? 5;
    return allResults.slice(0, topK);
  }

  /**
   * Markdown 导出：将指定项目的 VectorStore 导出为 Markdown 文件
   */
  async exportToMarkdown(projectId: string, outputPath: string): Promise<void> {
    const store = this.getStore(projectId);

    // 获取所有 active 条目（分页处理）
    const allEntries: KnowledgeEntry[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const { entries, total } = await store.list({
        status: 'active',
        page,
        pageSize: 100,
      });
      allEntries.push(...entries);
      hasMore = allEntries.length < total;
      page++;
    }

    // 按 category 分组
    const byCategory = new Map<KnowledgeCategory, KnowledgeEntry[]>();
    for (const entry of allEntries) {
      if (!byCategory.has(entry.category)) {
        byCategory.set(entry.category, []);
      }
      byCategory.get(entry.category)!.push(entry);
    }

    const timestamp = new Date().toISOString();
    const lines: string[] = [
      `# 知识库导出 - ${projectId}`,
      `导出时间：${timestamp}`,
      '',
    ];

    for (const [category, entries] of byCategory) {
      lines.push(`## ${category}`);
      lines.push('');

      for (const entry of entries) {
        const tagsStr = entry.tags.length > 0 ? entry.tags.join(', ') : '（无标签）';
        const sourceRef =
          entry.source.taskId ??
          (entry.source.manual ? 'manual' : entry.source.agentId ?? '未知');

        lines.push(`### ${entry.id}`);
        lines.push(`- **来源**: ${sourceRef}`);
        lines.push(`- **创建时间**: ${entry.createdAt}`);
        lines.push(`- **标签**: ${tagsStr}`);
        lines.push(`- **标题**: ${entry.title}`);
        lines.push('');
        lines.push(entry.content);
        lines.push('');
        lines.push('---');
        lines.push('');
      }
    }

    const markdown = lines.join('\n');
    await fs.promises.writeFile(outputPath, markdown, 'utf8');
  }

  /**
   * Markdown 导入：从 Markdown 文件导入知识条目
   * 返回导入数量
   */
  async importFromMarkdown(projectId: string, inputPath: string): Promise<number> {
    const store = this.getStore(projectId);
    let content: string;

    try {
      content = await fs.promises.readFile(inputPath, 'utf8');
    } catch (e) {
      throw new Error(`无法读取文件 ${inputPath}: ${(e as Error).message}`);
    }

    let importedCount = 0;

    // 按 category 段落分割：## {category}
    // 跳过文件头（第一段）
    const categorySections = content.split(/\n## /);

    for (let ci = 1; ci < categorySections.length; ci++) {
      const catSection = categorySections[ci];
      const categoryMatch = catSection.match(/^([^\n]+)/);
      if (!categoryMatch) continue;

      const categoryRaw = categoryMatch[1].trim();
      const VALID_CATEGORIES: KnowledgeCategory[] = [
        'code', 'error-solution', 'best-practice', 'decision', 'context', 'other',
      ];
      const category: KnowledgeCategory = VALID_CATEGORIES.includes(categoryRaw as KnowledgeCategory)
        ? (categoryRaw as KnowledgeCategory)
        : 'other';

      // 按 ### {id} 分割条目
      const entrySections = catSection.split(/\n### /);
      for (let ei = 1; ei < entrySections.length; ei++) {
        const entrySection = entrySections[ei];

        try {
          const parsed = this.parseMarkdownEntry(entrySection, category);
          if (!parsed) continue;

          // 增量导入：标题+category 相同则跳过
          const { entries } = await store.list({ category, pageSize: 100 });
          const duplicate = entries.find(
            e => e.title === parsed.title && e.status === 'active'
          );
          if (duplicate) continue;

          await store.add({
            namespace: 'global',
            title: parsed.title,
            content: parsed.content,
            summary: parsed.content.slice(0, 200),
            category,
            tags: parsed.tags,
            source: { manual: true },
            quality: { confidence: 0.5, verified: false, usageCount: 0, successRate: 0 },
          });
          importedCount++;
        } catch {
          // 解析失败时跳过，不中断整体导入
        }
      }
    }

    return importedCount;
  }

  /** 列出所有已加载的项目 */
  listProjects(): string[] {
    return Array.from(this.stores.keys());
  }

  /** 删除项目知识库（软删除所有条目 + 从 stores map 移除） */
  async deleteProject(projectId: string): Promise<void> {
    const store = this.stores.get(projectId);
    if (!store) return;

    // 软删除所有条目
    const { entries } = await store.list({ status: 'active', pageSize: 10000 });
    for (const entry of entries) {
      await store.delete(entry.id);
    }
    await store.flush();
    this.stores.delete(projectId);
  }

  // ---- 便捷方法（委托给指定 project 的 store）----

  async add(
    projectId: string,
    input: Parameters<VectorStore['add']>[0]
  ): Promise<KnowledgeEntry> {
    return this.getStore(projectId).add(input);
  }

  async get(projectId: string, id: string): Promise<KnowledgeEntry | null> {
    return this.getStore(projectId).get(id);
  }

  async update(
    projectId: string,
    id: string,
    patch: Parameters<VectorStore['update']>[1]
  ): Promise<KnowledgeEntry> {
    return this.getStore(projectId).update(id, patch);
  }

  async delete(projectId: string, id: string): Promise<void> {
    return this.getStore(projectId).delete(id);
  }

  async list(
    projectId: string,
    filter?: ListFilter
  ): Promise<{ entries: KnowledgeEntry[]; total: number }> {
    return this.getStore(projectId).list(filter);
  }

  async search(
    projectId: string,
    query: SearchQuery
  ): Promise<SearchResult[]> {
    return this.getStore(projectId).search({
      searchMode: 'hybrid',
      semanticWeight: 0.7,
      ...query,
    });
  }

  async stats(projectId: string): Promise<StoreStats & { projectId: string }> {
    const baseStats = await this.getStore(projectId).getStats();
    return { ...baseStats, projectId };
  }

  async getVersionHistory(projectId: string, id: string): Promise<VersionSnapshot[]> {
    const store = this.getStore(projectId);
    const entry = await store.get(id);
    if (!entry) throw new Error(`知识条目 ${id} 不存在`);
    return entry.versions;
  }

  async flush(projectId: string): Promise<void> {
    return this.getStore(projectId).flush();
  }

  // ---- 私有方法 ----

  private parseMarkdownEntry(
    section: string,
    category: KnowledgeCategory
  ): { title: string; content: string; tags: string[] } | null {
    const lines = section.split('\n');
    // 第一行是 id（### {id} 已被分割移除，第一行即 id）
    // 实际上第一行就是 id
    // 元数据行
    let title = '';
    let tagsStr = '';
    let contentStart = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('- **来源**:')) continue;
      if (line.startsWith('- **创建时间**:')) continue;
      if (line.startsWith('- **标签**:')) {
        const m = line.match(/- \*\*标签\*\*:\s*(.+)/);
        tagsStr = m?.[1]?.trim() ?? '';
      } else if (line.startsWith('- **标题**:')) {
        const m = line.match(/- \*\*标题\*\*:\s*(.+)/);
        title = m?.[1]?.trim() ?? '';
        contentStart = i + 1;
        break;
      }
    }

    if (!title || contentStart === -1) return null;

    // 提取正文（跳过空行，直到 --- 或结束）
    const contentLines: string[] = [];
    for (let i = contentStart; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '---') break;
      contentLines.push(line);
    }

    const content = contentLines.join('\n').trim();
    if (!content) return null;

    const tags = tagsStr
      ? tagsStr.split(',').map(t => t.trim()).filter(t => t && t !== '（无标签）')
      : [];

    return { title, content, tags };
  }
}
