export type ToolCategory = 'file' | 'git' | 'code' | 'browser' | 'ai';

export interface JSONSchema {
  type: string;
  /** 供 LLM 理解自由参数字段的插件工具等 */
  description?: string;
  properties?: Record<string, { type: string; description?: string }>;
  required?: string[];
}

export interface ToolContext {
  taskId: string;
  agentId: string;
  workingDirectory: string;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface Tool {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: JSONSchema;
  dangerous: boolean;
  execute: (params: any, context: ToolContext) => Promise<ToolResult>;
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(category?: ToolCategory): Tool[] {
    const tools = Array.from(this.tools.values());
    if (category) {
      return tools.filter(t => t.category === category);
    }
    return tools;
  }

  getAllowedTools(allowedNames: string[]): Tool[] {
    return allowedNames
      .map(name => this.tools.get(name))
      .filter((t): t is Tool => t !== undefined);
  }
}

// 内置工具实现
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const builtinTools: Tool[] = [
  {
    name: 'read_file',
    description: '读取文件内容',
    category: 'file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' }
      },
      required: ['path']
    },
    dangerous: false,
    execute: async (params: { path: string }, context: ToolContext) => {
      try {
        const fullPath = path.join(context.workingDirectory, params.path);
        const content = await fs.readFile(fullPath, 'utf-8');
        return { success: true, data: content };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  },
  {
    name: 'write_file',
    description: '写入文件内容',
    category: 'file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '文件内容' }
      },
      required: ['path', 'content']
    },
    dangerous: false,
    execute: async (params: { path: string; content: string }, context: ToolContext) => {
      try {
        const fullPath = path.join(context.workingDirectory, params.path);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, params.content, 'utf-8');
        return { success: true, data: { path: params.path, size: params.content.length } };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  },
  {
    name: 'list_files',
    description: '列出目录中的文件',
    category: 'file',
    parameters: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: '目录路径' }
      },
      required: ['dir']
    },
    dangerous: false,
    execute: async (params: { dir: string }, context: ToolContext) => {
      try {
        const fullPath = path.join(context.workingDirectory, params.dir);
        const files = await fs.readdir(fullPath);
        return { success: true, data: files };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  },
  {
    name: 'execute_command',
    description: '执行 shell 命令（谨慎使用）',
    category: 'code',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的命令' },
        timeout: { type: 'number', description: '超时时间（秒）' }
      },
      required: ['command']
    },
    dangerous: true,
    execute: async (params: { command: string; timeout?: number }, context: ToolContext) => {
      try {
        const { stdout, stderr } = await execAsync(params.command, {
          cwd: context.workingDirectory,
          timeout: (params.timeout || 30) * 1000,
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });

        return {
          success: true,
          data: stdout || stderr || 'Command executed successfully'
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  }
];
