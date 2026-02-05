import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { WorkDirManager } from '../../src/core/work-dir-manager.js';

describe('WorkDirManager', () => {
  let manager: WorkDirManager;
  const testTaskId = 'test-task-123';
  const testBasePath = '/tmp/test-workspace';

  beforeEach(() => {
    manager = new WorkDirManager();
  });

  afterEach(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createWorkDir', () => {
    it('should create correct directory structure', async () => {
      const state = await manager.createWorkDir({
        taskId: testTaskId,
        basePath: testBasePath,
      });

      expect(state.structure.root).toBe(path.join(testBasePath, testTaskId));
      expect(state.structure.src).toBe(path.join(testBasePath, testTaskId, 'src'));
      expect(state.structure.tests).toBe(path.join(testBasePath, testTaskId, 'tests'));
      expect(state.structure.docs).toBe(path.join(testBasePath, testTaskId, 'docs'));
      expect(state.structure.output).toBe(path.join(testBasePath, testTaskId, 'output'));
      expect(state.structure.state).toBe(path.join(testBasePath, testTaskId, '.agent-state'));

      expect(state.taskId).toBe(testTaskId);
    });

    it('should create all directories', async () => {
      await manager.createWorkDir({
        taskId: testTaskId,
        basePath: testBasePath,
      });

      const dirs = ['src', 'tests', 'docs', 'output', '.agent-state'];
      for (const dir of dirs) {
        const dirPath = path.join(testBasePath, testTaskId, dir);
        const stats = await fs.stat(dirPath);
        expect(stats.isDirectory()).toBe(true);
      }
    });

    it('should create meta.json in .agent-state', async () => {
      await manager.createWorkDir({
        taskId: testTaskId,
        basePath: testBasePath,
      });

      const metaPath = path.join(testBasePath, testTaskId, '.agent-state', 'meta.json');
      const content = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(content);

      expect(meta.taskId).toBe(testTaskId);
      expect(meta.createdAt).toBeDefined();
      expect(meta.template).toBe('default');
    });

    it('should use minimal template when specified', async () => {
      const state = await manager.createWorkDir({
        taskId: testTaskId,
        basePath: testBasePath,
        template: 'minimal',
      });

      expect(state.taskId).toBe(testTaskId);
    });
  });

  describe('validatePath', () => {
    it('should validate paths within work directory', async () => {
      await manager.createWorkDir({
        taskId: testTaskId,
        basePath: testBasePath,
      });

      const result = await manager.validatePath(testTaskId, path.join(testBasePath, testTaskId, 'src', 'file.ts'));

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject paths outside work directory', async () => {
      await manager.createWorkDir({
        taskId: testTaskId,
        basePath: testBasePath,
      });

      const result = await manager.validatePath(testTaskId, '/other/path/file.ts');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('路径越界');
    });

    it('should return error for non-existent task', async () => {
      const result = await manager.validatePath('non-existent', '/some/path');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('任务工作目录不存在');
    });
  });

  describe('getWorkDir', () => {
    it('should return correct state', async () => {
      const created = await manager.createWorkDir({
        taskId: testTaskId,
        basePath: testBasePath,
      });

      const state = manager.getWorkDir(testTaskId);

      expect(state).toEqual(created);
    });

    it('should return undefined for non-existent task', () => {
      const state = manager.getWorkDir('non-existent');

      expect(state).toBeUndefined();
    });
  });

  describe('cleanupWorkDir', () => {
    it('should remove directory', async () => {
      await manager.createWorkDir({
        taskId: testTaskId,
        basePath: testBasePath,
      });

      await manager.cleanupWorkDir(testTaskId);

      const exists = await checkPathExists(path.join(testBasePath, testTaskId));
      expect(exists).toBe(false);
    });

    it('should remove from states map', async () => {
      await manager.createWorkDir({
        taskId: testTaskId,
        basePath: testBasePath,
      });

      await manager.cleanupWorkDir(testTaskId);

      expect(manager.getWorkDir(testTaskId)).toBeUndefined();
    });

    it('should handle non-existent task gracefully', async () => {
      await expect(manager.cleanupWorkDir('non-existent')).resolves.not.toThrow();
    });
  });
});

async function checkPathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
