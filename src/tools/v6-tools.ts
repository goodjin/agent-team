/**
 * v6-tools.ts - v6 工具注册入口
 *
 * 将所有 v6 新工具注册到 ToolRegistry。
 * WebSearchTool 直接继承 BaseTool，其余工具通过 V6ToolAdapter 包装。
 */

import { BaseTool } from './base.js';
import type { ToolResult } from './base.js';
import { ToolRegistry, ToolPermission } from './tool-registry.js';
import type { V6ToolDefinition } from './tool-registry.js';

import { WebSearchTool } from './builtin/web-search.js';
import { WebFetchTool } from './builtin/web-fetch.js';
import { ShellExecutorTool } from './builtin/shell-executor.js';
import { CodeSandboxTool } from './builtin/code-sandbox.js';
import { SerperSearchAdapter } from './adapters/serper-search.js';
import { BingSearchAdapter } from './adapters/bing-search.js';
import type { SearchAdapter } from './adapters/search-adapter.js';

// ============ V6ToolAdapter ============

/**
 * 将独立 V6ToolDefinition（WebFetchTool、ShellExecutorTool 等）
 * 适配为 BaseTool，以便注册到 ToolRegistry。
 */
class V6ToolAdapter extends BaseTool {
  private v6Tool: V6ToolDefinition;

  constructor(v6Tool: V6ToolDefinition) {
    super({
      name: v6Tool.name,
      description: v6Tool.description,
      category: v6Tool.category,
      permissions: v6Tool.permissions as unknown as ToolPermission[],
      dangerous: (v6Tool.permissions ?? []).some(
        (p: string) => p === 'shell' || p === 'system' || p === 'code_exec'
      ),
    } as any);
    this.v6Tool = v6Tool;
  }

  protected async executeImpl(params: unknown): Promise<ToolResult> {
    try {
      const result = await this.v6Tool.execute(params);
      // V6 工具直接返回结果对象（非 ToolResult），包装一下
      if (result && typeof result === 'object' && 'success' in result) {
        return result as ToolResult;
      }
      return { success: true, data: result };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ============ 注册选项 ============

export interface RegisterV6ToolsOptions {
  enableWebSearch?: boolean;
  enableWebFetch?: boolean;
  enableShell?: boolean;
  enableCodeSandbox?: boolean;
  webSearchApiKey?: string;      // Serper API Key（也可从 SERPER_API_KEY 环境变量读取）
  bingApiKey?: string;           // Bing Search API Key（也可从 BING_SEARCH_API_KEY 读取）
  workingDir?: string;           // ShellExecutorTool 工作目录
}

// ============ 注册函数 ============

/**
 * 注册所有 v6 工具到 ToolRegistry
 */
export function registerV6Tools(
  registry: ToolRegistry,
  options: RegisterV6ToolsOptions = {},
): void {
  const {
    enableWebSearch = true,
    enableWebFetch = true,
    enableShell = true,
    enableCodeSandbox = true,
    webSearchApiKey = process.env.SERPER_API_KEY,
    bingApiKey = process.env.BING_SEARCH_API_KEY,
    workingDir,
  } = options;

  // ---- WebSearchTool（BaseTool 子类，直接注册）----
  if (enableWebSearch) {
    const adapters: SearchAdapter[] = buildSearchAdapters(webSearchApiKey, bingApiKey);
    if (adapters.length > 0) {
      try {
        const webSearch = new WebSearchTool(adapters);
        registry.register(webSearch);
      } catch {
        // 静默失败：缺少依赖时跳过
      }
    }
    // 如果没有 API Key，跳过注册（不报错）
  }

  // ---- WebFetchTool（V6ToolDefinition，通过适配器包装）----
  if (enableWebFetch) {
    try {
      const webFetch = new WebFetchTool();
      registry.register(new V6ToolAdapter(webFetch as unknown as V6ToolDefinition));
    } catch {
      // 静默失败
    }
  }

  // ---- ShellExecutorTool（V6ToolDefinition，通过适配器包装）----
  if (enableShell) {
    try {
      const shell = new ShellExecutorTool(workingDir);
      registry.register(new V6ToolAdapter(shell as unknown as V6ToolDefinition));
    } catch {
      // 静默失败
    }
  }

  // ---- CodeSandboxTool（V6ToolDefinition，通过适配器包装）----
  if (enableCodeSandbox) {
    try {
      const sandbox = new CodeSandboxTool();
      registry.register(new V6ToolAdapter(sandbox as unknown as V6ToolDefinition));
    } catch {
      // 静默失败
    }
  }
}

// ============ 辅助函数 ============

/**
 * 根据配置构建搜索适配器列表
 */
function buildSearchAdapters(
  serperApiKey?: string,
  bingApiKey?: string,
): SearchAdapter[] {
  const adapters: SearchAdapter[] = [];

  if (serperApiKey) {
    try {
      adapters.push(new SerperSearchAdapter(serperApiKey));
    } catch {
      // 适配器不可用时静默跳过
    }
  }

  if (bingApiKey) {
    try {
      adapters.push(new BingSearchAdapter(bingApiKey));
    } catch {
      // 适配器不可用时静默跳过
    }
  }

  return adapters;
}
