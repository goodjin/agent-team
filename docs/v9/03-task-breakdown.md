# Agent Team v9.0 任务拆分

**版本**: 9.0.0
**作者**: 系统架构师
**创建日期**: 2026-02-13
**基于**: 01-requirements.md + 02-architecture.md

---

## 总览

| 任务 | 名称 | 优先级 | 预计工时 | 阶段 | 依赖 |
|------|------|--------|---------|------|------|
| Task 1 | PluginManifest Schema + PluginLoader 基础 | P0 | 4h | Phase 1 | 无 |
| Task 2 | PluginSandbox 安全隔离 | P0 | 3h | Phase 1 | Task 1 |
| Task 3 | DynamicToolLoader + 热更新 | P0 | 4h | Phase 1 | Task 1, Task 2 |
| Task 4 | SelfEvaluator - 任务自评估 | P1 | 4h | Phase 2 | Task 1 |
| Task 5 | PromptOptimizer - 提示词优化 | P1 | 5h | Phase 2 | Task 4 |
| Task 6 | PluginRegistry - 本地插件索引 | P2 | 3h | Phase 3 | Task 1, Task 3 |
| Task 7 | 示例插件 + Schema 验证器 | P1 | 3h | Phase 3 | Task 1, Task 2 |
| Task 8 | 端到端测试 | P1 | 4h | Phase 3 | Task 1-7 |

**总计**: 30 工时 / 3 阶段 / 5 周

---

## 依赖关系图

```
Task 1 (PluginLoader)
  ├── Task 2 (Sandbox)
  │     └── Task 3 (DynamicToolLoader)
  │           └── Task 6 (PluginRegistry)
  ├── Task 4 (SelfEvaluator)
  │     └── Task 5 (PromptOptimizer)
  └── Task 7 (示例插件 + Validator)
        └── Task 8 (E2E 测试) ←─── 依赖所有 Task 1-7
```

---

## 阶段规划

### Phase 1：插件基础设施（Week 1-2）

目标：实现插件加载和工具热更新核心能力。

```
Task 1 → Task 2 → Task 3
```

**阶段验收**：
- 3 个工具插件可加载并被 Agent 调用
- 修改工具文件 3 秒内热更新生效
- 单元测试覆盖率 >= 80%

---

### Phase 2：自进化能力（Week 3-4）

目标：实现评估-优化闭环。

```
Task 4 → Task 5
```

**阶段验收**：
- 执行 20 次任务后 SelfEvaluator 趋势分析返回有意义数据
- A/B 测试流量分配误差 <= 5%
- Prompt 优化建议基于实际评估数据生成

---

### Phase 3：插件市场与集成（Week 5）

目标：插件市场、示例插件、端到端验证。

```
Task 6 + Task 7 → Task 8
```

**阶段验收**：
- 完整 E2E 场景通过：加载工具插件 → Agent 调用 → 自评估 → 趋势触发 → 生成变体
- 与 v5-v8 集成无回归（现有测试全部通过）
- 3 个示例插件覆盖三种插件类型（tool/role/hook）

---

## 任务详情摘要

### Task 1：PluginManifest Schema + PluginLoader 基础

**优先级**: P0 | **工时**: 4h | **详情**: `docs/v9/tasks/task-01.md`

**输出**：
- `src/plugins/loader.ts` — PluginLoader 类
- `src/plugins/validator.ts` — PluginValidator（Schema 验证）
- `src/plugins/types.ts` — 共享 TypeScript 接口
- `tests/v9/plugin-loader.test.ts`、`tests/v9/plugin-validator.test.ts`

**核心功能**：
- 扫描 `plugins/` 目录，读取并验证 `plugin.json`
- ESM 动态 `import()` 加载插件入口
- Kahn 算法拓扑排序处理依赖顺序
- 循环依赖检测和错误隔离

---

### Task 2：PluginSandbox 安全隔离

**优先级**: P0 | **工时**: 3h | **详情**: `docs/v9/tasks/task-02.md`

**输出**：
- `src/plugins/sandbox.ts` — PluginSandbox 类
- `tests/v9/plugin-sandbox.test.ts`

**核心功能**：
- 模块黑名单拦截（`child_process`、`cluster`、`worker_threads`）
- 插件初始化 5 秒超时保护
- 工具执行超时保护（默认 30 秒，可配置）
- 环境变量安全过滤（敏感 API Key）
- 异常捕获与隔离

---

### Task 3：DynamicToolLoader + 热更新

**优先级**: P0 | **工时**: 4h | **详情**: `docs/v9/tasks/task-03.md`

**输出**：
- `src/plugins/dynamic-tool-loader.ts` — DynamicToolLoader 类
- `tests/v9/dynamic-tool-loader.test.ts`

**核心功能**：
- 组合 v6 `ToolRegistry`，动态注册工具插件
- `fs.watch` + 300ms 防抖监听文件变化
- 热更新时保护正在执行的工具调用
- 工具版本管理（最多 3 个版本，`Map<name, VersionedTool[]>`）
- 热更新日志当前以 `console` 输出为主（可按需接 v7 StructuredLogger）

---

### Task 4：SelfEvaluator - 任务自评估

**优先级**: P1 | **工时**: 4h | **详情**: `docs/v9/tasks/task-04.md`

**输出**：
- `src/evolution/evaluator.ts` — SelfEvaluator 类
- `.agent-memory/evaluations.jsonl`（运行时生成）
- `tests/v9/self-evaluator.test.ts`

**核心功能**：
- 监听 `task:completed` / `task:failed` 事件
- 三维度评分（效率 0.3 + 质量 0.5 + 资源 0.2）
- 评估结果写入 `.agent-memory/evaluations.jsonl` + v8 `VectorStore`
- `getTrend(agentId, days)` 趋势分析
- 连续下降检测，触发 `evaluation:declining` 事件
- 规则驱动的优化建议生成

---

### Task 5：PromptOptimizer - 提示词优化

**优先级**: P1 | **工时**: 5h | **详情**: `docs/v9/tasks/task-05.md`

**输出**：
- `src/evolution/prompt-optimizer.ts` — PromptOptimizer 类
- `tests/v9/prompt-optimizer.test.ts`

**核心功能**：
- Prompt 版本历史管理（v8 `ProjectKnowledgeBase`，最多 20 版本）
- 订阅 `evaluation:declining`，10 秒内生成变体
- 三种优化策略：精简 / 强化约束 / 示例注入
- A/B 测试框架（60/40 分流，最少 20 样本）
- Welch t-test 统计显著性验证（p < 0.05）
- `prompt:improvement-ready` 事件 + 人工确认门控

---

### Task 6：PluginRegistry - 本地插件索引

**优先级**: P2 | **工时**: 3h | **详情**: `docs/v9/tasks/task-06.md`

**输出**：
- `src/plugins/registry.ts` — PluginRegistry 类
- `plugins/registry.json`（默认路径，运行时生成）
- `tests/v9/plugin-registry.test.ts`

**核心功能**：
- JSON 格式本地索引（原子写入 tmp + rename）
- `install(sourcePath)` 验证 manifest 后登记条目
- 同名冲突检测，不自动覆盖
- `usage_count` / `avg_score` 统计持久化
- `list()` / `search()` / 聚合 `getStats()` 查询接口

---

### Task 7：示例插件 + Schema 验证器

**优先级**: P1 | **工时**: 3h | **详情**: `docs/v9/tasks/task-07.md`

**输出**：
- `plugins/http-request/` — 工具插件示例
- `plugins/code-reviewer/` — 角色插件示例
- `plugins/audit-logger/` — 钩子插件示例
- `src/plugins/validator.ts` — PluginValidator（JSON Schema 验证）

**核心功能**：
- 三种类型示例插件，覆盖完整规范
- `PluginValidator.validate(manifest)` 返回详细错误信息
- Schema 验证集成到 `PluginLoader` 加载流程
- 示例插件包含 README 说明

---

### Task 8：端到端测试

**优先级**: P1 | **工时**: 4h | **详情**: `docs/v9/tasks/task-08.md`

**输出**：
- `tests/v9/e2e.test.ts` — 集成与「热重载等价路径」场景
- `tests/v9/fixtures/` — 最小插件、依赖排序、循环依赖、黑名单源码样例
- `tests/regression/core-exports.test.ts` — 核心容器 / 文件存储冒烟
- `vitest.config.ts` — Vitest + `@vitest/coverage-v8` 门槛

**核心功能**：
- E2E：加载工具插件 → 执行工具；自评估下降链 → Prompt 变体；仓库内 `plugins/http-request` 探测
- 热重载：变更 `plugin.json` 的 `entry` 与新入口文件后 `loadPlugin` + `loadToolsFromPlugins`（规避 Node 对同一路径 ESM 缓存）
- 沙箱：`tests/v9/fixtures/forbidden-import` + 单测覆盖静态拦截
- v5–v8 兼容：`tests/regression` 冒烟 + 全量 `npm test` 通过；性能 P99 指标可在 CI 中另加基准步骤
