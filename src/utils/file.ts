import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { glob as globAsync } from 'glob';

const PathSchema = z.string().min(1, 'Path cannot be empty');

export interface FileStats {
  size: number;
  mtime: Date;
  isFile: boolean;
  isDir: boolean;
}

export interface ReadResult {
  content: string;
}

export interface WriteResult {
  success: boolean;
}

export interface ListResult {
  entries: string[];
}

export interface SearchResult {
  files: string[];
}

export async function readFile(filePath: string): Promise<string> {
  const validatedPath = PathSchema.parse(filePath);
  try {
    return await fs.readFile(validatedPath, 'utf-8');
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${validatedPath}`);
      }
      if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${validatedPath}`);
      }
    }
    throw error;
  }
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  const validatedPath = PathSchema.parse(filePath);
  const directory = path.dirname(validatedPath);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(validatedPath, content, 'utf-8');
}

export async function deleteFile(filePath: string): Promise<void> {
  const validatedPath = PathSchema.parse(filePath);
  try {
    await fs.unlink(validatedPath);
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${validatedPath}`);
      }
      if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${validatedPath}`);
      }
    }
    throw error;
  }
}

export async function exists(filePath: string): Promise<boolean> {
  const validatedPath = PathSchema.parse(filePath);
  try {
    await fs.access(validatedPath);
    return true;
  } catch {
    return false;
  }
}

export async function isFile(filePath: string): Promise<boolean> {
  const validatedPath = PathSchema.parse(filePath);
  try {
    const stats = await fs.stat(validatedPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

export async function isDir(filePath: string): Promise<boolean> {
  const validatedPath = PathSchema.parse(filePath);
  try {
    const stats = await fs.stat(validatedPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export async function mkdir(dirPath: string, options?: { recursive: boolean }): Promise<void> {
  const validatedPath = PathSchema.parse(dirPath);
  await fs.mkdir(validatedPath, { recursive: options?.recursive ?? false });
}

export async function rmdir(dirPath: string, options?: { recursive: boolean }): Promise<void> {
  const validatedPath = PathSchema.parse(dirPath);
  await fs.rm(validatedPath, { recursive: options?.recursive ?? false });
}

export async function readdir(dirPath: string): Promise<string[]> {
  const validatedPath = PathSchema.parse(dirPath);
  try {
    const entries = await fs.readdir(validatedPath);
    return entries;
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Directory not found: ${validatedPath}`);
      }
      if (error.code === 'ENOTDIR') {
        throw new Error(`Not a directory: ${validatedPath}`);
      }
    }
    throw error;
  }
}

export async function glob(pattern: string, cwd?: string): Promise<string[]> {
  const validatedPattern = PathSchema.parse(pattern);
  if (cwd) {
    return globAsync(validatedPattern, { cwd });
  }
  return globAsync(validatedPattern);
}

export function join(...paths: string[]): string {
  return path.join(...paths);
}

export function dirname(filePath: string): string {
  return path.dirname(filePath);
}

export function basename(filePath: string): string {
  return path.basename(filePath);
}

export function extname(filePath: string): string {
  return path.extname(filePath);
}

export async function chmod(filePath: string, mode: number): Promise<void> {
  const validatedPath = PathSchema.parse(filePath);
  await fs.chmod(validatedPath, mode);
}

export async function stat(filePath: string): Promise<FileStats> {
  const validatedPath = PathSchema.parse(filePath);
  const stats = await fs.stat(validatedPath);
  return {
    size: stats.size,
    mtime: stats.mtime,
    isFile: stats.isFile(),
    isDir: stats.isDirectory(),
  };
}

export const FileUtils = {
  readFile,
  writeFile,
  deleteFile,
  exists,
  isFile,
  isDir,
  mkdir,
  rmdir,
  readdir,
  glob,
  join,
  dirname,
  basename,
  extname,
  chmod,
  stat,
};
