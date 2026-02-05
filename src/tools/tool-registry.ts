import { EventEmitter } from 'eventemitter3';
import type { ToolDefinition, ToolResult, AgentEvent, AgentEventData } from '../types/index.js';
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

/**
 * 工具注册表
 * 管理所有可用工具
 */
export class ToolRegistry extends EventEmitter {
  private tools: Map<string, BaseTool> = new Map();
  private categories: Map<string, Set<string>> = new Map();

  constructor() {
    super();
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
   */
  async execute(name: string, params: any): Promise<ToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
      };
    }

    // 检查工具是否可用
    const available = await tool.isAvailable();
    if (!available) {
      return {
        success: false,
        error: `Tool is not available: ${name}`,
      };
    }

    // 发出执行前事件
    this.emit('tool:before-execute', {
      event: 'tool:before-execute',
      timestamp: new Date(),
      data: { name, params },
    } as AgentEventData);

    try {
      const result = await tool.execute(params);

      // 发出执行后事件
      this.emit('tool:after-execute', {
        event: 'tool:after-execute',
        timestamp: new Date(),
        data: { name, params, result },
      } as AgentEventData);

      return result;
    } catch (error) {
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
    this.register(new ReadFileTool());
    this.register(new WriteFileTool());
    this.register(new SearchFilesTool());
    this.register(new DeleteFileTool());
    this.register(new ListDirectoryTool());

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

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
    this.categories.clear();
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
