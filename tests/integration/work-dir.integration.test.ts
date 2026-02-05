/**
 * Integration Test: WorkDir
 * Tests end-to-end workflow directory functionality with real file operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';
import { WorkDirManager } from '../../src/core/work-dir-manager.js';
import { ToolRegistry } from '../../src/tools/tool-registry.js';

describe('WorkDir Integration Tests', () => {
  let tempDir: string;
  let workDirManager: WorkDirManager;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'agent-team-workdir-'));
    workDirManager = new WorkDirManager();
    toolRegistry = new ToolRegistry(workDirManager);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('WorkDir Creation and Path Validation', () => {
    it('should create work dir and validate path', async () => {
      const state = await workDirManager.createWorkDir({
        taskId: 'test-task-1',
        basePath: tempDir,
      });

      expect(state.taskId).toBe('test-task-1');
      expect(state.rootPath).toBe(path.join(tempDir, 'test-task-1'));
      expect(state.structure.src).toBe(path.join(tempDir, 'test-task-1', 'src'));
      expect(state.structure.tests).toBe(path.join(tempDir, 'test-task-1', 'tests'));
      expect(state.structure.docs).toBe(path.join(tempDir, 'test-task-1', 'docs'));
      expect(state.structure.output).toBe(path.join(tempDir, 'test-task-1', 'output'));
      expect(state.structure.state).toBe(path.join(tempDir, 'test-task-1', '.agent-state'));

      const validResult = await workDirManager.validatePath('test-task-1', path.join(state.rootPath, 'src/main.py'));
      expect(validResult.valid).toBe(true);

      const invalidResult = await workDirManager.validatePath('test-task-1', '../other/file.py');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toBe('路径越界');
    });

    it('should reject path traversal attempts', async () => {
      await workDirManager.createWorkDir({
        taskId: 'test-task-2',
        basePath: tempDir,
      });

      const traversalPatterns = [
        '../outside.txt',
        '..%2Foutside.txt',
        'subdir/../../etc/passwd',
        'src/../..//etc/passwd',
        'src/./../../etc/passwd',
      ];

      for (const pattern of traversalPatterns) {
        const result = await workDirManager.validatePath('test-task-2', pattern);
        expect(result.valid).toBe(false);
      }
    });

    it('should return error for non-existent task', async () => {
      const result = await workDirManager.validatePath('non-existent-task', '/some/path');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('任务工作目录不存在');
    });
  });

  describe('File Write and Read within Work Dir', () => {
    it('should write and read files within work dir', async () => {
      const state = await workDirManager.createWorkDir({
        taskId: 'test-task-3',
        basePath: tempDir,
      });

      const filePath = path.join(state.rootPath, 'test.txt');

      const writeResult = await toolRegistry.execute('write-file', {
        filePath,
        content: 'Hello World',
        taskId: 'test-task-3',
      });

      expect(writeResult.success).toBe(true);
      expect(writeResult.data?.path).toBe(filePath);

      const readResult = await toolRegistry.execute('read-file', {
        filePath,
        taskId: 'test-task-3',
      });

      expect(readResult.success).toBe(true);
      expect(readResult.data?.content).toBe('Hello World');
    });

    it('should write files in subdirectories', async () => {
      const state = await workDirManager.createWorkDir({
        taskId: 'test-task-4',
        basePath: tempDir,
      });

      const filePath = path.join(state.rootPath, 'src/components/Button.tsx');

      const writeResult = await toolRegistry.execute('write-file', {
        filePath,
        content: 'export const Button = () => "Button";',
        taskId: 'test-task-4',
      });

      expect(writeResult.success).toBe(true);

      const readResult = await toolRegistry.execute('read-file', {
        filePath,
        taskId: 'test-task-4',
      });

      expect(readResult.success).toBe(true);
      expect(readResult.data?.content).toBe('export const Button = () => "Button";');
    });

    it('should handle multiple file operations', async () => {
      await workDirManager.createWorkDir({
        taskId: 'test-task-5',
        basePath: tempDir,
      });

      const files = [
        { path: 'file1.txt', content: 'Content 1' },
        { path: 'src/file2.ts', content: 'Content 2' },
        { path: 'tests/file3.test.ts', content: 'Content 3' },
      ];

      for (const file of files) {
        const fullPath = path.join(tempDir, 'test-task-5', file.path);
        const writeResult = await toolRegistry.execute('write-file', {
          filePath: fullPath,
          content: file.content,
          taskId: 'test-task-5',
        });
        expect(writeResult.success).toBe(true);
      }

      const listResult = await toolRegistry.execute('list-directory', {
        dirPath: path.join(tempDir, 'test-task-5'),
        taskId: 'test-task-5',
      });

      expect(listResult.success).toBe(true, `list-directory failed: ${listResult.error || 'unknown error'}`);
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should reject file operations outside work dir', async () => {
      const result = await toolRegistry.execute('write-file', {
        filePath: '/etc/passwd',
        content: 'hacked',
        taskId: 'non-existent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('安全错误');
      expect(result.error).toContain('路径越界');
    });

    it('should reject write outside work dir with valid taskId', async () => {
      await workDirManager.createWorkDir({
        taskId: 'test-task-6',
        basePath: tempDir,
      });

      const result = await toolRegistry.execute('write-file', {
        filePath: '/tmp/outside.txt',
        content: 'outside content',
        taskId: 'test-task-6',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('安全错误');
      expect(result.error).toContain('路径越界');
    });

    it('should reject read outside work dir', async () => {
      await workDirManager.createWorkDir({
        taskId: 'test-task-7',
        basePath: tempDir,
      });

      const result = await toolRegistry.execute('read-file', {
        filePath: '/etc/passwd',
        taskId: 'test-task-7',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('安全错误');
      expect(result.error).toContain('路径越界');
    });
  });

  describe('File Search Restrictions', () => {
    it('should restrict search to work dir', async () => {
      await workDirManager.createWorkDir({
        taskId: 'test-task-8',
        basePath: tempDir,
      });

      const result = await toolRegistry.execute('search-files', {
        pattern: '**/*.ts',
        taskId: 'test-task-8',
      });

      expect(result.success).toBe(true, `search-files failed: ${result.error || 'unknown error'}`);
    });

    it('should reject search outside work dir', async () => {
      await workDirManager.createWorkDir({
        taskId: 'test-task-9',
        basePath: tempDir,
      });

      const result = await toolRegistry.execute('search-files', {
        pattern: '**/*.json',
        cwd: '/etc',
        taskId: 'test-task-9',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('安全错误');
    });
  });

  describe('File Deletion Validation', () => {
    it('should allow file deletion within work dir', async () => {
      await workDirManager.createWorkDir({
        taskId: 'test-task-10',
        basePath: tempDir,
      });

      const filePath = path.join(tempDir, 'test-task-10', 'to-delete.txt');

      await toolRegistry.execute('write-file', {
        filePath,
        content: 'to be deleted',
        taskId: 'test-task-10',
      });

      const deleteResult = await toolRegistry.execute('delete-file', {
        filePath,
        taskId: 'test-task-10',
      });

      expect(deleteResult.success).toBe(true);

      const readResult = await toolRegistry.execute('read-file', {
        filePath,
        taskId: 'test-task-10',
      });

      expect(readResult.success).toBe(false);
    });

    it('should reject deletion outside work dir', async () => {
      await workDirManager.createWorkDir({
        taskId: 'test-task-11',
        basePath: tempDir,
      });

      const result = await toolRegistry.execute('delete-file', {
        filePath: '/etc/passwd',
        taskId: 'test-task-11',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('安全错误');
      expect(result.error).toContain('路径越界');
    });
  });

  describe('Directory Listing', () => {
    it('should list directory contents', async () => {
      const state = await workDirManager.createWorkDir({
        taskId: 'test-task-12',
        basePath: tempDir,
      });

      await toolRegistry.execute('write-file', {
        filePath: path.join(state.rootPath, 'file1.txt'),
        content: 'content1',
        taskId: 'test-task-12',
      });

      await toolRegistry.execute('write-file', {
        filePath: path.join(state.rootPath, 'file2.txt'),
        content: 'content2',
        taskId: 'test-task-12',
      });

      const listResult = await toolRegistry.execute('list-directory', {
        dirPath: state.rootPath,
        taskId: 'test-task-12',
      });

      expect(listResult.success).toBe(true, `list-directory failed: ${listResult.error || 'unknown error'}`);
    });

    it('should reject listing outside work dir', async () => {
      await workDirManager.createWorkDir({
        taskId: 'test-task-13',
        basePath: tempDir,
      });

      const result = await toolRegistry.execute('list-directory', {
        dirPath: '/etc',
        taskId: 'test-task-13',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('安全错误');
      expect(result.error).toContain('路径越界');
    });
  });

  describe('WorkDir Cleanup', () => {
    it('should clean up work dir on task completion', async () => {
      const state = await workDirManager.createWorkDir({
        taskId: 'test-task-14',
        basePath: tempDir,
      });

      await toolRegistry.execute('write-file', {
        filePath: path.join(state.rootPath, 'test.txt'),
        content: 'test',
        taskId: 'test-task-14',
      });

      expect(await checkPathExists(state.rootPath)).toBe(true);

      await workDirManager.cleanupWorkDir('test-task-14');

      expect(await checkPathExists(state.rootPath)).toBe(false);
    });

    it('should preserve work dir when preserve flag is set', async () => {
      const state = await workDirManager.createWorkDir({
        taskId: 'test-task-15',
        basePath: tempDir,
        preserve: true,
      });

      await toolRegistry.execute('write-file', {
        filePath: path.join(state.rootPath, 'test.txt'),
        content: 'test',
        taskId: 'test-task-15',
      });

      await workDirManager.cleanupWorkDir('test-task-15');

      expect(await checkPathExists(state.rootPath)).toBe(true);
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
