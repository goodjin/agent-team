/**
 * ShellExecutorTool - 安全的 Shell 命令执行工具
 *
 * 使用 Node.js 内置 child_process，含命令黑名单过滤、
 * 工作目录限制、超时控制。
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

// 内联类型定义（等待 Task 01 registry.ts 完成后可统一重构）
export enum ToolPermission {
  NETWORK = 'network',
  READ_ONLY = 'read_only',
  READ = 'read',
  WRITE = 'write',
  SHELL = 'shell',
  SYSTEM = 'system',
}

export interface V6ToolDefinition {
  name: string;
  description: string;
  permissions: ToolPermission[];
  category: string;
  execute(args: any): Promise<any>;
}

// 危险命令黑名单（正则匹配，大小写不敏感）
const DANGEROUS_COMMANDS: RegExp[] = [
  /rm\s+-[a-z]*r[a-z]*f[a-z]*\s+\//i,             // rm -rf / (含 -fr / 等变体)
  /rm\s+-[a-z]*f[a-z]*r[a-z]*\s+\//i,             // rm -fr /
  /rm\s+-[a-z]*r[a-z]*f[a-z]*\s+~(\s|$)/i,        // rm -rf ~
  /rm\s+-[a-z]*r[a-z]*f[a-z]*\s+\.\s*\/\*?(\s|$)/i, // rm -rf ./* 或 rm -rf ./
  /rm\s+-[a-z]*r[a-z]*f[a-z]*\s+\.(\s|$)/i,       // rm -rf .
  /rm\s+-[a-z]*r[a-z]*f[a-z]*\s+\*(\s|$)/i,       // rm -rf *
  /rm\s+-rf\s+--no-preserve-root/i,                // rm -rf --no-preserve-root
  /\:\s*\(\s*\)\s*\{.*\:\s*\|.*\&/,               // fork bomb :(){ :|:& };:
  /mkfs\b/i,                                        // mkfs（格式化磁盘）
  /dd\s+if=\/dev\/zero/i,                           // dd if=/dev/zero
  /dd\s+if=\/dev\/random/i,                         // dd if=/dev/random
  /chmod\s+(-R\s+)?777\s+\//i,                     // chmod 777 /
  /chown\s+-R\b/i,                                  // chown -R
  />\s*\/dev\/sd[a-z]/i,                            // 写入裸磁盘
  /sudo\s+rm\b/i,                                   // sudo rm
  /(wget|curl)[^\n]*\|\s*(ba)?sh/i,                 // wget/curl | sh
  /\bshutdown\b/i,                                  // shutdown
  /\breboot\b/i,                                    // reboot
  /\bhalt\b/i,                                      // halt
  /\bpoweroff\b/i,                                  // poweroff
];

// 警告命令列表（执行但记录警告）
const WARNING_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /rm\s+-rf/i, reason: '递归删除文件，可能导致数据丢失' },
  { pattern: /sudo\s+/i, reason: '使用超级用户权限' },
  { pattern: /npm\s+install\s+-g/i, reason: '全局安装 npm 包' },
  { pattern: /pip\s+install/i, reason: '安装 Python 包' },
];

// 每个输出流的最大字节数（10KB）
const MAX_OUTPUT_BYTES = 10 * 1024;

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  command: string;
  executionTime: number;
  truncated: boolean;
  warnings: string[];
}

export interface ShellAuditLog {
  timestamp: string;
  command: string;
  cwd: string;
  exitCode: number;
  executionTime: number;
  timedOut: boolean;
  warnings: string[];
}

// spawn 函数类型（用于依赖注入和测试）
type SpawnFn = typeof spawn;

export class ShellExecutorTool implements V6ToolDefinition {
  name = 'shell_execute';
  description = '在受限环境中执行 Shell 命令';
  permissions = [ToolPermission.SHELL];
  category = 'system';

  private maxTimeout = 30000;  // 30 秒
  private workingDir: string;
  private spawnFn: SpawnFn;

  constructor(workingDir?: string, spawnFn?: SpawnFn) {
    // 默认工作目录为当前进程工作目录
    this.workingDir = workingDir || process.cwd();
    // 允许注入 spawnFn，方便测试时 mock
    this.spawnFn = spawnFn || spawn;
  }

  async execute(args: {
    command: string;
    timeout?: number;
    workingDir?: string;
    env?: Record<string, string>;
    maxOutputSize?: number;
  }): Promise<ShellResult> {
    const {
      command,
      timeout = 30000,
      workingDir,
      env,
      maxOutputSize = MAX_OUTPUT_BYTES,
    } = args;

    // 1. 黑名单检查
    if (this.isDangerousCommand(command)) {
      return {
        stdout: '',
        stderr: `安全拒绝：命令包含危险操作模式，已被拒绝执行`,
        exitCode: -1,
        timedOut: false,
        command,
        executionTime: 0,
        truncated: false,
        warnings: ['命令因安全策略被拒绝'],
      };
    }

    // 2. 获取警告
    const warnings = this.getDangerousWarnings(command);

    // 3. 解析工作目录
    let cwd: string;
    try {
      cwd = this.resolveWorkDir(workingDir);
    } catch (error) {
      return {
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: -1,
        timedOut: false,
        command,
        executionTime: 0,
        truncated: false,
        warnings,
      };
    }

    // 4. 执行命令
    const effectiveTimeout = Math.min(timeout, this.maxTimeout);
    const result = await this.runCommand(command, effectiveTimeout, cwd, env, maxOutputSize);
    const fullResult: ShellResult = { ...result, warnings };

    // 5. 写入审计日志（异步，不阻塞返回）
    this.writeAuditLog({
      timestamp: new Date().toISOString(),
      command,
      cwd,
      exitCode: fullResult.exitCode,
      executionTime: fullResult.executionTime,
      timedOut: fullResult.timedOut,
      warnings,
    }).catch(() => {
      // 审计日志写入失败不影响命令结果
    });

    return fullResult;
  }

  /**
   * 检查命令是否包含危险模式（大小写不敏感）
   */
  private isDangerousCommand(command: string): boolean {
    return DANGEROUS_COMMANDS.some(pattern => pattern.test(command));
  }

  /**
   * 获取命令的警告信息（不阻止执行）
   */
  private getDangerousWarnings(command: string): string[] {
    return WARNING_PATTERNS
      .filter(w => w.pattern.test(command))
      .map(w => w.reason);
  }

  /**
   * 解析工作目录，防止路径穿越
   */
  private resolveWorkDir(cwd?: string): string {
    if (!cwd) {
      return this.workingDir;
    }

    const resolved = path.resolve(this.workingDir, cwd);

    // 防止路径穿越：不允许跳出项目根目录
    if (!resolved.startsWith(this.workingDir + path.sep) && resolved !== this.workingDir) {
      throw new Error(
        `路径穿越检测：cwd 必须在工作空间根目录内（${this.workingDir}），得到: ${resolved}`
      );
    }

    return resolved;
  }

  /**
   * 执行 Shell 命令，返回 Promise
   */
  private runCommand(
    command: string,
    timeout: number,
    cwd: string,
    env?: Record<string, string>,
    maxOutputSize: number = MAX_OUTPUT_BYTES,
  ): Promise<ShellResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let timedOut = false;
      let truncated = false;

      const childEnv = env
        ? { ...process.env, ...env }
        : process.env;

      const child = this.spawnFn('/bin/sh', ['-c', command], {
        cwd,
        env: childEnv as NodeJS.ProcessEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stdoutSize = 0;
      let stderrSize = 0;

      child.stdout.on('data', (chunk: Buffer) => {
        if (stdoutSize < maxOutputSize) {
          const remaining = maxOutputSize - stdoutSize;
          if (chunk.length > remaining) {
            stdoutChunks.push(chunk.slice(0, remaining));
            stdoutSize += remaining;
            truncated = true;
          } else {
            stdoutChunks.push(chunk);
            stdoutSize += chunk.length;
          }
        } else {
          truncated = true;
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        if (stderrSize < maxOutputSize) {
          const remaining = maxOutputSize - stderrSize;
          if (chunk.length > remaining) {
            stderrChunks.push(chunk.slice(0, remaining));
            stderrSize += remaining;
            truncated = true;
          } else {
            stderrChunks.push(chunk);
            stderrSize += chunk.length;
          }
        } else {
          truncated = true;
        }
      });

      // 超时处理：强制 SIGKILL
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        const executionTime = Date.now() - startTime;

        const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
        const stderr = Buffer.concat(stderrChunks).toString('utf-8');

        resolve({
          stdout,
          stderr,
          exitCode: timedOut ? -1 : (code ?? -1),
          timedOut,
          command,
          executionTime,
          truncated,
          warnings: [],
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        const executionTime = Date.now() - startTime;

        resolve({
          stdout: '',
          stderr: err.message,
          exitCode: -1,
          timedOut: false,
          command,
          executionTime,
          truncated: false,
          warnings: [],
        });
      });
    });
  }

  /**
   * 写入审计日志（追加模式）
   */
  private async writeAuditLog(log: ShellAuditLog): Promise<void> {
    const auditDir = path.resolve(this.workingDir, '.audit');
    const auditFile = path.resolve(auditDir, 'shell-commands.jsonl');

    try {
      await fs.mkdir(auditDir, { recursive: true });
      await fs.appendFile(auditFile, JSON.stringify(log) + '\n', 'utf-8');
    } catch {
      // 静默失败：审计日志不影响主流程
    }
  }
}
