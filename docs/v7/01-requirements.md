# Agent Team v7.0 - 产品需求文档（PRD）

**版本**: 7.0.0
**日期**: 2026-02-11
**状态**: 待开发
**负责人**: 产品团队

---

## 一、版本概述

### 1.1 核心目标

**v7.0 主题：可观测性与持久化工作流（Observability & Persistent Workflows）**

v6.0 大幅扩展了 Agent 的工具能力（WebSearch、WebFetch、ShellExecutor、CodeSandbox、ToolPipeline、ToolRegistry），但系统的内部运行对用户和开发者几乎完全不透明。

v7.0 的核心目标是**让 Agent 的执行过程完全可见、可追踪、可恢复**，使系统从"黑盒"变成"玻璃箱"：

- 结构化日志系统：统一记录所有 Agent 执行事件
- 执行追踪（Tracing）：完整的调用链路可视化
- 指标采集（Metrics）：量化系统性能和健康状态
- 工作流检查点（Checkpointing）：崩溃后可从断点恢复

### 1.2 与 v6 的关系

| 维度 | v6.0 | v7.0 |
|------|------|------|
| 核心能力 | 工具生态系统增强 | 可观测性与持久化工作流 |
| 系统透明度 | 黑盒执行 | 完整执行链路可见 |
| 崩溃恢复 | 从头重新执行 | 从最近检查点恢复 |
| 调试能力 | 散乱 console.log | 结构化 JSON 日志 + Trace |
| 性能洞察 | 无 | Token 消耗、工具延迟、成功率指标 |
| 依赖关系 | 完全继承 v5 | 完全继承 v6，不破坏现有接口 |

### 1.3 关键改进

1. **透明化**：每次 LLM 调用、每次工具调用都产生可查询的结构化日志
2. **可追踪**：Trace ID 将 Master Agent → Sub Agents → Tools 的完整调用树串联起来
3. **可量化**：指标系统让"Agent 执行效率如何"有了明确的数字答案
4. **可恢复**：工作流检查点使长时间任务在崩溃后无需从头执行
5. **向后兼容**：v6 的所有工具和接口保持不变，v7 只是增加观测层

---

## 二、核心理念

### 2.1 可观测性三大支柱

v7.0 基于云原生可观测性的标准三大支柱（Logs / Traces / Metrics）来设计整个观测体系：

```
┌─────────────────────────────────────────────────────────┐
│                   可观测性三大支柱                        │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Logs       │  │   Traces     │  │   Metrics    │  │
│  │  结构化日志   │  │   执行追踪   │  │   指标采集   │  │
│  │              │  │              │  │              │  │
│  │ 记录"发生了   │  │ 记录"如何    │  │ 记录"执行得  │  │
│  │  什么事"     │  │  发生的"     │  │  怎么样"    │  │
│  │              │  │              │  │              │  │
│  │ • 事件时间线  │  │ • 调用树结构 │  │ • 成功率     │  │
│  │ • 错误详情   │  │ • 耗时分析   │  │ • 平均耗时   │  │
│  │ • 上下文信息  │  │ • 依赖关系   │  │ • Token 消耗 │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Logs（日志）** 回答"发生了什么"：Agent 在 14:32:05 调用了 web_search 工具，参数是什么，返回了什么，耗时多久。

**Traces（追踪）** 回答"如何发生的"：这次任务从 MasterAgent 开始，创建了 2 个 SubAgent，SubAgent-1 调用了 3 次工具，SubAgent-2 调用了 1 次 LLM，整个调用树的层级关系和时序关系。

**Metrics（指标）** 回答"执行得怎么样"：过去 24 小时任务成功率 87%，平均执行时间 45 秒，web_search 工具平均耗时 2.3 秒，Token 消耗趋势。

### 2.2 非侵入式设计

可观测性组件不应干扰核心业务逻辑的正确性：

- **零侵入**：现有的 AgentLoop、MasterAgent、SubAgent、工具执行代码不需要大规模修改
- **中间件模式**：通过事件发布/订阅机制收集数据，不在执行路径上增加同步延迟
- **降级安全**：日志写入失败、Trace 采集失败不影响 Agent 任务继续执行

### 2.3 持久化优先

工作流状态持久化遵循以下原则：

- **最小状态**：只持久化恢复执行所需的最小必要状态，不序列化完整的内存对象
- **幂等恢复**：从检查点恢复后的执行结果与未中断执行的结果一致
- **显式检查点**：只在业务上有意义的"关键步骤"保存检查点，不做无意义的全量快照

---

## 三、功能需求

### 3.1 P0 核心功能（必须实现）

#### 3.1.1 结构化日志系统（StructuredLogger）

**功能描述**：
为整个 Agent Team 系统提供统一的结构化日志能力，替换现有的散乱 `console.log`，输出标准 JSON 格式日志，支持持久化到文件。

**核心能力**：

1. **统一日志格式**：所有日志输出为 JSON 结构，包含时间戳、级别、模块、消息、上下文字段
2. **日志级别**：支持 `debug` / `info` / `warn` / `error` 四个级别，运行时可动态调整
3. **Agent 执行事件记录**：专门的事件类型涵盖任务全生命周期
   - `task.started` / `task.completed` / `task.failed`
   - `tool.called` / `tool.succeeded` / `tool.failed`
   - `llm.requested` / `llm.responded` / `llm.error`
   - `agent.created` / `agent.finished`
4. **日志持久化**：写入文件，按日期滚动（每天一个文件）
5. **日志文件路径**：`workspace/logs/YYYY-MM-DD.log`
6. **控制台输出**：开发模式下同时输出到控制台（可选美化格式）

**日志格式规范**（详见第五节）：
```json
{
  "timestamp": "2026-02-11T14:32:05.123Z",
  "level": "info",
  "module": "agent-loop",
  "event": "tool.called",
  "traceId": "trace-abc123",
  "taskId": "task-001",
  "agentId": "agent-master-01",
  "data": {
    "toolName": "web_search",
    "params": { "query": "TypeScript best practices" }
  }
}
```

**接口定义**：
```typescript
interface LogEntry {
  timestamp: string;        // ISO 8601 格式
  level: 'debug' | 'info' | 'warn' | 'error';
  module: string;           // 产生日志的模块名
  event?: string;           // 事件类型（可选）
  traceId?: string;         // 关联的 Trace ID（可选）
  taskId?: string;          // 关联的任务 ID（可选）
  agentId?: string;         // 关联的 Agent ID（可选）
  message: string;          // 人可读的描述
  data?: Record<string, any>; // 结构化附加数据
  durationMs?: number;      // 操作耗时（可选）
  error?: {                 // 错误信息（可选）
    name: string;
    message: string;
    stack?: string;
  };
}

interface StructuredLogger {
  debug(message: string, data?: Record<string, any>): void;
  info(message: string, data?: Record<string, any>): void;
  warn(message: string, data?: Record<string, any>): void;
  error(message: string, error?: Error, data?: Record<string, any>): void;
  child(context: Partial<LogEntry>): StructuredLogger; // 创建子 logger，继承上下文
  setLevel(level: LogLevel): void;
}
```

**技术要求**：
- 不依赖 `winston`、`pino` 等重量级日志库，自行实现轻量级日志器
- 文件写入使用异步流，不阻塞主线程
- 日志文件超过 100MB 时触发滚动（即使未到次日）
- 保留最近 30 天的日志文件，自动清理旧文件

**验收标准**：
- 所有 Agent 执行事件（任务开始、工具调用、LLM 请求）产生对应的 JSON 日志
- 日志文件按日期正确滚动，旧文件自动清理
- 日志级别过滤生效：设置 `warn` 级别时，`debug`/`info` 日志不输出
- 控制台输出和文件输出同时工作
- 单元测试覆盖率 > 80%

---

#### 3.1.2 执行追踪系统（TracingSystem）

**功能描述**：
为每次任务执行生成唯一的 Trace ID，记录从 MasterAgent 到 SubAgent 到工具调用的完整树形调用链路，并将 Trace 数据持久化。

**核心能力**：

1. **Trace ID 生成**：每次任务提交时生成全局唯一的 `traceId`（UUID v4）
2. **Span 记录**：每个有意义的操作（LLM 调用、工具调用、Agent 创建）创建一个 Span
   - Span 包含：`spanId`、`parentSpanId`、`name`、`startTime`、`endTime`、`status`、`attributes`
3. **树形调用关系**：通过 `parentSpanId` 构建 Master → Sub Agent → Tool 的层级调用树
4. **Trace 持久化**：Trace 数据以 JSON 格式保存到 `workspace/traces/` 目录
5. **Trace 查询接口**：支持按 `traceId` 查询完整 Trace 树，按 `taskId` 查询关联 Trace

**Span 类型定义**：
```typescript
type SpanKind = 'task' | 'agent' | 'llm' | 'tool' | 'pipeline';
type SpanStatus = 'running' | 'success' | 'error';

interface Span {
  spanId: string;           // Span 唯一 ID
  traceId: string;          // 所属 Trace ID
  parentSpanId?: string;    // 父 Span ID（根 Span 无此字段）
  name: string;             // Span 名称（如 "tool:web_search"）
  kind: SpanKind;
  startTime: string;        // ISO 8601
  endTime?: string;         // 完成时填入
  durationMs?: number;      // 完成时计算
  status: SpanStatus;
  attributes: Record<string, any>; // 附加属性
  events: SpanEvent[];      // Span 内的关键事件点
  error?: {
    name: string;
    message: string;
  };
}

interface SpanEvent {
  time: string;
  name: string;
  attributes?: Record<string, any>;
}
```

**Tracer 接口**：
```typescript
interface Tracer {
  startSpan(name: string, kind: SpanKind, parentSpanId?: string): Span;
  endSpan(spanId: string, status: SpanStatus, error?: Error): void;
  addSpanEvent(spanId: string, eventName: string, attributes?: Record<string, any>): void;
  getTrace(traceId: string): TraceTree | null;
  getCurrentSpan(): Span | null;  // 基于 AsyncLocalStorage 的当前 Span
}

interface TraceTree {
  traceId: string;
  rootSpan: SpanNode;
  totalDurationMs: number;
  spanCount: number;
}

interface SpanNode extends Span {
  children: SpanNode[];
}
```

**技术要求**：
- 使用 Node.js `AsyncLocalStorage` 自动传播当前 Span 上下文，无需手动传参
- Trace 数据文件路径：`workspace/traces/{traceId}.json`
- Span 在 endSpan 调用时写入文件（追加模式），不等任务完成再批量写入
- 内存中只保留当前活跃 Trace 的 Span，防止内存泄漏

**验收标准**：
- 每次任务执行生成唯一的 Trace ID
- 调用树正确反映 MasterAgent → SubAgent → Tool 的层级关系
- Trace 数据文件在任务完成后可查询
- LLM 调用和工具调用的耗时准确记录（误差 < 10ms）
- 单元测试覆盖率 > 80%

---

### 3.2 P1 重要功能（第二阶段实现）

#### 3.2.1 工作流检查点系统（WorkflowCheckpointing）

**功能描述**：
允许工作流在执行过程中自动保存检查点，当系统崩溃或进程退出后，可从最近的检查点恢复执行，而不必从头重来。

**核心能力**：

1. **检查点自动保存**：在以下时机自动创建检查点：
   - 每个 SubAgent 完成其子任务时
   - 每次工具调用成功返回后（可配置）
   - Pipeline 每个步骤完成后
2. **检查点内容**：任务参数、当前执行阶段、已完成的子任务结果、待执行的子任务列表
3. **崩溃检测**：系统启动时扫描未完成的工作流，提示用户是否恢复
4. **手动恢复**：支持通过 API 指定 `workflowId` 从最近检查点恢复
5. **检查点存储**：JSON 文件，路径 `workspace/checkpoints/{workflowId}/checkpoint-{seq}.json`

**工作流状态机**：
```
pending → running → completed
                 ↓
              paused  (用户暂停)
                 ↓
            recovering (从检查点恢复中)
                 ↓
              failed  (不可恢复错误)
```

**检查点数据结构**：
```typescript
type WorkflowStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'recovering';

interface WorkflowCheckpoint {
  workflowId: string;
  checkpointSeq: number;       // 检查点序号，单调递增
  createdAt: string;           // ISO 8601
  status: WorkflowStatus;
  taskInput: Record<string, any>; // 原始任务输入（不可变）
  completedSteps: CompletedStep[]; // 已完成的步骤及其输出
  pendingSteps: PendingStep[];    // 待执行的步骤
  agentContexts: Record<string, AgentContext>; // 各 Agent 的执行上下文摘要
  metadata: {
    totalSteps: number;
    completedCount: number;
    traceId: string;
    lastActiveAt: string;
  };
}

interface CompletedStep {
  stepId: string;
  agentId: string;
  completedAt: string;
  output: any;
  durationMs: number;
}
```

**Checkpointing 接口**：
```typescript
interface WorkflowCheckpointer {
  createWorkflow(taskInput: Record<string, any>): string; // 返回 workflowId
  saveCheckpoint(workflowId: string, state: Partial<WorkflowCheckpoint>): Promise<void>;
  loadLatestCheckpoint(workflowId: string): Promise<WorkflowCheckpoint | null>;
  listIncompleteWorkflows(): Promise<WorkflowSummary[]>;
  markCompleted(workflowId: string): Promise<void>;
  markFailed(workflowId: string, reason: string): Promise<void>;
}
```

**技术要求**：
- 检查点写入使用原子操作（先写临时文件，再重命名），防止文件损坏
- 每个工作流最多保留最近 10 个检查点，旧检查点自动清理
- 检查点文件压缩存储（JSON + gzip），减少磁盘占用
- 恢复时验证检查点完整性（校验和）

**验收标准**：
- 任务执行中途强制终止进程，重启后能检测到未完成的工作流
- 从检查点恢复后，已完成的步骤不重复执行
- 检查点原子写入：不出现半写状态的损坏文件
- 检查点数量超过 10 个时，旧文件自动清理
- 单元测试覆盖率 > 80%

---

#### 3.2.2 指标采集系统（MetricsCollector）

**功能描述**：
自动采集 Agent 系统的关键运行指标，提供实时查询和历史统计接口，支持发现性能瓶颈和异常模式。

**采集的指标**：

1. **任务级指标**：
   - `task.total`：总任务数（累计）
   - `task.success_rate`：任务成功率（滑动窗口）
   - `task.duration_p50 / p95 / p99`：任务执行时间百分位数
   - `task.active_count`：当前并发执行的任务数

2. **工具级指标**：
   - `tool.call_count[tool_name]`：每个工具的调用次数
   - `tool.success_rate[tool_name]`：每个工具的成功率
   - `tool.duration_avg[tool_name]`：每个工具的平均耗时

3. **LLM 级指标**：
   - `llm.request_count[provider]`：每个 LLM 服务商的请求次数
   - `llm.token_input_total`：总输入 Token 消耗（累计）
   - `llm.token_output_total`：总输出 Token 消耗（累计）
   - `llm.token_by_task[task_id]`：按任务统计 Token 消耗
   - `llm.duration_avg[provider]`：每个服务商的平均响应时间

4. **系统级指标**：
   - `system.memory_mb`：内存使用量（MB）
   - `system.uptime_seconds`：系统运行时长

**指标数据结构**：
```typescript
interface MetricPoint {
  name: string;
  value: number;
  timestamp: string;          // ISO 8601
  labels?: Record<string, string>; // 维度标签（如 tool_name, provider）
}

interface MetricSummary {
  name: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50?: number;
  p95?: number;
  p99?: number;
  labels?: Record<string, string>;
  windowStart: string;
  windowEnd: string;
}
```

**MetricsCollector 接口**：
```typescript
interface MetricsCollector {
  increment(name: string, labels?: Record<string, string>): void;
  gauge(name: string, value: number, labels?: Record<string, string>): void;
  histogram(name: string, value: number, labels?: Record<string, string>): void;
  timing(name: string, durationMs: number, labels?: Record<string, string>): void;
  getSummary(name: string, windowMinutes?: number): MetricSummary;
  getSnapshot(): Record<string, MetricSummary>; // 所有指标的当前快照
  exportPrometheus(): string;   // 导出 Prometheus 格式文本（P2 可用）
}
```

**技术要求**：
- 指标存储在内存中，不依赖外部数据库
- 滑动时间窗口：支持最近 1 分钟、5 分钟、1 小时、24 小时的统计
- 定期将指标快照持久化到 `workspace/metrics/metrics-{date}.jsonl`（每分钟一条）
- 内存中只保留最近 2 小时的原始数据点，防止内存无限增长
- 指标采集本身的开销 < 0.1ms（不影响主流程性能）

**验收标准**：
- 执行 10 次任务后，`task.success_rate` 准确反映实际成功率
- 工具调用次数和成功率统计准确（与日志比对）
- Token 消耗统计与 LLM API 返回的用量一致
- 指标快照文件正确持久化
- 单元测试覆盖率 > 80%

---

### 3.3 P2 可选功能（第三阶段，视资源决定）

#### 3.3.1 Web 仪表板增强 - 实时日志流

**功能描述**：
在现有 Web UI 基础上新增日志流面板，通过 SSE（Server-Sent Events）向前端推送实时日志，支持日志级别过滤和关键词搜索。

**核心能力**：
- SSE 端点 `GET /api/logs/stream?level=info&taskId=xxx`，持续推送新日志
- 日志面板支持：自动滚动到最新、暂停滚动、级别过滤、关键词高亮
- 历史日志查询：`GET /api/logs?taskId=xxx&startTime=&endTime=&limit=100`

**验收标准**：
- 浏览器端能实时接收并展示 Agent 执行日志
- 日志级别过滤生效
- 断开重连后能从断点续传日志

---

#### 3.3.2 Web 仪表板增强 - Trace 可视化

**功能描述**：
在 Web UI 中展示 Trace 的树形可视化，直观显示 MasterAgent → SubAgent → Tool 的调用层次和时序关系。

**核心能力**：
- `GET /api/traces/{traceId}` 返回完整 Trace 树
- 甘特图式时序视图：横轴为时间，纵轴为 Span 层级
- 点击 Span 查看详情（参数、返回值、错误信息）
- 高亮耗时最长的 Span（热点分析）

**验收标准**：
- Trace 树形结构正确展示
- 各 Span 的时间范围在甘特图上准确显示
- 耗时超过阈值的 Span 有视觉高亮标记

---

#### 3.3.3 Web 仪表板增强 - 指标图表

**功能描述**：
在现有 Web UI 的任务监控页面增加指标图表区域，展示关键性能指标的时序趋势。

**核心能力**：
- 任务成功率趋势图（折线图，最近 24 小时）
- 各工具调用次数分布图（柱状图）
- Token 消耗趋势图（累计/增量视图）
- 指标数据通过 `GET /api/metrics/snapshot` 接口获取

**验收标准**：
- 指标图表在任务执行时实时刷新
- 图表数据与后端指标 API 返回值一致

---

## 四、技术约束

### 4.1 语言与运行时

- **TypeScript**: 严格模式（`strict: true`），类型覆盖率 > 90%
- **Node.js**: v18 LTS 或以上（使用 `AsyncLocalStorage`、`crypto.randomUUID()`）
- **模块系统**: ESM（与 v5/v6 保持一致）

### 4.2 依赖约束

新增依赖必须满足：
- 维护活跃（近 6 个月有更新）
- 无已知高危安全漏洞
- MIT / Apache 2.0 / BSD 许可证

**v7 允许新增的依赖**：
```json
{
  "zlib": "内置模块，用于检查点压缩（无需安装）",
  "uuid": "已有依赖（v4 UUID 生成）"
}
```

**v7 不引入外部可观测性平台**：
- 不引入 OpenTelemetry SDK（v7 自研轻量实现，v8 可考虑对接）
- 不引入 Prometheus 客户端库（自行实现文本格式导出）
- 不引入 Jaeger / Zipkin（自行实现 Trace 存储）

### 4.3 向后兼容性

- v6 的所有公开接口（`WebSearchTool`、`ShellExecutorTool`、`ToolRegistry`、`ToolPipeline`）保持不变
- v5 的所有接口（`MasterAgent`、`SubAgent`、`AgentLoop`）保持不变
- v7 新增的观测能力以**中间件/插件**方式集成，不修改现有核心逻辑
- 现有工作空间结构新增 `logs/`、`traces/`、`checkpoints/`、`metrics/` 子目录，不影响已有目录

### 4.4 性能约束

- 日志写入不应使单次 Agent 执行延迟超过 5ms
- Span 记录（startSpan/endSpan）单次耗时 < 1ms
- 检查点保存不阻塞 Agent 执行（异步写入，不等待完成）
- 内存指标数据保留上限：2 小时的原始数据点，超出自动淘汰

---

## 五、数据格式规范

### 5.1 日志格式（Log Format）

所有日志条目必须符合以下 JSON Schema：

```json
{
  "timestamp": "2026-02-11T14:32:05.123Z",
  "level": "info",
  "module": "agent-loop",
  "event": "tool.called",
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "taskId": "task-20260211-001",
  "agentId": "agent-master-01",
  "message": "Executing tool web_search",
  "data": {
    "toolName": "web_search",
    "params": { "query": "TypeScript best practices", "limit": 10 }
  },
  "durationMs": 1823
}
```

**必填字段**：`timestamp`、`level`、`module`、`message`

**可选字段**：`event`、`traceId`、`taskId`、`agentId`、`data`、`durationMs`、`error`

**事件类型枚举（event 字段）**：
```
task.started         任务开始执行
task.completed       任务成功完成
task.failed          任务执行失败
agent.created        Agent 实例创建
agent.finished       Agent 执行完成
llm.requested        发起 LLM API 请求
llm.responded        LLM API 请求成功返回
llm.error            LLM API 请求失败
tool.called          工具调用开始
tool.succeeded       工具调用成功
tool.failed          工具调用失败
checkpoint.saved     检查点保存成功
workflow.recovering  工作流从检查点恢复
```

### 5.2 Trace 格式（Trace Format）

Trace 文件路径：`workspace/traces/{traceId}.json`

```json
{
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "taskId": "task-20260211-001",
  "startTime": "2026-02-11T14:32:00.000Z",
  "endTime": "2026-02-11T14:32:45.000Z",
  "totalDurationMs": 45000,
  "status": "success",
  "spans": [
    {
      "spanId": "span-001",
      "traceId": "550e8400-e29b-41d4-a716-446655440000",
      "parentSpanId": null,
      "name": "task:research-task",
      "kind": "task",
      "startTime": "2026-02-11T14:32:00.000Z",
      "endTime": "2026-02-11T14:32:45.000Z",
      "durationMs": 45000,
      "status": "success",
      "attributes": {
        "taskId": "task-20260211-001",
        "input": "Research TypeScript best practices"
      },
      "events": []
    },
    {
      "spanId": "span-002",
      "traceId": "550e8400-e29b-41d4-a716-446655440000",
      "parentSpanId": "span-001",
      "name": "tool:web_search",
      "kind": "tool",
      "startTime": "2026-02-11T14:32:05.000Z",
      "endTime": "2026-02-11T14:32:06.823Z",
      "durationMs": 1823,
      "status": "success",
      "attributes": {
        "toolName": "web_search",
        "params": { "query": "TypeScript best practices" },
        "resultCount": 10
      },
      "events": [
        {
          "time": "2026-02-11T14:32:05.100Z",
          "name": "cache.miss",
          "attributes": { "key": "web_search:TypeScript best practices" }
        }
      ]
    }
  ]
}
```

### 5.3 指标格式（Metrics Format）

指标快照文件路径：`workspace/metrics/metrics-{YYYY-MM-DD}.jsonl`（每行一条 JSON）

```json
{
  "snapshotTime": "2026-02-11T14:33:00.000Z",
  "metrics": {
    "task.total": { "value": 42, "labels": {} },
    "task.success_rate": { "value": 0.857, "labels": {}, "windowMinutes": 60 },
    "task.duration_p50": { "value": 32500, "labels": {}, "unit": "ms" },
    "task.duration_p95": { "value": 87200, "labels": {}, "unit": "ms" },
    "tool.call_count": { "value": 156, "labels": { "tool_name": "web_search" } },
    "tool.success_rate": { "value": 0.942, "labels": { "tool_name": "web_search" } },
    "tool.duration_avg": { "value": 1823, "labels": { "tool_name": "web_search" }, "unit": "ms" },
    "llm.token_input_total": { "value": 284500, "labels": {} },
    "llm.token_output_total": { "value": 96200, "labels": {} },
    "system.memory_mb": { "value": 387, "labels": {} }
  }
}
```

---

## 六、文件结构规划

```
src/
├── observability/                    # 可观测性模块（v7 新增）
│   ├── logger.ts                     # StructuredLogger 实现
│   ├── tracer.ts                     # TracingSystem 实现
│   ├── metrics.ts                    # MetricsCollector 实现
│   ├── context.ts                    # AsyncLocalStorage 上下文管理
│   └── index.ts                      # 统一导出
│
├── workflow/                         # 工作流模块（v7 新增）
│   ├── checkpointer.ts               # WorkflowCheckpointer 实现
│   ├── recovery.ts                   # 工作流恢复逻辑
│   └── index.ts                      # 统一导出
│
├── core/                             # 核心模块（v5/v6 继承，v7 插入观测钩子）
│   ├── agent-loop.ts                 # AgentLoop（添加 Trace/Log 钩子）
│   ├── master-agent.ts               # MasterAgent（添加 Checkpoint 支持）
│   └── sub-agent.ts                  # SubAgent（添加 Span 记录）
│
├── tools/                            # 工具系统（v6 继承，v7 添加指标）
│   └── tool-executor.ts              # ToolExecutor（添加 Metrics 记录）
│
├── server/                           # Web 服务器（v7 新增 SSE 端点）
│   ├── routes/
│   │   ├── logs.ts                   # GET /api/logs, GET /api/logs/stream
│   │   ├── traces.ts                 # GET /api/traces/:traceId
│   │   └── metrics.ts                # GET /api/metrics/snapshot
│   └── sse.ts                        # SSE 管理器
│
workspace/
├── logs/
│   ├── 2026-02-11.log                # 日志文件（JSON Lines 格式）
│   └── 2026-02-10.log
├── traces/
│   └── {traceId}.json                # 单次执行的完整 Trace 数据
├── checkpoints/
│   └── {workflowId}/
│       ├── checkpoint-001.json.gz    # 压缩的检查点文件
│       └── checkpoint-002.json.gz
└── metrics/
    └── metrics-2026-02-11.jsonl      # 每分钟一条的指标快照

tests/
└── observability/
    ├── logger.test.ts
    ├── tracer.test.ts
    ├── metrics.test.ts
    └── checkpointer.test.ts
```

---

## 七、里程碑计划

### Phase 1：日志与追踪基础（Week 1-2）

**目标**：建立可观测性数据采集的基础设施

**任务清单**：
- **任务 1**：StructuredLogger 实现（JSON 格式、日志级别、文件滚动）
- **任务 2**：AsyncLocalStorage 上下文管理（Trace/Task/Agent ID 自动传播）
- **任务 3**：TracingSystem 实现（Span 生命周期管理、树形结构构建）
- **任务 4**：在 AgentLoop、MasterAgent、SubAgent、ToolExecutor 中接入 Logger 和 Tracer

**验收标准**：
- 执行一次任务后，`workspace/logs/` 下有对应日期的日志文件
- 日志文件包含 task.started、tool.called、llm.requested 等关键事件
- `workspace/traces/{traceId}.json` 包含完整的调用树（含 parentSpanId 层级关系）
- 所有新增模块单元测试覆盖率 > 80%

---

### Phase 2：指标与检查点（Week 3-4）

**目标**：量化系统性能，实现工作流持久化恢复

**任务清单**：
- **任务 5**：MetricsCollector 实现（计数器、直方图、滑动窗口统计）
- **任务 6**：在工具执行、LLM 调用路径上接入指标采集
- **任务 7**：WorkflowCheckpointer 实现（原子写入、压缩存储、校验和）
- **任务 8**：MasterAgent 集成 Checkpointing（关键步骤自动保存、崩溃恢复流程）

**验收标准**：
- 执行 5 次任务后，指标快照包含准确的成功率、工具调用次数、Token 消耗
- 任务执行中途强制终止，重启后检测到未完成工作流
- 从检查点恢复后，已完成步骤不重新执行，最终结果与正常完成一致
- 所有新增模块单元测试覆盖率 > 80%

---

### Phase 3：Web 仪表板增强（Week 5-6，P2 可选）

**目标**：将可观测性数据通过 Web UI 可视化呈现

**任务清单**（P2，视资源决定）：
- **任务 9（P2）**：日志流 SSE 端点 + Web UI 日志面板
- **任务 10（P2）**：Trace 查询 API + Web UI 甘特图可视化

**验收标准**：
- 浏览器端实时展示 Agent 执行日志
- Trace 甘特图正确展示调用层级和时序关系

---

## 八、验收标准汇总

| 功能 | 优先级 | 关键验收标准 |
|------|--------|------------|
| StructuredLogger | P0 | JSON 日志输出；日志级别过滤；文件按日期滚动；关键事件覆盖 |
| TracingSystem | P0 | 唯一 Trace ID；调用树层级正确；Span 耗时准确；数据持久化 |
| MetricsCollector | P1 | 成功率准确；Token 统计与 LLM 返回一致；快照持久化 |
| WorkflowCheckpointing | P1 | 崩溃检测；检查点恢复不重复执行；原子写入无损坏文件 |
| 日志流 SSE（Web UI） | P2 | 实时推送；级别过滤；断点续传 |
| Trace 可视化（Web UI） | P2 | 甘特图展示；点击查看 Span 详情；热点高亮 |
| 指标图表（Web UI） | P2 | 图表实时刷新；数据与 API 一致 |

---

## 九、风险与依赖

### 9.1 技术风险

1. **AsyncLocalStorage 兼容性**：Node.js v16+ 才稳定支持
   - 缓解措施：v7 要求 Node.js v18+，与 v6 技术约束一致

2. **检查点数据一致性**：Agent 执行到一半，内存状态复杂，难以完整序列化
   - 缓解措施：只序列化"已完成步骤的输出结果"，不尝试序列化 LLM 对话历史和工具调用中间状态；恢复时从已知良好状态重新开始未完成的步骤

3. **日志性能**：高频日志写入可能成为 I/O 瓶颈
   - 缓解措施：使用写入缓冲区（batch flush），不每次日志都立即 fsync；控制 debug 级别日志的写入量

4. **Trace 文件体积**：长时间任务的 Span 数量可能很多
   - 缓解措施：单个 Span 的 attributes 字段限制大小（最大 1KB）；长任务的 Span 数超过 1000 时停止记录新 Span（只记录 Task/Agent 级别）

### 9.2 暂不实现的功能

以下功能在 v7.0 中**不实现**：

1. OpenTelemetry 标准协议对接（v8 考虑）
2. 分布式 Tracing（多进程/多机器场景）
3. 告警规则和告警通知（阈值触发 Webhook/邮件）
4. Trace/Log 数据的外部存储（ElasticSearch、ClickHouse 等）
5. 指标的 Prometheus Scrape 端点（P2 可作为预留接口）
6. 完整的 APM 仪表板（v7 只做基础增强）

---

## 十、成功标准

### 10.1 功能标准

1. 任意一次 Agent 任务执行后，开发者能在 `workspace/logs/` 找到对应的结构化日志
2. 开发者能通过 `workspace/traces/{traceId}.json` 重建完整的调用链路
3. 系统运行 1 小时后，能通过 Metrics API 查询到准确的任务成功率和 Token 消耗
4. 长时间运行的工作流在进程崩溃后，能从最近检查点恢复而不从头执行

### 10.2 质量标准

1. 所有新增模块单元测试覆盖率 > 80%
2. 可观测性组件的引入使现有任务执行时间增加 < 5%（性能回归测试验证）
3. 代码符合 TypeScript 严格模式，无 `any` 类型滥用
4. 所有文件写入操作有错误处理，写入失败不中断 Agent 执行

### 10.3 体验标准

1. 日志格式对人类友好（development 模式下有彩色美化输出）
2. Trace 文件结构清晰，开发者无需文档即可理解字段含义
3. 工作流恢复时有明确的用户提示（恢复了哪个工作流、从第几步恢复）

---

**文档结束**
