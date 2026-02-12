# Task 08: 端到端测试

**优先级**: P1
**预计工时**: 4h
**阶段**: Phase 3
**依赖**: Task 1-7（全部模块）

---

## 目标

编写完整的单元测试和端到端集成测试，验证知识库系统在真实场景下的正确性、性能和可靠性，确保与 v5/v6/v7 集成无回归。

---

## 测试文件结构

```
tests/v8/
├── unit/
│   ├── vector-store.test.ts    - VectorStore CRUD + 持久化
│   ├── tfidf.test.ts           - TF-IDF 向量化算法
│   ├── cosine.test.ts          - 余弦相似度和 Top-K 检索
│   ├── extractor.test.ts       - KnowledgeExtractor 规则引擎
│   ├── agent-memory.test.ts    - AgentMemory 情景记忆 + 注入
│   └── project-kb.test.ts     - ProjectKnowledgeBase I/O + 版本控制
└── e2e/
    ├── knowledge-accumulation.test.ts  - 多任务知识积累场景
    ├── memory-injection.test.ts        - 记忆注入完整流程
    ├── persistence.test.ts             - 持久化可靠性
    └── performance.test.ts             - 性能基准测试
```

---

## 实现步骤

### Step 1: 单元测试（2h）

#### `tests/v8/unit/vector-store.test.ts`

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { VectorStore } from '../../../src/knowledge/vector-store';

let tmpDir: string;
let store: VectorStore;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-memory-test-'));
  store = new VectorStore({
    storagePath: path.join(tmpDir, 'knowledge-store.json'),
  });
  await store.initialize();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('CRUD 操作', () => {
  test('add() 创建条目并分配 UUID', async () => {
    const entry = await store.add({
      title: '测试条目',
      content: 'Express.js 安全配置：使用 helmet',
      category: 'best-practice',
      tags: ['express', 'security'],
      summary: '摘要',
      source: { manual: true },
      quality: { confidence: 0.8, verified: false, usageCount: 0, successRate: 0 },
    });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.version).toBe(1);
    expect(entry.versions).toHaveLength(0);
    expect(entry.status).toBe('active');
  });

  test('update() 自动保存版本快照', async () => {
    const entry = await store.add({ title: '原始标题', content: '原始内容', category: 'code', /* ... */ });
    const updated = await store.update(entry.id, { title: '更新标题', content: '更新内容' });

    expect(updated.version).toBe(2);
    expect(updated.versions).toHaveLength(1);
    expect(updated.versions[0].title).toBe('原始标题');
    expect(updated.versions[0].version).toBe(1);
  });

  test('update() 版本数超 20 时删除最旧', async () => {
    let entry = await store.add({ title: 'v1', content: '内容', category: 'code', /* ... */ });
    for (let i = 2; i <= 22; i++) {
      entry = await store.update(entry.id, { title: `v${i}` });
    }
    expect(entry.versions).toHaveLength(20);
    expect(entry.versions[0].version).toBe(2); // v1 被删除
  });

  test('delete() 执行软删除', async () => {
    const entry = await store.add({ title: '待删除', content: '内容', category: 'code', /* ... */ });
    await store.delete(entry.id);
    const deleted = await store.get(entry.id);
    expect(deleted?.status).toBe('deleted');
  });

  test('list() 支持分页', async () => {
    for (let i = 0; i < 15; i++) {
      await store.add({ title: `条目${i}`, content: `内容${i}`, category: 'code', /* ... */ });
    }
    const page1 = await store.list({ page: 1, pageSize: 10 });
    const page2 = await store.list({ page: 2, pageSize: 10 });
    expect(page1.entries).toHaveLength(10);
    expect(page2.entries).toHaveLength(5);
    expect(page1.total).toBe(15);
  });
});

describe('持久化', () => {
  test('数据持久化到文件并可恢复', async () => {
    await store.add({ title: '持久化测试', content: '内容', category: 'code', /* ... */ });
    await store.flush();

    // 创建新实例，从文件加载
    const store2 = new VectorStore({ storagePath: path.join(tmpDir, 'knowledge-store.json') });
    await store2.initialize();
    const { entries } = await store2.list();
    expect(entries.some(e => e.title === '持久化测试')).toBe(true);
  });

  test('原子写入：写入临时文件后 rename', async () => {
    await store.add({ title: '测试', content: '内容', category: 'code', /* ... */ });
    await store.flush();
    // 正式文件存在，临时文件不存在
    expect(fs.existsSync(path.join(tmpDir, 'knowledge-store.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'knowledge-store.json.tmp'))).toBe(false);
  });
});
```

#### `tests/v8/unit/tfidf.test.ts`

```typescript
describe('TF-IDF 向量化', () => {
  test('同一文本多次向量化结果相同（幂等）', async () => {
    const v1 = store.computeTFIDF('express helmet security middleware');
    const v2 = store.computeTFIDF('express helmet security middleware');
    expect(v1).toEqual(v2);
  });

  test('支持中英文混合文本', async () => {
    const v = store.computeTFIDF('使用 Express.js 构建 API');
    expect(v.length).toBeGreaterThan(0);
    expect(v.some(x => x > 0)).toBe(true);
  });

  test('停用词不影响向量', async () => {
    // 只有停用词的文本，向量应为空或全零
    const v = store.computeTFIDF('the a an is are');
    expect(v.every(x => x === 0)).toBe(true);
  });
});

describe('余弦相似度', () => {
  test('相同文本相似度为 1', async () => {
    await store.add({ title: 'Express', content: 'use helmet for security', category: 'best-practice', /* ... */ });
    const results = await store.search({ text: 'use helmet for security', topK: 1, threshold: 0 });
    expect(results[0].score).toBeCloseTo(1, 1);
  });

  test('相关文本相似度 >= 0.7', async () => {
    await store.add({ title: 'Express安全', content: 'Express helmet security middleware best practice', category: 'best-practice', /* ... */ });
    const results = await store.search({ text: 'Express security best practice', topK: 1, threshold: 0 });
    expect(results[0].score).toBeGreaterThanOrEqual(0.7);
  });

  test('不相关文本相似度 <= 0.2', async () => {
    await store.add({ title: '量子力学', content: '量子纠缠 波函数 薛定谔方程 普朗克常数', category: 'context', /* ... */ });
    const results = await store.search({ text: 'express nodejs security', topK: 1, threshold: 0 });
    if (results.length > 0) {
      expect(results[0].score).toBeLessThanOrEqual(0.2);
    }
  });

  test('空知识库返回空数组', async () => {
    const results = await store.search({ text: 'express security', topK: 5 });
    expect(results).toHaveLength(0);
  });
});
```

### Step 2: E2E 测试（1.5h）

#### `tests/v8/e2e/knowledge-accumulation.test.ts`

```typescript
import { ProjectKnowledgeBase } from '../../../src/knowledge/project-kb';
import { KnowledgeExtractor } from '../../../src/knowledge/extractor';
import { EventEmitter } from 'events';

describe('多任务知识积累', () => {
  let kb: ProjectKnowledgeBase;
  let extractor: KnowledgeExtractor;
  let emitter: EventEmitter;

  beforeEach(async () => {
    kb = new ProjectKnowledgeBase(tmpDir);
    await kb.initialize();
    extractor = new KnowledgeExtractor(kb['store']);
    emitter = new EventEmitter();
    extractor.attach(emitter);
  });

  test('场景：10 个任务后知识库有积累', async () => {
    const tasks = [
      { input: '实现登录 API', output: '使用 JWT 和 bcrypt，设置 token 过期时间', success: true },
      { input: '修复 CORS 错误', output: 'Access-Control-Allow-Origin 设置为 * 或具体域名', success: true },
      { input: '添加数据库连接', output: 'TypeORM 连接 PostgreSQL，配置连接池', success: true },
      { input: '处理文件上传', output: '使用 multer 中间件，限制文件大小', success: true },
      { input: '实现分页查询', output: 'LIMIT OFFSET 分页，返回 total 字段', success: true },
      { input: '修复内存泄漏', output: 'TypeError: Cannot read property of undefined，检查空值', success: false },
      { input: '添加日志系统', output: '使用 winston 记录 info/error 级别日志', success: true },
      { input: '实现缓存', output: '使用 Redis 缓存，设置 TTL 为 3600s', success: true },
      { input: '配置 HTTPS', output: '使用 Let\'s Encrypt 证书，nginx 反向代理', success: true },
      { input: '部署到生产', output: 'Docker 容器化，使用 docker-compose', success: true },
    ];

    for (const task of tasks) {
      emitter.emit('task:completed', {
        taskId: `task-${Math.random().toString(36).slice(2)}`,
        agentId: 'master-001',
        ...task,
        toolsUsed: ['bash', 'file'],
        duration: 1000,
      });
      // 等待异步提取完成
      await new Promise(r => setTimeout(r, 100));
    }

    const stats = await kb.stats();
    expect(stats.active).toBeGreaterThanOrEqual(8); // 至少 8 条知识（部分可能合并）

    // 验证知识可检索
    const results = await kb.search({ text: 'JWT 登录认证', topK: 3 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThan(0.3);
  });

  test('重复相似知识自动合并', async () => {
    const content = '使用 Express helmet 中间件防止常见 Web 安全漏洞';
    for (let i = 0; i < 3; i++) {
      emitter.emit('task:completed', {
        taskId: `task-${i}`,
        agentId: 'agent-001',
        input: 'Express 安全配置',
        output: content,
        success: true,
        toolsUsed: [],
        duration: 500,
      });
      await new Promise(r => setTimeout(r, 50));
    }

    const { total } = await kb.list({ status: 'active' });
    // 重复知识合并，总条数应该 <= 2（而不是 3）
    expect(total).toBeLessThanOrEqual(2);
  });

  test('错误经验分类为 error-solution', async () => {
    emitter.emit('task:failed', {
      taskId: 'task-fail-001',
      agentId: 'agent-001',
      input: '连接数据库',
      error: new Error('ECONNREFUSED: 数据库连接失败，请检查数据库是否启动'),
      toolsUsed: [],
      duration: 500,
    });
    await new Promise(r => setTimeout(r, 200));

    const results = await kb.search({ text: '数据库连接失败', topK: 3 });
    const errorEntry = results.find(r => r.entry.category === 'error-solution');
    expect(errorEntry).toBeDefined();
    // 验证 API Key 类信息被脱敏
    expect(errorEntry?.entry.content).not.toMatch(/password=.+/i);
  });
});
```

#### `tests/v8/e2e/persistence.test.ts`

```typescript
describe('持久化可靠性', () => {
  test('模拟进程重启后数据恢复', async () => {
    const kb1 = new ProjectKnowledgeBase(tmpDir);
    await kb1.initialize();

    await kb1.add({ title: '重要知识', content: '不能丢失的内容', category: 'best-practice', /* ... */ });
    await kb1.flush(); // 模拟优雅退出

    // 模拟新进程启动
    const kb2 = new ProjectKnowledgeBase(tmpDir);
    await kb2.initialize();

    const results = await kb2.search({ text: '重要知识', topK: 1 });
    expect(results[0].entry.title).toBe('重要知识');
  });

  test('Markdown 导出后重新导入数据完整', async () => {
    const kb = new ProjectKnowledgeBase(tmpDir);
    await kb.initialize();

    await kb.add({ title: '导出测试', content: '完整的知识内容', category: 'best-practice', tags: ['test'], /* ... */ });

    const markdown = await kb.exportMarkdown();
    expect(markdown).toContain('[best-practice] 导出测试');

    // 导入到新知识库
    const kb2 = new ProjectKnowledgeBase(tmpDir2);
    await kb2.initialize();
    const result = await kb2.importMarkdown(markdown);

    expect(result.imported).toBe(1);
    const { entries } = await kb2.list();
    expect(entries[0].title).toBe('导出测试');
    expect(entries[0].tags).toContain('test');
  });
});
```

### Step 3: 性能基准测试（0.5h）

#### `tests/v8/e2e/performance.test.ts`

```typescript
describe('性能基准', () => {
  test('TF-IDF 向量化延迟 P99 <= 50ms', async () => {
    // 先构建有足够词汇量的知识库
    for (let i = 0; i < 100; i++) {
      await store.add({
        content: `知识条目 ${i}: express nodejs typescript react docker postgresql redis helm kubernetes`,
        title: `条目${i}`, category: 'code', /* ... */
      });
    }

    const times: number[] = [];
    const testText = 'express nodejs security middleware best practice';
    for (let i = 0; i < 200; i++) {
      const start = performance.now();
      store.computeTFIDF(testText);
      times.push(performance.now() - start);
    }

    times.sort((a, b) => a - b);
    const p99 = times[Math.floor(times.length * 0.99)];
    expect(p99).toBeLessThanOrEqual(50);
  }, 30000);

  test('检索延迟 P99 <= 200ms（10,000 条）', async () => {
    // 批量创建 10,000 条
    const batchSize = 100;
    for (let batch = 0; batch < 100; batch++) {
      const promises = [];
      for (let i = 0; i < batchSize; i++) {
        const idx = batch * batchSize + i;
        promises.push(store.add({
          title: `知识${idx}`,
          content: `内容${idx} express nodejs typescript security ${idx % 10 === 0 ? 'best-practice' : ''}`,
          category: idx % 5 === 0 ? 'best-practice' : 'code',
          /* ... */
        }));
      }
      await Promise.all(promises);
    }

    const times: number[] = [];
    for (let i = 0; i < 50; i++) {
      const start = performance.now();
      await store.search({ text: 'express nodejs security', topK: 5 });
      times.push(performance.now() - start);
    }

    times.sort((a, b) => a - b);
    const p99 = times[Math.floor(times.length * 0.99)];
    expect(p99).toBeLessThanOrEqual(200);
  }, 120000);

  test('内存占用 <= 200MB（10,000 条）', () => {
    const memUsage = process.memoryUsage();
    expect(memUsage.heapUsed / 1024 / 1024).toBeLessThanOrEqual(200);
  });
});
```

### Step 4: 回归测试检查（0.5h）

在 Phase 3 完成后，运行现有测试套件确保无回归：

```bash
# 运行现有测试（v5/v6/v7）
npm test -- --testPathIgnorePatterns='tests/v8'

# 运行 v8 测试
npm test -- tests/v8/
```

检查要点：
1. `src/ai/agent-loop.ts` 的任何修改不破坏现有 AgentLoop 测试
2. `src/ai/master-agent.ts` 添加事件发射不影响现有功能
3. `src/knowledge/index.ts` 的导出不与现有模块冲突

---

## 测试配置

在 `package.json` 中添加测试命令（或确认已有）：

```json
{
  "scripts": {
    "test:v8": "jest tests/v8/ --runInBand",
    "test:v8:unit": "jest tests/v8/unit/",
    "test:v8:e2e": "jest tests/v8/e2e/ --runInBand",
    "test:v8:perf": "jest tests/v8/e2e/performance.test.ts --testTimeout=120000"
  }
}
```

---

## 验收标准

- [ ] `tests/v8/unit/` 中所有单元测试通过
- [ ] `tests/v8/e2e/knowledge-accumulation.test.ts` 通过（10 任务场景）
- [ ] `tests/v8/e2e/persistence.test.ts` 通过（数据不丢失）
- [ ] `tests/v8/e2e/performance.test.ts` 通过（10,000 条 P99 <= 200ms）
- [ ] TF-IDF 向量化 P99 <= 50ms
- [ ] 内存占用（10,000 条）<= 200MB
- [ ] 单元测试覆盖率 >= 80%（使用 `jest --coverage`）
- [ ] 现有测试套件（v5/v6/v7）无回归
- [ ] 重复知识自动合并（相似度 > 0.9）
- [ ] 错误信息分类为 `error-solution`
- [ ] Markdown 导出后重新导入数据完整
- [ ] 进程重启后数据完全恢复
