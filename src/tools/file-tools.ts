import { promises as fs } from 'fs';
import { glob } from 'glob';
import path from 'path';
import { BaseTool } from './base.js';
import type { ToolDefinition, ToolResult } from '../types/index.js';
import { z } from 'zod';
import { WorkDirManager } from '../core/work-dir-manager.js';

function createPathSecurityError(workDir: string, filePath: string): string {
  return `❌ 安全错误: 路径越界\n\n当前工作目录: ${workDir}\n请求路径: ${filePath}\n\n只能在工作目录内进行文件操作。`;
}

/**
 * 读取文件工具
 */
export class ReadFileTool extends BaseTool {
  constructor(private workDirManager: WorkDirManager) {
    const definition: ToolDefinition = {
      name: 'read-file',
      description: '读取文件内容',
      category: 'file',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        filePath: z.string().min(1, '文件路径不能为空'),
        encoding: z.string().optional().default('utf-8'),
        taskId: z.string().optional(),
      }),
      dangerous: false,
    };

    super(definition);
  }

  protected async executeImpl(params: { filePath: string; encoding?: string; taskId?: string }): Promise<ToolResult> {
    const { filePath, encoding = 'utf-8', taskId } = params;

    if (taskId) {
      const validation = await this.workDirManager.validatePath(taskId, filePath);
      if (!validation.valid) {
        const state = this.workDirManager.getWorkDir(taskId);
        return {
          success: false,
          error: createPathSecurityError(state?.rootPath || '', filePath),
        };
      }
    }

    try {
      const content = await fs.readFile(filePath, { encoding: encoding as BufferEncoding });
      const stats = await fs.stat(filePath);

      return {
        success: true,
        data: {
          content,
          size: stats.size,
          path: filePath,
          encoding,
        },
        metadata: {
          lastModified: stats.mtime,
          created: stats.birthtime,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * 写入文件工具
 */
export class WriteFileTool extends BaseTool {
  constructor(private workDirManager: WorkDirManager) {
    const definition: ToolDefinition = {
      name: 'write-file',
      description: '写入文件内容',
      category: 'file',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        filePath: z.string().min(1, '文件路径不能为空'),
        content: z.string(),
        encoding: z.string().optional().default('utf-8'),
        createDirs: z.boolean().optional().default(true),
        taskId: z.string().optional(),
      }),
      dangerous: true, // 写入文件是危险操作
    };

    super(definition);
  }

  protected async executeImpl(params: {
    filePath: string;
    content: string;
    encoding?: string;
    createDirs?: boolean;
    taskId?: string;
  }): Promise<ToolResult> {
    const { filePath, content, encoding = 'utf-8', createDirs = true, taskId } = params;

    if (taskId) {
      const validation = await this.workDirManager.validatePath(taskId, filePath);
      if (!validation.valid) {
        const state = this.workDirManager.getWorkDir(taskId);
        return {
          success: false,
          error: createPathSecurityError(state?.rootPath || '', filePath),
        };
      }
    }

    try {
      if (createDirs) {
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
      }

      await fs.writeFile(filePath, content, { encoding: encoding as BufferEncoding });

      const stats = await fs.stat(filePath);

      return {
        success: true,
        data: {
          path: filePath,
          size: stats.size,
          bytesWritten: content.length,
        },
        metadata: {
          lastModified: stats.mtime,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * 搜索文件工具
 */
export class SearchFilesTool extends BaseTool {
  constructor(private workDirManager: WorkDirManager) {
    const definition: ToolDefinition = {
      name: 'search-files',
      description: '使用 glob 模式搜索文件',
      category: 'file',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        pattern: z.string().min(1, '搜索模式不能为空'),
        cwd: z.string().optional(),
        ignore: z.array(z.string()).optional(),
        taskId: z.string().optional(),
      }),
      dangerous: false,
    };

    super(definition);
  }

  protected async executeImpl(params: {
    pattern: string;
    cwd?: string;
    ignore?: string[];
    taskId?: string;
  }): Promise<ToolResult> {
    let { pattern, cwd, ignore, taskId } = params;

    if (taskId) {
      const state = this.workDirManager.getWorkDir(taskId);
      if (state) {
        if (cwd !== undefined) {
          const validation = await this.workDirManager.validatePath(taskId, cwd);
          if (!validation.valid) {
            return {
              success: false,
              error: createPathSecurityError(state.rootPath, cwd),
            };
          }
        }
        cwd = state.rootPath;
      } else {
        cwd = cwd || process.cwd();
      }
    } else {
      cwd = cwd || process.cwd();
    }

    try {
      const files = await glob(pattern, {
        cwd,
        ignore: ignore || [],
        absolute: true,
      });

      return {
        success: true,
        data: {
          files,
          count: files.length,
          pattern,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * 删除文件工具
 */
export class DeleteFileTool extends BaseTool {
  constructor(private workDirManager: WorkDirManager) {
    const definition: ToolDefinition = {
      name: 'delete-file',
      description: '删除文件或目录',
      category: 'file',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        filePath: z.string().min(1, '文件路径不能为空'),
        recursive: z.boolean().optional().default(false),
        taskId: z.string().optional(),
      }),
      dangerous: true, // 删除是危险操作
    };

    super(definition);
  }

  protected async executeImpl(params: { filePath: string; recursive?: boolean; taskId?: string }): Promise<ToolResult> {
    const { filePath, recursive = false, taskId } = params;

    if (taskId) {
      const validation = await this.workDirManager.validatePath(taskId, filePath);
      if (!validation.valid) {
        const state = this.workDirManager.getWorkDir(taskId);
        return {
          success: false,
          error: createPathSecurityError(state?.rootPath || '', filePath),
        };
      }
    }

    try {
      const stats = await fs.stat(filePath);
      let deletedSize = 0;

      if (stats.isDirectory() && recursive) {
        const files = await fs.readdir(filePath);
        for (const file of files) {
          const fullPath = path.join(filePath, file);
          const fileStats = await fs.stat(fullPath);
          if (fileStats.isDirectory()) {
            await this.executeImpl({ filePath: fullPath, recursive: true, taskId });
          } else {
            deletedSize += fileStats.size;
            await fs.unlink(fullPath);
          }
        }
        await fs.rmdir(filePath);
      } else if (stats.isDirectory()) {
        return {
          success: false,
          error: '无法删除目录，请使用 recursive=true',
        };
      } else {
        deletedSize = stats.size;
        await fs.unlink(filePath);
      }

      return {
        success: true,
        data: {
          path: filePath,
          deletedSize,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * 列出目录工具
 */
export class ListDirectoryTool extends BaseTool {
  constructor(private workDirManager: WorkDirManager) {
    const definition: ToolDefinition = {
      name: 'list-directory',
      description: '列出目录内容',
      category: 'file',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        dirPath: z.string().min(1, '目录路径不能为空'),
        recursive: z.boolean().optional().default(false),
        includeStats: z.boolean().optional().default(false),
        taskId: z.string().optional(),
      }),
      dangerous: false,
    };

    super(definition);
  }

  protected async executeImpl(params: {
    dirPath: string;
    recursive?: boolean;
    includeStats?: boolean;
    taskId?: string;
  }): Promise<ToolResult> {
    const { dirPath, recursive = false, includeStats = false, taskId } = params;

    if (taskId) {
      const validation = await this.workDirManager.validatePath(taskId, dirPath);
      if (!validation.valid) {
        const state = this.workDirManager.getWorkDir(taskId);
        return {
          success: false,
          error: createPathSecurityError(state?.rootPath || '', dirPath),
        };
      }
    }

    try {
      const items: any[] = [];

      const listDir = async (currentPath: string, level = 0): Promise<void> => {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          const item: any = {
            name: entry.name,
            path: fullPath,
            type: entry.isDirectory() ? 'directory' : 'file',
            level,
          };

          if (includeStats) {
            const stats = await fs.stat(fullPath);
            item.stats = {
              size: stats.size,
              modified: stats.mtime,
              created: stats.birthtime,
              mode: stats.mode,
            };
          }

          items.push(item);

          if (entry.isDirectory() && recursive) {
            await listDir(fullPath, level + 1);
          }
        }
      };

      await listDir(dirPath);

      return {
        success: true,
        data: {
          path: dirPath,
          items,
          count: items.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
