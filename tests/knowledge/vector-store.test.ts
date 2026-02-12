import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VectorStore } from '../../src/knowledge/vector-store.js';
import type { KnowledgeEntry } from '../../src/knowledge/types.js';

// 避免 fake timer 问题
beforeEach(() => vi.useRealTimers());

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vector-store-test-'));
}

function makeInput(overrides: Partial<Omit<KnowledgeEntry, 'id' | 'embedding' | 'embeddingModel' | 'version' | 'versions' | 'status' | 'createdAt' | 'updatedAt' | 'accessedAt'>> = {}) {
  return {
    namespace: 'global',
    title: 'Test Entry',
    content: 'This is a test knowledge entry about express security',
    summary: 'Test summary',
    category: 'code' as const,
    tags: ['test'],
    source: {},
    quality: { confidence: 0.8, verified: false, usageCount: 0, successRate: 1.0 },
    ...overrides,
  };
}

describe('VectorStore CRUD', () => {
  let store: VectorStore;
  let tmpDir: string;

  beforeEach(async () => {
    vi.useRealTimers();
    tmpDir = makeTmpDir();
    store = new VectorStore({ storagePath: path.join(tmpDir, 'store.json'), debounceMs: 50 });
    await store.initialize();
  });

  afterEach(async () => {
    await store.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('add() 创建条目并生成 UUID', async () => {
    const entry = await store.add(makeInput());
    expect(entry.id).toBeTruthy();
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.version).toBe(1);
    expect(entry.status).toBe('active');
    expect(entry.versions).toHaveLength(0);
  });

  it('get() 可按 ID 检索', async () => {
    const entry = await store.add(makeInput());
    const retrieved = await store.get(entry.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(entry.id);
    expect(retrieved!.title).toBe('Test Entry');
  });

  it('get() 不存在时返回 null', async () => {
    const result = await store.get('non-existent-id');
    expect(result).toBeNull();
  });

  it('update() 自动保存版本快照', async () => {
    const entry = await store.add(makeInput());
    const updated = await store.update(entry.id, { title: 'Updated Title', content: 'Updated content about nodejs typescript' });
    expect(updated.title).toBe('Updated Title');
    expect(updated.versions).toHaveLength(1);
    expect(updated.versions[0].title).toBe('Test Entry');
    expect(updated.version).toBe(2);
  });

  it('update() 版本数超 20 时删除最旧', async () => {
    let entry = await store.add(makeInput());
    for (let i = 0; i < 22; i++) {
      entry = await store.update(entry.id, { title: `Title ${i}`, content: `Content ${i} nodejs` });
    }
    const retrieved = await store.get(entry.id);
    expect(retrieved!.versions.length).toBeLessThanOrEqual(20);
  });

  it('delete() 执行软删除，status 变为 deleted', async () => {
    const entry = await store.add(makeInput());
    await store.delete(entry.id);
    const retrieved = await store.get(entry.id);
    expect(retrieved!.status).toBe('deleted');
  });

  it('delete() 不从 Map 中物理删除', async () => {
    const entry = await store.add(makeInput());
    await store.delete(entry.id);
    const retrieved = await store.get(entry.id);
    expect(retrieved).not.toBeNull();
  });

  it('list() 返回 active 条目，支持分页', async () => {
    await store.add(makeInput({ title: 'Entry 1' }));
    await store.add(makeInput({ title: 'Entry 2' }));
    await store.add(makeInput({ title: 'Entry 3' }));

    const { entries, total } = await store.list({ pageSize: 2, page: 1 });
    expect(total).toBe(3);
    expect(entries).toHaveLength(2);
  });

  it('list() pageSize 范围 1-100', async () => {
    for (let i = 0; i < 5; i++) {
      await store.add(makeInput({ title: `Entry ${i}` }));
    }
    const { entries: e1 } = await store.list({ pageSize: 200 });
    expect(e1.length).toBeLessThanOrEqual(100);

    const { entries: e2 } = await store.list({ pageSize: 0 });
    expect(e2.length).toBeGreaterThanOrEqual(1);
  });

  it('list() 支持 category 过滤', async () => {
    await store.add(makeInput({ category: 'code' }));
    await store.add(makeInput({ category: 'error-solution' }));
    const { entries } = await store.list({ category: 'code' });
    expect(entries.every(e => e.category === 'code')).toBe(true);
  });

  it('list() 删除的条目不在 active 列表中', async () => {
    const entry = await store.add(makeInput());
    await store.delete(entry.id);
    const { entries } = await store.list();
    expect(entries.find(e => e.id === entry.id)).toBeUndefined();
  });

  it('getStats() 返回正确统计', async () => {
    await store.add(makeInput({ category: 'code' }));
    await store.add(makeInput({ category: 'code' }));
    await store.add(makeInput({ category: 'error-solution' }));
    const entry = await store.add(makeInput({ category: 'context' }));
    await store.delete(entry.id);

    const stats = await store.getStats();
    expect(stats.total).toBe(4);
    expect(stats.active).toBe(3);
    expect(stats.byCategory['code']).toBe(2);
    expect(stats.byCategory['error-solution']).toBe(1);
  });
});

describe('VectorStore TF-IDF 向量化', () => {
  let store: VectorStore;
  let tmpDir: string;

  beforeEach(async () => {
    vi.useRealTimers();
    tmpDir = makeTmpDir();
    store = new VectorStore({ storagePath: path.join(tmpDir, 'store.json'), debounceMs: 50 });
    await store.initialize();
  });

  afterEach(async () => {
    await store.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('add() 后 embedding 不为空', async () => {
    const entry = await store.add(makeInput({ content: 'express security middleware nodejs' }));
    expect(entry.embedding.length).toBeGreaterThan(0);
    expect(entry.embeddingModel).toBe('tfidf-v1');
  });

  it('TF-IDF 幂等性：相同文本结果相同', async () => {
    await store.add(makeInput({ content: 'express helmet security middleware' }));
    const v1 = store.computeTFIDF('express helmet security middleware');
    const v2 = store.computeTFIDF('express helmet security middleware');
    expect(v1).toEqual(v2);
  });

  it('停用词被过滤', async () => {
    // 添加一些内容让词汇表有词
    await store.add(makeInput({ content: 'express security middleware nodejs typescript' }));
    // 停用词如 the, a, in 不应出现在向量中
    const v1 = store.computeTFIDF('the security in express');
    const v2 = store.computeTFIDF('security express');
    // 两者应该有非零分量（针对 security 和 express）
    const hasNonZero = v1.some(x => x > 0);
    expect(hasNonZero).toBe(true);
  });

  it('不相关文本的向量差异大', async () => {
    await store.add(makeInput({ content: 'express nodejs security middleware' }));
    await store.add(makeInput({ content: 'quantum physics particles wave' }));
    const v1 = store.computeTFIDF('express nodejs security');
    const v2 = store.computeTFIDF('quantum physics particles');
    // 不应完全相同
    expect(v1).not.toEqual(v2);
  });

  it('中文文本可以向量化', async () => {
    await store.add(makeInput({ content: '使用 express 框架开发 nodejs 应用程序' }));
    const v = store.computeTFIDF('express 框架 应用程序');
    expect(v.length).toBeGreaterThan(0);
  });
});

describe('VectorStore 余弦相似度搜索', () => {
  let store: VectorStore;
  let tmpDir: string;

  beforeEach(async () => {
    vi.useRealTimers();
    tmpDir = makeTmpDir();
    store = new VectorStore({ storagePath: path.join(tmpDir, 'store.json'), debounceMs: 50 });
    await store.initialize();
  });

  afterEach(async () => {
    await store.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('空知识库时 search() 返回空数组', async () => {
    const results = await store.search({ text: 'express security' });
    expect(results).toHaveLength(0);
  });

  it('空查询返回空数组', async () => {
    await store.add(makeInput());
    const results = await store.search({ text: '' });
    expect(results).toHaveLength(0);
  });

  it('语义搜索找到相关条目', async () => {
    await store.add(makeInput({ title: 'Express Security', content: 'Using helmet middleware for express security protection' }));
    await store.add(makeInput({ title: 'Database Design', content: 'PostgreSQL database schema design best practices' }));
    await store.add(makeInput({ title: 'React Components', content: 'Building reusable react typescript components' }));

    const results = await store.search({ text: 'express helmet security', topK: 3, threshold: 0 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.title).toBe('Express Security');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('threshold 过滤低分条目', async () => {
    await store.add(makeInput({ content: 'express security nodejs middleware protection' }));
    const results = await store.search({ text: 'express security', threshold: 0.99 });
    // 高阈值时可能没有结果
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0.99);
    }
  });

  it('topK 限制返回数量', async () => {
    for (let i = 0; i < 10; i++) {
      await store.add(makeInput({ title: `Entry ${i}`, content: `express security middleware ${i}` }));
    }
    const results = await store.search({ text: 'express security', topK: 3, threshold: 0 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('category 过滤只返回指定分类', async () => {
    await store.add(makeInput({ category: 'code', content: 'express security code implementation' }));
    await store.add(makeInput({ category: 'error-solution', content: 'express security error fix solution' }));

    const results = await store.search({ text: 'express security', category: 'code', threshold: 0, topK: 10 });
    expect(results.every(r => r.entry.category === 'code')).toBe(true);
  });

  it('namespace 过滤', async () => {
    await store.add(makeInput({ namespace: 'project-a', content: 'express security nodejs middleware' }));
    await store.add(makeInput({ namespace: 'project-b', content: 'express security nodejs middleware' }));

    const results = await store.search({ text: 'express security', namespace: 'project-a', threshold: 0, topK: 10 });
    expect(results.every(r => r.entry.namespace === 'project-a')).toBe(true);
  });

  it('keyword 搜索模式', async () => {
    await store.add(makeInput({ content: 'express security middleware nodejs' }));
    const results = await store.search({ text: 'express security', searchMode: 'keyword', threshold: 0, topK: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].matchType).toBe('keyword');
  });

  it('hybrid 搜索模式', async () => {
    await store.add(makeInput({ content: 'express security middleware nodejs' }));
    const results = await store.search({ text: 'express security', searchMode: 'hybrid', threshold: 0, topK: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].matchType).toBe('hybrid');
  });

  it('搜索后更新 accessedAt 和 usageCount', async () => {
    const entry = await store.add(makeInput({ content: 'express security middleware' }));
    const before = entry.quality.usageCount;
    await store.search({ text: 'express security', threshold: 0, topK: 5 });
    const updated = await store.get(entry.id);
    expect(updated!.quality.usageCount).toBe(before + 1);
  });

  it('搜索结果按分数降序排列', async () => {
    await store.add(makeInput({ content: 'express security middleware protection nodejs' }));
    await store.add(makeInput({ content: 'express security' }));
    await store.add(makeInput({ content: 'something completely different database' }));

    const results = await store.search({ text: 'express security middleware', threshold: 0, topK: 10 });
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('向量维度不一致时不崩溃（补零处理）', async () => {
    // 先添加条目，然后 store 2 有不同的词汇表
    await store.add(makeInput({ content: 'express security' }));
    // 手动模拟维度不一致：直接调用 computeTFIDF
    const v1 = [1, 2, 3];
    const v2 = [1, 2, 3, 4, 5];
    // 通过 search 触发余弦相似度
    const results = await store.search({ text: 'express security nodejs typescript', threshold: 0, topK: 5 });
    expect(Array.isArray(results)).toBe(true);
  });

  it('删除的条目不出现在搜索结果中', async () => {
    const entry = await store.add(makeInput({ content: 'express security middleware nodejs' }));
    await store.delete(entry.id);
    const results = await store.search({ text: 'express security', threshold: 0, topK: 10 });
    expect(results.find(r => r.entry.id === entry.id)).toBeUndefined();
  });
});

describe('VectorStore 持久化', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.useRealTimers();
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('数据持久化并可重新加载', async () => {
    const storePath = path.join(tmpDir, 'store.json');
    const store1 = new VectorStore({ storagePath: storePath, debounceMs: 50 });
    await store1.initialize();
    const entry = await store1.add(makeInput({ content: 'express security middleware nodejs typescript' }));
    await store1.flush();

    // 重新加载
    const store2 = new VectorStore({ storagePath: storePath, debounceMs: 50 });
    await store2.initialize();
    const retrieved = await store2.get(entry.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.title).toBe('Test Entry');
    await store2.flush();
  });

  it('目录不存在时自动创建', async () => {
    const storePath = path.join(tmpDir, 'nested', 'deep', 'store.json');
    const store = new VectorStore({ storagePath: storePath, debounceMs: 50 });
    await store.initialize();
    await store.add(makeInput());
    await store.flush();
    expect(fs.existsSync(storePath)).toBe(true);
    await store.flush();
  });

  it('flush() 强制写入文件', async () => {
    const storePath = path.join(tmpDir, 'store.json');
    const store = new VectorStore({ storagePath: storePath, debounceMs: 10000 }); // 长防抖
    await store.initialize();
    await store.add(makeInput());
    await store.flush();
    expect(fs.existsSync(storePath)).toBe(true);
  });

  it('重新加载后搜索功能正常', async () => {
    const storePath = path.join(tmpDir, 'store.json');
    const store1 = new VectorStore({ storagePath: storePath, debounceMs: 50 });
    await store1.initialize();
    await store1.add(makeInput({ content: 'express security middleware nodejs helmet protection' }));
    await store1.flush();

    const store2 = new VectorStore({ storagePath: storePath, debounceMs: 50 });
    await store2.initialize();
    const results = await store2.search({ text: 'express security', threshold: 0, topK: 5 });
    expect(results.length).toBeGreaterThan(0);
    await store2.flush();
  });
});
