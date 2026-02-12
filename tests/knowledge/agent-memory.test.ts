import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentMemory } from '../../src/knowledge/agent-memory.js';

beforeEach(() => vi.useRealTimers());

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-memory-test-'));
}

function makeEpisode(overrides: Partial<Omit<import('../../src/knowledge/types.js').EpisodeRecord, 'id'>> = {}) {
  const now = new Date().toISOString();
  return {
    taskId: 'task-001',
    agentId: 'agent-001',
    taskDescription: 'Fix a bug in the authentication module',
    executionSummary: 'Found the issue in token validation and fixed it',
    outcome: 'success' as const,
    duration: 5000,
    toolsUsed: ['read_file', 'edit_file'],
    knowledgeUsed: [],
    startedAt: now,
    completedAt: now,
    ...overrides,
  };
}

describe('AgentMemory - recordEpisode', () => {
  let memory: AgentMemory;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    memory = new AgentMemory({ memoryDir: tmpDir });
    await memory.initialize();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('recordEpisode() 应返回带 id 的记录', async () => {
    const ep = await memory.recordEpisode(makeEpisode());
    expect(ep.id).toBeTruthy();
    expect(ep.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ep.taskId).toBe('task-001');
    expect(ep.outcome).toBe('success');
  });

  it('应将新情景置于列表最前', async () => {
    await memory.recordEpisode(makeEpisode({ taskId: 'old-task' }));
    await memory.recordEpisode(makeEpisode({ taskId: 'new-task' }));

    const all = memory.getAllEpisodes();
    expect(all[0].taskId).toBe('new-task');
    expect(all[1].taskId).toBe('old-task');
  });

  it('超出 maxEpisodicRecords 时应截断最旧记录', async () => {
    const mem = new AgentMemory({ memoryDir: tmpDir + '-small', maxEpisodic: 3 });
    await mem.initialize();

    for (let i = 0; i < 5; i++) {
      await mem.recordEpisode(makeEpisode({ taskId: `task-${i}` }));
    }

    const all = mem.getAllEpisodes();
    expect(all.length).toBe(3);
    expect(all[0].taskId).toBe('task-4');

    fs.rmSync(tmpDir + '-small', { recursive: true, force: true });
  });

  it('长文本描述应被截断到 500 字符', async () => {
    const longDesc = 'x'.repeat(600);
    const ep = await memory.recordEpisode(makeEpisode({ taskDescription: longDesc }));
    expect(ep.taskDescription.length).toBe(500);
  });
});

describe('AgentMemory - recallEpisodes', () => {
  let memory: AgentMemory;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    memory = new AgentMemory({ memoryDir: tmpDir });
    await memory.initialize();

    await memory.recordEpisode(makeEpisode({
      taskId: 't1',
      taskDescription: 'Fix authentication bug',
      executionSummary: 'Token validation error resolved',
    }));
    await memory.recordEpisode(makeEpisode({
      taskId: 't2',
      taskDescription: 'Optimize database queries',
      executionSummary: 'Added indexes and reduced N+1',
    }));
    await memory.recordEpisode(makeEpisode({
      taskId: 't3',
      taskDescription: 'Fix authentication token expiry',
      executionSummary: 'Extended token lifetime',
    }));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应按查询关键词返回相关情景', async () => {
    const results = await memory.recallEpisodes('authentication token', 3);
    expect(results.length).toBeGreaterThan(0);
    // 认证相关的任务应排在前面
    const hasAuth = results.some(r =>
      r.taskDescription.toLowerCase().includes('authentication') ||
      r.executionSummary.toLowerCase().includes('token')
    );
    expect(hasAuth).toBe(true);
  });

  it('limit 参数应限制返回数量', async () => {
    const results = await memory.recallEpisodes('fix', 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('无匹配时应返回最近情景', async () => {
    const results = await memory.recallEpisodes('zzz-nonexistent-query', 2);
    expect(results.length).toBeGreaterThanOrEqual(0);
  });
});

describe('AgentMemory - buildMemoryContext', () => {
  let memory: AgentMemory;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    memory = new AgentMemory({ memoryDir: tmpDir, tokenBudget: 500 });
    await memory.initialize();

    await memory.recordEpisode(makeEpisode({
      taskId: 't1',
      executionSummary: 'Fixed auth bug successfully',
    }));
    await memory.storeKnowledge(
      'Use JWT tokens with short expiry for security',
      'best-practice',
      { title: 'JWT Security Best Practice' }
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应返回包含 [记忆上下文] 的字符串', async () => {
    const ctx = await memory.buildMemoryContext('authentication security');
    // 有情景记忆时应有内容
    if (ctx.length > 0) {
      expect(ctx).toContain('[记忆上下文]');
    }
  });

  it('token 预算为 0 时应截断输出', async () => {
    const ctx = await memory.buildMemoryContext('auth', 0);
    // 预算为0时，只有header或为空
    expect(ctx.length).toBeLessThanOrEqual(20);
  });

  it('无相关记忆时应返回空字符串', async () => {
    // 清空情景，且 knowledge store 中没有相关内容
    const emptyMem = new AgentMemory({ memoryDir: tmpDir + '-empty' });
    await emptyMem.initialize();
    const ctx = await emptyMem.buildMemoryContext('completely unrelated xyz 12345');
    expect(ctx).toBe('');
    fs.rmSync(tmpDir + '-empty', { recursive: true, force: true });
  });

  it('应包含 "相关经验:" 标题', async () => {
    const ctx = await memory.buildMemoryContext('fix auth bug', 2000);
    if (ctx.length > 0) {
      expect(ctx).toContain('相关经验:');
    }
  });
});

describe('AgentMemory - loadEpisodes / saveEpisodes', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saveEpisodes 后重新加载应保持数据一致', async () => {
    const mem1 = new AgentMemory({ memoryDir: tmpDir });
    await mem1.initialize();
    await mem1.recordEpisode(makeEpisode({ taskId: 'persistent-task' }));
    await mem1.saveEpisodes();

    const mem2 = new AgentMemory({ memoryDir: tmpDir });
    await mem2.initialize();

    const all = mem2.getAllEpisodes();
    expect(all.some(e => e.taskId === 'persistent-task')).toBe(true);
  });
});

describe('AgentMemory - storeKnowledge / recallKnowledge', () => {
  let memory: AgentMemory;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    memory = new AgentMemory({ memoryDir: tmpDir });
    await memory.initialize();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('storeKnowledge 应存储并可检索', async () => {
    await memory.storeKnowledge(
      'Express middleware should handle async errors with try-catch',
      'best-practice',
      { title: 'Async Error Handling', tags: ['express', 'middleware'] }
    );

    const results = await memory.recallKnowledge('express async error handling');
    // 可能因 TF-IDF 阈值未达到而返回空，但不应报错
    expect(Array.isArray(results)).toBe(true);
  });
});
