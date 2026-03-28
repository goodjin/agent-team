import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { createContainer } from '../../src/container.js';
import { createTempDir } from '../helpers/fixtures.js';

/**
 * Smoke tests：确保 v5–v8 容器与域模块在引入 v9 后仍可构建与访问。
 */
describe('regression: core container & domain', () => {
  it('createContainer exposes services and tool registry', async () => {
    const data = await createTempDir('agent-data-');
    const c = await createContainer(data);
    expect(c.taskService).toBeDefined();
    expect(c.agentService).toBeDefined();
    expect(c.toolRegistry).toBeDefined();
    expect(c.eventBus).toBeDefined();
    expect(c.fileStore).toBeDefined();
    expect(c.agentMemory).toBeDefined();
    expect(c.projectKnowledgeBase).toBeDefined();
    expect(c.selfEvaluator).toBeDefined();
    expect(c.promptOptimizer).toBeDefined();
    expect(c.executionEngine).toBeDefined();
    const tools = c.toolRegistry.list();
    expect(tools.length).toBeGreaterThan(0);
  });

  it('file-backed stores initialize under custom data path', async () => {
    const data = await createTempDir('agent-data-');
    const c = await createContainer(data);
    await c.fileStore.ensureDir('tasks');
    const tasksDir = path.join(data, 'tasks');
    await fs.access(tasksDir);
  });
});
