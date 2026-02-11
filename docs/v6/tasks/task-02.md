# Task 02：WebSearchTool - Web 搜索工具

**优先级**: P0
**预估工时**: 4h
**依赖**: Task 01（ToolRegistry 增强）
**状态**: 待开发

---

## 目标

实现 WebSearchTool，允许 Agent 通过 Serper.dev API 搜索互联网信息，含结果缓存、搜索引擎 fallback 和速率限制机制。

---

## 输入

- 架构文档：`docs/v6/02-architecture.md`（WebSearchTool 章节）
- PRD：`docs/v6/01-requirements.md`（3.1.1 节）
- 现有工具示例：`src/tools/base.ts`（BaseTool 基类）
- Task 01 产出：`src/tools/tool-registry.ts`（V6ToolDefinition、ToolPermission）

---

## 输出

**新增文件**：
- `src/tools/adapters/search-adapter.ts` - SearchAdapter 接口
- `src/tools/adapters/serper-search.ts` - Serper.dev 适配器
- `src/tools/adapters/bing-search.ts` - Bing 备用适配器
- `src/tools/builtin/web-search.ts` - WebSearchTool 主类
- `tests/tools/web-search.test.ts` - 单元测试

---

## 实现步骤

### Step 1：SearchAdapter 接口（0.5h）

创建 `src/tools/adapters/search-adapter.ts`，定义接口：

```typescript
export interface WebSearchParams {
  query: string;
  limit?: number;       // 默认 10，最大 50
  language?: string;    // 默认 'zh-CN'
  region?: string;      // 默认 'CN'
  freshness?: 'day' | 'week' | 'month' | 'any';
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  source?: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  totalEstimated: number;
  query: string;
  searchEngine: string;
}

export interface SearchAdapter {
  name: string;
  search(params: WebSearchParams): Promise<WebSearchResponse>;
  isAvailable(): Promise<boolean>;
}
```

### Step 2：Serper.dev 适配器（1h）

创建 `src/tools/adapters/serper-search.ts`：

- 构造函数接受 `apiKey: string`
- `search()` 方法调用 `https://google.serper.dev/search`
  - POST body：`{ q, num: limit, gl: region, hl: language }`
  - 请求头：`{ 'X-API-KEY': apiKey, 'Content-Type': 'application/json' }`
  - 超时 10 秒（使用 `AbortController`）
  - 将 `organic` 数组映射为 `WebSearchResult[]`
- `isAvailable()` 方法：检查 apiKey 是否非空

### Step 3：Bing 适配器（0.5h）

创建 `src/tools/adapters/bing-search.ts`：

- 构造函数接受 `apiKey: string`
- `search()` 方法调用 `https://api.bing.microsoft.com/v7.0/search`
  - GET 请求，参数：`q`, `count`, `mkt`
  - 请求头：`{ 'Ocp-Apim-Subscription-Key': apiKey }`
  - 将 `webPages.value` 映射为 `WebSearchResult[]`
- `isAvailable()` 方法：检查 apiKey 是否非空

### Step 4：WebSearchTool 主类（1.5h）

创建 `src/tools/builtin/web-search.ts`，继承 `BaseTool`：

**构造函数**接受 `adapters: SearchAdapter[]`（按优先级排序）

**工具定义**：
```typescript
{
  name: 'web_search',
  description: '通过搜索引擎查询互联网信息，返回标题、URL、摘要的结构化结果列表',
  category: ToolCategory.WEB,
  permissions: [ToolPermission.NETWORK, ToolPermission.READ_ONLY],
  version: '1.0.0',
  tags: ['search', 'internet', 'web'],
  schema: z.object({
    query: z.string().min(1),
    limit: z.number().min(1).max(50).optional(),
    language: z.string().optional(),
    region: z.string().optional(),
    freshness: z.enum(['day', 'week', 'month', 'any']).optional(),
  }),
}
```

**executeImpl 逻辑**：
1. 检查速率限制（滑动窗口，默认每分钟 20 次），超限返回错误
2. 生成缓存 key（normalize query + 参数组合）
3. 检查内存缓存（TTL 5 分钟），命中则直接返回
4. 遍历适配器列表逐一尝试，成功则存缓存并返回
5. URL 安全校验：过滤非 http/https 协议的结果
6. 所有适配器失败则返回聚合错误

### Step 5：单元测试（0.5h）

在 `tests/tools/web-search.test.ts` 覆盖：
- Mock 适配器返回固定结果，验证字段正确映射
- 缓存命中：同一查询第二次调用不触发适配器
- 缓存过期：超过 TTL 后重新触发适配器
- Fallback：主适配器抛出异常时自动使用备用适配器
- 速率限制：超过限制后返回限流错误
- URL 过滤：非 http/https URL 不出现在结果中

---

## 验收标准

- [ ] 给定关键词，返回不少于 5 条有效搜索结果
- [ ] 结果包含 `title`、`url`、`snippet` 字段，类型正确
- [ ] 缓存生效：相同查询在 5 分钟内只调用一次适配器
- [ ] Fallback 生效：主适配器失败时自动切换备用
- [ ] 超时控制：10 秒无响应后返回超时错误
- [ ] URL 过滤：非 http/https URL 不出现在结果中
- [ ] 通过 `ToolRegistry.execute('web_search', params)` 可正常调用
- [ ] 单元测试覆盖率 > 80%

---

## 注意事项

- API Key 从环境变量 `SERPER_API_KEY`、`BING_SEARCH_API_KEY` 读取，不硬编码
- 测试时使用 Mock 适配器，不依赖真实 API Key
- 缓存 key 需对 query 做 normalize（trim + toLowerCase）
- `limit` 参数需 clamp 到 [1, 50] 范围
