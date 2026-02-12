import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { VectorStore } from './vector-store.js';
import type {
  EpisodeRecord,
  SearchResult,
  KnowledgeEntry,
  KnowledgeCategory,
  EpisodeFilter,
} from './types.js';

// Re-export EpisodeRecord for consumers
export type { EpisodeRecord };

interface EpisodesFile {
  version: string;
  episodes: EpisodeRecord[];
}

export interface AgentMemoryOptions {
  memoryDir?: string;
  maxEpisodic?: number;
  tokenBudget?: number;
}

export class AgentMemory {
  private static instance: AgentMemory | null = null;

  private longTermMemory: VectorStore;
  private episodicMemory: EpisodeRecord[] = [];
  private maxEpisodicRecords: number;
  private episodicPath: string;
  private episodesDirty: boolean = false;
  private episodesDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private tokenBudget: number;

  constructor(options: AgentMemoryOptions = {}) {
    const memoryDir = options.memoryDir ?? path.join(process.cwd(), '.agent-memory');
    this.maxEpisodicRecords = options.maxEpisodic ?? 1000;
    this.tokenBudget = options.tokenBudget ?? 1000;
    this.episodicPath = path.join(memoryDir, 'episodes.json');

    fs.mkdirSync(memoryDir, { recursive: true });

    this.longTermMemory = new VectorStore({
      storagePath: path.join(memoryDir, 'long-term.json'),
      debounceMs: 500,
    });
  }

  static getInstance(options?: AgentMemoryOptions): AgentMemory {
    if (!AgentMemory.instance) {
      AgentMemory.instance = new AgentMemory(options);
    }
    return AgentMemory.instance;
  }

  /** 初始化：加载长期记忆和情景记忆 */
  async initialize(): Promise<void> {
    await this.longTermMemory.initialize();
    await this.loadEpisodes();

    // 进程退出前同步写入
    process.setMaxListeners(process.getMaxListeners() + 1);
    process.on('exit', () => this.flushEpisodesSync());
  }

  /** 加载情景记忆 */
  async loadEpisodes(): Promise<void> {
    try {
      if (fs.existsSync(this.episodicPath)) {
        const raw = await fs.promises.readFile(this.episodicPath, 'utf8');
        const file: EpisodesFile = JSON.parse(raw);
        this.episodicMemory = file.episodes ?? [];
      }
    } catch {
      console.warn('[AgentMemory] 无法加载情景记忆，从空白开始');
      this.episodicMemory = [];
    }
  }

  /** 保存情景记忆（debounced） */
  async saveEpisodes(): Promise<void> {
    await this.flushEpisodes();
  }

  /** 记录情景记忆（任务完成后调用） */
  async recordEpisode(record: Omit<EpisodeRecord, 'id'>): Promise<EpisodeRecord> {
    const episode: EpisodeRecord = {
      ...record,
      id: crypto.randomUUID(),
      taskDescription: this.truncate(record.taskDescription, 500),
      executionSummary: this.truncate(record.executionSummary, 500),
    };

    // 最新的放在最前
    this.episodicMemory.unshift(episode);

    // 超出容量时删除最旧的
    if (this.episodicMemory.length > this.maxEpisodicRecords) {
      this.episodicMemory = this.episodicMemory.slice(0, this.maxEpisodicRecords);
    }

    this.scheduleEpisodesSave();
    return episode;
  }

  /** 检索相关情景（按内容关键词相似度） */
  async recallEpisodes(query: string, limit: number = 3): Promise<EpisodeRecord[]> {
    return this.getRelevantEpisodes(query, limit);
  }

  /** 从长期记忆检索 */
  async recallKnowledge(query: string, topK: number = 5): Promise<SearchResult[]> {
    return this.longTermMemory.search({
      text: query,
      topK,
      threshold: 0.3,
      searchMode: 'hybrid',
    });
  }

  /** 存储到长期记忆 */
  async storeKnowledge(
    content: string,
    category: KnowledgeCategory,
    metadata: Record<string, unknown> = {}
  ): Promise<KnowledgeEntry> {
    const title = String(metadata.title ?? content.slice(0, 80));
    const summary = content.slice(0, 200);
    const tags = Array.isArray(metadata.tags) ? (metadata.tags as string[]) : [];

    return this.longTermMemory.add({
      namespace: 'global',
      title,
      content,
      summary,
      category,
      tags,
      source: { manual: true },
      quality: { confidence: 0.5, verified: false, usageCount: 0, successRate: 0 },
    });
  }

  /**
   * 为 LLM 调用生成记忆注入字符串（控制 token 预算）
   * 格式：
   * [记忆上下文]
   * 相关经验:
   * - [时间] [摘要] (结果: success)
   * ...
   * 相关知识:
   * - [内容摘要]
   * ...
   */
  async buildMemoryContext(query: string, tokenBudget?: number): Promise<string> {
    const budget = tokenBudget ?? this.tokenBudget;

    // 检索相关情景（limit: 3）
    const episodes = await this.recallEpisodes(query, 3);
    // 检索相关知识（topK: 5）
    const knowledge = await this.recallKnowledge(query, 5);

    if (episodes.length === 0 && knowledge.length === 0) {
      return '';
    }

    const lines: string[] = ['[记忆上下文]'];
    let usedTokens = this.estimateTokens('[记忆上下文]');

    // 情景记忆部分
    if (episodes.length > 0) {
      const header = '相关经验:';
      usedTokens += this.estimateTokens(header);
      lines.push(header);

      for (const ep of episodes) {
        const date = ep.startedAt.slice(0, 10);
        const line = `- [${date}] ${ep.executionSummary} (结果: ${ep.outcome})`;
        const lineTokens = this.estimateTokens(line);
        if (usedTokens + lineTokens > budget) break;
        lines.push(line);
        usedTokens += lineTokens;
      }
    }

    // 长期知识部分
    if (knowledge.length > 0) {
      const header = '相关知识:';
      usedTokens += this.estimateTokens(header);
      lines.push(header);

      for (const result of knowledge) {
        const summary = result.entry.summary || result.entry.content.slice(0, 200);
        const line = `- ${summary}`;
        const lineTokens = this.estimateTokens(line);
        if (usedTokens + lineTokens > budget) break;
        lines.push(line);
        usedTokens += lineTokens;
      }
    }

    return lines.join('\n');
  }

  /** 搜索情景记忆（支持多维度过滤） */
  searchEpisodes(filter: EpisodeFilter): EpisodeRecord[] {
    let results = [...this.episodicMemory];

    if (filter.agentId) {
      results = results.filter(e => e.agentId === filter.agentId);
    }
    if (filter.outcome) {
      results = results.filter(e => e.outcome === filter.outcome);
    }
    if (filter.dateRange?.from) {
      results = results.filter(e => e.startedAt >= filter.dateRange!.from!);
    }
    if (filter.dateRange?.to) {
      results = results.filter(e => e.startedAt <= filter.dateRange!.to!);
    }
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase();
      results = results.filter(e =>
        e.taskDescription.toLowerCase().includes(kw) ||
        e.executionSummary.toLowerCase().includes(kw)
      );
    }

    return results.slice(0, filter.limit ?? 10);
  }

  /** 暴露长期记忆 store（供测试/调试使用） */
  getLongTermMemory(): VectorStore {
    return this.longTermMemory;
  }

  /** 获取所有情景记忆（供测试/调试使用） */
  getAllEpisodes(): EpisodeRecord[] {
    return [...this.episodicMemory];
  }

  // ---- 私有方法 ----

  private getRelevantEpisodes(query: string, limit: number): EpisodeRecord[] {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    if (queryWords.length === 0) return this.episodicMemory.slice(0, limit);

    const scored = this.episodicMemory.map(ep => {
      const text = (ep.taskDescription + ' ' + ep.executionSummary).toLowerCase();
      const score = queryWords.filter(w => text.includes(w)).length / queryWords.length;
      return { ep, score };
    });

    const relevant = scored.filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.ep.startedAt.localeCompare(a.ep.startedAt));

    if (relevant.length === 0) {
      return this.episodicMemory.slice(0, limit);
    }

    return relevant.slice(0, limit).map(({ ep }) => ep);
  }

  private scheduleEpisodesSave(): void {
    this.episodesDirty = true;
    if (this.episodesDebounceTimer) clearTimeout(this.episodesDebounceTimer);
    this.episodesDebounceTimer = setTimeout(() => {
      this.flushEpisodes().catch(console.error);
    }, 500);
  }

  private async flushEpisodes(): Promise<void> {
    const data: EpisodesFile = { version: '1.0.0', episodes: this.episodicMemory };
    const tmpPath = this.episodicPath + '.tmp';
    await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.promises.rename(tmpPath, this.episodicPath);
    this.episodesDirty = false;
  }

  private flushEpisodesSync(): void {
    if (!this.episodesDirty) return;
    try {
      const data: EpisodesFile = { version: '1.0.0', episodes: this.episodicMemory };
      const tmpPath = this.episodicPath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
      fs.renameSync(tmpPath, this.episodicPath);
    } catch {
      // 退出时写入失败，忽略
    }
  }

  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen);
  }

  /** 简单 token 估算（4字符≈1token） */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
