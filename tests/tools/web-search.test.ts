/**
 * WebSearchTool 测试
 * Task 02: 缓存、Fallback、速率限制、URL 过滤
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSearchTool, MockSearchAdapter } from '../../src/tools/builtin/web-search.js';
import type { SearchAdapter, WebSearchParams, WebSearchResult, WebSearchResponse } from '../../src/tools/adapters/search-adapter.js';

// ============ 辅助工具 ============

function makeResults(count: number): WebSearchResult[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `Result ${i + 1}`,
    url: `https://example.com/page${i + 1}`,
    snippet: `Snippet for result ${i + 1}`,
    source: 'example.com',
  }));
}

class CountingAdapter implements SearchAdapter {
  readonly name: string;
  callCount = 0;
  private results: WebSearchResult[];
  private fail: boolean;

  constructor(name: string, results?: WebSearchResult[], fail = false) {
    this.name = name;
    this.results = results ?? makeResults(5);
    this.fail = fail;
  }

  async isAvailable(): Promise<boolean> {
    return !this.fail;
  }

  async search(params: WebSearchParams): Promise<WebSearchResponse> {
    if (this.fail) {
      throw new Error(`${this.name} adapter failed`);
    }
    this.callCount++;
    const limit = params.limit ?? 10;
    return {
      results: this.results.slice(0, limit),
      totalEstimated: this.results.length,
      query: params.query,
      searchEngine: this.name,
    };
  }
}

// ============ 测试套件 ============

describe('WebSearchTool', () => {
  let tool: WebSearchTool;
  let mockAdapter: CountingAdapter;

  beforeEach(() => {
    mockAdapter = new CountingAdapter('mock', makeResults(10));
    tool = new WebSearchTool([mockAdapter]);
    tool.clearCache();
    tool.resetRateLimit();
  });

  // ============================
  // 基础功能
  // ============================

  describe('基础功能', () => {
    it('返回至少 5 条搜索结果', async () => {
      const result = await tool.execute({ query: 'TypeScript' });
      expect(result.success).toBe(true);
      expect(result.data.results.length).toBeGreaterThanOrEqual(5);
    });

    it('结果包含 title、url、snippet 字段', async () => {
      const result = await tool.execute({ query: 'Node.js' });
      expect(result.success).toBe(true);
      const first = result.data.results[0] as WebSearchResult;
      expect(typeof first.title).toBe('string');
      expect(typeof first.url).toBe('string');
      expect(typeof first.snippet).toBe('string');
    });

    it('返回 query 和 searchEngine 字段', async () => {
      const result = await tool.execute({ query: 'hello world' });
      expect(result.success).toBe(true);
      expect(result.data.query).toBe('hello world');
      expect(typeof result.data.searchEngine).toBe('string');
    });

    it('limit 参数限制结果数量', async () => {
      const result = await tool.execute({ query: 'test', limit: 3 });
      expect(result.success).toBe(true);
      expect(result.data.results.length).toBeLessThanOrEqual(3);
    });

    it('空 query 返回验证错误', async () => {
      const result = await tool.execute({ query: '' });
      expect(result.success).toBe(false);
    });
  });

  // ============================
  // 缓存
  // ============================

  describe('缓存', () => {
    it('相同查询第二次不触发适配器', async () => {
      await tool.execute({ query: 'cache test' });
      await tool.execute({ query: 'cache test' });

      expect(mockAdapter.callCount).toBe(1);
    });

    it('缓存命中时返回 fromCache=true', async () => {
      await tool.execute({ query: 'cache test' });
      const second = await tool.execute({ query: 'cache test' });

      expect(second.data.fromCache).toBe(true);
    });

    it('第一次请求返回 fromCache=false', async () => {
      const first = await tool.execute({ query: 'fresh query' });
      expect(first.data.fromCache).toBe(false);
    });

    it('不同 query 各自独立缓存', async () => {
      await tool.execute({ query: 'query A' });
      await tool.execute({ query: 'query B' });
      await tool.execute({ query: 'query A' });

      // query A 第二次命中缓存，query B 独立调用
      expect(mockAdapter.callCount).toBe(2);
    });

    it('缓存 key 对 query 做 normalize（trim + toLowerCase）', async () => {
      await tool.execute({ query: '  TypeScript  ' });
      await tool.execute({ query: 'typescript' });

      expect(mockAdapter.callCount).toBe(1);
    });

    it('clearCache 后重新触发适配器', async () => {
      await tool.execute({ query: 'fresh' });
      tool.clearCache();
      await tool.execute({ query: 'fresh' });

      expect(mockAdapter.callCount).toBe(2);
    });
  });

  // ============================
  // Fallback 机制
  // ============================

  describe('Fallback', () => {
    it('主适配器失败时自动切换备用适配器', async () => {
      const failAdapter = new CountingAdapter('primary', makeResults(5), true);
      const backupAdapter = new CountingAdapter('backup', makeResults(5), false);

      const fallbackTool = new WebSearchTool([failAdapter, backupAdapter]);

      const result = await fallbackTool.execute({ query: 'fallback test' });
      expect(result.success).toBe(true);
      expect(result.data.searchEngine).toBe('backup');
      expect(backupAdapter.callCount).toBe(1);
    });

    it('主适配器不可用时跳过', async () => {
      const unavailableAdapter = new CountingAdapter('unavailable', makeResults(5), true);
      const goodAdapter = new CountingAdapter('good', makeResults(5), false);

      const fallbackTool = new WebSearchTool([unavailableAdapter, goodAdapter]);

      const result = await fallbackTool.execute({ query: 'skip unavailable' });
      expect(result.success).toBe(true);
      expect(result.data.searchEngine).toBe('good');
    });

    it('所有适配器失败返回聚合错误', async () => {
      const fail1 = new CountingAdapter('fail1', makeResults(5), true);
      const fail2 = new CountingAdapter('fail2', makeResults(5), true);

      const allFailTool = new WebSearchTool([fail1, fail2]);
      const result = await allFailTool.execute({ query: 'all fail' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('适配器均失败');
    });

    it('主适配器抛出异常时自动切换', async () => {
      let callCount = 0;
      const throwingAdapter: SearchAdapter = {
        name: 'thrower',
        isAvailable: async () => true,
        search: async () => {
          callCount++;
          throw new Error('Network error');
        },
      };
      const safeAdapter = new CountingAdapter('safe', makeResults(5));

      const fallbackTool = new WebSearchTool([throwingAdapter, safeAdapter]);
      const result = await fallbackTool.execute({ query: 'exception test' });

      expect(result.success).toBe(true);
      expect(result.data.searchEngine).toBe('safe');
      expect(callCount).toBe(1);
      expect(safeAdapter.callCount).toBe(1);
    });
  });

  // ============================
  // URL 过滤
  // ============================

  describe('URL 过滤', () => {
    it('非 http/https URL 不出现在结果中', async () => {
      const dirtyAdapter: SearchAdapter = {
        name: 'dirty',
        isAvailable: async () => true,
        search: async (params: WebSearchParams): Promise<WebSearchResponse> => ({
          results: [
            { title: 'HTTPS', url: 'https://safe.com', snippet: 'ok' },
            { title: 'HTTP', url: 'http://also-safe.com', snippet: 'ok' },
            { title: 'FTP', url: 'ftp://unsafe.com', snippet: 'bad' },
            { title: 'JS', url: 'javascript:alert(1)', snippet: 'xss' },
            { title: 'Data', url: 'data:text/html,<h1>hi</h1>', snippet: 'data uri' },
          ],
          totalEstimated: 5,
          query: params.query,
          searchEngine: 'dirty',
        }),
      };

      const filteredTool = new WebSearchTool([dirtyAdapter]);
      const result = await filteredTool.execute({ query: 'url filter test' });

      expect(result.success).toBe(true);
      const urls = (result.data.results as WebSearchResult[]).map(r => r.url);
      expect(urls).toContain('https://safe.com');
      expect(urls).toContain('http://also-safe.com');
      expect(urls).not.toContain('ftp://unsafe.com');
      expect(urls).not.toContain('javascript:alert(1)');
      expect(urls).not.toContain('data:text/html,<h1>hi</h1>');
    });
  });

  // ============================
  // 速率限制
  // ============================

  describe('速率限制', () => {
    it('超过限制后返回限流错误', async () => {
      // 重置速率限制并消耗所有配额
      tool.resetRateLimit();

      // 执行 20 次（最大值）
      const promises = Array.from({ length: 20 }, (_, i) =>
        tool.execute({ query: `rate test ${i}` })
      );
      const results = await Promise.all(promises);

      // 第 21 次应该被限流
      tool.clearCache(); // 避免缓存干扰
      const limited = await tool.execute({ query: 'rate limit exceeded' });
      expect(limited.success).toBe(false);
      expect(limited.error).toContain('速率限制');
    });

    it('resetRateLimit 后可以重新请求', async () => {
      // 消耗所有配额
      for (let i = 0; i < 20; i++) {
        await tool.execute({ query: `consume ${i}` });
      }

      // 重置
      tool.resetRateLimit();
      tool.clearCache();

      const result = await tool.execute({ query: 'after reset' });
      expect(result.success).toBe(true);
    });
  });

  // ============================
  // isAvailable()
  // ============================

  describe('isAvailable()', () => {
    it('有可用适配器时返回 true', async () => {
      const available = await tool.isAvailable();
      expect(available).toBe(true);
    });

    it('所有适配器不可用时返回 false', async () => {
      const unavailableTool = new WebSearchTool([
        new CountingAdapter('dead', makeResults(5), true),
      ]);
      const available = await unavailableTool.isAvailable();
      expect(available).toBe(false);
    });

    it('适配器列表为空时返回 false', async () => {
      const emptyTool = new WebSearchTool([]);
      const available = await emptyTool.isAvailable();
      expect(available).toBe(false);
    });
  });

  // ============================
  // MockSearchAdapter
  // ============================

  describe('MockSearchAdapter', () => {
    it('默认返回 5 条结果', async () => {
      const mock = new MockSearchAdapter();
      const mockTool = new WebSearchTool([mock]);
      const result = await mockTool.execute({ query: 'test' });
      expect(result.success).toBe(true);
      expect(result.data.results.length).toBeGreaterThanOrEqual(5);
    });

    it('shouldFail=true 时抛出异常', async () => {
      const failingMock = new MockSearchAdapter(undefined, true);
      const failTool = new WebSearchTool([failingMock]);
      const result = await failTool.execute({ query: 'fail test' });
      expect(result.success).toBe(false);
    });

    it('自定义结果正确返回', async () => {
      const customResults: WebSearchResult[] = [
        { title: 'Custom 1', url: 'https://custom1.com', snippet: 'Custom snippet 1' },
        { title: 'Custom 2', url: 'https://custom2.com', snippet: 'Custom snippet 2' },
      ];
      const mock = new MockSearchAdapter(customResults);
      const mockTool = new WebSearchTool([mock]);
      const result = await mockTool.execute({ query: 'custom' });
      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(2);
      expect(result.data.results[0].title).toBe('Custom 1');
    });
  });
});
