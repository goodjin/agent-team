/**
 * WebFetchTool - 网页内容获取工具
 *
 * 使用 Node.js 18+ 内置 fetch，无外部依赖。
 * 含 SSRF 防护和简化版 HTML 到纯文本转换。
 */

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

// 私有 IP 地址匹配规则
const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./,                           // 回环 127.x.x.x
  /^10\./,                            // 私有 A 类 10.x.x.x
  /^172\.(1[6-9]|2\d|3[01])\./,      // 私有 B 类 172.16-31.x.x
  /^192\.168\./,                      // 私有 C 类 192.168.x.x
  /^0\./,                             // 保留地址（含 0.0.0.0）
  /^169\.254\./,                      // Link-local（含 AWS metadata 169.254.169.254）
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // CGNAT 100.64.0.0/10
  /^198\.1[89]\./,                    // 保留 198.18.0.0/15（benchmark）
  /^::1$/,                            // IPv6 回环
  /^\[::1\]$/,                        // IPv6 回环（带括号）
  /^\[::\]$/,                         // IPv6 全零地址
  /^::$/,                             // IPv6 全零地址
  /^fc[0-9a-f]{2}:/i,                 // IPv6 私有 fc00::/7
  /^fd[0-9a-f]{2}:/i,                 // IPv6 私有 fd00::/8
];

export interface FetchResult {
  url: string;
  title: string;
  content: string;      // 转换为纯文本
  statusCode: number;
  contentLength: number;
  truncated: boolean;
  fetchedAt: string;
}

export class WebFetchTool implements V6ToolDefinition {
  name = 'web_fetch';
  description = '获取网页内容并转换为纯文本';
  permissions = [ToolPermission.NETWORK, ToolPermission.READ_ONLY];
  category = 'web';

  private maxContentLength = 50000; // 50KB 字符数

  async execute(args: { url: string; maxLength?: number }): Promise<FetchResult> {
    const { url, maxLength = this.maxContentLength } = args;

    // 安全检查
    this.validateUrl(url);

    // 设置请求超时（10秒）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AgentTeam/6.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        redirect: 'follow',
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const statusCode = response.status;

    if (!response.ok) {
      return {
        url,
        title: '',
        content: `HTTP Error ${statusCode}: ${response.statusText}`,
        statusCode,
        contentLength: 0,
        truncated: false,
        fetchedAt: new Date().toISOString(),
      };
    }

    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();
    const contentLength = rawText.length;

    let title = '';
    let content = '';

    if (contentType.includes('application/json')) {
      // JSON 响应直接返回原始内容
      content = rawText;
      title = 'JSON Response';
    } else if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      // HTML 处理
      title = this.extractTitle(rawText);
      content = this.htmlToText(rawText);
    } else {
      // 其他文本类型直接返回
      content = rawText;
      title = '';
    }

    // 截断处理
    let truncated = false;
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + `\n[内容已截断，原文共 ${content.length} 字符]`;
      truncated = true;
    }

    return {
      url,
      title,
      content,
      statusCode,
      contentLength,
      truncated,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * SSRF 防护：验证 URL 合法性，阻止访问私有 IP
   */
  private validateUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`无效的 URL 格式: ${url}`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`不支持的协议: ${parsed.protocol}，仅允许 http/https`);
    }

    const hostname = parsed.hostname.toLowerCase();

    // 检查 localhost
    if (hostname === 'localhost') {
      throw new Error('SSRF 防护：不允许访问 localhost');
    }

    // 检查私有 IP 范围
    if (this.isPrivateUrl(hostname)) {
      throw new Error(`SSRF 防护：不允许访问私有 IP 地址: ${hostname}`);
    }
  }

  /**
   * 检查是否为私有/保留 IP 地址
   */
  private isPrivateUrl(hostname: string): boolean {
    return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(hostname));
  }

  /**
   * 简化版 HTML 转纯文本
   * 使用正则表达式，无外部依赖
   */
  private htmlToText(html: string): string {
    let text = html;

    // 1. 移除 <script> 标签及其内容（含多行）
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // 2. 移除 <style> 标签及其内容
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // 3. 移除 <head> 标签及其内容
    text = text.replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '');

    // 4. 移除 <nav>、<header>、<footer>、<aside> 标签及内容
    text = text.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');
    text = text.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '');
    text = text.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');
    text = text.replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '');

    // 5. 将块级标签转为换行
    text = text.replace(/<\/(p|div|article|section|h[1-6]|li|tr|blockquote|pre)>/gi, '\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<hr\s*\/?>/gi, '\n---\n');

    // 6. 为标题添加标记
    text = text.replace(/<h1[^>]*>/gi, '\n# ');
    text = text.replace(/<h2[^>]*>/gi, '\n## ');
    text = text.replace(/<h3[^>]*>/gi, '\n### ');
    text = text.replace(/<h[4-6][^>]*>/gi, '\n#### ');

    // 7. 列表项加符号
    text = text.replace(/<li[^>]*>/gi, '\n- ');

    // 8. 去掉所有剩余 HTML 标签
    text = text.replace(/<[^>]+>/g, '');

    // 9. 解码常见 HTML 实体
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&hellip;/g, '...')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));

    // 10. 压缩多余空白：多个连续空行合并为两个换行
    text = text.replace(/[ \t]+/g, ' ');         // 多个空格/tab 合并
    text = text.replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n'); // 多个空行合并为两行
    text = text.trim();

    return text;
  }

  /**
   * 从 HTML 中提取 <title> 内容
   */
  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : '';
  }
}
