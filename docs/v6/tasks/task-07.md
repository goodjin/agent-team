# Task 07：与 AgentLoop 集成

**优先级**: P0
**预估工时**: 3h
**依赖**: Task 01、02、03、04（ToolRegistry 增强 + P0 工具全部完成）
**状态**: 待开发

---

## 目标

将 v6 新工具（WebSearchTool、WebFetchTool、ShellExecutorTool）注册到 ToolRegistry，配置工具参数，并验证 AgentLoop 到工具的完整调用链路畅通。

---

## 输入

- Task 01 产出：`src/tools/tool-registry.ts`（增强版 ToolRegistry）
- Task 02 产出：`src/tools/builtin/web-search.ts`（WebSearchTool）
- Task 03 产出：`src/tools/builtin/web-fetch.ts`（WebFetchTool）
- Task 04 产出：`src/tools/builtin/shell-executor.ts`（ShellExecutorTool）
- 现有代码：`src/tools/tool-registry.ts` 中的 `registerDefaultTools()` 方法
- 现有代码：`src/core/agent-loop.ts` 或 `src/agents/` 目录（了解工具调用路径）

---

## 输出

**修改文件**：
- `src/tools/tool-registry.ts` - 在 `registerDefaultTools()` 中注册 v6 工具

**新增文件**：
- `config/tools.yaml` - 工具配置文件（API Key 配置模板、权限白名单等）
- `config/tools.yaml.example` - 示例配置（提交到 git，真实 tools.yaml 加入 .gitignore）
- `tests/integration/v6-tools-integration.test.ts` - 集成测试

---

## 实现步骤

### Step 1：工具配置文件（0.5h）

创建 `config/tools.yaml.example`：

```yaml
# Agent Team v6.0 工具配置
# 复制此文件为 tools.yaml 并填写真实的 API Key

webSearch:
  enabled: true
  primaryAdapter: serper  # serper | bing
  adapters:
    serper:
      apiKey: ${SERPER_API_KEY}  # 也可直接填写
    bing:
      apiKey: ${BING_SEARCH_API_KEY}
  cache:
    ttlMinutes: 5
  rateLimit:
    requestsPerMinute: 20

webFetch:
  enabled: true
  defaultFormat: markdown     # markdown | text | raw
  maxLengthChars: 50000
  timeoutSeconds: 15

shellExecutor:
  enabled: true
  defaultTimeoutSeconds: 30
  maxOutputChars: 100000
  auditLog: true

codeSandbox:
  enabled: true
  defaultTimeoutSeconds: 30

permissions:
  # 哪些 Agent 类型可以使用哪些工具权限
  # 可选值: read_only, write, network, shell, code_exec, system
  masterAgent:
    - read_only
    - write
    - network
    - shell
    - code_exec
  subAgent:
    - read_only
    - write
    - network
```

### Step 2：配置加载器（0.5h）

在 `src/tools/tool-registry.ts` 或独立文件 `src/config/tools-config.ts` 中实现：

```typescript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';  // 若已有 yaml 依赖，否则用 JSON 配置

export interface ToolsConfig {
  webSearch?: {
    enabled: boolean;
    adapters: {
      serper?: { apiKey: string };
      bing?: { apiKey: string };
    };
  };
  shellExecutor?: {
    enabled: boolean;
    auditLog: boolean;
  };
  // ...
}

export function loadToolsConfig(): ToolsConfig {
  const configPath = join(process.cwd(), 'config', 'tools.yaml');
  if (!existsSync(configPath)) {
    return {};  // 配置可选，没有则返回空配置
  }
  const raw = readFileSync(configPath, 'utf-8');
  return yaml.load(raw) as ToolsConfig;
}
```

若没有现有 yaml 解析依赖，改用 JSON 格式（`tools.json`）或直接从环境变量读取。

### Step 3：注册 v6 工具（1h）

修改 `src/tools/tool-registry.ts` 的 `registerDefaultTools()` 方法，追加 v6 工具注册：

```typescript
private registerDefaultTools(): void {
  // === v5 原有工具（不变）===
  this.register(new ReadFileTool(this.workDirManager));
  this.register(new WriteFileTool(this.workDirManager));
  // ... 其余 v5 工具 ...

  // === v6 新增工具 ===
  this.registerV6Tools();
}

private registerV6Tools(): void {
  const config = loadToolsConfig();

  // WebSearchTool
  if (config.webSearch?.enabled !== false) {
    const adapters: SearchAdapter[] = [];
    if (config.webSearch?.adapters?.serper?.apiKey || process.env.SERPER_API_KEY) {
      adapters.push(new SerperSearchAdapter(
        config.webSearch?.adapters?.serper?.apiKey ?? process.env.SERPER_API_KEY!
      ));
    }
    if (config.webSearch?.adapters?.bing?.apiKey || process.env.BING_SEARCH_API_KEY) {
      adapters.push(new BingSearchAdapter(
        config.webSearch?.adapters?.bing?.apiKey ?? process.env.BING_SEARCH_API_KEY!
      ));
    }
    if (adapters.length > 0) {
      this.register(new WebSearchTool(adapters));
    }
  }

  // WebFetchTool（无需 API Key，直接注册）
  this.register(new WebFetchTool());

  // ShellExecutorTool
  if (config.shellExecutor?.enabled !== false) {
    this.register(new ShellExecutorTool(this.workDirManager));
  }
}
```

### Step 4：集成测试（1h）

创建 `tests/integration/v6-tools-integration.test.ts`：

```typescript
describe('v6 Tools Integration', () => {
  let registry: ToolRegistry;
  let workDirManager: WorkDirManager;

  beforeEach(async () => {
    // 使用临时工作目录
    workDirManager = new WorkDirManager(tmpdir());
    registry = new ToolRegistry(workDirManager);
  });

  it('WebFetchTool - 通过 ToolRegistry 可调用', async () => {
    const result = await registry.execute('web_fetch', {
      url: 'https://example.com',
      format: 'markdown',
    });
    // 注：集成测试可 Mock fetch，确保不依赖网络
    expect(result.success).toBe(true);
  });

  it('ShellExecutorTool - echo 命令正确返回', async () => {
    const result = await registry.execute('shell_execute', {
      command: 'echo "integration test"',
    });
    expect(result.success).toBe(true);
    expect(result.data?.stdout).toContain('integration test');
  });

  it('ShellExecutorTool - 黑名单命令被拒绝', async () => {
    const result = await registry.execute('shell_execute', {
      command: 'rm -rf /',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('SECURITY_ERROR');
  });

  it('ToolRegistry - query 按 category 过滤', () => {
    const webTools = registry.query({ category: 'web' });
    const names = webTools.map(t => t.getDefinition().name);
    expect(names).toContain('web_fetch');
  });

  it('ToolRegistry - 权限检查', async () => {
    // 空权限列表，无法调用 SHELL 工具
    const result = await registry.execute(
      'shell_execute',
      { command: 'echo test' },
      []  // agentPermissions 为空
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Permission denied');
  });
});
```

---

## 验收标准

- [ ] `ToolRegistry` 中 `web_fetch`、`shell_execute` 工具已注册（`registry.has('web_fetch')` 为 true）
- [ ] 配置了 SERPER_API_KEY 环境变量时，`web_search` 工具自动注册
- [ ] `registry.query({ category: 'web' })` 返回包含 web_fetch 的工具列表
- [ ] `registry.execute('web_fetch', { url: 'https://example.com' })` 成功执行（Mock fetch）
- [ ] `registry.execute('shell_execute', { command: 'echo test' }, [])` 返回权限错误
- [ ] `registry.execute('shell_execute', { command: 'rm -rf /' }, [ToolPermission.SHELL])` 返回安全错误
- [ ] config/tools.yaml.example 文件存在，格式正确
- [ ] 所有 v5 工具仍正常工作（不破坏现有功能）

---

## 注意事项

- `config/tools.yaml` 可能包含 API Key，必须加入 `.gitignore`
- 若项目无 yaml 解析依赖，使用 JSON 格式（`config/tools.json`）替代
- `registerV6Tools()` 应该静默处理配置缺失（无 API Key 时跳过注册，不报错）
- 集成测试中的网络请求一律使用 Mock（`vi.mock('node:fetch')` 或 `jest.mock`）
