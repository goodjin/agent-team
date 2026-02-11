# Task 03：WebFetchTool - 网页内容获取

**优先级**: P0
**预估工时**: 4h
**依赖**: Task 01（ToolRegistry 增强）
**状态**: 待开发

---

## 目标

实现 WebFetchTool，从指定 URL 获取网页内容并转换为 Markdown 或纯文本格式，含 SSRF 防护和内容截断机制。

---

## 输入

- 架构文档：`docs/v6/02-architecture.md`（WebFetchTool 章节）
- PRD：`docs/v6/01-requirements.md`（3.1.2 节）
- 现有工具示例：`src/tools/base.ts`（BaseTool 基类）
- Task 01 产出：`src/tools/tool-registry.ts`（V6ToolDefinition、ToolPermission）

---

## 输出

**新增文件**：
- `src/tools/builtin/web-fetch.ts` - WebFetchTool 主类
- `tests/tools/web-fetch.test.ts` - 单元测试

**新增依赖**（需更新 `package.json`）：
- `node-html-parser` - HTML 解析
- `turndown` - HTML 转 Markdown

---

## 实现步骤

### Step 1：安装依赖（0.25h）

```bash
npm install node-html-parser turndown
npm install --save-dev @types/turndown
```

### Step 2：SSRF 防护函数（0.5h）

在 `src/tools/builtin/web-fetch.ts` 中实现私有函数：

```typescript
// 禁止访问的 IP 范围
const PRIVATE_IP_PATTERNS = [
  /^127\./,           // 回环
  /^10\./,            // 私有 A 类
  /^172\.(1[6-9]|2\d|3[01])\./,  // 私有 B 类
  /^192\.168\./,      // 私有 C 类
  /^0\./,             // 保留
  /^169\.254\./,      // Link-local
  /^::1$/,            // IPv6 回环
  /^fc[0-9a-f]{2}:/,  // IPv6 私有
];

function isPrivateIP(hostname: string): boolean {
  return PRIVATE_IP_PATTERNS.some(p => p.test(hostname));
}

function validateUrl(url: string): void {
  const parsed = new URL(url);  // 若 URL 格式非法则抛出
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }
  if (isPrivateIP(parsed.hostname)) {
    throw new Error(`SSRF protection: access to private IP is not allowed`);
  }
}
```

### Step 3：HTML 内容提取（0.75h）

实现内容提取辅助函数：

```typescript
import { parse } from 'node-html-parser';

function extractMainContent(html: string): string {
  const root = parse(html);

  // 移除噪声元素
  ['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe',
   '[class*="ad"]', '[id*="ad"]', '[class*="cookie"]', '[class*="popup"]']
    .forEach(selector => {
      root.querySelectorAll(selector).forEach(el => el.remove());
    });

  // 优先使用语义化标签
  const main = root.querySelector('main') ||
                root.querySelector('article') ||
                root.querySelector('[role="main"]') ||
                root.querySelector('#content') ||
                root.querySelector('.content') ||
                root.querySelector('body');

  return main?.innerHTML ?? html;
}

function getTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim();
}
```

### Step 4：WebFetchTool 主类（2h）

创建 `src/tools/builtin/web-fetch.ts`，继承 `BaseTool`：

**工具定义**：
```typescript
{
  name: 'web_fetch',
  description: '获取指定 URL 的网页内容，转换为 Markdown 格式供 Agent 阅读',
  category: ToolCategory.WEB,
  permissions: [ToolPermission.NETWORK, ToolPermission.READ_ONLY],
  version: '1.0.0',
  tags: ['fetch', 'web', 'html', 'markdown'],
  schema: z.object({
    url: z.string().url(),
    format: z.enum(['markdown', 'text', 'raw']).optional(),
    maxLength: z.number().min(100).max(200000).optional(),
    timeout: z.number().min(1).max(60).optional(),
    extractMainContent: z.boolean().optional(),
  }),
}
```

**executeImpl 逻辑**：
1. 调用 `validateUrl(params.url)` 做安全检查
2. 使用 `fetch` 发送 GET 请求
   - 请求头设置 User-Agent 为浏览器 UA
   - 超时 `params.timeout ?? 15` 秒（AbortController）
3. 非 200 响应时返回结构化错误（含 statusCode）
4. 根据 Content-Type 判断处理方式：
   - `application/json`：直接返回 JSON 字符串（format 强制为 raw）
   - `text/html`：走 HTML 处理流程
   - 其他：返回原始文本
5. HTML 处理流程：
   - 若 `extractMainContent = true`（默认），调用 `extractMainContent(html)`
   - 根据 `format` 参数转换：
     - `markdown`：使用 `TurndownService` 转换
     - `text`：仅提取文本节点
     - `raw`：返回原始 HTML
6. 截断处理：内容超 `maxLength`（默认 50000）时截断，末尾追加 `\n[内容已截断，原文共 N 字符]`
7. 返回 `WebFetchResponse` 结构

**Turndown 配置**（移除不必要的元素）：
```typescript
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});
turndown.remove(['script', 'style', 'nav', 'header', 'footer', 'aside']);
```

### Step 5：单元测试（0.5h）

在 `tests/tools/web-fetch.test.ts` 覆盖：
- Mock `fetch`，验证正常 HTML 页面返回 markdown 格式
- 内容截断：超过 maxLength 时正确截断并标注
- SSRF 防护：访问 127.0.0.1 返回安全错误
- SSRF 防护：访问 192.168.1.1 返回安全错误
- 非 HTTP URL（file://）返回协议错误
- 非 200 状态码返回包含 statusCode 的错误
- JSON 响应直接返回 raw 格式
- timeout 参数生效（使用 fake timers）

---

## 验收标准

- [ ] 给定公开 URL，返回可读的 Markdown 格式内容
- [ ] 内容超过 maxLength 时被正确截断并标注 `[内容已截断，原文共 N 字符]`
- [ ] 访问 localhost/127.0.0.1 返回 SSRF 安全错误
- [ ] 访问 192.168.x.x / 10.x.x.x 返回 SSRF 安全错误
- [ ] 非 http/https 协议返回协议错误
- [ ] 非 200 响应返回包含 statusCode 的结构化错误
- [ ] 响应包含 `title`、`content`、`contentLength`、`truncated` 字段
- [ ] 通过 `ToolRegistry.execute('web_fetch', params)` 可正常调用
- [ ] 单元测试覆盖率 > 80%

---

## 注意事项

- `node-html-parser` 是同步 API，不需要 await
- Turndown 的 `turndown()` 方法接受 HTML 字符串，返回 Markdown 字符串
- User-Agent 设置为 `Mozilla/5.0 (compatible; AgentTeam/6.0)` 或标准浏览器 UA
- `maxLength` 截断应基于字符数（`.length`），不是字节数
- 响应的 `fetchedAt` 字段使用 ISO 8601 格式（`new Date().toISOString()`）
