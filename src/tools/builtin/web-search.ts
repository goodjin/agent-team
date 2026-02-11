/**
 * WebSearchTool - Web 搜索工具
 * Task 02: 允许 Agent 通过搜索引擎查询互联网信息
 */

import { z } from 'zod';
import { BaseTool } from '../base.js';
import type { ToolResult } from '../base.js';
import { ToolPermission, ToolCategory } from '../tool-registry.js';
import type { SearchAdapter, WebSearchResult } from '../adapters/search-adapter.js';

// ============ 参数 Schema ============

const WebSearchSchema = z.object({
  query: z.string().min(1, '查询词不能为空'),
  limit: z.number().int().min(1).max(50).optional(),
  language: z.string().optional(),
  region: z.string().optional(),
  freshness: z.enum(['day', 'week', 'month', 'any']).optional(),
});

type WebSearchParams = z.infer<typeof WebSearchSchema>;

// ============ 缓存结构 ============

interface CacheEntry {
  results: WebSearchResult[];
  totalEstimated: number;
  searchEngine: string;
  expires: number;
}

// ============ 速率限制滑动窗口 ============

interface RateLimit {
  windowMs: number;
  maxRequests: number;
  timestamps: number[];
}

// ============ WebSearchTool ============

export class WebSearchTool extends BaseTool {
  // 适配器列表（按优先级排序，第一个为主适配器）
  private adapters: SearchAdapter[];

  // 内存缓存（TTL 5 分钟）
  private cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTtlMs = 5 * 60 * 1000;

  // 速率限制（每分钟 20 次）
  private rateLimit: RateLimit = {
    windowMs: 60_000,
    maxRequests: 20,
    timestamps: [],
  };

  constructor(adapters: SearchAdapter[]) {
    super({
      name: 'web_search',
      description: '通过搜索引擎查询互联网信息，返回标题、URL、摘要的结构化结果列表',
      category: ToolCategory.WEB as unknown as 'custom',
      schema: WebSearchSchema,
      // ToolDefinition requires execute; BaseTool.execute() dispatches to executeImpl()
      execute: async () => ({ success: false, error: 'use BaseTool.execute()' }),
      // v6 扩展字段
      ...(({
        permissions: [ToolPermission.NETWORK, ToolPermission.READ_ONLY],
        version: '1.0.0',
        tags: ['search', 'internet', 'web'],
      }) as Record<string, unknown>),
    });
    this.adapters = adapters;
  }

  /**
   * 检查工具是否可用：至少有一个可用适配器
   */
  override async isAvailable(): Promise<boolean> {
    for (const adapter of this.adapters) {
      if (await adapter.isAvailable()) {
        return true;
      }
    }
    return false;
  }

  protected async executeImpl(params: WebSearchParams): Promise<ToolResult> {
    // 1. 速率限制检查
    if (!this.checkRateLimit()) {
      return {
        success: false,
        error: '速率限制：每分钟最多 20 次搜索请求',
      };
    }

    const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);

    // 2. 缓存检查
    const cacheKey = this.buildCacheKey(params);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return {
        success: true,
        data: {
          results: cached.results,
          totalEstimated: cached.totalEstimated,
          query: params.query,
          searchEngine: cached.searchEngine,
          fromCache: true,
        },
      };
    }

    // 3. 遍历适配器，逐一尝试
    const errors: string[] = [];
    for (const adapter of this.adapters) {
      const available = await adapter.isAvailable();
      if (!available) {
        errors.push(`${adapter.name}: not available`);
        continue;
      }

      try {
        const response = await adapter.search({
          query: params.query,
          limit,
          language: params.language,
          region: params.region,
          freshness: params.freshness,
        });

        // 4. URL 安全校验：过滤非 http/https
        const safeResults = response.results.filter(
          r => r.url.startsWith('http://') || r.url.startsWith('https://')
        );

        // 5. 存入缓存
        this.setCache(cacheKey, {
          results: safeResults,
          totalEstimated: response.totalEstimated,
          searchEngine: response.searchEngine,
          expires: Date.now() + this.cacheTtlMs,
        });

        return {
          success: true,
          data: {
            results: safeResults,
            totalEstimated: response.totalEstimated,
            query: params.query,
            searchEngine: response.searchEngine,
            fromCache: false,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${adapter.name}: ${msg}`);
      }
    }

    // 所有适配器均失败
    return {
      success: false,
      error: `所有搜索适配器均失败: ${errors.join('; ')}`,
    };
  }

  // ============ 私有工具方法 ============

  /**
   * 构建缓存 key（normalize query + 参数组合）
   */
  private buildCacheKey(params: WebSearchParams): string {
    const normalized = params.query.trim().toLowerCase();
    const limit = params.limit ?? 10;
    const lang = params.language ?? 'zh-CN';
    const region = params.region ?? 'CN';
    const freshness = params.freshness ?? 'any';
    return `${normalized}|${limit}|${lang}|${region}|${freshness}`;
  }

  /**
   * 从缓存取值（TTL 过期则删除）
   */
  private getFromCache(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    return entry;
  }

  /**
   * 写入缓存
   */
  private setCache(key: string, entry: CacheEntry): void {
    this.cache.set(key, entry);
  }

  /**
   * 速率限制检查（滑动窗口）
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    const windowStart = now - this.rateLimit.windowMs;

    // 清除窗口外的旧时间戳
    this.rateLimit.timestamps = this.rateLimit.timestamps.filter(t => t > windowStart);

    if (this.rateLimit.timestamps.length >= this.rateLimit.maxRequests) {
      return false;
    }

    this.rateLimit.timestamps.push(now);
    return true;
  }

  /**
   * 清空缓存（用于测试）
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 重置速率限制（用于测试）
   */
  resetRateLimit(): void {
    this.rateLimit.timestamps = [];
  }
}

// ============ Mock 适配器（测试用） ============

export class MockSearchAdapter implements SearchAdapter {
  readonly name = 'mock';
  private mockResults: WebSearchResult[];
  private shouldFail: boolean;

  constructor(results?: WebSearchResult[], shouldFail = false) {
    this.shouldFail = shouldFail;
    this.mockResults = results ?? [
      {
        title: 'TypeScript 官方文档',
        url: 'https://www.typescriptlang.org/docs/',
        snippet: 'TypeScript 是 JavaScript 的类型超集，可编译为纯 JavaScript。',
        source: 'typescriptlang.org',
      },
      {
        title: 'Node.js 官方网站',
        url: 'https://nodejs.org/',
        snippet: 'Node.js 是基于 Chrome V8 引擎的 JavaScript 运行时。',
        source: 'nodejs.org',
      },
      {
        title: 'GitHub - agent-team',
        url: 'https://github.com/example/agent-team',
        snippet: '多智能体系统框架，支持工具注册、任务调度和多角色协作。',
        source: 'github.com',
      },
      {
        title: 'MDN Web Docs',
        url: 'https://developer.mozilla.org/',
        snippet: 'MDN Web Docs 提供丰富的 Web 技术参考资料，包括 HTML、CSS、JavaScript。',
        source: 'developer.mozilla.org',
      },
      {
        title: 'Stack Overflow',
        url: 'https://stackoverflow.com/',
        snippet: '全球最大的开发者问答社区。',
        source: 'stackoverflow.com',
      },
    ];
  }

  async isAvailable(): Promise<boolean> {
    return !this.shouldFail;
  }

  async search(params: WebSearchParams): Promise<{ results: WebSearchResult[]; totalEstimated: number; query: string; searchEngine: string }> {
    if (this.shouldFail) {
      throw new Error('Mock adapter failure');
    }
    const limit = Math.min(params.limit ?? 10, this.mockResults.length);
    return {
      results: this.mockResults.slice(0, limit),
      totalEstimated: this.mockResults.length,
      query: params.query,
      searchEngine: 'mock',
    };
  }
}
