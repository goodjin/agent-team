/**
 * WebFetchTool 单元测试
 * Mock fetch，不做真实网络请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebFetchTool } from '../../src/tools/builtin/web-fetch.js';

// 构造一个假的 Response 对象
function makeMockResponse(opts: {
  status?: number;
  statusText?: string;
  contentType?: string;
  body?: string;
}): Response {
  const {
    status = 200,
    statusText = 'OK',
    contentType = 'text/html; charset=utf-8',
    body = '',
  } = opts;

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Headers({ 'content-type': contentType }),
    text: async () => body,
  } as unknown as Response;
}

describe('WebFetchTool', () => {
  let tool: WebFetchTool;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tool = new WebFetchTool();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ---------------------------------------------------------------
  // 正常 HTML 获取
  // ---------------------------------------------------------------
  describe('正常 HTML 页面', () => {
    it('应返回包含纯文本内容的 FetchResult', async () => {
      mockFetch.mockResolvedValueOnce(
        makeMockResponse({
          body: '<html><head><title>测试页面</title></head><body><h1>Hello World</h1><p>这是正文内容。</p></body></html>',
        })
      );

      const result = await tool.execute({ url: 'https://example.com' });

      expect(result.statusCode).toBe(200);
      expect(result.title).toBe('测试页面');
      expect(result.content).toContain('Hello World');
      expect(result.content).toContain('这是正文内容');
      expect(result.url).toBe('https://example.com');
      expect(result.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.truncated).toBe(false);
    });

    it('应去除 script 和 style 内容', async () => {
      mockFetch.mockResolvedValueOnce(
        makeMockResponse({
          body: '<html><body><script>alert("xss")</script><style>body{color:red}</style><p>干净内容</p></body></html>',
        })
      );

      const result = await tool.execute({ url: 'https://example.com' });

      expect(result.content).not.toContain('alert');
      expect(result.content).not.toContain('color:red');
      expect(result.content).toContain('干净内容');
    });

    it('应正确解码 HTML 实体', async () => {
      mockFetch.mockResolvedValueOnce(
        makeMockResponse({
          body: '<html><body><p>价格：&lt;100 &amp; 免费，&quot;促销&quot;&nbsp;期间</p></body></html>',
        })
      );

      const result = await tool.execute({ url: 'https://example.com' });

      // &lt; => <, &amp; => &, &quot; => ", &nbsp; => space
      expect(result.content).toContain('<100');
      expect(result.content).toContain('& 免费');
      expect(result.content).toContain('"促销"');
    });
  });

  // ---------------------------------------------------------------
  // 内容截断
  // ---------------------------------------------------------------
  describe('内容截断', () => {
    it('超过 maxLength 时应截断并附加提示', async () => {
      const longText = 'A'.repeat(10000);
      mockFetch.mockResolvedValueOnce(
        makeMockResponse({
          body: `<html><body><p>${longText}</p></body></html>`,
        })
      );

      const result = await tool.execute({ url: 'https://example.com', maxLength: 100 });

      expect(result.truncated).toBe(true);
      expect(result.content).toContain('[内容已截断');
      expect(result.content.length).toBeLessThan(200);
    });

    it('未超过 maxLength 时不截断', async () => {
      mockFetch.mockResolvedValueOnce(
        makeMockResponse({
          body: '<html><body><p>短内容</p></body></html>',
        })
      );

      const result = await tool.execute({ url: 'https://example.com', maxLength: 50000 });

      expect(result.truncated).toBe(false);
      expect(result.content).not.toContain('[内容已截断');
    });
  });

  // ---------------------------------------------------------------
  // SSRF 防护
  // ---------------------------------------------------------------
  describe('SSRF 防护', () => {
    it('访问 127.0.0.1 应抛出安全错误', async () => {
      await expect(
        tool.execute({ url: 'http://127.0.0.1/secret' })
      ).rejects.toThrow(/SSRF|私有/i);
    });

    it('访问 localhost 应抛出安全错误', async () => {
      await expect(
        tool.execute({ url: 'http://localhost/secret' })
      ).rejects.toThrow(/SSRF|localhost/i);
    });

    it('访问 192.168.1.1 应抛出安全错误', async () => {
      await expect(
        tool.execute({ url: 'http://192.168.1.1/' })
      ).rejects.toThrow(/SSRF|私有/i);
    });

    it('访问 10.0.0.1 应抛出安全错误', async () => {
      await expect(
        tool.execute({ url: 'http://10.0.0.1/' })
      ).rejects.toThrow(/SSRF|私有/i);
    });

    it('访问 172.16.0.1 应抛出安全错误', async () => {
      await expect(
        tool.execute({ url: 'http://172.16.0.1/' })
      ).rejects.toThrow(/SSRF|私有/i);
    });

    it('访问 172.31.255.255 应抛出安全错误', async () => {
      await expect(
        tool.execute({ url: 'http://172.31.255.255/' })
      ).rejects.toThrow(/SSRF|私有/i);
    });

    it('访问 172.15.0.1（非私有范围）应允许通过', async () => {
      mockFetch.mockResolvedValueOnce(
        makeMockResponse({ body: '<html><body><p>ok</p></body></html>' })
      );

      // 172.15 不在私有范围 172.16-31，应正常发起请求
      await expect(
        tool.execute({ url: 'http://172.15.0.1/' })
      ).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------
  // 不支持的协议
  // ---------------------------------------------------------------
  describe('协议检查', () => {
    it('file:// 协议应抛出错误', async () => {
      await expect(
        tool.execute({ url: 'file:///etc/passwd' })
      ).rejects.toThrow(/协议|protocol/i);
    });

    it('ftp:// 协议应抛出错误', async () => {
      await expect(
        tool.execute({ url: 'ftp://example.com/file' })
      ).rejects.toThrow(/协议|protocol/i);
    });

    it('无效 URL 格式应抛出错误', async () => {
      await expect(
        tool.execute({ url: 'not-a-url' })
      ).rejects.toThrow(/URL|无效/i);
    });
  });

  // ---------------------------------------------------------------
  // 非 200 状态码
  // ---------------------------------------------------------------
  describe('非 200 状态码', () => {
    it('404 响应应返回包含 statusCode 的结果', async () => {
      mockFetch.mockResolvedValueOnce(
        makeMockResponse({ status: 404, statusText: 'Not Found', body: 'Not Found' })
      );

      const result = await tool.execute({ url: 'https://example.com/404' });

      expect(result.statusCode).toBe(404);
      expect(result.content).toContain('404');
    });

    it('500 响应应返回包含 statusCode 的结果', async () => {
      mockFetch.mockResolvedValueOnce(
        makeMockResponse({ status: 500, statusText: 'Internal Server Error', body: 'Error' })
      );

      const result = await tool.execute({ url: 'https://example.com/error' });

      expect(result.statusCode).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // JSON 响应
  // ---------------------------------------------------------------
  describe('JSON 响应', () => {
    it('JSON content-type 应直接返回原始 JSON 字符串', async () => {
      const jsonBody = JSON.stringify({ foo: 'bar', count: 42 });
      mockFetch.mockResolvedValueOnce(
        makeMockResponse({
          contentType: 'application/json; charset=utf-8',
          body: jsonBody,
        })
      );

      const result = await tool.execute({ url: 'https://api.example.com/data' });

      expect(result.content).toBe(jsonBody);
      expect(result.title).toBe('JSON Response');
    });
  });

  // ---------------------------------------------------------------
  // 超时
  // ---------------------------------------------------------------
  describe('请求超时', () => {
    it('fetch 被 abort 时应向上抛出错误', async () => {
      mockFetch.mockRejectedValueOnce(
        Object.assign(new Error('AbortError'), { name: 'AbortError' })
      );

      await expect(
        tool.execute({ url: 'https://example.com' })
      ).rejects.toThrow(/AbortError/);
    });
  });

  // ---------------------------------------------------------------
  // contentLength 字段
  // ---------------------------------------------------------------
  describe('响应元数据', () => {
    it('应包含 contentLength 字段', async () => {
      const body = '<html><body><p>hello</p></body></html>';
      mockFetch.mockResolvedValueOnce(makeMockResponse({ body }));

      const result = await tool.execute({ url: 'https://example.com' });

      expect(result.contentLength).toBe(body.length);
    });
  });
});
