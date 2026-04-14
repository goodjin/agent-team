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

function resolveInWorkspace(workingDirectory: string, userPath: string): string {
  if (typeof userPath !== 'string' || !userPath.trim()) {
    throw new Error('path must be a non-empty string');
  }
  // 统一分隔符、去掉前后空格
  const raw = userPath.trim().replace(/\\/g, '/');
  const root = path.resolve(workingDirectory);

  // 允许绝对路径，但必须最终落在工作空间根目录内（避免误写到系统目录）
  const candidate = path.isAbsolute(raw) || /^[a-zA-Z]:\//.test(raw) || raw.startsWith('//')
    ? path.resolve(raw)
    : path.resolve(root, raw);

  const rel = path.relative(root, candidate);
  if (!rel || rel === '.') return candidate;
  if (rel.startsWith('..') || rel.includes(`..${path.sep}`)) {
    throw new Error(`path escapes workspace (root: ${root})`);
  }
  return candidate;
}

export const builtinTools: Tool[] = [
  {
    name: 'read_file',
    description: '读取文件内容（路径相对于任务工作空间根目录；也允许传入落在工作空间内的绝对路径）',
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
        const fullPath = resolveInWorkspace(context.workingDirectory, params.path);
        const content = await fs.readFile(fullPath, 'utf-8');
        return { success: true, data: content };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  },
  {
    name: 'write_file',
    description: '写入文件内容（路径相对于任务工作空间根目录；也允许传入落在工作空间内的绝对路径）',
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
        const fullPath = resolveInWorkspace(context.workingDirectory, params.path);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, params.content, 'utf-8');
        return { success: true, data: { path: params.path, size: params.content.length } };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  },
  {
    name: 'record_experience',
    description:
      '在问题已解决且方案已验证后，将可复用经验追加写入工作区 docs/EXPERIENCE.md。开工前应用 read_file 查阅本文件，避免重复踩坑。',
    category: 'file',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '简短标题（便于检索）' },
        situation: { type: 'string', description: '问题场景或触发条件' },
        approach: { type: 'string', description: '做法与关键步骤' },
        pitfalls: { type: 'string', description: '踩坑与避免方式（可选）' },
        tags: { type: 'string', description: '逗号分隔标签（可选）' },
      },
      required: ['title', 'situation', 'approach'],
    },
    dangerous: false,
    execute: async (
      params: { title: string; situation: string; approach: string; pitfalls?: string; tags?: string },
      context: ToolContext
    ) => {
      try {
        const rel = 'docs/EXPERIENCE.md';
        const fullPath = resolveInWorkspace(context.workingDirectory, rel);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        let prev = '';
        try {
          prev = await fs.readFile(fullPath, 'utf-8');
        } catch {
          prev =
            '# 任务内经验（record_experience 追加）\n\n> 开工前请先 read_file 本文件，检索与当前子任务相关的标题/标签。\n\n';
        }
        const iso = new Date().toISOString();
        const pit = params.pitfalls?.trim() ? `\n- 避坑: ${params.pitfalls.trim()}` : '';
        const tag = params.tags?.trim() ? `\n- 标签: ${params.tags.trim()}` : '';
        const block = `\n## ${params.title.trim()}\n- 时间: ${iso}\n- 场景: ${params.situation.trim()}\n- 做法: ${params.approach.trim()}${pit}${tag}\n\n---\n`;
        await fs.writeFile(fullPath, prev.replace(/\s*$/, '') + block, 'utf-8');
        return { success: true, data: { path: rel, appended: true } };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  },
  {
    name: 'list_files',
    description: '列出目录中的文件（dir 相对于任务工作空间根目录；也允许传入落在工作空间内的绝对路径）',
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
        const fullPath = resolveInWorkspace(context.workingDirectory, params.dir);
        const files = await fs.readdir(fullPath);
        return { success: true, data: files };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  },
  {
    name: 'execute_command',
    description:
      '执行 shell 命令（谨慎使用）。**必须显式声明 outputs（产出文件列表）**：即使命令不产出文件，也要传 outputs: []，用于质量门禁精确审查。',
    category: 'code',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的命令' },
        outputs: {
          type: 'array',
          description:
            '显式声明本命令会写入/生成的工作区文件路径列表（相对工作区根）；无产出也必须传空数组 []，供审查系统绑定材料。',
        } as any,
        timeout: { type: 'number', description: '超时时间（秒）' }
      },
      required: ['command', 'outputs']
    },
    dangerous: true,
    execute: async (
      params: { command: string; outputs: string[]; timeout?: number },
      context: ToolContext
    ) => {
      try {
        const cmd = String(params.command || '').trim();
        if (!cmd) return { success: false, error: 'command must be non-empty' };
        // 轻量护栏：避免明显破坏性命令（你自己用，默认不做更严格的白名单）
        const deny = [
          /\brm\s+-rf\s+\/\b/i,
          /\bsudo\b/i,
          /\bshutdown\b|\breboot\b|\bhalt\b/i,
          /\bmkfs\b|\bdd\s+if=\/dev\//i,
          /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*;\s*\}\s*;\s*:/, // fork bomb
        ];
        if (deny.some((r) => r.test(cmd))) {
          return { success: false, error: 'command rejected by safety guard' };
        }
        const { stdout, stderr } = await execAsync(params.command, {
          cwd: context.workingDirectory,
          timeout: (params.timeout || 30) * 1000,
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });

        const out = stdout || stderr || 'Command executed successfully';
        const clipped = out.length > 20000 ? `${out.slice(0, 20000)}…(truncated)` : out;
        return {
          success: true,
          data: { output: clipped, outputs: Array.isArray(params.outputs) ? params.outputs : [] }
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
