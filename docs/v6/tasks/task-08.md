# Task 08：端到端测试

**优先级**: P1
**预估工时**: 4h
**依赖**: Task 01-07（所有任务完成）
**状态**: 待开发

---

## 目标

编写覆盖 v6 工具生态系统的端到端集成测试，验证 Agent 通过工具完成多步骤任务的完整工作流，确保所有工具的单元测试覆盖率满足 > 80% 要求。

---

## 输入

- 所有 Task 01-07 的产出
- PRD 验收标准：`docs/v6/01-requirements.md`（八、验收标准汇总）
- 现有测试基础设施（`vitest` / `jest` 配置）

---

## 输出

**新增文件**：
- `tests/e2e/v6-tools.test.ts` - 端到端测试套件
- `tests/e2e/v6-pipeline.test.ts` - Pipeline 端到端测试

**补充文件**（如覆盖率不足，补充各工具的单元测试）：
- `tests/tools/tool-registry.test.ts` - 补充 v6 新增方法测试

---

## 测试场景设计

### 场景 1：WebSearchTool 完整链路（Mock API）

```typescript
describe('E2E: WebSearchTool', () => {
  it('搜索关键词返回结构化结果', async () => {
    // Mock Serper.dev API 响应
    const mockResponse = {
      organic: [
        { title: '结果1', link: 'https://example.com/1', snippet: '摘要1' },
        { title: '结果2', link: 'https://example.com/2', snippet: '摘要2' },
      ],
      searchInformation: { totalResults: '2' },
    };
    // ... Mock fetch ...

    const result = await registry.execute('web_search', { query: 'TypeScript tutorial' });

    expect(result.success).toBe(true);
    expect(result.data.results).toHaveLength(2);
    expect(result.data.results[0]).toMatchObject({
      title: expect.any(String),
      url: expect.stringMatching(/^https?:\/\//),
      snippet: expect.any(String),
    });
  });

  it('缓存机制：相同查询不重复请求', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');

    await registry.execute('web_search', { query: 'cached query' });
    await registry.execute('web_search', { query: 'cached query' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);  // 只调用一次
  });
});
```

### 场景 2：WebFetchTool 完整链路（Mock fetch）

```typescript
describe('E2E: WebFetchTool', () => {
  it('获取网页并返回 Markdown 格式', async () => {
    const htmlContent = `
      <html>
        <head><title>Test Page</title></head>
        <body>
          <main>
            <h1>Hello World</h1>
            <p>This is a test paragraph.</p>
          </main>
        </body>
      </html>
    `;
    // Mock fetch 返回 HTML

    const result = await registry.execute('web_fetch', {
      url: 'https://example.com',
      format: 'markdown',
    });

    expect(result.success).toBe(true);
    expect(result.data.title).toBe('Test Page');
    expect(result.data.content).toContain('# Hello World');
    expect(result.data.truncated).toBe(false);
  });

  it('SSRF 防护生效：拒绝访问内网 IP', async () => {
    const result = await registry.execute('web_fetch', {
      url: 'http://192.168.1.100/admin',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('SSRF');
  });
});
```

### 场景 3：ShellExecutorTool 完整链路

```typescript
describe('E2E: ShellExecutorTool', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'agent-test-'));
    // 设置 workDirManager 的工作目录为 tempDir
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it('基础命令执行', async () => {
    const result = await registry.execute('shell_execute', {
      command: 'echo "e2e test" && pwd',
    });
    expect(result.success).toBe(true);
    expect(result.data.stdout).toContain('e2e test');
    expect(result.data.exitCode).toBe(0);
  });

  it('文件操作在工作空间内', async () => {
    const result = await registry.execute('shell_execute', {
      command: 'echo "hello" > output.txt && cat output.txt',
    });
    expect(result.success).toBe(true);
    expect(result.data.stdout).toContain('hello');
  });

  it('超时控制生效', async () => {
    const result = await registry.execute('shell_execute', {
      command: 'sleep 60',
      timeout: 1,  // 1 秒
    });
    expect(result.success).toBe(true);  // 执行成功但超时
    expect(result.data.timedOut).toBe(true);
  });
});
```

### 场景 4：CodeSandboxTool 完整链路

```typescript
describe('E2E: CodeSandboxTool', () => {
  it('Node.js 代码执行', async () => {
    const result = await registry.execute('code_execute', {
      code: `
        const arr = [1, 2, 3, 4, 5];
        const sum = arr.reduce((a, b) => a + b, 0);
        console.log('Sum:', sum);
        sum
      `,
      language: 'nodejs',
    });
    expect(result.success).toBe(true);
    expect(result.data.output).toContain('Sum: 15');
    expect(result.data.returnValue).toBe(15);
  });

  it('Python 代码执行', async () => {
    const result = await registry.execute('code_execute', {
      code: 'numbers = [1,2,3,4,5]\nprint(sum(numbers))',
      language: 'python',
    });
    expect(result.success).toBe(true);
    expect(result.data.output).toContain('15');
  });

  it('沙箱安全：禁止 require', async () => {
    const result = await registry.execute('code_execute', {
      code: `const fs = require('fs'); fs.readFileSync('/etc/passwd')`,
      language: 'nodejs',
    });
    expect(result.data.error).toContain('require is not defined');
  });
});
```

### 场景 5：ToolPipeline 3 步工作流（E2E 核心场景）

```typescript
describe('E2E: ToolPipeline - 搜索 → 获取内容 → 执行代码', () => {
  it('3 步 Pipeline 完整执行', async () => {
    // Mock 工具的返回值
    const mockSearchResult = {
      results: [
        { title: '文章1', url: 'https://example.com/1', snippet: '摘要1' },
      ],
    };
    const mockFetchResult = {
      content: '# 文章标题\n\n这是文章内容，包含数字 42。',
      title: '文章1',
    };

    // Mock registry.execute 返回对应数据
    // ...

    const pipeline: PipelineDefinition = {
      name: 'research-pipeline',
      steps: [
        {
          id: 'search',
          tool: 'web_search',
          params: { query: '{{input.topic}}', limit: 1 },
        },
        {
          id: 'fetch',
          tool: 'web_fetch',
          forEach: '{{search.results[*].url}}',
          params: { url: '{{item}}', format: 'markdown' },
        },
        {
          id: 'analyze',
          tool: 'code_execute',
          params: {
            code: `
              const content = \`{{fetch[*].content}}\`;
              const wordCount = content.split(' ').length;
              console.log('Word count:', wordCount);
              wordCount
            `,
            language: 'nodejs',
          },
        },
      ],
    };

    const pipelineEngine = new ToolPipeline(registry);
    const result = await pipelineEngine.execute(pipeline, { topic: 'TypeScript' });

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].stepId).toBe('search');
    expect(result.steps[1].stepId).toBe('fetch');
    expect(result.steps[2].stepId).toBe('analyze');
    expect(result.output).toBeDefined();
  });
});
```

---

## 实现步骤

### Step 1：梳理测试覆盖率（0.5h）

运行覆盖率报告，识别不足 80% 的模块：
```bash
npx vitest run --coverage
```

列出需要补充测试的文件，并优先补充。

### Step 2：编写 E2E 测试（2h）

按场景 1-5 依次编写测试，注意：
- 所有网络请求使用 Mock（`vi.mock` 或 `vi.spyOn(global, 'fetch')`）
- ShellExecutorTool 使用真实的临时目录，不 Mock 文件系统操作
- CodeSandboxTool 在 Node.js 场景不 Mock（直接测试 vm 沙箱）
- Python 场景在 CI 环境中跳过（如果 python3 不存在）

### Step 3：补充单元测试（1h）

根据 Step 1 的覆盖率分析，补充缺失的单元测试。

### Step 4：CI 配置验证（0.5h）

确认测试可在 CI 环境（GitHub Actions）中通过：
- 检查 `.github/workflows/` 中是否有测试步骤
- 必要时添加 python3 安装步骤（`sudo apt-get install python3`）

---

## 验收标准

- [ ] 所有 E2E 测试通过（5 个场景全部 GREEN）
- [ ] WebSearchTool 单元测试覆盖率 > 80%
- [ ] WebFetchTool 单元测试覆盖率 > 80%
- [ ] ShellExecutorTool 单元测试覆盖率 > 80%
- [ ] CodeSandboxTool 单元测试覆盖率 > 80%
- [ ] ToolRegistry 单元测试覆盖率 > 80%
- [ ] ToolPipeline 单元测试覆盖率 > 80%
- [ ] 3 步工具 Pipeline E2E 测试通过（搜索 → 获取内容 → 代码分析）
- [ ] 所有安全策略测试通过（SSRF、黑名单、路径限制、沙箱隔离）

---

## 注意事项

- E2E 测试中的工具调用一律使用 Mock，避免真实网络请求导致测试不稳定
- Python E2E 测试设置 `skip: !existsSync('/usr/bin/python3')` 跳过标志
- 测试执行时间目标：所有单元测试 < 10 秒，E2E 测试 < 30 秒
- 若覆盖率报告显示某个分支未覆盖，需针对该分支添加专项测试用例
