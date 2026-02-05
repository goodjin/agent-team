import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ReadFileTool,
  WriteFileTool,
  SearchFilesTool,
  DeleteFileTool,
  ListDirectoryTool,
} from '../src/tools/file-tools.js';

describe('File Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ReadFileTool', () => {
    it('should have correct tool definition', () => {
      const tool = new ReadFileTool();
      const def = tool.getDefinition();
      expect(def.name).toBe('read-file');
      expect(def.description).toBe('读取文件内容');
      expect(def.category).toBe('file');
      expect(def.dangerous).toBe(false);
    });
  });

  describe('WriteFileTool', () => {
    it('should have correct tool definition', () => {
      const tool = new WriteFileTool();
      const def = tool.getDefinition();
      expect(def.name).toBe('write-file');
      expect(def.description).toBe('写入文件内容');
      expect(def.category).toBe('file');
      expect(def.dangerous).toBe(true);
    });
  });

  describe('SearchFilesTool', () => {
    it('should have correct tool definition', () => {
      const tool = new SearchFilesTool();
      const def = tool.getDefinition();
      expect(def.name).toBe('search-files');
      expect(def.description).toBe('使用 glob 模式搜索文件');
      expect(def.category).toBe('file');
      expect(def.dangerous).toBe(false);
    });
  });

  describe('DeleteFileTool', () => {
    it('should have correct tool definition', () => {
      const tool = new DeleteFileTool();
      const def = tool.getDefinition();
      expect(def.name).toBe('delete-file');
      expect(def.description).toBe('删除文件或目录');
      expect(def.category).toBe('file');
      expect(def.dangerous).toBe(true);
    });
  });

  describe('ListDirectoryTool', () => {
    it('should have correct tool definition', () => {
      const tool = new ListDirectoryTool();
      const def = tool.getDefinition();
      expect(def.name).toBe('list-directory');
      expect(def.description).toBe('列出目录内容');
      expect(def.category).toBe('file');
      expect(def.dangerous).toBe(false);
    });
  });

  describe('Tool Execution - Parameter Validation', () => {
    it('ReadFileTool should require filePath parameter', async () => {
      const tool = new ReadFileTool();
      const result = await tool.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('参数验证失败');
    });

    it('WriteFileTool should require filePath and content', async () => {
      const tool = new WriteFileTool();
      const result = await tool.execute({});
      expect(result.success).toBe(false);
    });

    it('SearchFilesTool should require pattern parameter', async () => {
      const tool = new SearchFilesTool();
      const result = await tool.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('参数验证失败');
    });

    it('DeleteFileTool should require filePath parameter', async () => {
      const tool = new DeleteFileTool();
      const result = await tool.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('参数验证失败');
    });

    it('ListDirectoryTool should require dirPath parameter', async () => {
      const tool = new ListDirectoryTool();
      const result = await tool.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('参数验证失败');
    });
  });

  describe('Tool Help', () => {
    it('should return help information for read file tool', () => {
      const tool = new ReadFileTool();
      const help = tool.getHelp();
      expect(help).toContain('read-file');
      expect(help).toContain('读取文件内容');
      expect(help).toContain('file');
    });

    it('should return help information for write file tool', () => {
      const tool = new WriteFileTool();
      const help = tool.getHelp();
      expect(help).toContain('write-file');
      expect(help).toContain('写入文件内容');
      expect(help).toContain('是');
    });
  });
});
