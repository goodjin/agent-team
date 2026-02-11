# Agent Team v6.0 - 任务拆分

**版本**: 6.0.0
**日期**: 2026-02-11
**状态**: 设计完成，待实现

---

## 任务总览

| 任务 | 名称 | 优先级 | 预估工时 | 依赖 | 状态 |
|------|------|--------|---------|------|------|
| Task 1 | ToolRegistry 增强 | P0 | 3h | 无 | 待开发 |
| Task 2 | WebSearchTool | P0 | 4h | Task 1 | 待开发 |
| Task 3 | WebFetchTool | P0 | 4h | Task 1 | 待开发 |
| Task 4 | ShellExecutorTool | P0 | 5h | Task 1 | 待开发 |
| Task 5 | CodeSandboxTool | P1 | 5h | Task 1 | 待开发 |
| Task 6 | ToolPipeline | P1 | 4h | Task 1、2、3 | 待开发 |
| Task 7 | 与 AgentLoop 集成 | P0 | 3h | Task 1、2、3、4 | 待开发 |
| Task 8 | 端到端测试 | P1 | 4h | Task 1-7 | 待开发 |

**总工时估计**: 32h（约 4 个工作日）

---

## 任务依赖关系

```
Task 1: ToolRegistry
    ├── Task 2: WebSearchTool
    │       └── Task 6: ToolPipeline
    ├── Task 3: WebFetchTool
    │       └── Task 6: ToolPipeline
    ├── Task 4: ShellExecutorTool
    │       └── Task 7: 与 AgentLoop 集成
    └── Task 5: CodeSandboxTool

Task 7: 与 AgentLoop 集成
    └── Task 8: 端到端测试
```

**并行执行策略**：
- Task 2、3、4、5 可在 Task 1 完成后并行开发
- Task 6 需等 Task 2、3 完成（需要真实工具测试 Pipeline）
- Task 7 需等 Task 2、3、4 完成（P0 工具全部就绪才集成）
- Task 8 在所有任务完成后执行

---

## Phase 分组

### Phase 1 - 基础设施（建议优先级）

| 任务 | 工时 | 说明 |
|------|------|------|
| Task 1 | 3h | 其他所有任务的基础，必须最先完成 |

### Phase 2 - P0 工具（Week 1-2）

| 任务 | 工时 | 说明 |
|------|------|------|
| Task 2 | 4h | Web 搜索，核心能力 |
| Task 3 | 4h | 网页内容获取，与 Task 2 配套 |
| Task 4 | 5h | Shell 执行，最高安全风险，需仔细实现 |

### Phase 3 - P1 功能（Week 3）

| 任务 | 工时 | 说明 |
|------|------|------|
| Task 5 | 5h | 代码沙箱 |
| Task 6 | 4h | 工具流水线编排 |

### Phase 4 - 集成与验收（Week 4）

| 任务 | 工时 | 说明 |
|------|------|------|
| Task 7 | 3h | 接入 AgentLoop，打通端到端链路 |
| Task 8 | 4h | 端到端测试，验收全部功能 |

---

## 任务详情

### Task 1：ToolRegistry 增强（P0，3h）

**目标**：为 v6 新工具提供权限控制、工具发现、健康检查和调用统计能力。

**关键交付物**：
- 更新 `src/tools/tool-registry.ts`
- 新增 `ToolPermission` 枚举和 `V6ToolDefinition` 接口
- `query()` 多维搜索方法
- `execute()` 方法增加权限检查
- 调用统计收集

**详情文档**：[docs/v6/tasks/task-01.md](./tasks/task-01.md)

---

### Task 2：WebSearchTool（P0，4h）

**目标**：实现通过 Serper.dev API 搜索互联网信息的工具，含缓存和 fallback 机制。

**关键交付物**：
- `src/tools/builtin/web-search.ts`（WebSearchTool 类）
- `src/tools/adapters/search-adapter.ts`（接口定义）
- `src/tools/adapters/serper-search.ts`（Serper.dev 适配器）
- `src/tools/adapters/bing-search.ts`（Bing 备用适配器）
- `tests/tools/web-search.test.ts`

**详情文档**：[docs/v6/tasks/task-02.md](./tasks/task-02.md)

---

### Task 3：WebFetchTool（P0，4h）

**目标**：实现从 URL 获取网页内容并转换为 Markdown 的工具，含 SSRF 防护。

**关键交付物**：
- `src/tools/builtin/web-fetch.ts`（WebFetchTool 类）
- `tests/tools/web-fetch.test.ts`
- 依赖：`node-html-parser`、`turndown`（需添加到 package.json）

**详情文档**：[docs/v6/tasks/task-03.md](./tasks/task-03.md)

---

### Task 4：ShellExecutorTool（P0，5h）

**目标**：实现安全的 Shell 命令执行工具，含命令黑名单和工作目录限制。

**关键交付物**：
- `src/tools/builtin/shell-executor.ts`（ShellExecutorTool 类）
- `tests/tools/shell-executor.test.ts`
- 黑名单配置嵌入代码或独立配置文件

**详情文档**：[docs/v6/tasks/task-04.md](./tasks/task-04.md)

---

### Task 5：CodeSandboxTool（P1，5h）

**目标**：实现基于 Node.js vm 模块的代码沙箱，支持 Node.js 和 Python 代码执行。

**关键交付物**：
- `src/tools/builtin/code-sandbox.ts`（CodeSandboxTool 类）
- `tests/tools/code-sandbox.test.ts`

**详情文档**：[docs/v6/tasks/task-05.md](./tasks/task-05.md)

---

### Task 6：ToolPipeline（P1，4h）

**目标**：实现工具流水线，支持顺序执行、数据传递、条件分支、forEach fan-out。

**关键交付物**：
- `src/tools/tool-pipeline.ts`（ToolPipeline 类）
- `tests/tools/tool-pipeline.test.ts`

**详情文档**：[docs/v6/tasks/task-06.md](./tasks/task-06.md)

---

### Task 7：与 AgentLoop 集成（P0，3h）

**目标**：将 v6 新工具注册到 ToolRegistry，确保 AgentLoop → SubAgent → 工具链路通畅。

**关键交付物**：
- 更新 `src/tools/tool-registry.ts` 的 `registerDefaultTools()` 加入 v6 工具
- 添加 `config/tools.yaml` 工具配置文件
- 集成测试：确认 AgentLoop 能调用 WebSearchTool

**详情文档**：[docs/v6/tasks/task-07.md](./tasks/task-07.md)

---

### Task 8：端到端测试（P1，4h）

**目标**：编写端到端集成测试，覆盖 Agent 通过工具完成"搜索 → 获取内容 → 执行代码"的完整工作流。

**关键交付物**：
- `tests/e2e/v6-tools.test.ts`
- 测试场景：3 步工具流水线测试
- 测试报告：覆盖率满足 > 80% 要求

**详情文档**：[docs/v6/tasks/task-08.md](./tasks/task-08.md)

---

## 风险识别

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Serper.dev API 密钥未配置 | Task 2 无法真实测试 | Mock 测试为主，提供 .env.example |
| Node.js vm 沙箱逃逸 | Task 5 安全风险 | 明确限制适用场景；生产环境用 Docker |
| Shell 黑名单不完整 | Task 4 安全风险 | 默认最小权限；记录审计日志 |
| node-html-parser 解析质量 | Task 3 内容质量 | 支持 `format: 'raw'` 回退选项 |

---

**文档结束**
