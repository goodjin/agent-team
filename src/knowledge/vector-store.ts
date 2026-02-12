import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  KnowledgeEntry,
  KnowledgeCategory,
  SearchQuery,
  SearchResult,
  ListFilter,
  StoreStats,
  VectorStoreOptions,
} from './types.js';

// 停用词集合
const STOP_WORDS = new Set([
  // 中文停用词
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人',
  '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去',
  '你', '会', '着', '没有', '看', '好', '自己', '这',
  // 英文停用词
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'to', 'of',
  'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as', 'or',
  'and', 'but', 'not', 'it', 'its', 'this', 'that', 'these',
]);

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

type CreateEntryInput = Omit<KnowledgeEntry, 'id' | 'embedding' | 'embeddingModel' | 'version' | 'versions' | 'status' | 'createdAt' | 'updatedAt' | 'accessedAt'>;
type UpdateEntryPatch = Partial<Omit<KnowledgeEntry, 'id' | 'createdAt'>>;

export class VectorStore {
  private index: Map<string, KnowledgeEntry> = new Map();
  private storagePath: string;
  private tmpPath: string;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty: boolean = false;
  private options: Required<VectorStoreOptions>;
  private createdAt: string = new Date().toISOString();

  // TF-IDF 词汇表相关
  private vocab: Map<string, number> = new Map();
  private docFreq: Map<string, number> = new Map();
  private docCount: number = 0;
  private crudCount: number = 0;

  constructor(options: VectorStoreOptions) {
    this.options = {
      storagePath: options.storagePath,
      maxVocabSize: options.maxVocabSize ?? 10000,
      debounceMs: options.debounceMs ?? 500,
    };
    this.storagePath = options.storagePath;
    this.tmpPath = options.storagePath + '.tmp';

    // 进程退出前强制写入（提升最大监听器上限避免警告）
    process.setMaxListeners(process.getMaxListeners() + 1);
    process.on('exit', () => {
      if (this.dirty) {
        try {
          const data = this.buildStoreFile();
          fs.writeFileSync(this.tmpPath, JSON.stringify(data, null, 2));
          fs.renameSync(this.tmpPath, this.storagePath);
        } catch {
          // 退出时写入失败，忽略
        }
      }
    });
  }

  // 初始化（从文件加载）
  async initialize(): Promise<void> {
    const dir = path.dirname(this.storagePath);
    fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(this.storagePath)) {
      try {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const data: StoreFile = JSON.parse(raw);
        this.createdAt = data.metadata?.createdAt ?? new Date().toISOString();

        for (const entry of data.entries ?? []) {
          this.index.set(entry.id, entry);
        }
      } catch {
        // 文件损坏，从空库开始
        this.index.clear();
      }
    }

    // 恢复词汇表状态（等待完成）
    await this.rebuildIDF();
  }

  // CRUD: 添加
  async add(input: CreateEntryInput): Promise<KnowledgeEntry> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const entry: KnowledgeEntry = {
      ...input,
      id,
      embedding: [],
      embeddingModel: 'none',
      version: 1,
      versions: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
      accessedAt: now,
    };

    // 计算 TF-IDF 向量
    const textToVectorize = `${entry.title} ${entry.content} ${entry.tags.join(' ')}`;
    const tokens = this.tokenize(textToVectorize);
    this.addToVocab(tokens);
    this.docCount++;
    entry.embedding = this.computeTFIDF(textToVectorize);
    entry.embeddingModel = 'tfidf-v1';

    this.index.set(id, entry);
    this.scheduleSave();
    await this.afterCRUD();

    return entry;
  }

  // CRUD: 获取
  async get(id: string): Promise<KnowledgeEntry | null> {
    return this.index.get(id) ?? null;
  }

  // CRUD: 更新
  async update(id: string, patch: UpdateEntryPatch): Promise<KnowledgeEntry> {
    const entry = this.index.get(id);
    if (!entry) throw new Error(`Entry not found: ${id}`);

    // 保存版本快照
    const snapshot = {
      version: entry.version,
      timestamp: entry.updatedAt,
      content: entry.content,
      title: entry.title,
      changedBy: (patch as { changedBy?: string }).changedBy ?? 'manual',
    };

    entry.versions.push(snapshot);
    if (entry.versions.length > 20) {
      entry.versions.shift();
    }

    // 应用更新
    const { changedBy: _changedBy, ...safeP } = patch as UpdateEntryPatch & { changedBy?: string };
    Object.assign(entry, safeP);
    entry.version = (entry.version ?? 1) + 1;
    entry.updatedAt = new Date().toISOString();

    // 如果内容改变，重新计算 embedding
    if (patch.content !== undefined || patch.title !== undefined || patch.tags !== undefined) {
      const textToVectorize = `${entry.title} ${entry.content} ${entry.tags.join(' ')}`;
      entry.embedding = this.computeTFIDF(textToVectorize);
      entry.embeddingModel = 'tfidf-v1';
    }

    this.index.set(id, entry);
    this.scheduleSave();
    await this.afterCRUD();

    return entry;
  }

  // CRUD: 软删除
  async delete(id: string): Promise<void> {
    const entry = this.index.get(id);
    if (!entry) throw new Error(`Entry not found: ${id}`);

    // 更新文档频率
    const tokens = this.tokenize(`${entry.title} ${entry.content} ${entry.tags.join(' ')}`);
    this.removeFromDocFreq(tokens);
    if (this.docCount > 0) this.docCount--;

    entry.status = 'deleted';
    entry.updatedAt = new Date().toISOString();
    this.index.set(id, entry);
    this.scheduleSave();
    await this.afterCRUD();
  }

  // 列表查询
  async list(filter?: ListFilter): Promise<{ entries: KnowledgeEntry[]; total: number }> {
    const {
      category,
      tags,
      namespace,
      status = 'active',
      dateRange,
      page = 1,
      pageSize = 20,
    } = filter ?? {};

    const clampedPageSize = Math.max(1, Math.min(100, pageSize));
    const clampedPage = Math.max(1, page);

    let results = Array.from(this.index.values());

    if (status) results = results.filter(e => e.status === status);
    if (category) results = results.filter(e => e.category === category);
    if (namespace) results = results.filter(e => e.namespace === namespace);
    if (tags?.length) results = results.filter(e => tags.every(t => e.tags.includes(t)));
    if (dateRange?.from) results = results.filter(e => e.createdAt >= dateRange.from!);
    if (dateRange?.to) results = results.filter(e => e.createdAt <= dateRange.to!);

    const total = results.length;
    const start = (clampedPage - 1) * clampedPageSize;
    const entries = results.slice(start, start + clampedPageSize);

    return { entries, total };
  }

  // 统一搜索接口
  async search(query: SearchQuery): Promise<SearchResult[]> {
    const {
      text,
      topK = 5,
      threshold = 0.3,
      searchMode = 'semantic',
      semanticWeight = 0.7,
      ...filter
    } = query;

    if (!text || text.trim().length === 0) return [];

    const updateAccessed = (results: SearchResult[]) => {
      for (const r of results) {
        r.entry.accessedAt = new Date().toISOString();
        r.entry.quality.usageCount++;
      }
      if (results.length > 0) this.scheduleSave();
      return results;
    };

    switch (searchMode) {
      case 'semantic':
        return updateAccessed(await this.semanticSearch(text, topK, threshold, filter));
      case 'keyword':
        return updateAccessed(this.keywordSearch(text, topK, filter));
      case 'hybrid':
        return updateAccessed(await this.hybridSearch(text, topK, threshold, semanticWeight, filter));
      default:
        return updateAccessed(await this.semanticSearch(text, topK, threshold, filter));
    }
  }

  // 统计信息
  async getStats(): Promise<StoreStats> {
    const allEntries = Array.from(this.index.values());
    const active = allEntries.filter(e => e.status === 'active');
    const byCategory: Partial<Record<KnowledgeCategory, number>> = {};

    for (const entry of active) {
      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;
    }

    let storageSizeBytes = 0;
    try {
      if (fs.existsSync(this.storagePath)) {
        storageSizeBytes = fs.statSync(this.storagePath).size;
      }
    } catch {
      // ignore
    }

    return {
      total: allEntries.length,
      active: active.length,
      byCategory,
      storageSizeBytes,
      lastUpdated: new Date().toISOString(),
    };
  }

  // 强制写入
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.atomicWrite();
  }

  // ---- TF-IDF 向量化 ----

  // 分词
  private tokenize(text: string): string[] {
    let s = text.toLowerCase();
    // 中文分字
    s = s.replace(/[\u4e00-\u9fa5]/g, (char) => ` ${char} `);
    // 保留字母、数字、中文，其余替换为空格
    s = s.replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ');
    const tokens = s.split(/\s+/).filter(t => t.length > 0);
    return tokens.filter(t => !STOP_WORDS.has(t) && t.length >= 2);
  }

  // 向词汇表添加新词
  private addToVocab(tokens: string[]): void {
    for (const token of new Set(tokens)) {
      if (!this.vocab.has(token)) {
        if (this.vocab.size >= this.options.maxVocabSize) continue;
        this.vocab.set(token, this.vocab.size);
      }
      this.docFreq.set(token, (this.docFreq.get(token) ?? 0) + 1);
    }
  }

  // 从词汇表移除（软删除时调用）
  private removeFromDocFreq(tokens: string[]): void {
    for (const token of new Set(tokens)) {
      const freq = this.docFreq.get(token) ?? 0;
      if (freq > 1) this.docFreq.set(token, freq - 1);
      else this.docFreq.delete(token);
    }
  }

  // 计算 TF-IDF 向量（公开，供外部使用）
  computeTFIDF(text: string): number[] {
    const tokens = this.tokenize(text);
    if (tokens.length === 0 || this.vocab.size === 0) return [];

    const termFreq = new Map<string, number>();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
    }

    const vector = new Array(this.vocab.size).fill(0);
    const N = Math.max(this.docCount, 1);

    for (const [term, freq] of termFreq) {
      const idx = this.vocab.get(term);
      if (idx === undefined) continue;

      const tf = freq / tokens.length;
      const df = this.docFreq.get(term) ?? 0;
      const idf = Math.log(N / (df + 1)) + 1;
      vector[idx] = tf * idf;
    }

    return vector;
  }

  // 全量 IDF 重建
  private async rebuildIDF(): Promise<void> {
    const newDocFreq = new Map<string, number>();
    let activeCount = 0;

    for (const entry of this.index.values()) {
      if (entry.status !== 'active') continue;
      activeCount++;
      const tokens = this.tokenize(`${entry.content} ${entry.title}`);
      for (const token of new Set(tokens)) {
        newDocFreq.set(token, (newDocFreq.get(token) ?? 0) + 1);
      }
    }

    this.docFreq = newDocFreq;
    this.docCount = activeCount;

    // 重建词汇表（保留高频词）
    const sortedByFreq = [...newDocFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.options.maxVocabSize);

    this.vocab = new Map(sortedByFreq.map(([word], i) => [word, i]));

    // 重新计算所有 active 文档的 embedding
    for (const entry of this.index.values()) {
      if (entry.status !== 'active') continue;
      entry.embedding = this.computeTFIDF(`${entry.content} ${entry.title}`);
      entry.embeddingModel = 'tfidf-v1';
    }

    this.scheduleSave();
  }

  // CRUD 后触发检查
  private async afterCRUD(): Promise<void> {
    this.crudCount++;
    if (this.crudCount % 100 === 0) {
      setImmediate(() => this.rebuildIDF().catch(console.error));
    }
  }

  // ---- 余弦相似度搜索 ----

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    if (a.length !== b.length) {
      const maxLen = Math.max(a.length, b.length);
      a = [...a, ...new Array(maxLen - a.length).fill(0)];
      b = [...b, ...new Array(maxLen - b.length).fill(0)];
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private async semanticSearch(
    queryText: string,
    topK: number,
    threshold: number,
    filter: Partial<SearchQuery>
  ): Promise<SearchResult[]> {
    const queryVector = this.computeTFIDF(queryText);
    if (queryVector.length === 0) return [];

    const results: Array<{ entry: KnowledgeEntry; score: number }> = [];

    for (const entry of this.index.values()) {
      if (entry.status !== 'active') continue;
      if (filter.category && entry.category !== filter.category) continue;
      if (filter.tags?.length && !filter.tags.every(t => entry.tags.includes(t))) continue;
      if (filter.namespace && entry.namespace !== filter.namespace) continue;
      if (filter.dateRange?.from && entry.createdAt < filter.dateRange.from) continue;
      if (filter.dateRange?.to && entry.createdAt > filter.dateRange.to) continue;

      const score = this.cosineSimilarity(queryVector, entry.embedding);
      if (score >= threshold) {
        results.push({ entry, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK).map(r => ({
      entry: r.entry,
      score: r.score,
      matchType: 'semantic' as const,
    }));
  }

  private keywordSearch(
    queryText: string,
    topK: number,
    filter: Partial<SearchQuery>
  ): SearchResult[] {
    const queryTokens = this.tokenize(queryText);
    if (queryTokens.length === 0) return [];

    const results: Array<{ entry: KnowledgeEntry; score: number }> = [];

    for (const entry of this.index.values()) {
      if (entry.status !== 'active') continue;
      if (filter.category && entry.category !== filter.category) continue;
      if (filter.namespace && entry.namespace !== filter.namespace) continue;

      const entryText = `${entry.title} ${entry.content} ${entry.tags.join(' ')}`.toLowerCase();
      let matchCount = 0;
      for (const token of queryTokens) {
        if (entryText.includes(token)) matchCount++;
      }

      const score = matchCount / queryTokens.length;
      if (score > 0) {
        results.push({ entry, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK).map(r => ({
      entry: r.entry,
      score: r.score,
      matchType: 'keyword' as const,
    }));
  }

  private async hybridSearch(
    queryText: string,
    topK: number,
    threshold: number,
    semanticWeight: number,
    filter: Partial<SearchQuery>
  ): Promise<SearchResult[]> {
    const [semanticResults, keywordResults] = await Promise.all([
      this.semanticSearch(queryText, topK * 2, 0, filter),
      Promise.resolve(this.keywordSearch(queryText, topK * 2, filter)),
    ]);

    const scoreMap = new Map<string, { entry: KnowledgeEntry; semanticScore: number; keywordScore: number }>();

    for (const r of semanticResults) {
      scoreMap.set(r.entry.id, { entry: r.entry, semanticScore: r.score, keywordScore: 0 });
    }
    for (const r of keywordResults) {
      const existing = scoreMap.get(r.entry.id);
      if (existing) {
        existing.keywordScore = r.score;
      } else {
        scoreMap.set(r.entry.id, { entry: r.entry, semanticScore: 0, keywordScore: r.score });
      }
    }

    const results: SearchResult[] = [];
    for (const { entry, semanticScore, keywordScore } of scoreMap.values()) {
      const hybridScore = semanticWeight * semanticScore + (1 - semanticWeight) * keywordScore;
      if (hybridScore >= threshold) {
        results.push({ entry, score: hybridScore, matchType: 'hybrid' });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  // ---- 持久化 ----

  private scheduleSave(): void {
    this.dirty = true;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.atomicWrite().catch(console.error);
    }, this.options.debounceMs);
  }

  private buildStoreFile(): StoreFile {
    return {
      version: '8.0.0',
      metadata: {
        projectId: path.basename(path.dirname(this.storagePath)),
        createdAt: this.createdAt,
        updatedAt: new Date().toISOString(),
        totalEntries: this.index.size,
        embedderConfig: { type: 'tfidf', version: '1.0' },
      },
      entries: Array.from(this.index.values()),
    };
  }

  private async atomicWrite(): Promise<void> {
    const data = this.buildStoreFile();
    const json = JSON.stringify(data, null, 2);
    await fs.promises.writeFile(this.tmpPath, json, 'utf8');
    await fs.promises.rename(this.tmpPath, this.storagePath);
    this.dirty = false;
  }
}
