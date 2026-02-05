import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import {
  ReadFileTool,
  WriteFileTool,
  GitStatusTool,
  GitCommitTool,
} from '../src/tools/index.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('Registration', () => {
    it('should register a tool', () => {
      const tool = new ReadFileTool();
      registry.register(tool);
      expect(registry.has('read-file')).toBe(true);
    });

    it('should unregister a tool', () => {
      const tool = new ReadFileTool();
      registry.register(tool);
      registry.unregister('read-file');
      expect(registry.has('read-file')).toBe(false);
    });

    it('should throw when unregistering non-existent tool', () => {
      expect(() => registry.unregister('non-existent')).toThrow('Tool not found');
    });
  });

  describe('Query', () => {
    it('should get a tool by name', () => {
      const tool = new ReadFileTool();
      registry.register(tool);
      const retrieved = registry.get('read-file');
      expect(retrieved).toBeDefined();
      expect(retrieved?.getDefinition().name).toBe('read-file');
    });

    it('should return undefined for non-existent tool', () => {
      const tool = registry.get('non-existent');
      expect(tool).toBeUndefined();
    });

    it('should check if tool exists', () => {
      expect(registry.has('read-file')).toBe(true);
      const newTool = new WriteFileTool();
      registry.unregister('write-file');
      expect(registry.has('write-file')).toBe(false);
      registry.register(newTool);
      expect(registry.has('write-file')).toBe(true);
    });

    it('should get all tool names', () => {
      const names = registry.getAllNames();
      expect(names).toContain('read-file');
      expect(names).toContain('write-file');
    });

    it('should get tools by category', () => {
      const fileTools = registry.getByCategory('file');
      expect(fileTools.length).toBeGreaterThan(0);
      expect(fileTools[0].getDefinition().category).toBe('file');

      const gitTools = registry.getByCategory('git');
      expect(gitTools.length).toBeGreaterThan(0);
      expect(gitTools[0].getDefinition().category).toBe('git');
    });

    it('should get all categories', () => {
      const categories = registry.getCategories();
      expect(categories).toContain('file');
      expect(categories).toContain('git');
    });
  });

  describe('Execution', () => {
    it('should return error for non-existent tool', async () => {
      const result = await registry.execute('non-existent', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool not found');
    });
  });

  describe('Search', () => {
    it('should search tools by name', () => {
      const results = registry.search('read');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].getDefinition().name).toBe('read-file');
    });

    it('should search tools by description', () => {
      const results = registry.search('文件');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should return correct statistics', () => {
      const stats = registry.getStats();
      expect(stats.totalTools).toBeGreaterThan(0);
      expect(stats.toolsByCategory.file).toBeDefined();
      expect(stats.toolsByCategory.git).toBeDefined();
      expect(stats.dangerousTools).toContain('write-file');
      expect(stats.dangerousTools).toContain('delete-file');
    });
  });

  describe('Default Tools', () => {
    it('should have default file tools registered', () => {
      expect(registry.has('read-file')).toBe(true);
      expect(registry.has('write-file')).toBe(true);
      expect(registry.has('search-files')).toBe(true);
      expect(registry.has('delete-file')).toBe(true);
      expect(registry.has('list-directory')).toBe(true);
    });

    it('should have default git tools registered', () => {
      expect(registry.has('git-status')).toBe(true);
      expect(registry.has('git-commit')).toBe(true);
      expect(registry.has('git-branch')).toBe(true);
      expect(registry.has('git-pull')).toBe(true);
      expect(registry.has('git-push')).toBe(true);
    });
  });

  describe('Clear', () => {
    it('should clear all tools', () => {
      expect(registry.has('read-file')).toBe(true);
      registry.clear();
      expect(registry.has('read-file')).toBe(false);
    });
  });

  describe('Tool Definitions', () => {
    it('should return correct definition for read-file', () => {
      const def = registry.getDefinition('read-file');
      expect(def).toBeDefined();
      expect(def?.name).toBe('read-file');
      expect(def?.category).toBe('file');
    });

    it('should return all definitions', () => {
      const defs = registry.getAllDefinitions();
      expect(defs.length).toBeGreaterThan(0);
      expect(defs.find(d => d.name === 'read-file')).toBeDefined();
    });
  });
});
