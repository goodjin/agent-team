# Task 05: AgentMemory - 三层记忆系统

**优先级**: P1
**预计工时**: 5h
**阶段**: Phase 2
**依赖**: Task 3（VectorStore 完整实现）

---

## 目标

实现 AgentMemory，提供三层记忆的统一管理接口：短期记忆（复用 AgentLoop 现有实现）、长期记忆（基于 VectorStore）、情景记忆（独立 JSON 文件）。核心功能是记忆注入 middleware，在每次 LLM 调用前自动检索并注入相关上下文。

---

## 前置调研

查阅以下文件：
- `src/ai/agent-loop.ts` - 了解 AgentLoop 结构，找到可以挂接 middleware 的位置
- `src/ai/context-compressor.ts` - 了解现有上下文压缩实现
- `src/ai/token-manager.ts` - 了解 token 计算方式

**关键问题**：
1. AgentLoop 在哪里组装 system prompt？（middleware 挂接点）
2. `context-compressor.ts` 的接口是什么？
3. 如何计算字符串的 token 数？（是否有 `tokenManager.count(text)` 接口）

---

## 实现步骤

### Step 1: 情景记忆持久化（1h）

```typescript
// src/knowledge/agent-memory.ts

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { VectorStore } from './vector-store';
import type { EpisodeRecord, SearchQuery, EpisodeFilter } from './types';

interface EpisodesFile {
  version: string;
  episodes: EpisodeRecord[];
}

export class AgentMemory {
  private store: VectorStore;
  private episodesPath: string;
  private episodes: EpisodeRecord[] = [];
  private episodesDirty: boolean = false;
  private episodesDebounceTimer: NodeJS.Timeout | null = null;
  private readonly MAX_EPISODES = 1000;

  constructor(store: VectorStore, options: { storagePath: string; tokenBudget?: number }) {
    this.store = store;
    this.episodesPath = path.join(options.storagePath, 'episodes.json');
    this.tokenBudget = options.tokenBudget ?? 1000;
  }

  async initialize(): Promise<void> {
    // 加载情景记忆
    try {
      if (fs.existsSync(this.episodesPath)) {
        const raw = await fs.promises.readFile(this.episodesPath, 'utf8');
        const file: EpisodesFile = JSON.parse(raw);
        this.episodes = file.episodes ?? [];
      }
    } catch (e) {
      console.warn('[AgentMemory] 无法加载情景记忆，从空白开始');
      this.episodes = [];
    }

    // 进程退出前强制写入
    process.on('exit', () => this.flushEpisodesSync());
  }

  // 记录情景记忆
  async recordEpisode(episode: Omit<EpisodeRecord, 'id'>): Promise<void> {
    const record: EpisodeRecord = {
      ...episode,
      id: crypto.randomUUID(),
      // 截断长文本
      taskDescription: this.truncate(episode.taskDescription, 500),
      executionSummary: this.truncate(episode.executionSummary, 500),
    };

    this.episodes.unshift(record); // 最新的在最前

    // 超出容量时删除最旧的
    if (this.episodes.length > this.MAX_EPISODES) {
      this.episodes = this.episodes.slice(0, this.MAX_EPISODES);
    }

    this.scheduleEpisodesSave();
  }

  // 查询情景记忆
  searchEpisodes(filter: EpisodeFilter): EpisodeRecord[] {
    let results = [...this.episodes];

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

  // 持久化
  private scheduleEpisodesSave(): void {
    this.episodesDirty = true;
    if (this.episodesDebounceTimer) clearTimeout(this.episodesDebounceTimer);
    this.episodesDebounceTimer = setTimeout(() => {
      this.flushEpisodes().catch(console.error);
    }, 500);
  }

  async flushEpisodes(): Promise<void> {
    const data: EpisodesFile = { version: '1.0.0', episodes: this.episodes };
    const tmpPath = this.episodesPath + '.tmp';
    await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.promises.rename(tmpPath, this.episodesPath);
    this.episodesDirty = false;
  }

  private flushEpisodesSync(): void {
    if (!this.episodesDirty) return;
    const data: EpisodesFile = { version: '1.0.0', episodes: this.episodes };
    const tmpPath = this.episodesPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, this.episodesPath);
  }
}
```

### Step 2: 记忆检索和注入（2h）

```typescript
private tokenBudget: number;

// 核心：获取相关上下文（用于注入 system prompt）
async getRelevantContext(query: string, budget?: number): Promise<string> {
  const effectiveBudget = budget ?? this.tokenBudget;
  const longTermBudget = Math.floor(effectiveBudget * 0.7);
  const episodicBudget = effectiveBudget - longTermBudget;

  // 1. 检索长期记忆（VectorStore）
  const longTermResults = await this.store.search({
    text: query,
    topK: 5,
    threshold: 0.3,
    searchMode: 'hybrid',
  });

  // 2. 检索情景记忆（近期相关）
  const recentEpisodes = this.getRecentRelevantEpisodes(query, 3);

  // 如果都没有内容，不注入
  if (longTermResults.length === 0 && recentEpisodes.length === 0) {
    return '';
  }

  // 3. 格式化长期记忆
  let longTermSection = '';
  let longTermTokens = 0;
  const longTermLines: string[] = [];

  for (let i = 0; i < longTermResults.length; i++) {
    const r = longTermResults[i];
    const line = `${i + 1}. [${r.entry.category}] ${r.entry.title}: ${r.entry.summary}`;
    const lineTokens = this.estimateTokens(line);
    if (longTermTokens + lineTokens > longTermBudget) break;
    longTermLines.push(line);
    longTermTokens += lineTokens;
  }

  if (longTermLines.length > 0) {
    longTermSection = '[相关知识]\n' + longTermLines.join('\n');
  }

  // 4. 格式化情景记忆
  let episodicSection = '';
  let episodicTokens = 0;
  const episodicLines: string[] = [];

  for (const ep of recentEpisodes) {
    const date = ep.startedAt.slice(0, 10);
    const line = `- ${date}: ${ep.executionSummary} (${ep.outcome})`;
    const lineTokens = this.estimateTokens(line);
    if (episodicTokens + lineTokens > episodicBudget) break;
    episodicLines.push(line);
    episodicTokens += lineTokens;
  }

  if (episodicLines.length > 0) {
    episodicSection = '[近期情景]\n' + episodicLines.join('\n');
  }

  // 5. 组合
  const sections = [longTermSection, episodicSection].filter(s => s.length > 0);
  return sections.join('\n\n');
}

// 获取近期相关情景（简单关键词匹配）
private getRecentRelevantEpisodes(query: string, limit: number): EpisodeRecord[] {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);

  // 计算每个情景的相关性分数
  const scored = this.episodes
    .filter(e => e.outcome !== 'failure' || queryWords.some(w => e.executionSummary.toLowerCase().includes(w)))
    .map(ep => {
      const text = (ep.taskDescription + ' ' + ep.executionSummary).toLowerCase();
      const score = queryWords.filter(w => text.includes(w)).length / Math.max(queryWords.length, 1);
      return { ep, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.ep.startedAt.localeCompare(a.ep.startedAt));

  // 如果无相关情景，取最近 N 条
  if (scored.length === 0) {
    return this.episodes.slice(0, limit);
  }

  return scored.slice(0, limit).map(({ ep }) => ep);
}

// 简单 token 估算（1 token ≈ 4 字符）
private estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

### Step 3: 上下文压缩（1h）

```typescript
// 检查是否需要压缩（超过 80% token 限制时触发）
async shouldCompress(messages: Array<{ role: string; content: string }>, maxTokens: number): Promise<boolean> {
  const totalTokens = messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
  return totalTokens > maxTokens * 0.8;
}

// 压缩上下文（保留最近的消息，压缩较旧的）
async compressContext(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number
): Promise<Array<{ role: string; content: string }>> {
  const totalTokens = messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
  if (totalTokens <= maxTokens * 0.8) return messages;

  // 策略：保留 system message + 最近 6 条消息 + 中间生成摘要
  const systemMessages = messages.filter(m => m.role === 'system');
  const otherMessages = messages.filter(m => m.role !== 'system');
  const recentMessages = otherMessages.slice(-6);
  const olderMessages = otherMessages.slice(0, -6);

  if (olderMessages.length === 0) return messages; // 无法压缩

  // 生成较旧消息的摘要（简单截断，实际应调用 LLM）
  const summary = olderMessages
    .map(m => `${m.role}: ${this.truncate(m.content, 100)}`)
    .join('\n');

  const summaryMessage = {
    role: 'system' as const,
    content: `[上下文摘要]\n${summary}`,
  };

  return [...systemMessages, summaryMessage, ...recentMessages];
}
```

### Step 4: Middleware 接口（0.5h）

```typescript
// 提供 middleware 函数，用于 AgentLoop 集成
createMiddleware() {
  return async (ctx: { task: string; systemPrompt: string }, next: () => Promise<void>) => {
    const context = await this.getRelevantContext(ctx.task);
    if (context) {
      ctx.systemPrompt = ctx.systemPrompt + '\n\n' + context;
    }
    await next();
  };
}

// 如果 AgentLoop 不支持 middleware，提供 injectIntoPrompt 方法
async injectIntoPrompt(systemPrompt: string, task: string): Promise<string> {
  const context = await this.getRelevantContext(task);
  if (!context) return systemPrompt;
  return systemPrompt + '\n\n' + context;
}
```

---

## 与 AgentLoop 集成方案

**方案 A：AgentLoop 支持 middleware**（推荐）：

```typescript
// 在 AgentLoop 的 LLM 调用前执行
agentLoop.use(agentMemory.createMiddleware());
```

**方案 B：最小化修改 AgentLoop**：

在 AgentLoop 组装 system prompt 的位置添加一行：

```typescript
// 在 AgentLoop.ts 中，构建 messages 数组前
if (this.agentMemory) {
  systemPrompt = await this.agentMemory.injectIntoPrompt(systemPrompt, currentTask);
}
```

这种方式对 AgentLoop 的修改最小，且对外行为透明。

---

## 验收标准

- [ ] 情景记忆自动持久化到 `.agent-memory/episodes.json`（独立于知识库）
- [ ] 最多保留 1000 条情景记录（超出时删除最旧）
- [ ] 情景摘要截断到 <= 500 字符
- [ ] `getRelevantContext()` 注入内容不超过 token 预算
- [ ] 无相关记忆时 `getRelevantContext()` 返回空字符串（不注入空块）
- [ ] `searchEpisodes()` 支持按时间范围、关键词、outcome 过滤
- [ ] 支持查询"最近 7 天的任务"（通过 dateRange 过滤）
- [ ] 上下文超过 80% token 限制时触发压缩（保留最近 6 条）
- [ ] 进程退出前同步写入情景记忆
- [ ] 单元测试：`tests/v8/unit/agent-memory.test.ts`
