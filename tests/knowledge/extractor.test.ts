import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VectorStore } from '../../src/knowledge/vector-store.js';
import { KnowledgeExtractor } from '../../src/knowledge/extractor.js';
import type { TaskCompletedEvent, TaskFailedEvent, ToolErrorEvent } from '../../src/knowledge/types.js';

// 避免 fake timer 问题
beforeEach(() => vi.useRealTimers());

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'extractor-test-'));
}

async function makeStore(tmpDir: string): Promise<VectorStore> {
  const store = new VectorStore({ storagePath: path.join(tmpDir, 'store.json'), debounceMs: 50 });
  await store.initialize();
  return store;
}

describe('KnowledgeExtractor 规则匹配', () => {
  let store: VectorStore;
  let extractor: KnowledgeExtractor;
  let tmpDir: string;

  beforeEach(async () => {
    vi.useRealTimers();
    tmpDir = makeTmpDir();
    store = await makeStore(tmpDir);
    extractor = new KnowledgeExtractor(store);
  });

  afterEach(async () => {
    await store.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('onTaskCompleted() 保存知识条目', async () => {
    const event: TaskCompletedEvent = {
      taskId: 'task-001',
      agentId: 'agent-001',
      input: 'Install express and configure security middleware',
      output: 'Successfully installed express with helmet middleware for security protection',
      toolsUsed: ['npm', 'bash'],
      duration: 5000,
      success: true,
    };

    await extractor.onTaskCompleted(event);

    const { entries } = await store.list({ status: 'active' });
    expect(entries.length).toBeGreaterThan(0);
    const saved = entries[0];
    expect(saved.source.taskId).toBe('task-001');
    expect(saved.source.agentId).toBe('agent-001');
  });

  it('onTaskFailed() 保存 error-solution 条目', async () => {
    const event: TaskFailedEvent = {
      taskId: 'task-002',
      agentId: 'agent-001',
      input: 'Connect to database',
      error: new Error('ECONNREFUSED connection refused to localhost:5432'),
      toolsUsed: ['psql'],
      duration: 1000,
    };

    await extractor.onTaskFailed(event);

    const { entries } = await store.list({ status: 'active' });
    expect(entries.length).toBeGreaterThan(0);
    const saved = entries[0];
    expect(saved.category).toBe('error-solution');
    expect(saved.tags).toContain('error');
  });

  it('onToolError() 保存工具错误条目', async () => {
    const event: ToolErrorEvent = {
      taskId: 'task-003',
      agentId: 'agent-001',
      toolName: 'bash',
      input: { command: 'npm install' },
      error: 'ENOENT: no such file or directory package.json',
    };

    await extractor.onToolError(event);

    const { entries } = await store.list({ status: 'active' });
    expect(entries.length).toBeGreaterThan(0);
    const saved = entries[0];
    expect(saved.category).toBe('error-solution');
    expect(saved.tags).toContain('tool-error');
    expect(saved.tags).toContain('bash');
    expect(saved.source.tool).toBe('bash');
  });

  it('onTaskFailed() 从 Error 对象提取消息', async () => {
    const event: TaskFailedEvent = {
      taskId: 'task-004',
      agentId: 'agent-001',
      input: 'Run typescript compilation',
      error: new TypeError('Cannot read property of undefined'),
      toolsUsed: ['tsc'],
      duration: 500,
    };

    await extractor.onTaskFailed(event);

    const { entries } = await store.list({ status: 'active' });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].tags).toContain('type-error');
  });

  it('onTaskFailed() 从字符串错误提取', async () => {
    const event: TaskFailedEvent = {
      taskId: 'task-005',
      agentId: 'agent-001',
      input: 'Connect service',
      error: 'ECONNREFUSED connection refused',
      toolsUsed: [],
      duration: 200,
    };

    await extractor.onTaskFailed(event);

    const { entries } = await store.list({ status: 'active' });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].tags).toContain('connection-error');
  });
});

describe('KnowledgeExtractor 敏感信息脱敏', () => {
  let store: VectorStore;
  let extractor: KnowledgeExtractor;
  let tmpDir: string;

  beforeEach(async () => {
    vi.useRealTimers();
    tmpDir = makeTmpDir();
    store = await makeStore(tmpDir);
    extractor = new KnowledgeExtractor(store);
  });

  afterEach(async () => {
    await store.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('Bearer Token 被脱敏', async () => {
    const event: TaskCompletedEvent = {
      taskId: 'task-sec-1',
      agentId: 'agent-001',
      input: 'Call API with Bearer eyJhbGciOiJSUzI1NiJ9.token',
      output: 'API call succeeded with Bearer eyJhbGciOiJSUzI1NiJ9.token authentication',
      toolsUsed: [],
      duration: 100,
      success: true,
    };

    await extractor.onTaskCompleted(event);
    const { entries } = await store.list({ status: 'active' });
    expect(entries.length).toBeGreaterThan(0);
    // 内容中不应包含原始 token
    expect(entries[0].content).not.toContain('eyJhbGciOiJSUzI1NiJ9');
    expect(entries[0].content).toContain('[REDACTED]');
  });

  it('API Key 被脱敏', async () => {
    const event: TaskCompletedEvent = {
      taskId: 'task-sec-2',
      agentId: 'agent-001',
      input: 'Configure api_key=sk-1234567890abcdef',
      output: 'API key configured successfully',
      toolsUsed: [],
      duration: 100,
      success: true,
    };

    await extractor.onTaskCompleted(event);
    const { entries } = await store.list({ status: 'active' });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].content).toContain('[REDACTED]');
  });

  it('Password 被脱敏', async () => {
    const event: TaskFailedEvent = {
      taskId: 'task-sec-3',
      agentId: 'agent-001',
      input: 'Connect with password=mysecretpassword123',
      error: 'Authentication failed',
      toolsUsed: [],
      duration: 100,
    };

    await extractor.onTaskFailed(event);
    const { entries } = await store.list({ status: 'active' });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].content).toContain('[REDACTED]');
  });
});

describe('KnowledgeExtractor 事件监听', () => {
  let store: VectorStore;
  let extractor: KnowledgeExtractor;
  let tmpDir: string;

  beforeEach(async () => {
    vi.useRealTimers();
    tmpDir = makeTmpDir();
    store = await makeStore(tmpDir);
    extractor = new KnowledgeExtractor(store);
  });

  afterEach(async () => {
    await store.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('attach() 监听 task:completed 事件', async () => {
    const emitter = new EventEmitter();
    extractor.attach(emitter);

    const event: TaskCompletedEvent = {
      taskId: 'task-evt-1',
      agentId: 'agent-001',
      input: 'Setup express server with security',
      output: 'Express server configured with security middleware successfully',
      toolsUsed: ['npm'],
      duration: 2000,
      success: true,
    };

    emitter.emit('task:completed', event);
    // 等待异步处理
    await new Promise(resolve => setTimeout(resolve, 100));

    const { entries } = await store.list({ status: 'active' });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].source.taskId).toBe('task-evt-1');
  });

  it('attach() 监听 task:failed 事件', async () => {
    const emitter = new EventEmitter();
    extractor.attach(emitter);

    const event: TaskFailedEvent = {
      taskId: 'task-evt-2',
      agentId: 'agent-001',
      input: 'Run database migration',
      error: new Error('ECONNREFUSED: Connection refused'),
      toolsUsed: ['psql'],
      duration: 500,
    };

    emitter.emit('task:failed', event);
    await new Promise(resolve => setTimeout(resolve, 100));

    const { entries } = await store.list({ status: 'active' });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].category).toBe('error-solution');
  });

  it('attach() 监听 tool:error 事件', async () => {
    const emitter = new EventEmitter();
    extractor.attach(emitter);

    const event: ToolErrorEvent = {
      taskId: 'task-evt-3',
      agentId: 'agent-001',
      toolName: 'git',
      input: { command: 'git push' },
      error: 'Permission denied (publickey)',
    };

    emitter.emit('tool:error', event);
    await new Promise(resolve => setTimeout(resolve, 100));

    const { entries } = await store.list({ status: 'active' });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].tags).toContain('git');
  });
});

describe('KnowledgeExtractor promoteBestPractices', () => {
  let store: VectorStore;
  let extractor: KnowledgeExtractor;
  let tmpDir: string;

  beforeEach(async () => {
    vi.useRealTimers();
    tmpDir = makeTmpDir();
    store = await makeStore(tmpDir);
    extractor = new KnowledgeExtractor(store);
  });

  afterEach(async () => {
    await store.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('高使用率高成功率的条目升级为 best-practice', async () => {
    const entry = await store.add({
      namespace: 'global',
      title: 'Express Security Pattern',
      content: 'Use helmet middleware for express security best practices',
      summary: 'Express security pattern',
      category: 'code',
      tags: ['express'],
      source: {},
      quality: { confidence: 0.8, verified: false, usageCount: 5, successRate: 0.9 },
    });

    await extractor.promoteBestPractices({ minUsage: 3, minSuccessRate: 0.8 });

    const updated = await store.get(entry.id);
    expect(updated!.category).toBe('best-practice');
    expect(updated!.quality.verified).toBe(true);
    expect(updated!.tags).toContain('verified');
  });

  it('低使用率的条目不升级', async () => {
    const entry = await store.add({
      namespace: 'global',
      title: 'Low Usage Pattern',
      content: 'Some pattern with low usage count',
      summary: 'Low usage',
      category: 'code',
      tags: [],
      source: {},
      quality: { confidence: 0.8, verified: false, usageCount: 1, successRate: 0.9 },
    });

    await extractor.promoteBestPractices({ minUsage: 3, minSuccessRate: 0.8 });

    const updated = await store.get(entry.id);
    expect(updated!.category).toBe('code');
    expect(updated!.quality.verified).toBe(false);
  });

  it('低成功率的条目不升级', async () => {
    const entry = await store.add({
      namespace: 'global',
      title: 'Low Success Rate Pattern',
      content: 'Some pattern with low success rate',
      summary: 'Low success',
      category: 'code',
      tags: [],
      source: {},
      quality: { confidence: 0.8, verified: false, usageCount: 10, successRate: 0.3 },
    });

    await extractor.promoteBestPractices({ minUsage: 3, minSuccessRate: 0.8 });

    const updated = await store.get(entry.id);
    expect(updated!.category).toBe('code');
    expect(updated!.quality.verified).toBe(false);
  });

  it('promoteBestPractices 发射 knowledge:promoted 事件', async () => {
    const emitter = new EventEmitter();
    extractor.attach(emitter);

    await store.add({
      namespace: 'global',
      title: 'High Quality Pattern',
      content: 'High quality pattern with many usages express security',
      summary: 'High quality',
      category: 'context',
      tags: [],
      source: {},
      quality: { confidence: 0.9, verified: false, usageCount: 10, successRate: 0.95 },
    });

    const promotedEvents: unknown[] = [];
    emitter.on('knowledge:promoted', (data) => promotedEvents.push(data));

    await extractor.promoteBestPractices({ minUsage: 3, minSuccessRate: 0.8 });

    expect(promotedEvents.length).toBeGreaterThan(0);
  });

  it('已是 best-practice 的条目不重复升级', async () => {
    const entry = await store.add({
      namespace: 'global',
      title: 'Already Best Practice',
      content: 'Already categorized as best practice pattern express security',
      summary: 'Already best',
      category: 'best-practice',
      tags: [],
      source: {},
      quality: { confidence: 0.9, verified: false, usageCount: 10, successRate: 0.95 },
    });

    await extractor.promoteBestPractices({ minUsage: 3, minSuccessRate: 0.8 });

    const updated = await store.get(entry.id);
    // category 保持 best-practice，但 version 没有因重复升级而增加
    expect(updated!.category).toBe('best-practice');
  });
});
