import { EventEmitter } from 'eventemitter3';
import type { ToolDefinition, ToolResult, AgentEvent, AgentEventData } from '../types/index.js';
import { WorkDirManager } from '../core/work-dir-manager.js';
import { ReadFileTool } from './file-tools.js';
import { WriteFileTool } from './file-tools.js';
import { SearchFilesTool } from './file-tools.js';
import { DeleteFileTool } from './file-tools.js';
import { ListDirectoryTool } from './file-tools.js';
import { GitStatusTool } from './git-tools.js';
import { GitCommitTool } from './git-tools.js';
import { GitBranchTool } from './git-tools.js';
import { GitPullTool } from './git-tools.js';
import { GitPushTool } from './git-tools.js';
import { TextToImageTool, TextToVideoTool, ImageToImageTool, VideoEditTool, GenerationTaskStatusTool } from './ai-generation.js';
import { BrowseTool, SearchTool, ClickTool, InputTool, SubmitTool, ScreenshotTool, ExecuteJSTool } from './browser.js';
import { AnalyzeCodeTool, DetectCodeSmellsTool, DiffTool, GetImportsTool } from './code-analysis.js';
import { BaseTool } from './base.js';

// ============ v6 类型扩展 ============

/**
 * 工具权限级别
 */
export enum ToolPermission {
  READ_ONLY = 'read_only',
  WRITE = 'write',
  NETWORK = 'network',
  SHELL = 'shell',
  CODE_EXEC = 'code_exec',
  SYSTEM = 'system',
}

/**
 * 工具类别
 */
export enum ToolCategory {
  WEB = 'web',
  SHELL = 'shell',
  CODE = 'code',
  FILE = 'file',
  LLM = 'llm',
  GIT = 'git',
}

/**
 * 扩展工具定义（向后兼容 v5 ToolDefinition）
 */
export interface V6ToolDefinition extends ToolDefinition {
  version?: string;
  tags?: string[];
  permissions?: ToolPermission[];
  examples?: Array<{ description: string; params: unknown }>;
  healthCheck?: () => Promise<boolean>;
}

/**
 * 多维查询条件
 */
export interface ToolRegistryQuery {
  keyword?: string;
  category?: string;
  tags?: string[];
  permissions?: ToolPermission[];
}

/**
 * 工具调用统计
 */
export interface ToolCallStats {
  name: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  totalDurationMs: number;
  avgDurationMs: number;
  lastCalledAt?: Date;
}

/**
 * 工具注册表
 * 管理所有可用工具
 */
export class ToolRegistry extends EventEmitter {
  private tools: Map<string, BaseTool> = new Map();
  private categories: Map<string, Set<string>> = new Map();
  private workDirManager: WorkDirManager;

  // v6 新增：调用统计
  private stats: Map<string, ToolCallStats> = new Map();

  // v6 新增：健康检查
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private toolHealthStatus: Map<string, boolean> = new Map();

  constructor(workDirManager: WorkDirManager) {
    super();
    this.workDirManager = workDirManager;
    this.registerDefaultTools();
  }

  /**
   * 注册工具
   */
  register(tool: BaseTool): void {
    const definition = tool.getDefinition();
    const { name, category } = definition;

    this.tools.set(name, tool);

    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }
    this.categories.get(category)!.add(name);

    // v6：初始化统计条目
    if (!this.stats.has(name)) {
      this.stats.set(name, {
        name,
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        totalDurationMs: 0,
        avgDurationMs: 0,
      });
    }

    this.emit('tool:registered', {
      event: 'tool:registered',
      timestamp: new Date(),
      data: { name, category },
    } as AgentEventData);
  }

  /**
   * 注销工具
   */
  unregister(name: string): void {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    const { category } = tool.getDefinition();
    this.tools.delete(name);
    this.categories.get(category)?.delete(name);

    this.emit('tool:unregistered', {
      event: 'tool:unregistered',
      timestamp: new Date(),
      data: { name },
    } as AgentEventData);
  }

  /**
   * 获取工具
   */
  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 执行工具
   * @param name 工具名称
   * @param params 执行参数
   * @param agentPermissions Agent 拥有的权限列表（undefined 表示跳过权限检查，向后兼容）
   */
  async execute(name: string, params: any, agentPermissions?: ToolPermission[]): Promise<ToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
      };
    }

    // 检查工具是否可用（含健康状态）
    const available = await this.isToolAvailable(name, tool);
    if (!available) {
      return {
        success: false,
        error: `Tool is not available: ${name}`,
      };
    }

    // v6：权限检查（仅在 agentPermissions 传入时执行）
    if (agentPermissions !== undefined) {
      const definition = tool.getDefinition() as V6ToolDefinition;
      const requiredPermissions = definition.permissions ?? [];
      const missing = requiredPermissions.filter(p => !agentPermissions.includes(p));
      if (missing.length > 0) {
        return {
          success: false,
          error: `Permission denied: ${name} requires [${missing.join(', ')}]`,
        };
      }
    }

    // 发出执行前事件
    this.emit('tool:before-execute', {
      event: 'tool:before-execute',
      timestamp: new Date(),
      data: { name, params },
    } as AgentEventData);

    const startTime = Date.now();

    try {
      const result = await tool.execute(params);
      const duration = Date.now() - startTime;

      // v6：更新统计
      this.updateStats(name, result.success, duration);

      // 发出执行后事件
      this.emit('tool:after-execute', {
        event: 'tool:after-execute',
        timestamp: new Date(),
        data: { name, params, result },
      } as AgentEventData);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateStats(name, false, duration);

      const errorResult: ToolResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };

      this.emit('tool:error', {
        event: 'tool:error',
        timestamp: new Date(),
        data: { name, params, error: errorResult.error },
      } as AgentEventData);

      return errorResult;
    }
  }

  /**
   * v6：检查工具是否可用（含健康状态）
   */
  private async isToolAvailable(name: string, tool: BaseTool): Promise<boolean> {
    // 如果有健康状态缓存，且状态为 false，则不可用
    if (this.toolHealthStatus.has(name) && !this.toolHealthStatus.get(name)) {
      return false;
    }
    return tool.isAvailable();
  }

  /**
   * v6：更新调用统计
   */
  private updateStats(name: string, success: boolean, durationMs: number): void {
    const stat = this.stats.get(name);
    if (!stat) return;

    stat.totalCalls += 1;
    if (success) {
      stat.successCalls += 1;
    } else {
      stat.failedCalls += 1;
    }
    stat.totalDurationMs += durationMs;
    stat.avgDurationMs = stat.totalCalls > 0 ? stat.totalDurationMs / stat.totalCalls : 0;
    stat.lastCalledAt = new Date();
  }

  /**
   * 获取所有工具名称
   */
  getAllNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 按类别获取工具
   */
  getByCategory(category: string): BaseTool[] {
    const toolNames = this.categories.get(category);
    if (!toolNames) {
      return [];
    }

    return Array.from(toolNames)
      .map(name => this.tools.get(name))
      .filter((tool): tool is BaseTool => tool !== undefined);
  }

  /**
   * 获取所有类别
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * 获取工具定义
   */
  getDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name)?.getDefinition();
  }

  /**
   * 获取所有工具定义
   */
  getAllDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => tool.getDefinition());
  }

  /**
   * 搜索工具
   */
  search(query: string): BaseTool[] {
    const lowerQuery = query.toLowerCase();

    return Array.from(this.tools.values()).filter(tool => {
      const def = tool.getDefinition();
      return (
        def.name.toLowerCase().includes(lowerQuery) ||
        def.description.toLowerCase().includes(lowerQuery) ||
        def.category.toLowerCase().includes(lowerQuery)
      );
    });
  }

  /**
   * 注册默认工具集
   */
  private registerDefaultTools(): void {
    this.register(new ReadFileTool(this.workDirManager));
    this.register(new WriteFileTool(this.workDirManager));
    this.register(new SearchFilesTool(this.workDirManager));
    this.register(new DeleteFileTool(this.workDirManager));
    this.register(new ListDirectoryTool(this.workDirManager));

    this.register(new GitStatusTool());
    this.register(new GitCommitTool());
    this.register(new GitBranchTool());
    this.register(new GitPullTool());
    this.register(new GitPushTool());

    this.register(new TextToImageTool());
    this.register(new TextToVideoTool());
    this.register(new ImageToImageTool());
    this.register(new VideoEditTool());
    this.register(new GenerationTaskStatusTool());

    this.register(new BrowseTool());
    this.register(new SearchTool());
    this.register(new ClickTool());
    this.register(new InputTool());
    this.register(new SubmitTool());
    this.register(new ScreenshotTool());
    this.register(new ExecuteJSTool());

    this.register(new AnalyzeCodeTool());
    this.register(new DetectCodeSmellsTool());
    this.register(new DiffTool());
    this.register(new GetImportsTool());
  }

  /**
   * 批量注册工具
   */
  registerTools(tools: BaseTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 获取工具帮助
   */
  getHelp(name?: string): string {
    if (name) {
      const tool = this.tools.get(name);
      if (!tool) {
        return `Tool not found: ${name}`;
      }
      return tool.getHelp();
    }

    // 返回所有工具的帮助
    const sections: string[] = ['# Available Tools', ''];

    const categories = this.getCategories();
    for (const category of categories) {
      sections.push(`## ${category}`);
      sections.push('');

      const tools = this.getByCategory(category);
      for (const tool of tools) {
        const def = tool.getDefinition();
        sections.push(`### ${def.name}`);
        sections.push(def.description);
        sections.push('');
      }
    }

    return sections.join('\n');
  }

  // ============ v6 新增方法 ============

  /**
   * 多维查询工具
   */
  query(q: ToolRegistryQuery): BaseTool[] {
    return Array.from(this.tools.values()).filter(tool => {
      const def = tool.getDefinition() as V6ToolDefinition;

      // keyword：不区分大小写，匹配名称、描述、标签
      if (q.keyword) {
        const kw = q.keyword.toLowerCase();
        const inName = def.name.toLowerCase().includes(kw);
        const inDescription = def.description.toLowerCase().includes(kw);
        const inTags = (def.tags ?? []).some(t => t.toLowerCase().includes(kw));
        if (!inName && !inDescription && !inTags) {
          return false;
        }
      }

      // category：精确匹配
      if (q.category !== undefined && def.category !== q.category) {
        return false;
      }

      // tags：工具标签需包含查询标签的所有项
      if (q.tags && q.tags.length > 0) {
        const toolTags = def.tags ?? [];
        const hasAllTags = q.tags.every(t => toolTags.includes(t));
        if (!hasAllTags) {
          return false;
        }
      }

      // permissions：只返回具有指定权限的工具
      if (q.permissions && q.permissions.length > 0) {
        const toolPerms = def.permissions ?? [];
        const hasAnyPerm = q.permissions.some(p => toolPerms.includes(p));
        if (!hasAnyPerm) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * 启动定时健康检查
   */
  startHealthChecks(intervalMs: number): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    const runChecks = async () => {
      for (const [name, tool] of this.tools) {
        const def = tool.getDefinition() as V6ToolDefinition;
        if (def.healthCheck) {
          try {
            const healthy = await def.healthCheck();
            this.toolHealthStatus.set(name, healthy);
          } catch {
            this.toolHealthStatus.set(name, false);
          }
        }
      }
    };

    // 立即执行一次
    void runChecks();
    this.healthCheckTimer = setInterval(() => void runChecks(), intervalMs);

    // 进程退出时清理
    process.once('exit', () => this.stopHealthChecks());
  }

  /**
   * 停止健康检查
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * 获取工具调用统计
   */
  getToolStats(name: string): ToolCallStats | undefined {
    return this.stats.get(name);
  }

  /**
   * 获取所有工具调用统计
   */
  getAllToolStats(): ToolCallStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
    this.categories.clear();
    this.stats.clear();
    this.toolHealthStatus.clear();
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalTools: number;
    toolsByCategory: Record<string, number>;
    dangerousTools: string[];
  } {
    const toolsByCategory: Record<string, number> = {};
    const dangerousTools: string[] = [];

    for (const [category, tools] of this.categories) {
      toolsByCategory[category] = tools.size;
    }

    for (const [name, tool] of this.tools) {
      if (tool.getDefinition().dangerous) {
        dangerousTools.push(name);
      }
    }

    return {
      totalTools: this.tools.size,
      toolsByCategory,
      dangerousTools,
    };
  }
}
