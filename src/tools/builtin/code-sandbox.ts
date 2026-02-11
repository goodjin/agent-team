/**
 * CodeSandboxTool - 代码沙箱执行工具
 *
 * 使用 Node.js 内置 vm 模块执行 JavaScript，
 * 使用 child_process.spawn 执行 Python，
 * 含超时控制、模块访问限制。
 */

import * as vm from 'vm';
import { spawn } from 'child_process';

// 内联类型定义（与其他 builtin 工具保持一致）
export enum ToolPermission {
  NETWORK = 'network',
  READ_ONLY = 'read_only',
  READ = 'read',
  WRITE = 'write',
  SHELL = 'shell',
  CODE_EXEC = 'code_exec',
  SYSTEM = 'system',
}

export interface V6ToolDefinition {
  name: string;
  description: string;
  permissions: ToolPermission[];
  category: string;
  execute(args: any): Promise<any>;
}

// ============ 结果类型 ============

export interface SandboxResult {
  output: string;           // console.log 等标准输出
  result: unknown;          // 最后表达式的值（仅 nodejs）
  error?: string;           // 错误信息（含堆栈）
  executionTime: number;    // 执行时长（ms）
  timedOut: boolean;        // 是否超时
  language: string;
}

// ============ CodeSandboxTool ============

export class CodeSandboxTool implements V6ToolDefinition {
  name = 'code_execute';
  description = '在隔离沙箱中执行 Node.js 或 Python 代码，返回标准输出和执行结果';
  permissions = [ToolPermission.CODE_EXEC];
  category = 'code';

  async execute(args: {
    code: string;
    language?: 'javascript' | 'nodejs' | 'python';
    timeout?: number;  // 毫秒，默认 5000
    stdin?: string;
  }): Promise<SandboxResult> {
    const {
      code,
      language = 'nodejs',
      timeout = 5000,
      stdin,
    } = args;

    if (!code || code.trim().length === 0) {
      return {
        output: '',
        result: undefined,
        error: '代码不能为空',
        executionTime: 0,
        timedOut: false,
        language,
      };
    }

    if (language === 'python') {
      return this.executePython(code, timeout, stdin);
    }

    // javascript / nodejs
    return this.executeInVm(code, timeout);
  }

  // ============ Node.js vm 沙箱 ============

  private executeInVm(code: string, timeout: number): SandboxResult {
    const startTime = Date.now();
    const outputBuffer: string[] = [];

    // 安全沙箱：只暴露无害全局对象，明确禁止 require/process/Buffer/fetch
    const sandbox = {
      console: {
        log: (...args: unknown[]) => outputBuffer.push(args.map(String).join(' ')),
        error: (...args: unknown[]) => outputBuffer.push('[error] ' + args.map(String).join(' ')),
        warn: (...args: unknown[]) => outputBuffer.push('[warn] ' + args.map(String).join(' ')),
        info: (...args: unknown[]) => outputBuffer.push('[info] ' + args.map(String).join(' ')),
      },
      Math,
      JSON,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Number,
      String,
      Boolean,
      Array,
      Object,
      Date,
      RegExp,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      Map,
      Set,
      WeakMap,
      WeakSet,
      Symbol,
      Promise,
      // 注意：不注入 require, process, Buffer, fetch, __dirname, __filename
    };

    try {
      const context = vm.createContext(sandbox);
      const returnValue = vm.runInContext(code, context, {
        timeout,
        filename: 'sandbox.js',
      });

      return {
        output: outputBuffer.join('\n'),
        result: returnValue,
        executionTime: Date.now() - startTime,
        timedOut: false,
        language: 'nodejs',
      };
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      const isTimeout =
        error.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' ||
        (error.message ?? '').includes('Script execution timed out');

      return {
        output: outputBuffer.join('\n'),
        result: undefined,
        error: error.stack ?? error.message ?? String(err),
        executionTime: Date.now() - startTime,
        timedOut: isTimeout,
        language: 'nodejs',
      };
    }
  }

  // ============ Python 子进程 ============

  private executePython(
    code: string,
    timeout: number,
    stdin?: string,
  ): Promise<SandboxResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      // -c 执行代码字符串（注：--isolated 在部分 Python 版本不支持，故不使用）
      const child = spawn('python3', ['-c', code], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          PATH: process.env.PATH ?? '/usr/bin:/bin',
          // 不传递其他环境变量，减少信息泄漏
        },
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeout);

      if (stdin) {
        child.stdin.write(stdin);
      }
      child.stdin.end();

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', () => {
        clearTimeout(timer);
        resolve({
          output: stdout,
          result: undefined,
          error: stderr.trim() ? stderr : undefined,
          executionTime: Date.now() - startTime,
          timedOut,
          language: 'python',
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          output: stdout,
          result: undefined,
          error: err.message,
          executionTime: Date.now() - startTime,
          timedOut: false,
          language: 'python',
        });
      });
    });
  }
}
