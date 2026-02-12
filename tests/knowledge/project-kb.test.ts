import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProjectKnowledgeBase } from '../../src/knowledge/project-kb.js';

beforeEach(() => vi.useRealTimers());

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'project-kb-test-'));
}

function makeEntryInput(overrides: Partial<{
  title: string; content: string; category: any; tags: string[];
}> = {}) {
  return {
    namespace: 'global',
    title: 'Test Knowledge Entry',
    content: 'This is test content about express routing and middleware',
    summary: 'Test summary',
    category: 'best-practice' as const,
    tags: ['test', 'express'],
    source: {},
    quality: { confidence: 0.8, verified: false, usageCount: 0, successRate: 1.0 },
    ...overrides,
  };
}

describe('ProjectKnowledgeBase - Store 隔离', () => {
  let baseDir: string;
  let kb: ProjectKnowledgeBase;

  beforeEach(async () => {
    baseDir = makeTmpDir();
    kb = new ProjectKnowledgeBase({ baseDir });
    await kb.initializeProject('project-a');
    await kb.initializeProject('project-b');
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it('不同项目的 store 应完全隔离', async () => {
    await kb.add('project-a', makeEntryInput({ title: 'Entry A' }));
    await kb.add('project-b', makeEntryInput({ title: 'Entry B' }));

    const listA = await kb.list('project-a');
    const listB = await kb.list('project-b');

    expect(listA.entries.some(e => e.title === 'Entry A')).toBe(true);
    expect(listA.entries.some(e => e.title === 'Entry B')).toBe(false);
    expect(listB.entries.some(e => e.title === 'Entry B')).toBe(true);
    expect(listB.entries.some(e => e.title === 'Entry A')).toBe(false);
  });

  it('不同项目使用独立文件路径', () => {
    const storeA = kb.getStore('project-a');
    const storeB = kb.getStore('project-b');
    expect(storeA).not.toBe(storeB);
  });

  it('listProjects() 应列出所有已加载的项目', () => {
    const projects = kb.listProjects();
    expect(projects).toContain('project-a');
    expect(projects).toContain('project-b');
  });
});

describe('ProjectKnowledgeBase - CRUD', () => {
  let baseDir: string;
  let kb: ProjectKnowledgeBase;

  beforeEach(async () => {
    baseDir = makeTmpDir();
    kb = new ProjectKnowledgeBase({ baseDir });
    await kb.initializeProject('proj');
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it('add() 应创建条目', async () => {
    const entry = await kb.add('proj', makeEntryInput());
    expect(entry.id).toBeTruthy();
    expect(entry.title).toBe('Test Knowledge Entry');
  });

  it('get() 应获取存在的条目', async () => {
    const entry = await kb.add('proj', makeEntryInput());
    const fetched = await kb.get('proj', entry.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(entry.id);
  });

  it('get() 不存在时应返回 null', async () => {
    const result = await kb.get('proj', 'non-existent-id');
    expect(result).toBeNull();
  });

  it('update() 应更新条目内容', async () => {
    const entry = await kb.add('proj', makeEntryInput());
    const updated = await kb.update('proj', entry.id, { title: 'Updated Title' });
    expect(updated.title).toBe('Updated Title');
    expect(updated.version).toBe(2);
  });

  it('delete() 应软删除条目', async () => {
    const entry = await kb.add('proj', makeEntryInput());
    await kb.delete('proj', entry.id);
    const fetched = await kb.get('proj', entry.id);
    expect(fetched?.status).toBe('deleted');
  });

  it('stats() 应返回正确统计', async () => {
    await kb.add('proj', makeEntryInput({ category: 'code' }));
    await kb.add('proj', makeEntryInput({ category: 'best-practice' }));
    const s = await kb.stats('proj');
    expect(s.projectId).toBe('proj');
    expect(s.active).toBe(2);
    expect(s.byCategory).toBeDefined();
  });
});

describe('ProjectKnowledgeBase - searchAll', () => {
  let baseDir: string;
  let kb: ProjectKnowledgeBase;

  beforeEach(async () => {
    baseDir = makeTmpDir();
    kb = new ProjectKnowledgeBase({ baseDir });
    await kb.initializeProject('p1');
    await kb.initializeProject('p2');

    await kb.add('p1', makeEntryInput({ title: 'Express Routing', content: 'Express routing for REST API' }));
    await kb.add('p2', makeEntryInput({ title: 'Database Index', content: 'Database indexing for performance' }));
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it('searchAll() 应跨项目搜索', async () => {
    const results = await kb.searchAll({ text: 'express routing REST', topK: 10 });
    expect(Array.isArray(results)).toBe(true);
    // 每个结果应包含 projectId
    for (const r of results) {
      expect(r.projectId).toBeTruthy();
      expect(['p1', 'p2']).toContain(r.projectId);
    }
  });
});

describe('ProjectKnowledgeBase - exportToMarkdown / importFromMarkdown', () => {
  let baseDir: string;
  let kb: ProjectKnowledgeBase;
  let tmpDir: string;

  beforeEach(async () => {
    baseDir = makeTmpDir();
    tmpDir = makeTmpDir();
    kb = new ProjectKnowledgeBase({ baseDir });
    await kb.initializeProject('test-proj');

    await kb.add('test-proj', makeEntryInput({
      title: 'Authentication Best Practice',
      content: 'Always use short-lived JWT tokens for security',
      category: 'best-practice',
      tags: ['auth', 'security'],
    }));
    await kb.add('test-proj', makeEntryInput({
      title: 'Express Error Handling',
      content: 'Use async try-catch in express middleware',
      category: 'code',
      tags: ['express'],
    }));
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exportToMarkdown() 应生成有效 Markdown 文件', async () => {
    const outputPath = path.join(tmpDir, 'export.md');
    await kb.exportToMarkdown('test-proj', outputPath);

    expect(fs.existsSync(outputPath)).toBe(true);
    const content = fs.readFileSync(outputPath, 'utf8');
    expect(content).toContain('# 知识库导出 - test-proj');
    expect(content).toContain('Authentication Best Practice');
    expect(content).toContain('Express Error Handling');
  });

  it('exportToMarkdown() 应包含标签和时间信息', async () => {
    const outputPath = path.join(tmpDir, 'export.md');
    await kb.exportToMarkdown('test-proj', outputPath);
    const content = fs.readFileSync(outputPath, 'utf8');
    expect(content).toContain('auth');
    expect(content).toContain('security');
    expect(content).toContain('**标签**');
    expect(content).toContain('**创建时间**');
  });

  it('importFromMarkdown() 应导入条目并返回数量', async () => {
    // 先导出
    const exportPath = path.join(tmpDir, 'export.md');
    await kb.exportToMarkdown('test-proj', exportPath);

    // 导入到新项目
    await kb.initializeProject('import-proj');
    const count = await kb.importFromMarkdown('import-proj', exportPath);
    expect(count).toBeGreaterThan(0);
    expect(count).toBe(2);

    const list = await kb.list('import-proj');
    expect(list.entries.length).toBe(2);
  });

  it('importFromMarkdown() 重复导入应跳过已存在条目', async () => {
    const exportPath = path.join(tmpDir, 'export.md');
    await kb.exportToMarkdown('test-proj', exportPath);

    await kb.initializeProject('dedup-proj');
    const count1 = await kb.importFromMarkdown('dedup-proj', exportPath);
    const count2 = await kb.importFromMarkdown('dedup-proj', exportPath);

    expect(count1).toBe(2);
    expect(count2).toBe(0); // 全部跳过
  });

  it('importFromMarkdown() 文件不存在时应抛出错误', async () => {
    await kb.initializeProject('err-proj');
    await expect(
      kb.importFromMarkdown('err-proj', '/nonexistent/path/file.md')
    ).rejects.toThrow();
  });
});

describe('ProjectKnowledgeBase - deleteProject', () => {
  let baseDir: string;
  let kb: ProjectKnowledgeBase;

  beforeEach(async () => {
    baseDir = makeTmpDir();
    kb = new ProjectKnowledgeBase({ baseDir });
    await kb.initializeProject('del-proj');
    await kb.add('del-proj', makeEntryInput());
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it('deleteProject() 应软删除所有条目并从 stores map 移除', async () => {
    await kb.deleteProject('del-proj');
    expect(kb.listProjects()).not.toContain('del-proj');
  });
});
