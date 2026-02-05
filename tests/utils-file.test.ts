import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as glob from 'glob';
import {
  readFile,
  writeFile,
  deleteFile,
  exists,
  isFile,
  isDir,
  mkdir,
  rmdir,
  readdir,
  glob as fileGlob,
  join,
  dirname,
  basename,
  extname,
  chmod,
  stat,
} from '../src/utils/file.js';

vi.mock('node:fs/promises');
vi.mock('glob');

describe('File Utilities', () => {
  const testPath = '/test/file.txt';
  const testDir = '/test/dir';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('readFile', () => {
    it('should read file content successfully', async () => {
      const content = 'test content';
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await readFile(testPath);

      expect(result).toBe(content);
      expect(fs.readFile).toHaveBeenCalledWith(testPath, 'utf-8');
    });

    it('should throw error when file not found', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      await expect(readFile(testPath)).rejects.toThrow('File not found');
    });

    it('should throw error on permission denied', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(Object.assign(new Error('EACCES'), { code: 'EACCES' }));

      await expect(readFile(testPath)).rejects.toThrow('Permission denied');
    });
  });

  describe('writeFile', () => {
    it('should create directory and write file', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await writeFile(testPath, 'content');

      expect(fs.mkdir).toHaveBeenCalledWith(path.dirname(testPath), { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(testPath, 'content', 'utf-8');
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await deleteFile(testPath);

      expect(fs.unlink).toHaveBeenCalledWith(testPath);
    });

    it('should throw error when file not found', async () => {
      vi.mocked(fs.unlink).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      await expect(deleteFile(testPath)).rejects.toThrow('File not found');
    });
  });

  describe('exists', () => {
    it('should return true when file exists', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await exists(testPath);

      expect(result).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await exists(testPath);

      expect(result).toBe(false);
    });
  });

  describe('isFile', () => {
    it('should return true for file', async () => {
      const mockStats = { isFile: () => true, isDirectory: () => false };
      vi.mocked(fs.stat).mockResolvedValue(mockStats as any);

      const result = await isFile(testPath);

      expect(result).toBe(true);
    });

    it('should return false for directory', async () => {
      const mockStats = { isFile: () => false, isDirectory: () => true };
      vi.mocked(fs.stat).mockResolvedValue(mockStats as any);

      const result = await isFile(testPath);

      expect(result).toBe(false);
    });
  });

  describe('isDir', () => {
    it('should return true for directory', async () => {
      const mockStats = { isFile: () => false, isDirectory: () => true };
      vi.mocked(fs.stat).mockResolvedValue(mockStats as any);

      const result = await isDir(testDir);

      expect(result).toBe(true);
    });
  });

  describe('mkdir', () => {
    it('should create directory recursively', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await mkdir(testDir, { recursive: true });

      expect(fs.mkdir).toHaveBeenCalledWith(testDir, { recursive: true });
    });
  });

  describe('rmdir', () => {
    it('should remove directory recursively', async () => {
      vi.mocked(fs.rm).mockResolvedValue(undefined);

      await rmdir(testDir, { recursive: true });

      expect(fs.rm).toHaveBeenCalledWith(testDir, { recursive: true });
    });
  });

  describe('readdir', () => {
    it('should read directory contents', async () => {
      const entries = ['file1.txt', 'file2.txt'];
      vi.mocked(fs.readdir).mockResolvedValue(entries as any);

      const result = await readdir(testDir);

      expect(result).toEqual(entries);
    });

    it('should throw error when directory not found', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      await expect(readdir(testDir)).rejects.toThrow('Directory not found');
    });
  });

  describe('glob', () => {
    it('should find files matching pattern', async () => {
      const files = ['src/file1.ts', 'src/file2.ts'];
      vi.mocked(glob.glob).mockResolvedValue(files);

      const result = await fileGlob('src/**/*.ts');

      expect(result).toEqual(files);
      expect(glob.glob).toHaveBeenCalledWith('src/**/*.ts');
    });

    it('should use custom cwd', async () => {
      const files = ['file1.ts'];
      vi.mocked(glob.glob).mockResolvedValue(files);

      await fileGlob('*.ts', '/custom');

      expect(glob.glob).toHaveBeenCalledWith('*.ts', { cwd: '/custom' });
    });
  });

  describe('path helpers', () => {
    it('should join paths correctly', () => {
      expect(join('/test', 'file.txt')).toBe('/test/file.txt');
    });

    it('should get directory name', () => {
      expect(dirname('/test/file.txt')).toBe('/test');
    });

    it('should get base name', () => {
      expect(basename('/test/file.txt')).toBe('file.txt');
    });

    it('should get extension', () => {
      expect(extname('/test/file.txt')).toBe('.txt');
    });
  });

  describe('stat', () => {
    it('should return file stats', async () => {
      const mockStats = {
        size: 100,
        mtime: new Date('2024-01-01'),
        isFile: () => true,
        isDirectory: () => false,
      };
      vi.mocked(fs.stat).mockResolvedValue(mockStats as any);

      const result = await stat(testPath);

      expect(result.size).toBe(100);
      expect(result.isFile).toBe(true);
      expect(result.isDir).toBe(false);
    });
  });
});
