# Task 08：端到端测试

**优先级**: P1
**预计工时**: 4h
**阶段**: Phase 3
**依赖**: Task 01-07（所有前置任务完成）

---

## 目标

验证 v9.0 所有功能模块的集成正确性，以及与 v5-v8 系统的向后兼容性。通过端到端测试覆盖完整的插件生命周期、热更新流程、自评估-优化闭环，以及性能基准验证。

---

## 输入

- `docs/v9/01-requirements.md` §6（里程碑验收标准）
- `docs/v9/02-architecture.md`（系统集成点）
- `docs/v9/03-task-breakdown.md`（各阶段验收标准）
- 所有 Task 01-07 的输出产物
- 现有测试套件（`tests/` 目录下的 v5-v8 测试）

---

## 输出文件（与仓库一致）

| 文件 | 说明 |
|------|------|
| `tests/v9/e2e.test.ts` | 集成 / 演封闭式 / 热重载等价路径 / `fs.watch` 启停 |
| `tests/v9/*.test.ts` | PluginLoader、Sandbox、Validator、DynamicToolLoader、SelfEvaluator、PromptOptimizer、Registry |
| `tests/v9/fixtures/` | 最小 tool 插件、依赖排序、循环依赖、`child_process` 恶意样例 |
| `tests/regression/core-exports.test.ts` | `createContainer`、文件存储目录初始化 |
| `vitest.config.ts` | Vitest + `@vitest/coverage-v8`（`src/plugins`、`src/evolution` 覆盖率门槛） |

---

## 测试场景设计

### 场景 1：完整插件生命周期 E2E

**目标**：验证从插件安装到 Agent 调用的完整链路。

```
测试步骤：
1. 初始化 PluginLoader + ToolRegistry + DynamicToolLoader
2. 调用 pluginLoader.scanAndLoad('./plugins')
3. 验证 http-request 工具出现在 registry.listTools()
4. 创建 mock AgentLoop，发送包含 http_request 调用的任务
5. 验证工具调用成功执行并返回结果
6. 验证 PluginRegistry 中 usage_count 递增

验收点：
- 工具插件加载后在下一次任务中可调用
- 动态工具与内置工具行为一致
- 使用统计正确更新
```

### 场景 2：工具热更新 E2E

**目标**：验证文件修改后 3 秒内工具更新生效。

```
测试步骤：
1. 加载 http-request 插件（v1.0.0：execute 返回 "v1"）
2. 验证工具调用返回 "v1"
3. 修改 plugins/http-request/index.js（execute 返回 "v2"）
4. 等待最多 3 秒（轮询或事件监听）
5. 验证工具调用返回 "v2"

验收点：
- 文件变化到生效 <= 3 秒
- 热更新日志已记录
- 修改前正在执行的调用不受影响（需并发测试）
```

**热更新失败回滚测试**：
```
1. 加载合法工具插件
2. 将 index.js 替换为语法错误文件
3. 等待热更新尝试
4. 验证原版本工具仍可调用
5. 验证错误日志已记录
```

### 场景 3：沙箱安全 E2E

**目标**：验证恶意插件无法突破沙箱限制。

```typescript
// 测试用恶意插件：尝试访问黑名单模块
// tests/v9/fixtures/malicious-plugin/index.js
export default {
  name: 'malicious_tool',
  description: '测试沙箱',
  parameters: { type: 'object', properties: {} },
  async execute(params, context) {
    // 尝试通过 context.import 访问 child_process
    try {
      const cp = await context.import('child_process')
      return { breached: true }
    } catch (err) {
      return { blocked: true, error: err.message }
    }
  }
}
```

```
测试步骤：
1. 加载 "malicious-plugin"
2. 调用工具
3. 验证返回 { blocked: true }，未 breached
4. 验证 PluginSandboxError 已记录到日志
5. 验证系统其他功能正常运行（沙箱错误不影响宿主）

验收点：
- 黑名单模块访问被拦截
- 系统继续正常运行
- 敏感环境变量无法读取
```

### 场景 4：自评估-优化闭环 E2E

**目标**：验证"执行 → 评估 → 下降检测 → 变体生成"的完整闭环。

```
测试步骤：
1. 初始化 SelfEvaluator + PromptOptimizer
2. 模拟 20 次任务完成事件（其中连续 3 天评分下降 > 10%）
3. 验证 evaluation:declining 事件触发
4. 验证 10 秒内 generateVariants 被调用
5. 验证变体与原 Prompt 有实质性差异
6. 调用 startABTest，模拟 20 个样本（B 组明显更优）
7. 验证 prompt:improvement-ready 事件触发
8. 调用 adoptVersion，验证新版本激活
9. 验证旧版本进入存档（未删除）

验收点：
- 完整闭环在测试环境中端到端运行
- 人工确认门控有效（不自动替换）
- 统计结论基于实际样本数据
```

### 场景 5：A/B 测试流量分配验证

**目标**：统计验证 60/40 分配比例误差 <= 5%。

```typescript
// 运行 100 次任务分配，统计 A/B 比例
const aCount = Array.from({ length: 100 }, (_, i) =>
  optimizer.selectPromptForTask('agent-1', `task-${i}`)
).filter(v => v === session.controlVersionId).length

// 期望 A 占 60%（误差 <= 5%）
expect(aCount).toBeGreaterThanOrEqual(55)
expect(aCount).toBeLessThanOrEqual(65)
```

### 场景 6：v5-v8 向后兼容性验证

**目标**：v9 新增模块不破坏现有接口。

```
测试步骤：
1. 运行所有现有测试套件（v5/v6/v7/v8 测试）
2. 验证全部通过，无回归

涵盖接口：
- MasterAgent.execute()、SubAgent.execute()（v5）
- ToolRegistry.register()、ToolRegistry.execute()（v6）
- StructuredLogger 接口（v7）
- VectorStore.upsert()、AgentMemory 接口（v8）

验收点：
- 现有测试全部通过（0 regression）
- v9 新模块不修改任何 v5-v8 核心文件
```

### 场景 7：性能基准验证

**目标**：验证性能约束符合需求规格。

```typescript
// 单插件加载时间 P99 <= 500ms
const times: number[] = []
for (let i = 0; i < 100; i++) {
  const start = Date.now()
  await loader.load(`./tests/v9/fixtures/simple-plugin`)
  times.push(Date.now() - start)
}
const p99 = percentile(times, 99)
expect(p99).toBeLessThanOrEqual(500)

// 热更新延迟 <= 3 秒
// 通过 'tool:hot-reloaded' 事件的 elapsedMs 字段验证

// 自评估耗时 <= 3 秒（evaluate 方法调用到返回）
const evalStart = Date.now()
await evaluator.evaluate(mockTaskResult)
expect(Date.now() - evalStart).toBeLessThanOrEqual(3000)
```

---

## 测试夹具（`tests/v9/fixtures/`）

```
tests/v9/fixtures/
├── simple-plugin/              # 最小化工具插件（用于性能测试）
│   ├── plugin.json
│   └── index.js               # execute 直接返回 { ok: true }
├── malicious-plugin/           # 沙箱测试用恶意插件
│   ├── plugin.json
│   └── index.js
├── cyclic-a/                   # 循环依赖测试：A 依赖 B
│   └── plugin.json
├── cyclic-b/                   # 循环依赖测试：B 依赖 A
│   └── plugin.json
├── slow-plugin/                # 超时测试用：初始化耗时 10 秒
│   ├── plugin.json
│   └── index.js
└── mock-task-results.ts        # 模拟任务结果数据（用于评估测试）
```

---

## 实现步骤

### 步骤 1：搭建测试环境

```typescript
// tests/v9/helpers/setup.ts
export async function createTestEnvironment() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-team-v9-test-'))
  const pluginsDir = path.join(tmpDir, 'plugins')
  const memoryDir = path.join(tmpDir, '.agent-memory')

  await fs.mkdir(pluginsDir, { recursive: true })
  await fs.mkdir(memoryDir, { recursive: true })

  // 复制 fixtures 到临时目录
  await fs.cp('./tests/v9/fixtures', path.join(pluginsDir, 'fixtures'), { recursive: true })

  const logger = createMockLogger()
  const validator = new PluginValidator()
  const sandbox = new PluginSandbox({ ... })
  const loader = new PluginLoader(validator, sandbox, logger)
  const registry = new ToolRegistry()
  const dynamicLoader = new DynamicToolLoader(registry, loader, sandbox, logger)

  return { tmpDir, pluginsDir, memoryDir, logger, loader, registry, dynamicLoader, cleanup: () => fs.rm(tmpDir, { recursive: true }) }
}
```

### 步骤 2：实现各场景测试用例

每个场景对应独立的 `describe` 块，通过 `beforeEach`/`afterEach` 管理测试环境生命周期。

### 步骤 3：热更新测试中的文件修改

```typescript
// 热更新测试：修改插件文件触发热更新
async function simulateFileChange(pluginDir: string, newContent: string) {
  const indexPath = path.join(pluginDir, 'index.js')
  await fs.writeFile(indexPath, newContent, 'utf-8')
  // fs.watch 回调是异步的，需要等待
  await new Promise(resolve => setTimeout(resolve, 500))  // 等待 300ms 防抖 + 处理时间
}
```

### 步骤 4：自评估测试数据准备

```typescript
// 生成连续 3 天下降的模拟评估数据
async function seedDecliningTrend(evaluator: SelfEvaluator, agentId: string) {
  const days = [-3, -2, -1, 0]  // 最近 4 天
  const scores = [8.5, 7.5, 6.5, 5.5]  // 持续下降

  for (let i = 0; i < days.length; i++) {
    const timestamp = new Date(Date.now() + days[i] * 86400000)
    // 直接写入 evaluations.jsonl 模拟历史数据
    await evaluator.injectHistoricalData({
      taskId: `mock-task-${i}`,
      agentId,
      timestamp,
      scores: { composite: scores[i], efficiency: scores[i], quality: scores[i], resource: scores[i] }
    })
  }
}
```

### 步骤 5：运行现有测试验证兼容性

```bash
npm run test        # 全部测试（v9 + 回归）
npm run test:e2e    # 仅 tests/v9/e2e.test.ts
npm run test:coverage
```

---

## 验收标准

### 功能验收

- [ ] 完整 E2E 场景：加载工具插件 → Agent 调用 → 自评估 → 趋势触发 → 生成变体，全链路通过
- [ ] 热更新 E2E：修改插件文件 → 3 秒内验证工具更新（在 CI 中可设宽松的 5 秒超时）
- [ ] 热更新失败回滚：语法错误文件不影响旧版本可用性
- [ ] 沙箱安全：恶意插件尝试访问黑名单模块被拦截，系统继续运行
- [ ] 评估闭环：连续下降 → 变体生成 → A/B 测试 → 推荐采纳
- [ ] 人工确认门控：`prompt:improvement-ready` 事件触发后需显式调用 `adoptVersion`
- [ ] 采纳新版本后旧版本进入存档，不删除

### 兼容性验收

- [ ] 与 v5-v8 集成无回归（现有测试全部通过）
- [ ] 3 个示例插件覆盖三种插件类型（tool/role/hook）

### 性能验收

- [ ] 单插件加载时间 P99 <= 500ms
- [ ] 自评估耗时 <= 3 秒
- [ ] A/B 测试流量分配比例误差 <= 5%（100 次样本统计）

---

## 技术注意事项

1. **文件系统测试隔离**：每个测试用例使用独立的临时目录，`afterEach` 中清理，避免测试间干扰
2. **热更新测试的时间敏感性**：CI 环境中 I/O 可能较慢，建议将 3 秒限制放宽到 5 秒，或通过事件监听代替轮询
3. **ESM 动态 import**：使用 Vitest（`vitest.config.ts`），与源码中 `*.js` 导入后缀一致；同一路径模块可能被 Node 缓存，热重载集成测试采用新 `entry` 文件规避
4. **循环依赖测试**：`cyclic-a` 和 `cyclic-b` 的 `plugin.json` 的 `dependencies` 互相引用，验证两者均拒绝加载
5. **并发热更新测试**：验证热更新期间正在进行的调用不中断，需要在触发文件变化的同时发起耗时较长的工具调用
