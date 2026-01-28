/**
 * 代码执行工具
 */

import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { BaseTool, type ToolResult } from './base.js';
import { z } from 'zod';
import type { ToolDefinition } from '../types/index.js';

/**
 * 代码执行工具配置
 */
export interface CodeExecutionConfig {
  enabled: boolean;
  timeout: number;
  workingDirectory?: string;
  allowedCommands?: string[];
  blockedCommands?: string[];
  environment?: { [key: string]: string };
}

/**
 * 代码执行结果
 */
export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  duration: number;
}

/**
 * 代码执行工具
 */
export class ExecuteCodeTool extends BaseTool {
  private config: CodeExecutionConfig;
  private readonly promisifyExec = promisify(exec);

  constructor(config?: Partial<CodeExecutionConfig>) {
    const definition: ToolDefinition = {
      name: 'execute-code',
      description: '执行代码命令并返回输出',
      category: 'code',
      dangerous: true,
      execute: async (params: any) => this.execute(params),
      schema: z.object({
        command: z.string().describe('要执行的命令'),
        args: z.array(z.string()).optional().describe('命令参数'),
        options: z
          .object({
            timeout: z
              .number()
              .optional()
              .describe('超时时间（毫秒）'),
            workingDir: z
              .string()
              .optional()
              .describe('工作目录'),
            env: z
              .record(z.string())
              .optional()
              .describe('环境变量'),
          })
          .optional(),
      }),
    };
    super(definition);

    this.config = {
      enabled: config?.enabled ?? false,
      timeout: config?.timeout ?? 30000,
      workingDirectory: config?.workingDirectory,
      allowedCommands: config?.allowedCommands ?? ['npm', 'node', 'python', 'pip'],
      blockedCommands: config?.blockedCommands ?? ['rm', 'format', 'mkfs', 'dd'],
      environment: config?.environment ?? {},
    };
  }

  /**
   * 执行命令
   */
  protected async executeImpl(params: {
    command: string;
    args?: string[];
    options?: {
      timeout?: number;
      workingDir?: string;
      env?: Record<string, string>;
    };
  }): Promise<ToolResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        error: '代码执行功能已禁用',
      };
    }

    // 检查命令是否允许
    const commandName = params.command.split(' ')[0];
    if (
      this.config.allowedCommands &&
      this.config.allowedCommands.length > 0 &&
      !this.config.allowedCommands.includes(commandName)
    ) {
      return {
        success: false,
        error: `命令 ${commandName} 不在允许列表中`,
      };
    }

    // 检查命令是否被阻止
    if (this.config.blockedCommands && this.config.blockedCommands.includes(commandName)) {
      return {
        success: false,
        error: `命令 ${commandName} 被阻止执行`,
      };
    }

    const startTime = Date.now();
    const timeout = params.options?.timeout ?? this.config.timeout;
    const workingDir =
      params.options?.workingDir ?? this.config.workingDirectory;

    try {
      const fullCommand = [params.command, ...(params.args || [])].join(' ');
      const { stdout, stderr } = await this.promisifyExec(fullCommand, {
        cwd: workingDir,
        timeout,
        env: {
          ...process.env,
          ...this.config.environment,
          ...params.options?.env,
        },
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      const duration = Date.now() - startTime;

      return {
        success: true,
        data: {
          stdout,
          stderr,
          exitCode: 0,
          signal: null,
          duration,
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      // 处理超时
      if (error.killed && error.signal === 'SIGTERM') {
        return {
          success: false,
          error: `命令执行超时（${timeout}ms）`,
          data: {
            stdout: error.stdout || '',
            stderr: error.stderr || '',
            exitCode: null,
            signal: 'SIGTERM',
            duration,
          },
        };
      }

      return {
        success: false,
        error: error.message,
        data: {
          stdout: error.stdout || '',
          stderr: error.stderr || '',
          exitCode: error.code || null,
          signal: error.signal || null,
          duration,
        },
      };
    }
  }

  /**
   * 启用/禁用代码执行
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * 获取当前配置
   */
  getConfig(): CodeExecutionConfig {
    return { ...this.config };
  }
}

/**
 * 声明 child_process.exec 的类型
 */
function exec(
  command: string,
  options: any,
  callback: (error: any, stdout: any, stderr: any) => void
): ChildProcess {
  return require('child_process').exec(command, options, callback);
}

/**
 * 测试命令工具
 */
export class RunTestsTool extends BaseTool {
  private config: {
    framework?: string;
    pattern?: string;
    timeout: number;
  };

  constructor(config?: { framework?: string; pattern?: string; timeout?: number }) {
    const definition: ToolDefinition = {
      name: 'run-tests',
      description: '运行测试并返回结果',
      category: 'code',
      dangerous: false,
      execute: async (params: any) => this.execute(params),
      schema: z.object({
        framework: z
          .enum(['jest', 'vitest', 'pytest', 'go-test', 'custom'])
          .optional()
          .describe('测试框架'),
        pattern: z.string().optional().describe('测试文件匹配模式'),
        args: z.array(z.string()).optional().describe('额外参数'),
      }),
    };
    super(definition);
    this.config = {
      framework: config?.framework,
      pattern: config?.pattern,
      timeout: config?.timeout ?? 60000,
    };
  }

  /**
   * 执行测试
   */
  protected async executeImpl(params: {
    framework?: string;
    pattern?: string;
    args?: string[];
  }): Promise<ToolResult> {
    const framework = params.framework || this.config.framework;
    const pattern = params.pattern || this.config.pattern;

    if (!framework) {
      return {
        success: false,
        error: '请指定测试框架',
      };
    }

    // 构建测试命令
    let command: string;
    const args: string[] = [];

    switch (framework) {
      case 'jest':
        command = 'npx jest';
        if (pattern) {
          args.push('--testPathPattern', pattern);
        }
        break;
      case 'vitest':
        command = 'npx vitest';
        if (pattern) {
          args.push(pattern);
        }
        break;
      case 'pytest':
        command = 'python -m pytest';
        if (pattern) {
          args.push(pattern);
        }
        break;
      case 'go-test':
        command = 'go test';
        if (pattern) {
          args.push('./...', '-run', pattern);
        } else {
          args.push('./...');
        }
        break;
      default:
        return {
          success: false,
          error: `不支持的测试框架: ${framework}`,
        };
    }

    // 添加额外参数
    if (params.args) {
      args.push(...params.args);
    }

    // 执行测试
    const executeTool = new ExecuteCodeTool({ timeout: this.config.timeout });
    const result = await executeTool.execute({ command, args });

    return result;
  }
}

/**
 * 安装依赖工具
 */
export class InstallDependenciesTool extends BaseTool {
  private readonly packageManagers = ['npm', 'yarn', 'pnpm', 'bun'] as const;

  constructor() {
    const definition: ToolDefinition = {
      name: 'install-dependencies',
      description: '安装项目依赖',
      category: 'code',
      dangerous: true,
      execute: async (params: any) => this.execute(params),
      schema: z.object({
        packageManager: z
          .enum(['npm', 'yarn', 'pnpm', 'bun'])
          .optional()
          .describe('包管理器'),
        packages: z.array(z.string()).optional().describe('要安装的包'),
        dev: z.boolean().optional().describe('是否安装为开发依赖'),
        exact: z.boolean().optional().describe('是否安装精确版本'),
      }),
    };
    super(definition);
  }

  /**
   * 执行安装
   */
  protected async executeImpl(params: {
    packageManager?: string;
    packages?: string[];
    dev?: boolean;
    exact?: boolean;
  }): Promise<ToolResult> {
    const packageManager = (params.packageManager || 'npm') as 'npm' | 'yarn' | 'pnpm' | 'bun';

    if (!this.packageManagers.includes(packageManager)) {
      return {
        success: false,
        error: `不支持的包管理器: ${packageManager}`,
      };
    }

    const args: string[] = ['install'];

    if (params.dev) {
      args.push('-D');
    }

    if (params.exact) {
      args.push('--save-exact');
    }

    if (params.packages && params.packages.length > 0) {
      args.push(...params.packages);
    }

    const executeTool = new ExecuteCodeTool({ enabled: true });

    return executeTool.execute({
      command: packageManager,
      args,
    });
  }
}
