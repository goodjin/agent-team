import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool } from './base.js';
import type { ToolDefinition, ToolResult } from '../types/index.js';
import { z } from 'zod';

const execAsync = promisify(exec);

/**
 * Git 基础工具类
 */
export abstract class BaseGitTool extends BaseTool {
  protected async execGit(command: string, cwd?: string): Promise<{ stdout: string; stderr: string }> {
    const fullCommand = `git ${command}`;
    const options = cwd ? { cwd } : {};

    try {
      return await execAsync(fullCommand, options);
    } catch (error: any) {
      throw new Error(`Git command failed: ${error.message}`);
    }
  }
}

/**
 * Git 状态工具
 */
export class GitStatusTool extends BaseGitTool {
  constructor() {
    const definition: ToolDefinition = {
      name: 'git-status',
      description: '查看 Git 工作区状态',
      category: 'git',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        repoPath: z.string().optional(),
      }),
      dangerous: false,
    };

    super(definition);
  }

  protected async executeImpl(params: { repoPath?: string }): Promise<ToolResult> {
    try {
      const { stdout } = await this.execGit('status --porcelain', params.repoPath);

      const lines = stdout.trim().split('\n').filter(Boolean);
      const changes = lines.map(line => ({
        status: line.substring(0, 2),
        file: line.substring(3),
      }));

      const { stdout: branchOut } = await this.execGit('branch --show-current', params.repoPath);

      return {
        success: true,
        data: {
          currentBranch: branchOut.trim(),
          changes,
          totalChanges: changes.length,
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
 * Git 提交工具
 */
export class GitCommitTool extends BaseGitTool {
  constructor() {
    const definition: ToolDefinition = {
      name: 'git-commit',
      description: '创建 Git 提交',
      category: 'git',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        message: z.string().min(1, '提交信息不能为空'),
        repoPath: z.string().optional(),
        addAll: z.boolean().optional().default(false),
        files: z.array(z.string()).optional(),
      }),
      dangerous: true, // Git 提交是重要操作
    };

    super(definition);
  }

  protected async executeImpl(params: {
    message: string;
    repoPath?: string;
    addAll?: boolean;
    files?: string[];
  }): Promise<ToolResult> {
    try {
      const { message, repoPath, addAll = false, files } = params;

      // 添加文件到暂存区
      if (addAll) {
        await this.execGit('add -A', repoPath);
      } else if (files && files.length > 0) {
        await this.execGit(`add ${files.join(' ')}`, repoPath);
      }

      // 创建提交
      const { stdout } = await this.execGit(`commit -m "${message}"`, repoPath);

      // 获取提交哈希
      const { stdout: logOut } = await this.execGit('log -1 --format=%H', repoPath);
      const commitHash = logOut.trim();

      return {
        success: true,
        data: {
          commitHash,
          message,
          output: stdout,
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
 * Git 分支工具
 */
export class GitBranchTool extends BaseGitTool {
  constructor() {
    const definition: ToolDefinition = {
      name: 'git-branch',
      description: '管理 Git 分支',
      category: 'git',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        action: z.enum(['list', 'create', 'delete', 'switch']),
        repoPath: z.string().optional(),
        branchName: z.string().optional(),
        force: z.boolean().optional().default(false),
      }),
      dangerous: true,
    };

    super(definition);
  }

  protected async executeImpl(params: {
    action: 'list' | 'create' | 'delete' | 'switch';
    repoPath?: string;
    branchName?: string;
    force?: boolean;
  }): Promise<ToolResult> {
    try {
      const { action, repoPath, branchName, force = false } = params;

      let command = '';
      switch (action) {
        case 'list':
          command = 'branch -a';
          break;
        case 'create':
          if (!branchName) {
            return { success: false, error: '创建分支需要指定 branchName' };
          }
          command = `branch ${branchName}`;
          break;
        case 'delete':
          if (!branchName) {
            return { success: false, error: '删除分支需要指定 branchName' };
          }
          command = `branch ${force ? '-D' : '-d'} ${branchName}`;
          break;
        case 'switch':
          if (!branchName) {
            return { success: false, error: '切换分支需要指定 branchName' };
          }
          command = `switch ${force ? '-C' : ''} ${branchName}`;
          break;
      }

      const { stdout } = await this.execGit(command, repoPath);

      return {
        success: true,
        data: {
          action,
          branchName,
          output: stdout,
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
 * Git 拉取工具
 */
export class GitPullTool extends BaseGitTool {
  constructor() {
    const definition: ToolDefinition = {
      name: 'git-pull',
      description: '从远程拉取更新',
      category: 'git',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        repoPath: z.string().optional(),
        remote: z.string().optional().default('origin'),
        branch: z.string().optional(),
        rebase: z.boolean().optional().default(false),
      }),
      dangerous: true,
    };

    super(definition);
  }

  protected async executeImpl(params: {
    repoPath?: string;
    remote?: string;
    branch?: string;
    rebase?: boolean;
  }): Promise<ToolResult> {
    try {
      const { repoPath, remote = 'origin', branch, rebase = false } = params;

      let command = 'pull';
      if (rebase) command += ' --rebase';
      if (branch) command += ` ${remote} ${branch}`;

      const { stdout } = await this.execGit(command, repoPath);

      return {
        success: true,
        data: {
          remote,
          branch,
          rebase,
          output: stdout,
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
 * Git 推送工具
 */
export class GitPushTool extends BaseGitTool {
  constructor() {
    const definition: ToolDefinition = {
      name: 'git-push',
      description: '推送到远程仓库',
      category: 'git',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        repoPath: z.string().optional(),
        remote: z.string().optional().default('origin'),
        branch: z.string().optional(),
        force: z.boolean().optional().default(false),
        setUpstream: z.boolean().optional().default(false),
      }),
      dangerous: true,
    };

    super(definition);
  }

  protected async executeImpl(params: {
    repoPath?: string;
    remote?: string;
    branch?: string;
    force?: boolean;
    setUpstream?: boolean;
  }): Promise<ToolResult> {
    try {
      const { repoPath, remote = 'origin', branch, force = false, setUpstream = false } = params;

      let command = 'push';
      if (force) command += ' --force';
      if (setUpstream) command += ' --set-upstream';
      if (branch) command += ` ${remote} ${branch}`;

      const { stdout } = await this.execGit(command, repoPath);

      return {
        success: true,
        data: {
          remote,
          branch,
          output: stdout,
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
