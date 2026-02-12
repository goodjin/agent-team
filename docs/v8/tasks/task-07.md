# Task 07: 知识库 REST API

**优先级**: P1
**预计工时**: 3h
**阶段**: Phase 3
**依赖**: Task 6（ProjectKnowledgeBase）

---

## 目标

使用 Node.js 原生 `http` 模块（无新依赖）实现知识库 REST API，默认端口 3001，提供完整的 CRUD、搜索、统计、导入导出端点。

---

## 实现步骤

### Step 1: 路由框架（0.5h）

```typescript
// src/knowledge/api/knowledge-api.ts

import * as http from 'http';
import * as url from 'url';
import type { ProjectKnowledgeBase } from '../project-kb';

type Handler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  params: Record<string, string>
) => Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

export class KnowledgeAPI {
  private kb: ProjectKnowledgeBase;
  private server: http.Server | null = null;
  private routes: Route[] = [];
  private port: number;

  constructor(kb: ProjectKnowledgeBase, options: { port?: number } = {}) {
    this.kb = kb;
    this.port = options.port ?? parseInt(process.env.KNOWLEDGE_API_PORT ?? '3001', 10);
    this.registerRoutes();
  }

  // 将路径模式转换为正则，提取参数名
  private route(method: string, pattern: string, handler: Handler): void {
    const paramNames: string[] = [];
    const regexStr = pattern
      .replace(/:([a-zA-Z]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      })
      .replace(/\//g, '\\/');

    this.routes.push({
      method: method.toUpperCase(),
      pattern: new RegExp(`^${regexStr}$`),
      paramNames,
      handler,
    });
  }

  private registerRoutes(): void {
    // CRUD
    this.route('POST',   '/api/v1/knowledge',          this.handleCreate.bind(this));
    this.route('GET',    '/api/v1/knowledge',           this.handleList.bind(this));
    this.route('GET',    '/api/v1/knowledge/stats',     this.handleStats.bind(this));
    this.route('GET',    '/api/v1/knowledge/export',    this.handleExport.bind(this));
    this.route('POST',   '/api/v1/knowledge/import',    this.handleImport.bind(this));
    this.route('POST',   '/api/v1/knowledge/search',    this.handleSearch.bind(this));
    this.route('GET',    '/api/v1/knowledge/:id',       this.handleGet.bind(this));
    this.route('PUT',    '/api/v1/knowledge/:id',       this.handleUpdate.bind(this));
    this.route('DELETE', '/api/v1/knowledge/:id',       this.handleDelete.bind(this));
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch(err => {
          this.sendError(res, 500, 'INTERNAL_ERROR', err.message);
        });
      });
      this.server.listen(this.port, () => {
        console.log(`[KnowledgeAPI] 启动在端口 ${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) { resolve(); return; }
      this.server.close(err => err ? reject(err) : resolve());
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url ?? '/', true);
    const pathname = parsedUrl.pathname ?? '/';

    // 路由匹配
    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      const match = pathname.match(route.pattern);
      if (!match) continue;

      // 提取路径参数
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });

      await route.handler(req, res, params);
      return;
    }

    this.sendError(res, 404, 'NOT_FOUND', `路径 ${pathname} 不存在`);
  }
}
```

### Step 2: 请求/响应工具函数（0.5h）

```typescript
// 读取请求体 JSON
private async readBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('无效的 JSON 请求体'));
      }
    });
    req.on('error', reject);
  });
}

// 标准响应格式
private sendJSON(res: http.ServerResponse, statusCode: number, data: unknown, message = 'ok'): void {
  const body = JSON.stringify({ code: statusCode, data, message });
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

private sendError(res: http.ServerResponse, statusCode: number, errorCode: string, message: string): void {
  const body = JSON.stringify({ code: statusCode, data: null, message, errorCode });
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(body);
}
```

### Step 3: 端点处理器（1.5h）

```typescript
// POST /api/v1/knowledge
private async handleCreate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await this.readBody<Record<string, unknown>>(req);
  if (!body.title || !body.content) {
    return this.sendError(res, 400, 'MISSING_FIELDS', 'title 和 content 是必填字段');
  }
  const entry = await this.kb.add(body as any);
  this.sendJSON(res, 201, entry, '创建成功');
}

// GET /api/v1/knowledge/:id
private async handleGet(req: http.IncomingMessage, res: http.ServerResponse, params: Record<string, string>): Promise<void> {
  const entry = await this.kb.get(params.id);
  if (!entry) return this.sendError(res, 404, 'NOT_FOUND', `条目 ${params.id} 不存在`);
  this.sendJSON(res, 200, entry);
}

// PUT /api/v1/knowledge/:id
private async handleUpdate(req: http.IncomingMessage, res: http.ServerResponse, params: Record<string, string>): Promise<void> {
  const body = await this.readBody<Record<string, unknown>>(req);
  const entry = await this.kb.update(params.id, body as any);
  this.sendJSON(res, 200, entry, '更新成功');
}

// DELETE /api/v1/knowledge/:id
private async handleDelete(req: http.IncomingMessage, res: http.ServerResponse, params: Record<string, string>): Promise<void> {
  await this.kb.delete(params.id);
  this.sendJSON(res, 200, null, '删除成功');
}

// GET /api/v1/knowledge  (列表查询)
private async handleList(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const parsedUrl = url.parse(req.url ?? '/', true);
  const query = parsedUrl.query;

  const filter = {
    category: query.category as any,
    tags: query.tags ? String(query.tags).split(',') : undefined,
    status: query.status as any,
    page: query.page ? parseInt(String(query.page), 10) : 1,
    pageSize: query.pageSize ? Math.min(parseInt(String(query.pageSize), 10), 100) : 20,
  };

  const result = await this.kb.list(filter);
  this.sendJSON(res, 200, result);
}

// POST /api/v1/knowledge/search
private async handleSearch(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await this.readBody<Record<string, unknown>>(req);
  if (!body.text) {
    return this.sendError(res, 400, 'MISSING_FIELDS', 'text 是必填字段');
  }
  const results = await this.kb.search(body as any);
  this.sendJSON(res, 200, results);
}

// GET /api/v1/knowledge/stats
private async handleStats(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const stats = await this.kb.stats();
  this.sendJSON(res, 200, stats);
}

// GET /api/v1/knowledge/export
private async handleExport(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const parsedUrl = url.parse(req.url ?? '/', true);
  const query = parsedUrl.query;

  const format = String(query.format ?? 'markdown');
  const markdown = await this.kb.exportMarkdown({
    category: query.category as any,
    tags: query.tags ? String(query.tags).split(',') : undefined,
  });

  if (format === 'json') {
    const { entries } = await this.kb.list({ status: 'active', pageSize: 10000 });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 200, data: entries }));
  } else {
    res.writeHead(200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': 'attachment; filename="knowledge-export.md"',
    });
    res.end(markdown);
  }
}

// POST /api/v1/knowledge/import
private async handleImport(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const contentType = req.headers['content-type'] ?? '';

  let result;
  if (contentType.includes('application/json')) {
    const body = await this.readBody<{ content: string; format?: string }>(req);
    result = await this.kb.importMarkdown(body.content ?? '');
  } else {
    // 假设是 Markdown 文本
    const body = await this.readBody<string>(req);
    result = await this.kb.importMarkdown(typeof body === 'string' ? body : JSON.stringify(body));
  }

  this.sendJSON(res, 200, result, `导入完成：${result.imported} 条成功，${result.skipped} 条跳过`);
}
```

### Step 4: 错误处理（0.5h）

全局错误处理在 `handleRequest` 的 `catch` 中实现（已在 Step 1 完成）。

针对常见错误情况：

```typescript
// 在 update/delete 处理器中处理不存在的情况
try {
  const entry = await this.kb.update(params.id, patch);
  this.sendJSON(res, 200, entry);
} catch (e) {
  if ((e as Error).message.includes('不存在')) {
    this.sendError(res, 404, 'NOT_FOUND', (e as Error).message);
  } else {
    this.sendError(res, 500, 'INTERNAL_ERROR', (e as Error).message);
  }
}
```

---

## 启动集成示例

```typescript
// src/index.ts 或应用入口
import { ProjectKnowledgeBase } from './knowledge/project-kb';
import { KnowledgeAPI } from './knowledge/api/knowledge-api';

const kb = new ProjectKnowledgeBase(process.cwd());
await kb.initialize();

const api = new KnowledgeAPI(kb, { port: 3001 });
await api.start();

// 应用退出时关闭 API
process.on('SIGTERM', async () => {
  await api.stop();
  await kb.flush();
  process.exit(0);
});
```

---

## API 响应格式规范

**成功响应**：
```json
{
  "code": 200,
  "data": { ... },
  "message": "ok"
}
```

**创建成功**：
```json
{
  "code": 201,
  "data": { "id": "...", ... },
  "message": "创建成功"
}
```

**错误响应**：
```json
{
  "code": 404,
  "data": null,
  "message": "条目 xxx 不存在",
  "errorCode": "NOT_FOUND"
}
```

---

## 验收标准

- [ ] POST /api/v1/knowledge 创建条目，返回 201
- [ ] GET /api/v1/knowledge/:id 获取条目，不存在返回 404
- [ ] PUT /api/v1/knowledge/:id 更新条目
- [ ] DELETE /api/v1/knowledge/:id 软删除条目
- [ ] GET /api/v1/knowledge 列表查询，支持 category/tags/page/pageSize 参数
- [ ] POST /api/v1/knowledge/search 搜索，text 为必填
- [ ] GET /api/v1/knowledge/stats 返回统计信息
- [ ] GET /api/v1/knowledge/export 导出 Markdown（支持 format=json）
- [ ] POST /api/v1/knowledge/import 导入 Markdown
- [ ] 所有端点返回标准 JSON 格式（code/data/message）
- [ ] 支持 CORS（Access-Control-Allow-Origin: *）
- [ ] OPTIONS 预检请求返回 204
- [ ] 默认端口 3001，可通过 `KNOWLEDGE_API_PORT` 环境变量配置
- [ ] 仅使用 Node.js 原生 `http` 模块，不引入新依赖
- [ ] `start()` 和 `stop()` 方法可靠（测试中可多次启停）
