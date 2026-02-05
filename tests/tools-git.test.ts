import { describe, it, expect, beforeEach } from 'vitest';
import {
  GitStatusTool,
  GitCommitTool,
  GitBranchTool,
  GitPullTool,
  GitPushTool,
} from '../src/tools/index.js';

describe('Git Tools', () => {
  beforeEach(() => {
  });

  describe('GitStatusTool', () => {
    it('should have correct tool definition', () => {
      const tool = new GitStatusTool();
      const def = tool.getDefinition();
      expect(def.name).toBe('git-status');
      expect(def.description).toBe('查看 Git 工作区状态');
      expect(def.category).toBe('git');
      expect(def.dangerous).toBe(false);
    });
  });

  describe('GitCommitTool', () => {
    it('should have correct tool definition', () => {
      const tool = new GitCommitTool();
      const def = tool.getDefinition();
      expect(def.name).toBe('git-commit');
      expect(def.description).toBe('创建 Git 提交');
      expect(def.category).toBe('git');
      expect(def.dangerous).toBe(true);
    });

    it('should require commit message', async () => {
      const tool = new GitCommitTool();
      const result = await tool.execute({ message: '' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('提交信息不能为空');
    });
  });

  describe('GitBranchTool', () => {
    it('should have correct tool definition', () => {
      const tool = new GitBranchTool();
      const def = tool.getDefinition();
      expect(def.name).toBe('git-branch');
      expect(def.description).toBe('管理 Git 分支');
      expect(def.category).toBe('git');
      expect(def.dangerous).toBe(true);
    });

    it('should require branch name for create action', async () => {
      const tool = new GitBranchTool();
      const result = await tool.execute({ action: 'create' as const });
      expect(result.success).toBe(false);
      expect(result.error).toContain('创建分支需要指定 branchName');
    });

    it('should require branch name for delete action', async () => {
      const tool = new GitBranchTool();
      const result = await tool.execute({ action: 'delete' as const });
      expect(result.success).toBe(false);
      expect(result.error).toContain('删除分支需要指定 branchName');
    });

    it('should require branch name for switch action', async () => {
      const tool = new GitBranchTool();
      const result = await tool.execute({ action: 'switch' as const });
      expect(result.success).toBe(false);
      expect(result.error).toContain('切换分支需要指定 branchName');
    });
  });

  describe('GitPullTool', () => {
    it('should have correct tool definition', () => {
      const tool = new GitPullTool();
      const def = tool.getDefinition();
      expect(def.name).toBe('git-pull');
      expect(def.description).toBe('从远程拉取更新');
      expect(def.category).toBe('git');
      expect(def.dangerous).toBe(true);
    });
  });

  describe('GitPushTool', () => {
    it('should have correct tool definition', () => {
      const tool = new GitPushTool();
      const def = tool.getDefinition();
      expect(def.name).toBe('git-push');
      expect(def.description).toBe('推送到远程仓库');
      expect(def.category).toBe('git');
      expect(def.dangerous).toBe(true);
    });
  });

  describe('Tool Help', () => {
    it('should return help for git-status', () => {
      const tool = new GitStatusTool();
      const help = tool.getHelp();
      expect(help).toContain('git-status');
      expect(help).toContain('git');
    });

    it('should return help for git-commit', () => {
      const tool = new GitCommitTool();
      const help = tool.getHelp();
      expect(help).toContain('git-commit');
      expect(help).toContain('是');
    });

    it('should return help for git-branch', () => {
      const tool = new GitBranchTool();
      const help = tool.getHelp();
      expect(help).toContain('git-branch');
      expect(help).toContain('git');
    });
  });

  describe('All Git Tools', () => {
    it('should have all required git tools', () => {
      const tools = ['git-status', 'git-commit', 'git-branch', 'git-pull', 'git-push'];
      tools.forEach(name => {
        let tool;
        switch (name) {
          case 'git-status': tool = new GitStatusTool(); break;
          case 'git-commit': tool = new GitCommitTool(); break;
          case 'git-branch': tool = new GitBranchTool(); break;
          case 'git-pull': tool = new GitPullTool(); break;
          case 'git-push': tool = new GitPushTool(); break;
        }
        const def = tool.getDefinition();
        expect(def.name).toBe(name);
        expect(def.category).toBe('git');
      });
    });
  });
});
