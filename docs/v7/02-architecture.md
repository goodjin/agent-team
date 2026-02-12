# Agent Team v7.0 架构设计

**版本**: 7.0.0
**日期**: 2026-02-11
**状态**: 设计完成，待实现

---

## 分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        可观测性层（Observability Layer）           │
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │StructuredLog│  │TracingSystem│  │MetricsCollec│             │
│  │   ger.ts    │  │   r.ts      │  │   tor.ts    │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                 │                     │
│         └────────────────┼─────────────────┘                    │
│                          │                                       │
│              ┌───────────┴───────────┐                          │
│              │  ObservabilityMiddlew │                          │
│              │      are.ts           │                          │
│              │  (零侵入事件监听)      │                          │
│              └───────────┬───────────┘                          │
└──────────────────────────┼──────────────────────────────────────┘
                           │ EventEmitter 事件订阅
┌──────────────────────────┼──────────────────────────────────────┐
│                    Agent 执行层（Core Layer）                     │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    AgentLoop (EventEmitter)               │   │
│  │  emit: task.start / tool.call / llm.request / task.end   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                         ↑                    ↑                   │
│             ┌───────────┘                    └──────────────┐   │
│  ┌──────────┴──────────┐              ┌──────────────────────┐  │
│  │   MasterAgent.ts    │              │   ToolExecutor.ts    │  │
│  │  + checkpoint hook  │              │  + metrics hook      │  │
│  └─────────────────────┘              └──────────────────────┘  │
│             ↓                                                     │
│  ┌──────────────────────┐                                        │
│  │    SubAgent.ts       │                                        │
│  │  + span tracking     │                                        │
│  └──────────────────────┘                                        │
└──────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                   持久化层（Persistence Layer）                    │
│                                                                   │
│  workspace/                                                       │
│  ├── logs/YYYY-MM-DD.log          (JSONL, 按日滚动)              │
│  ├── traces/{traceId}.json        (完整调用树)                   │
│  ├── checkpoints/{wfId}/          (gzip压缩检查点)               │
│  └── metrics/metrics-{date}.jsonl (每分钟快照)                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 核心模块

### StructuredLogger（结构化日志）

**文件**：`src/observability/logger.ts`

**设计原则**：
- 单例模式，全局可用，通过 `getLogger(module)` 获取子 logger
- 日志级别：debug / info / warn / error，运行时可动态调整
- 输出：控制台（开发模式彩色美化） + 文件（JSONL 格式）
- 文件路径：`workspace/logs/YYYY-MM-DD.log`
- 异步写入缓冲区，批量 flush，不阻塞主线程
- 文件超过 100MB 或跨日期时自动滚动
- 自动清理 30 天前的旧日志文件

**核心接口**：
```typescript
interface LogEntry {
  timestamp: string;           // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error';
  module: string;              // 产生日志的模块名
  event?: string;              // 事件类型（task.started, tool.called 等）
  traceId?: string;            // 关联 Trace ID（AsyncLocalStorage 自动注入）
  taskId?: string;
  agentId?: string;
  message: string;
  data?: Record<string, any>;
  durationMs?: number;
  error?: { name: string; message: string; stack?: string };
}

interface StructuredLogger {
  debug(message: string, data?: Record<string, any>): void;
  info(message: string, data?: Record<string, any>): void;
  warn(message: string, data?: Record<string, any>): void;
  error(message: string, error?: Error, data?: Record<string, any>): void;
  child(context: Partial<LogEntry>): StructuredLogger;
  setLevel(level: LogLevel): void;
  flush(): Promise<void>;      // 强制刷新缓冲区到文件
}
```

**关键实现细节**：
- 写入缓冲区：积累 100 条或每隔 1 秒批量写入
- 文件写入使用 `fs.createWriteStream` append 模式
- 上下文字段（traceId、taskId）从 AsyncLocalStorage 自动读取，无需调用方传入

---

### TracingSystem（执行追踪）

**文件**：`src/observability/tracer.ts`

**设计原则**：
- 使用 `AsyncLocalStorage<TraceContext>` 自动传播当前 Span 上下文
- 每次任务执行生成全局唯一 traceId（`crypto.randomUUID()`）
- Span 在 endSpan 时实时追加写入 trace 文件，不等任务结束再批量写
- 内存只保留活跃 Trace 的 Span，任务完成后释放

**核心接口**：
```typescript
interface Span {
  spanId: string;
  traceId: string;
  parentSpanId?: string;       // 通过 AsyncLocalStorage 自动获取
  name: string;                // 如 "tool:web_search", "llm:claude"
  kind: 'task' | 'agent' | 'llm' | 'tool' | 'pipeline';
  startTime: string;
  endTime?: string;
  durationMs?: number;
  status: 'running' | 'success' | 'error';
  attributes: Record<string, any>;
  events: SpanEvent[];
  error?: { name: string; message: string };
}

interface Tracer {
  startTrace(taskId: string): string;               // 返回 traceId
  startSpan(name: string, kind: SpanKind): Span;
  endSpan(spanId: string, status: SpanStatus, error?: Error): void;
  withSpan<T>(span: Span, fn: () => Promise<T>): Promise<T>;  // 自动管理上下文
  getCurrentSpan(): Span | null;
  getTrace(traceId: string): TraceTree | null;
}
```

**文件存储**：
- 路径：`workspace/traces/{traceId}.json`
- Span 完成时追加写入（增量），任务完成时写入完整树结构

**AsyncLocalStorage 传播链**：
```
startTrace() → store.run({ traceId, spanId }) →
  startSpan() 读取父 spanId → 新 Span 存入 store →
    工具调用 → startSpan() 自动继承父 spanId
```

---

### MetricsCollector（指标采集）

**文件**：`src/observability/metrics.ts`

**设计原则**：
- 纯内存存储，不依赖外部数据库
- 三种指标类型：Counter（计数器）、Histogram（直方图）、Gauge（仪表盘）
- 滑动时间窗口：支持 1min / 5min / 1h / 24h 统计
- 内存中只保留最近 2 小时原始数据点，超出自动淘汰
- 每分钟将快照持久化到 `workspace/metrics/metrics-{date}.jsonl`
- 单次采集操作开销 < 0.1ms

**核心接口**：
```typescript
interface MetricsCollector {
  increment(name: string, labels?: Record<string, string>, value?: number): void;
  gauge(name: string, value: number, labels?: Record<string, string>): void;
  histogram(name: string, value: number, labels?: Record<string, string>): void;
  timing(name: string, durationMs: number, labels?: Record<string, string>): void;
  getSummary(name: string, windowMinutes?: number): MetricSummary;
  getSnapshot(): Record<string, MetricSummary>;
  exportPrometheus(): string;   // 预留接口
}
```

**关键指标**：
```
task.total, task.success_rate, task.duration_p50/p95/p99
tool.call_count[tool_name], tool.success_rate[tool_name]
llm.token_input_total, llm.token_output_total, llm.request_count[provider]
system.memory_mb, system.uptime_seconds
```

---

### WorkflowCheckpoint（工作流检查点）

**文件**：`src/observability/checkpoint.ts`

**设计原则**：
- 状态机：`pending → running → completed / failed`，支持 `paused / recovering`
- 检查点只序列化"已完成步骤输出"，不序列化内存状态
- 原子写入：先写 `{name}.tmp`，再 `rename` 为正式文件（防止半写损坏）
- 文件压缩：JSON + gzip，减少磁盘占用
- 每个工作流最多保留最近 10 个检查点
- 恢复时用 SHA256 校验和验证文件完整性

**核心接口**：
```typescript
interface WorkflowCheckpointer {
  createWorkflow(taskInput: Record<string, any>): string;  // 返回 workflowId
  saveCheckpoint(workflowId: string, state: Partial<WorkflowCheckpoint>): Promise<void>;
  loadLatestCheckpoint(workflowId: string): Promise<WorkflowCheckpoint | null>;
  listIncompleteWorkflows(): Promise<WorkflowSummary[]>;
  markCompleted(workflowId: string): Promise<void>;
  markFailed(workflowId: string, reason: string): Promise<void>;
}
```

**文件路径规范**：
```
workspace/checkpoints/{workflowId}/
  ├── checkpoint-001.json.gz
  ├── checkpoint-002.json.gz
  └── checkpoint-003.json.gz   ← 最新
```

**原子写入流程**：
```typescript
// 1. 序列化 + gzip 压缩
const data = await gzip(JSON.stringify(state));
// 2. 写入临时文件
await fs.writeFile(`${path}.tmp`, data);
// 3. 原子重命名（POSIX 保证原子性）
await fs.rename(`${path}.tmp`, path);
// 4. 清理旧检查点（保留最近 10 个）
await this.pruneOldCheckpoints(workflowId);
```

---

### ObservabilityMiddleware（零侵入集成）

**文件**：`src/observability/middleware.ts`

**设计原则**：
- 完全不修改 AgentLoop、MasterAgent、SubAgent、ToolExecutor 核心代码
- 通过 EventEmitter 事件监听自动记录所有执行事件
- 监听已有事件：`task:start`、`task:end`、`tool:call`、`llm:request` 等
- 降级安全：监听器内部异常不传播，不影响 Agent 执行

**集成方式**：
```typescript
// 使用侧：只需在应用入口调用一次
import { createObservabilityMiddleware } from './observability/middleware.js';

const agentLoop = new AgentLoop(llmService, toolExecutor);
createObservabilityMiddleware(agentLoop, {
  logger: true,
  tracing: true,
  metrics: true,
});

// middleware.ts 内部实现
export function createObservabilityMiddleware(loop: AgentLoop, opts) {
  const logger = Logger.getInstance();
  const tracer = Tracer.getInstance();
  const metrics = MetricsCollector.getInstance();

  loop.on('task:start', (task) => {
    try {
      const traceId = tracer.startTrace(task.id);
      logger.info('task.started', { event: 'task.started', taskId: task.id, traceId });
      metrics.increment('task.total');
    } catch { /* 降级：忽略错误 */ }
  });

  loop.on('tool:call', ({ toolName, params, spanId }) => {
    try {
      tracer.startSpan(`tool:${toolName}`, 'tool');
      logger.info('tool.called', { event: 'tool.called', data: { toolName, params } });
      metrics.increment('tool.call_count', { tool_name: toolName });
    } catch { /* 降级 */ }
  });

  // ... 其他事件
}
```

---

## TypeScript 接口汇总

### 核心类型文件

**文件**：`src/observability/types.ts`

```typescript
// === 日志相关 ===
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  event?: string;
  traceId?: string;
  taskId?: string;
  agentId?: string;
  message: string;
  data?: Record<string, any>;
  durationMs?: number;
  error?: { name: string; message: string; stack?: string };
}

// === Trace 相关 ===
export type SpanKind = 'task' | 'agent' | 'llm' | 'tool' | 'pipeline';
export type SpanStatus = 'running' | 'success' | 'error';

export interface Span {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  status: SpanStatus;
  attributes: Record<string, any>;
  events: Array<{ time: string; name: string; attributes?: Record<string, any> }>;
  error?: { name: string; message: string };
}

export interface TraceContext {
  traceId: string;
  currentSpanId?: string;
  taskId?: string;
  agentId?: string;
}

// === 指标相关 ===
export interface MetricPoint {
  name: string;
  value: number;
  timestamp: string;
  labels?: Record<string, string>;
}

export interface MetricSummary {
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

// === 检查点相关 ===
export type WorkflowStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'recovering';

export interface WorkflowCheckpoint {
  workflowId: string;
  checkpointSeq: number;
  createdAt: string;
  status: WorkflowStatus;
  checksum: string;            // SHA256 完整性校验
  taskInput: Record<string, any>;
  completedSteps: CompletedStep[];
  pendingSteps: PendingStep[];
  metadata: {
    totalSteps: number;
    completedCount: number;
    traceId: string;
    lastActiveAt: string;
  };
}

export interface CompletedStep {
  stepId: string;
  agentId: string;
  completedAt: string;
  output: any;
  durationMs: number;
}

export interface PendingStep {
  stepId: string;
  description: string;
  dependsOn: string[];
}
```

---

## 模块目录结构

```
src/
└── observability/             # v7 新增
    ├── types.ts               # 所有 TypeScript 接口和类型定义
    ├── context.ts             # AsyncLocalStorage 上下文管理（TraceContext）
    ├── logger.ts              # StructuredLogger 实现
    ├── tracer.ts              # TracingSystem 实现
    ├── metrics.ts             # MetricsCollector 实现
    ├── checkpoint.ts          # WorkflowCheckpointer 实现
    ├── middleware.ts          # ObservabilityMiddleware（零侵入集成）
    └── index.ts               # 统一导出

tests/
└── observability/
    ├── logger.test.ts
    ├── tracer.test.ts
    ├── metrics.test.ts
    └── checkpoint.test.ts
```

---

## 集成方式（零侵入）

### AgentLoop 事件监听

AgentLoop 已继承 EventEmitter，现有代码已有事件发射。middleware.ts 通过监听这些事件完成集成：

```typescript
// AgentLoop 已有（不修改）：
this.emit('task:start', { id, title, ... });
this.emit('tool:call', { toolName, params, ... });
this.emit('llm:request', { prompt, ... });
this.emit('task:end', { success, result, ... });

// middleware.ts 订阅（新增，不修改 AgentLoop）：
agentLoop.on('task:start', handler);
agentLoop.on('tool:call', handler);
agentLoop.on('llm:request', handler);
agentLoop.on('task:end', handler);
```

### AsyncLocalStorage 上下文传播

```
应用入口 startTrace(taskId)
  └─ store.run({ traceId, spanId: rootSpanId })
       └─ AgentLoop.run()
            └─ ToolExecutor.execute()  ← store.getStore() 自动获取 traceId
                 └─ 工具内部调用      ← 无需传参，自动继承
```

### 降级策略

所有可观测性操作包裹在 `try-catch` 中，失败只记录内部警告，不抛出异常：

```typescript
// 确保任何可观测性异常都不会破坏业务执行
agentLoop.on('task:start', (task) => {
  try {
    // ... 记录日志、启动 trace
  } catch (err) {
    process.stderr.write(`[Observability] Error: ${err.message}\n`);
  }
});
```

---

## 关键架构决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 集成方式 | EventEmitter 事件监听 | 零侵入，不修改现有代码 |
| 上下文传播 | AsyncLocalStorage | 无需手动传参，自动跨异步边界传播 |
| 日志库 | 自研轻量实现 | 避免 winston/pino 等重量级依赖 |
| Trace 存储 | 本地 JSON 文件 | 无需外部服务，符合 PRD 约束 |
| 检查点压缩 | Node.js 内置 zlib | 无需新增依赖，减少磁盘占用 |
| 原子写入 | tmp 文件 + rename | POSIX 保证原子性，防止文件损坏 |
| 内存管理 | 2小时滑动窗口淘汰 | 防止指标数据无限增长 |
| 单例模式 | Logger/Tracer/Metrics 均为单例 | 全局统一实例，简化集成 |

---

**文档结束**
