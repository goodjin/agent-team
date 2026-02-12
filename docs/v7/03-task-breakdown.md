# Agent Team v7.0 任务拆分

**版本**: 7.0.0
**日期**: 2026-02-11
**状态**: 规划完成

---

## 总览

| 任务 | 名称 | 优先级 | 预估工时 | 依赖 | 阶段 |
|------|------|--------|----------|------|------|
| Task 1 | StructuredLogger | P0 | 4h | 无 | Phase 1 |
| Task 2 | TracingSystem | P0 | 5h | Task 1 | Phase 1 |
| Task 3 | MetricsCollector | P0 | 4h | 无 | Phase 1 |
| Task 4 | ObservabilityMiddleware - AgentLoop 集成 | P0 | 4h | Task 1, 2, 3 | Phase 1 |
| Task 5 | WorkflowCheckpoint | P1 | 6h | Task 1 | Phase 2 |
| Task 6 | 检查点恢复机制 | P1 | 4h | Task 5 | Phase 2 |
| Task 7 | 指标 API 端点 | P1 | 3h | Task 3 | Phase 2 |
| Task 8 | 端到端测试 | P1 | 4h | Task 1-7 | Phase 2 |

**总预估工时**：34h

---

## Phase 1：可观测性基础（P0，Week 1-2）

### Task 1：StructuredLogger（4h）

**目标**：实现统一结构化日志系统，替换散乱的 console.log

**输出文件**：
- `src/observability/types.ts` - 所有核心类型定义
- `src/observability/context.ts` - AsyncLocalStorage 上下文管理
- `src/observability/logger.ts` - StructuredLogger 实现
- `tests/observability/logger.test.ts` - 单元测试

**验收标准**：
- 输出 JSON 格式日志到控制台和文件
- 日志级别过滤生效（warn 级别时 debug/info 不输出）
- 文件按日期滚动，超 100MB 自动滚动
- 子 logger（child）正确继承上下文字段
- 单元测试覆盖率 > 80%

**详情**：[task-01.md](./tasks/task-01.md)

---

### Task 2：TracingSystem（5h）

**目标**：实现基于 AsyncLocalStorage 的分布式追踪系统

**依赖**：Task 1（复用 types.ts 和 context.ts）

**输出文件**：
- `src/observability/tracer.ts` - TracingSystem 实现
- `tests/observability/tracer.test.ts` - 单元测试

**验收标准**：
- 每次 startTrace 生成唯一 traceId
- Span 父子关系通过 AsyncLocalStorage 自动建立，无需手动传参
- endSpan 实时追加写入 `workspace/traces/{traceId}.json`
- withSpan() 自动管理 Span 生命周期和上下文切换
- 单元测试覆盖率 > 80%

**详情**：[task-02.md](./tasks/task-02.md)

---

### Task 3：MetricsCollector（4h）

**目标**：实现内存指标采集系统，支持滑动窗口统计和持久化

**依赖**：无（独立模块）

**输出文件**：
- `src/observability/metrics.ts` - MetricsCollector 实现
- `tests/observability/metrics.test.ts` - 单元测试

**验收标准**：
- Counter / Gauge / Histogram 三种指标类型均可用
- 百分位数计算（p50/p95/p99）准确
- 滑动窗口（1min/5min/1h/24h）统计正确
- 每分钟持久化快照到 JSONL 文件
- 内存数据超过 2 小时自动淘汰
- 单次采集开销 < 0.1ms
- 单元测试覆盖率 > 80%

**详情**：[task-03.md](./tasks/task-03.md)

---

### Task 4：ObservabilityMiddleware - AgentLoop 集成（4h）

**目标**：通过事件监听将日志、追踪、指标与 AgentLoop 零侵入集成

**依赖**：Task 1、Task 2、Task 3

**输出文件**：
- `src/observability/middleware.ts` - ObservabilityMiddleware 实现
- `src/observability/index.ts` - 统一导出
- 更新 `src/ai/agent-loop.ts` - 补充缺失的事件发射点（如需要）

**验收标准**：
- 调用 `createObservabilityMiddleware(agentLoop)` 后，任务执行自动产生日志、Trace、指标
- 不修改 AgentLoop 核心执行逻辑
- 可观测性组件异常不影响 Agent 任务执行（降级安全）
- 执行一次任务后 workspace/ 下产生对应的 log、trace、metrics 文件
- 单元测试覆盖率 > 80%

**详情**：[task-04.md](./tasks/task-04.md)

---

## Phase 2：持久化与 API（P1，Week 3-4）

### Task 5：WorkflowCheckpoint（6h）

**目标**：实现工作流检查点保存系统，支持原子写入和压缩存储

**依赖**：Task 1（日志记录）

**输出文件**：
- `src/observability/checkpoint.ts` - WorkflowCheckpointer 实现
- `tests/observability/checkpoint.test.ts` - 单元测试

**验收标准**：
- createWorkflow 返回唯一 workflowId
- saveCheckpoint 使用原子写入（tmp + rename）
- 检查点文件为 gzip 压缩格式
- SHA256 校验和验证文件完整性
- 每个工作流最多保留 10 个检查点，超出自动清理
- 单元测试覆盖率 > 80%

**详情**：[task-05.md](./tasks/task-05.md)

---

### Task 6：检查点恢复机制（4h）

**目标**：实现从检查点恢复工作流执行的完整流程

**依赖**：Task 5

**输出文件**：
- `src/workflow/recovery.ts` - 工作流恢复逻辑
- `src/workflow/index.ts` - 统一导出
- 更新 `src/ai/master-agent.ts` - 集成恢复逻辑（最小化修改）

**验收标准**：
- 系统启动时自动扫描并列出未完成的工作流
- 从最近检查点恢复，已完成步骤不重复执行
- 恢复时有明确的控制台提示（恢复了哪个工作流、从第几步）
- 强制终止进程后重启，能检测到未完成的工作流
- 单元测试覆盖率 > 80%

**详情**：[task-06.md](./tasks/task-06.md)

---

### Task 7：指标 API 端点（3h）

**目标**：在现有 Web 服务器上新增指标、日志、Trace 查询 API

**依赖**：Task 3（MetricsCollector）

**输出文件**：
- `src/server/routes/metrics.ts` - GET /api/metrics/snapshot
- `src/server/routes/logs.ts` - GET /api/logs
- `src/server/routes/traces.ts` - GET /api/traces/:traceId

**验收标准**：
- GET /api/metrics/snapshot 返回当前所有指标快照（JSON）
- GET /api/logs?taskId=xxx&limit=100 返回过滤后的日志列表
- GET /api/traces/:traceId 返回完整 Trace 树（含 children 嵌套结构）
- 所有端点有正确的 HTTP 状态码和错误处理
- 手动 curl 测试通过

**详情**：[task-07.md](./tasks/task-07.md)

---

### Task 8：端到端测试（4h）

**目标**：验证完整可观测性流水线的正确性，包括日志→Trace→指标→检查点的联动

**依赖**：Task 1 至 Task 7

**输出文件**：
- `tests/e2e/observability.e2e.test.ts` - 端到端测试
- `tests/e2e/checkpoint-recovery.e2e.test.ts` - 检查点恢复测试

**验收标准**：
- 执行真实 Agent 任务后，日志、Trace、指标文件均正确生成
- Trace 调用树正确反映 Task → Agent → Tool 层级关系
- 强制终止任务后恢复，已完成步骤不重复执行
- 可观测性组件引入后，现有任务执行时间增加 < 5%（性能回归）
- 端到端测试全部通过

**详情**：[task-08.md](./tasks/task-08.md)

---

## 任务依赖图

```
Task 1 (Logger) ──────────────────────────── Task 4 (Middleware)
Task 2 (Tracer) ──────────────────────────── Task 4 (Middleware)
Task 3 (Metrics) ─────────────────────────── Task 4 (Middleware)
                                              Task 7 (API)
Task 1 (Logger) ──────────────────────────── Task 5 (Checkpoint)
Task 5 (Checkpoint) ──────────────────────── Task 6 (Recovery)

Task 1 + 2 + 3 + 4 + 5 + 6 + 7 ──────────── Task 8 (E2E Test)
```

---

## 新增文件清单

```
src/observability/
├── types.ts          (Task 1)
├── context.ts        (Task 1)
├── logger.ts         (Task 1)
├── tracer.ts         (Task 2)
├── metrics.ts        (Task 3)
├── checkpoint.ts     (Task 5)
├── middleware.ts     (Task 4)
└── index.ts          (Task 4)

src/workflow/
├── recovery.ts       (Task 6)
└── index.ts          (Task 6)

src/server/routes/
├── metrics.ts        (Task 7)
├── logs.ts           (Task 7)
└── traces.ts         (Task 7)

tests/observability/
├── logger.test.ts    (Task 1)
├── tracer.test.ts    (Task 2)
├── metrics.test.ts   (Task 3)
└── checkpoint.test.ts (Task 5)

tests/e2e/
├── observability.e2e.test.ts         (Task 8)
└── checkpoint-recovery.e2e.test.ts   (Task 8)
```

---

**文档结束**
