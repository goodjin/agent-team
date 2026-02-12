# Task 02: TF-IDF 向量化引擎

**优先级**: P0
**预计工时**: 5h
**阶段**: Phase 1
**依赖**: Task 1（types.ts + VectorStore 骨架）

---

## 目标

在 VectorStore 中实现完整的 TF-IDF 向量化引擎，支持中英文混合文本，词汇表动态管理，实现幂等性，延迟 P99 <= 50ms。

---

## 背景知识

**TF-IDF（词频-逆文档频率）**：

```
TF(t, d)  = 词 t 在文档 d 中出现的次数 / 文档 d 的总词数
IDF(t)    = log(总文档数 N / 含词 t 的文档数 df_t + 1)
TF-IDF(t, d) = TF(t, d) * IDF(t)
```

向量表示：词汇表中每个词对应向量的一个维度，值为该词的 TF-IDF 分数。

**示例**：词汇表 = ["express", "helmet", "security"]，文档 "use helmet for security" 的向量 = [0, 0.5, 0.3]

---

## 实现步骤

### Step 1: 分词器（Tokenizer）（1h）

在 `src/knowledge/vector-store.ts` 中实现私有方法：

```typescript
private tokenize(text: string): string[] {
  // 1. 转小写
  let s = text.toLowerCase();

  // 2. 中文分字（将中文字符按字分开）
  s = s.replace(/[\u4e00-\u9fa5]/g, (char) => ` ${char} `);

  // 3. 保留字母、数字、中文，其余替换为空格
  s = s.replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ');

  // 4. 分词
  const tokens = s.split(/\s+/).filter(t => t.length > 0);

  // 5. 停用词过滤
  return tokens.filter(t => !STOP_WORDS.has(t) && t.length >= 2);
}
```

**停用词集合**（`STOP_WORDS`，定义为模块级常量）：

```typescript
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
```

### Step 2: 词汇表管理（1h）

```typescript
// 词汇表（词 -> 词汇表索引）
private vocab: Map<string, number> = new Map();
// 文档频率（词 -> 含该词的文档数）
private docFreq: Map<string, number> = new Map();
// 总文档数（仅计 active 文档）
private docCount: number = 0;
// CRUD 操作计数，用于触发全量重建
private crudCount: number = 0;

// 向词汇表添加新词
private addToVocab(tokens: string[]): void {
  for (const token of new Set(tokens)) {
    if (!this.vocab.has(token)) {
      if (this.vocab.size >= this.options.maxVocabSize) continue; // 词汇表已满
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
```

**全量 IDF 重建**（异步，不阻塞主流程）：

```typescript
private async rebuildIDF(): Promise<void> {
  // 重新统计所有 active 文档的词频
  const newDocFreq = new Map<string, number>();
  let activeCount = 0;

  for (const entry of this.index.values()) {
    if (entry.status !== 'active') continue;
    activeCount++;
    const tokens = this.tokenize(entry.content + ' ' + entry.title);
    for (const token of new Set(tokens)) {
      newDocFreq.set(token, (newDocFreq.get(token) ?? 0) + 1);
    }
  }

  this.docFreq = newDocFreq;
  this.docCount = activeCount;

  // 重建词汇表（保留高频词，淘汰低频词）
  const sortedByFreq = [...newDocFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, this.options.maxVocabSize);

  this.vocab = new Map(sortedByFreq.map(([word], i) => [word, i]));

  // 重新计算所有 active 文档的 embedding
  for (const entry of this.index.values()) {
    if (entry.status !== 'active') continue;
    entry.embedding = this.computeTFIDF(entry.content + ' ' + entry.title);
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
```

### Step 3: TF-IDF 向量计算（1.5h）

```typescript
// 计算单个文档的 TF-IDF 向量
computeTFIDF(text: string): number[] {
  const tokens = this.tokenize(text);
  if (tokens.length === 0 || this.vocab.size === 0) return [];

  // 计算词频（TF）
  const termFreq = new Map<string, number>();
  for (const token of tokens) {
    termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
  }

  // 构建向量（维度 = 词汇表大小）
  const vector = new Array(this.vocab.size).fill(0);
  const N = Math.max(this.docCount, 1);

  for (const [term, freq] of termFreq) {
    const idx = this.vocab.get(term);
    if (idx === undefined) continue;

    const tf = freq / tokens.length;
    const df = this.docFreq.get(term) ?? 0;
    const idf = Math.log(N / (df + 1)) + 1; // +1 平滑
    vector[idx] = tf * idf;
  }

  return vector;
}

// 在 VectorStore.add() 中调用
// entry.embedding = this.computeTFIDF(entry.content + ' ' + entry.title + ' ' + entry.tags.join(' '));
// entry.embeddingModel = 'tfidf-v1';
```

**向量化文本组合策略**（影响检索效果）：

```
向量化输入 = title + ' ' + content + ' ' + tags.join(' ')
权重设计（通过重复实现）：title 内容在文本中出现更多次，自然权重更高
```

### Step 4: 幂等性保证（0.5h）

**问题**：TF-IDF 的 IDF 值会随文档数变化，导致不同时刻向量化结果不同。

**解决方案**：同一文档的向量通过 `rebuildIDF` 全量重建保持一致。对于相同文本，在相同词汇表和 IDF 状态下，向量化结果一定相同（幂等）。

**测试验证**：
```typescript
const v1 = store.computeTFIDF("express helmet security");
const v2 = store.computeTFIDF("express helmet security");
assert.deepEqual(v1, v2); // 必须通过
```

### Step 5: 加载时恢复词汇表状态（1h）

从 JSON 文件加载后，需要恢复词汇表和 docFreq：

```typescript
async initialize(): Promise<void> {
  // ... 读取文件，加载 entries 到 index ...

  // 重建词汇表状态
  await this.rebuildIDF();
}
```

注意：`initialize()` 中的 `rebuildIDF()` 是同步等待（await）的，确保启动后词汇表就绪。

---

## 性能优化

**10,000 条知识库的词汇表构建性能**：

- 预期词汇量：~5,000-8,000 词（中英文技术文档）
- 向量维度：词汇表大小（最多 10,000）
- 内存估算：10,000 条 × 10,000 维 × 8 bytes = 800MB（过高！）

**优化策略：稀疏向量**：

```typescript
// 仅存储非零值
interface SparseVector {
  indices: number[];
  values: number[];
  size: number;
}

// 存储时序列化为稀疏格式
// 计算余弦相似度时也使用稀疏格式（Task 3 实现）
```

**实际内存估算（稀疏向量）**：
- 每条文档平均 50 个非零词
- 10,000 条 × 50 词 × (4 bytes index + 8 bytes value) = 6MB
- 加上词汇表和元数据，总内存 < 50MB，满足 200MB 约束

---

## 数据迁移：向量化格式

在 `vectors.json` 的 `metadata` 中记录嵌入模型版本：

```json
{
  "metadata": {
    "embedderConfig": { "type": "tfidf", "version": "1.0" }
  }
}
```

未来换 Embedder 时，检测版本不匹配则触发全量重新向量化。

---

## 验收标准

- [ ] 单条文本向量化延迟 P99 <= 50ms（基准：10,000 词汇表，500 字文本）
- [ ] 同一文本（相同 IDF 状态下）多次向量化结果完全相同（幂等）
- [ ] 支持中英文混合文本分词
- [ ] 停用词正确过滤（中英文各至少 20 个）
- [ ] 词汇表上限 10,000 词（可通过配置修改）
- [ ] 每 100 次 CRUD 操作异步触发全量 IDF 重建
- [ ] 全量重建期间不阻塞主线程（使用 `setImmediate`）
- [ ] 文件加载后词汇表状态正确恢复
- [ ] 稀疏向量存储（避免内存爆炸）
- [ ] 单元测试：`tests/v8/unit/tfidf.test.ts` 验证向量化正确性
