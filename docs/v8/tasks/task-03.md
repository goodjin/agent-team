# Task 03: 余弦相似度检索 + Top-K 搜索

**优先级**: P0
**预计工时**: 3h
**阶段**: Phase 1
**依赖**: Task 2（TF-IDF 向量化引擎）

---

## 目标

在 VectorStore 中实现 `search()` 方法，支持余弦相似度检索、相似度阈值过滤、Top-K 返回，以及关键词搜索和混合搜索模式。完成后 VectorStore 全部功能可用。

---

## 实现步骤

### Step 1: 余弦相似度计算（0.5h）

```typescript
// 密集向量余弦相似度
private cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  if (a.length !== b.length) {
    // 维度不一致时（词汇表扩展），补零对齐
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
```

**注意**：词汇表更新后，旧文档的向量维度可能小于新文档，需要补零对齐。

### Step 2: 语义搜索（Top-K）（1h）

```typescript
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
    // 跳过非 active 条目
    if (entry.status !== 'active') continue;
    // 分类过滤
    if (filter.category && entry.category !== filter.category) continue;
    // 标签过滤（查询标签必须全部匹配）
    if (filter.tags?.length && !filter.tags.every(t => entry.tags.includes(t))) continue;
    // 命名空间过滤
    if (filter.namespace && entry.namespace !== filter.namespace) continue;
    // 时间范围过滤
    if (filter.dateRange?.from && entry.createdAt < filter.dateRange.from) continue;
    if (filter.dateRange?.to && entry.createdAt > filter.dateRange.to) continue;

    const score = this.cosineSimilarity(queryVector, entry.embedding);
    if (score >= threshold) {
      results.push({ entry, score });
    }
  }

  // 按分数降序排列，取 Top-K
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK).map(r => ({
    entry: r.entry,
    score: r.score,
    matchType: 'semantic' as const,
  }));
}
```

**性能说明**：10,000 条全量遍历，每次余弦相似度计算 O(d)（d = 词汇表维度）。
实测：d=5000，n=10000 时约 50-100ms，满足 200ms P99 要求。

### Step 3: 关键词搜索（0.5h）

```typescript
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

    const entryText = (entry.title + ' ' + entry.content + ' ' + entry.tags.join(' ')).toLowerCase();
    let matchCount = 0;
    for (const token of queryTokens) {
      if (entryText.includes(token)) matchCount++;
    }

    const score = matchCount / queryTokens.length; // 0-1
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
```

### Step 4: 混合搜索（0.5h）

```typescript
private async hybridSearch(
  queryText: string,
  topK: number,
  threshold: number,
  semanticWeight: number,
  filter: Partial<SearchQuery>
): Promise<SearchResult[]> {
  // 并行执行语义搜索和关键词搜索
  const [semanticResults, keywordResults] = await Promise.all([
    this.semanticSearch(queryText, topK * 2, 0, filter), // 降低阈值，多取一些
    Promise.resolve(this.keywordSearch(queryText, topK * 2, filter)),
  ]);

  // 合并分数（按 id 聚合）
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

  // 计算混合分数
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
```

### Step 5: 统一 search() 接口（0.5h）

```typescript
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

  // 更新被检索条目的 accessedAt（Top-K 结果）
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
```

---

## 性能基准测试

在 `tests/v8/unit/vector-store.test.ts` 中添加性能基准：

```typescript
it('检索延迟 P99 <= 200ms（10,000 条）', async () => {
  // 创建 10,000 条测试数据
  for (let i = 0; i < 10000; i++) {
    await store.add({ title: `知识${i}`, content: `内容${i} express nodejs`, ... });
  }

  const times: number[] = [];
  for (let i = 0; i < 100; i++) {
    const start = Date.now();
    await store.search({ text: 'express nodejs best practice', topK: 5 });
    times.push(Date.now() - start);
  }

  times.sort((a, b) => a - b);
  const p99 = times[Math.floor(times.length * 0.99)];
  expect(p99).toBeLessThanOrEqual(200);
});
```

---

## 验收标准

- [ ] 相同语义文本的余弦相似度 >= 0.7（测试用例：同一文本的两个副本）
- [ ] 完全不相关文本的余弦相似度 <= 0.2（测试用例："express security" vs "量子物理学"）
- [ ] 10,000 条数据下检索延迟 P99 <= 200ms
- [ ] 支持 K 值范围 1-50
- [ ] 相似度阈值 threshold 正确过滤（低于阈值的不返回）
- [ ] 空知识库时 search() 返回空数组，不抛出异常
- [ ] 分类过滤：只返回指定 category 的条目
- [ ] 命名空间过滤：只返回指定 namespace 的条目
- [ ] 混合搜索权重可配置（semanticWeight 0-1）
- [ ] 检索后更新 entry.accessedAt 和 entry.quality.usageCount
- [ ] 向量维度不一致时（词汇表扩展）补零处理，不崩溃
