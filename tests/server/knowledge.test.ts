import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import express from 'express';
import request from 'supertest';
import { VectorStore } from '../../src/knowledge/vector-store.js';
import { createKnowledgeRouter } from '../../src/server/routes/knowledge.js';

beforeEach(() => vi.useRealTimers());

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-api-test-'));
}

function createTestApp(store: VectorStore) {
  const app = express();
  app.use(express.json());
  app.use('/knowledge', createKnowledgeRouter(store));
  return app;
}

function makeEntry(overrides: Partial<{
  title: string; content: string; category: any; tags: string[];
}> = {}) {
  return {
    namespace: 'global',
    title: 'Test Entry',
    content: 'Test content about express routing',
    summary: 'Test summary',
    category: 'best-practice',
    tags: ['test'],
    source: {},
    quality: { confidence: 0.8, verified: false, usageCount: 0, successRate: 1.0 },
    ...overrides,
  };
}

describe('Knowledge API - POST /knowledge (创建)', () => {
  let store: VectorStore;
  let tmpDir: string;
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    store = new VectorStore({ storagePath: path.join(tmpDir, 'store.json'), debounceMs: 50 });
    await store.initialize();
    app = createTestApp(store);
  });

  afterEach(async () => {
    await store.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应创建条目并返回 201', async () => {
    const res = await request(app)
      .post('/knowledge')
      .send(makeEntry())
      .expect(201);

    expect(res.body.code).toBe(201);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.message).toBe('创建成功');
  });

  it('缺少 title 应返回 400', async () => {
    const res = await request(app)
      .post('/knowledge')
      .send({ content: 'some content' })
      .expect(400);

    expect(res.body.code).toBe(400);
    expect(res.body.errorCode).toBe('MISSING_FIELDS');
  });

  it('缺少 content 应返回 400', async () => {
    const res = await request(app)
      .post('/knowledge')
      .send({ title: 'some title' })
      .expect(400);

    expect(res.body.code).toBe(400);
  });
});

describe('Knowledge API - GET /knowledge/:id (读取)', () => {
  let store: VectorStore;
  let tmpDir: string;
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    store = new VectorStore({ storagePath: path.join(tmpDir, 'store.json'), debounceMs: 50 });
    await store.initialize();
    app = createTestApp(store);
  });

  afterEach(async () => {
    await store.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应返回存在的条目', async () => {
    const entry = await store.add(makeEntry() as any);
    const res = await request(app)
      .get(`/knowledge/${entry.id}`)
      .expect(200);

    expect(res.body.code).toBe(200);
    expect(res.body.data.id).toBe(entry.id);
  });

  it('不存在时应返回 404', async () => {
    const res = await request(app)
      .get('/knowledge/nonexistent-id')
      .expect(404);

    expect(res.body.code).toBe(404);
    expect(res.body.errorCode).toBe('NOT_FOUND');
  });
});

describe('Knowledge API - PUT /knowledge/:id (更新)', () => {
  let store: VectorStore;
  let tmpDir: string;
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    store = new VectorStore({ storagePath: path.join(tmpDir, 'store.json'), debounceMs: 50 });
    await store.initialize();
    app = createTestApp(store);
  });

  afterEach(async () => {
    await store.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应更新条目并返回 200', async () => {
    const entry = await store.add(makeEntry() as any);
    const res = await request(app)
      .put(`/knowledge/${entry.id}`)
      .send({ title: 'Updated Title' })
      .expect(200);

    expect(res.body.code).toBe(200);
    expect(res.body.data.title).toBe('Updated Title');
    expect(res.body.message).toBe('更新成功');
  });

  it('不存在的 id 应返回 404', async () => {
    const res = await request(app)
      .put('/knowledge/nonexistent-id')
      .send({ title: 'New Title' })
      .expect(404);

    expect(res.body.code).toBe(404);
  });
});

describe('Knowledge API - DELETE /knowledge/:id (删除)', () => {
  let store: VectorStore;
  let tmpDir: string;
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    store = new VectorStore({ storagePath: path.join(tmpDir, 'store.json'), debounceMs: 50 });
    await store.initialize();
    app = createTestApp(store);
  });

  afterEach(async () => {
    await store.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应软删除条目并返回 200', async () => {
    const entry = await store.add(makeEntry() as any);
    const res = await request(app)
      .delete(`/knowledge/${entry.id}`)
      .expect(200);

    expect(res.body.code).toBe(200);
    expect(res.body.message).toBe('删除成功');

    // 验证软删除
    const deleted = await store.get(entry.id);
    expect(deleted?.status).toBe('deleted');
  });

  it('不存在时应返回 404', async () => {
    const res = await request(app)
      .delete('/knowledge/nonexistent-id')
      .expect(404);

    expect(res.body.code).toBe(404);
  });
});

describe('Knowledge API - GET /knowledge (列表)', () => {
  let store: VectorStore;
  let tmpDir: string;
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    store = new VectorStore({ storagePath: path.join(tmpDir, 'store.json'), debounceMs: 50 });
    await store.initialize();
    app = createTestApp(store);

    await store.add(makeEntry({ category: 'code', title: 'Code Entry', tags: ['typescript'] }) as any);
    await store.add(makeEntry({ category: 'best-practice', title: 'BP Entry', tags: ['design'] }) as any);
  });

  afterEach(async () => {
    await store.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应返回所有 active 条目', async () => {
    const res = await request(app)
      .get('/knowledge')
      .expect(200);

    expect(res.body.code).toBe(200);
    expect(res.body.data.entries).toBeDefined();
    expect(res.body.data.total).toBe(2);
  });

  it('支持 category 过滤', async () => {
    const res = await request(app)
      .get('/knowledge?category=code')
      .expect(200);

    expect(res.body.data.entries.every((e: any) => e.category === 'code')).toBe(true);
  });

  it('支持分页参数', async () => {
    const res = await request(app)
      .get('/knowledge?page=1&pageSize=1')
      .expect(200);

    expect(res.body.data.entries.length).toBeLessThanOrEqual(1);
  });
});

describe('Knowledge API - POST /knowledge/search (语义搜索)', () => {
  let store: VectorStore;
  let tmpDir: string;
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    store = new VectorStore({ storagePath: path.join(tmpDir, 'store.json'), debounceMs: 50 });
    await store.initialize();
    app = createTestApp(store);

    await store.add(makeEntry({ title: 'Express Routing', content: 'Express.js router for REST API' }) as any);
  });

  afterEach(async () => {
    await store.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应返回搜索结果', async () => {
    const res = await request(app)
      .post('/knowledge/search')
      .send({ text: 'express REST API routing' })
      .expect(200);

    expect(res.body.code).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('缺少 text 应返回 400', async () => {
    const res = await request(app)
      .post('/knowledge/search')
      .send({})
      .expect(400);

    expect(res.body.code).toBe(400);
    expect(res.body.errorCode).toBe('MISSING_FIELDS');
  });
});

describe('Knowledge API - GET /knowledge/stats (统计)', () => {
  let store: VectorStore;
  let tmpDir: string;
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    store = new VectorStore({ storagePath: path.join(tmpDir, 'store.json'), debounceMs: 50 });
    await store.initialize();
    app = createTestApp(store);

    await store.add(makeEntry({ category: 'code' }) as any);
    await store.add(makeEntry({ category: 'best-practice' }) as any);
  });

  afterEach(async () => {
    await store.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应返回统计信息', async () => {
    const res = await request(app)
      .get('/knowledge/stats')
      .expect(200);

    expect(res.body.code).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.total).toBeGreaterThanOrEqual(2);
    expect(res.body.data.active).toBeGreaterThanOrEqual(2);
    expect(res.body.data.byCategory).toBeDefined();
  });
});

describe('Knowledge API - 响应格式规范', () => {
  let store: VectorStore;
  let tmpDir: string;
  let app: ReturnType<typeof express>;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    store = new VectorStore({ storagePath: path.join(tmpDir, 'store.json'), debounceMs: 50 });
    await store.initialize();
    app = createTestApp(store);
  });

  afterEach(async () => {
    await store.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('成功响应应包含 code/data/message 字段', async () => {
    await store.add(makeEntry() as any);
    const res = await request(app).get('/knowledge').expect(200);
    expect(res.body).toHaveProperty('code');
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('message');
  });

  it('错误响应应包含 errorCode 字段', async () => {
    const res = await request(app).get('/knowledge/nonexistent').expect(404);
    expect(res.body).toHaveProperty('errorCode');
    expect(res.body.data).toBeNull();
  });
});
