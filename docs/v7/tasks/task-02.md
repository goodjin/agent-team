# Task 02：TracingSystem（执行追踪系统）

**优先级**: P0
**预估工时**: 5h
**依赖**: Task 1（types.ts, context.ts）
**阶段**: Phase 1

---

## 目标

实现基于 AsyncLocalStorage 的分布式执行追踪系统。为每次任务执行生成唯一 Trace ID，通过 Span 记录完整的 Master Agent → Sub Agent → Tool 调用树，并持久化到文件。

---

## 输入文件

- `docs/v7/01-requirements.md` - 第 3.1.2 节（TracingSystem 需求）
- `docs/v7/02-architecture.md` - TracingSystem 架构设计
- `src/observability/types.ts` - Span, TraceContext 类型（Task 1 输出）
- `src/observability/context.ts` - AsyncLocalStorage 管理（Task 1 输出）

---

## 输出文件

| 文件 | 说明 |
|------|------|
| `src/observability/tracer.ts` | TracingSystem 主体实现 |
| `tests/observability/tracer.test.ts` | 单元测试 |

---

## 实现步骤

### 步骤 1：设计 Tracer 核心接口

```typescript
interface TracerInterface {
  startTrace(taskId: string): string;              // 返回 traceId
  startSpan(name: string, kind: SpanKind): Span;   // 从当前上下文获取 parentSpanId
  endSpan(spanId: string, status: SpanStatus, error?: Error): void;
  addSpanEvent(spanId: string, eventName: string, attrs?: Record<string, any>): void;
  withSpan<T>(name: string, kind: SpanKind, fn: () => Promise<T>): Promise<T>;
  getCurrentSpan(): Span | null;
  getTrace(traceId: string): TraceTree | null;
}

interface TraceTree {
  traceId: string;
  taskId: string;
  startTime: string;
  endTime?: string;
  totalDurationMs?: number;
  status: 'running' | 'success' | 'error';
  spans: Span[];      // 所有 Span 的平铺列表
  rootSpan: SpanNode; // 树形结构（用于展示）
}

interface SpanNode extends Span {
  children: SpanNode[];
}
```

### 步骤 2：实现 Tracer `src/observability/tracer.ts`

```typescript
import { randomUUID } from 'crypto';
import { createWriteStream, mkdirSync, WriteStream } from 'fs';
import { join } from 'path';
import { traceContextStorage, getTraceContext } from './context.js';
import type { Span, SpanKind, SpanStatus, TraceContext } from './types.js';

export class Tracer {
  private static instance: Tracer;
  private activeSpans = new Map<string, Span>();          // spanId → Span
  private activeTraces = new Map<string, Span[]>();       // traceId → spans[]
  private traceStreams = new Map<string, WriteStream>();   // traceId → file stream
  private readonly tracesDir: string;

  private constructor(tracesDir = 'workspace/traces') {
    this.tracesDir = tracesDir;
    mkdirSync(tracesDir, { recursive: true });
  }

  static getInstance(): Tracer {
    if (!Tracer.instance) {
      Tracer.instance = new Tracer();
    }
    return Tracer.instance;
  }

  startTrace(taskId: string): string {
    const traceId = randomUUID();
    this.activeTraces.set(traceId, []);

    // 创建 trace 文件（追加模式）
    const filePath = join(this.tracesDir, `${traceId}.json`);
    this.traceStreams.set(traceId, createWriteStream(filePath, { flags: 'w' }));

    return traceId;
  }

  startSpan(name: string, kind: SpanKind): Span {
    const ctx = getTraceContext();
    if (!ctx?.traceId) throw new Error('No active trace context. Call startTrace() first.');

    const span: Span = {
      spanId: randomUUID(),
      traceId: ctx.traceId,
      parentSpanId: ctx.currentSpanId,
      name,
      kind,
      startTime: new Date().toISOString(),
      status: 'running',
      attributes: {},
      events: [],
    };

    this.activeSpans.set(span.spanId, span);
    this.activeTraces.get(ctx.traceId)?.push(span);

    return span;
  }

  endSpan(spanId: string, status: SpanStatus, error?: Error): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    const endTime = new Date().toISOString();
    span.endTime = endTime;
    span.durationMs = Date.now() - new Date(span.startTime).getTime();
    span.status = status;
    if (error) {
      span.error = { name: error.name, message: error.message };
    }

    this.activeSpans.delete(spanId);

    // 实时写入 Span 数据
    this.writeSpan(span);
  }

  addSpanEvent(spanId: string, eventName: string, attrs?: Record<string, any>): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;
    span.events.push({
      time: new Date().toISOString(),
      name: eventName,
      attributes: attrs,
    });
  }

  async withSpan<T>(
    name: string,
    kind: SpanKind,
    fn: () => Promise<T>
  ): Promise<T> {
    const ctx = getTraceContext();
    if (!ctx) throw new Error('No active trace context');

    const span = this.startSpan(name, kind);

    // 更新上下文中的当前 spanId
    const newCtx: TraceContext = { ...ctx, currentSpanId: span.spanId };

    return traceContextStorage.run(newCtx, async () => {
      try {
        const result = await fn();
        this.endSpan(span.spanId, 'success');
        return result;
      } catch (err) {
        this.endSpan(span.spanId, 'error', err as Error);
        throw err;
      }
    });
  }

  getCurrentSpan(): Span | null {
    const ctx = getTraceContext();
    if (!ctx?.currentSpanId) return null;
    return this.activeSpans.get(ctx.currentSpanId) ?? null;
  }

  getTrace(traceId: string): TraceTree | null {
    const spans = this.activeTraces.get(traceId);
    if (!spans || spans.length === 0) return null;

    const rootSpan = spans.find(s => !s.parentSpanId);
    if (!rootSpan) return null;

    return {
      traceId,
      taskId: rootSpan.attributes.taskId ?? '',
      startTime: rootSpan.startTime,
      endTime: rootSpan.endTime,
      totalDurationMs: rootSpan.durationMs,
      status: rootSpan.status as any,
      spans,
      rootSpan: this.buildTree(rootSpan, spans),
    };
  }

  async finalizeTrace(traceId: string): Promise<void> {
    const trace = this.getTrace(traceId);
    const stream = this.traceStreams.get(traceId);
    if (trace && stream) {
      await new Promise<void>((resolve) => {
        stream.write(JSON.stringify(trace, null, 2), () => {
          stream.end(resolve);
        });
      });
    }
    this.traceStreams.delete(traceId);
    this.activeTraces.delete(traceId);
  }

  private writeSpan(span: Span): void {
    // 实时追加（增量写入，完成时覆盖为完整树）
    const stream = this.traceStreams.get(span.traceId);
    if (stream) {
      stream.write(JSON.stringify(span) + '\n');
    }
  }

  private buildTree(node: Span, allSpans: Span[]): SpanNode {
    const children = allSpans
      .filter(s => s.parentSpanId === node.spanId)
      .map(child => this.buildTree(child, allSpans));
    return { ...node, children };
  }
}
```

### 步骤 3：集成到应用入口

```typescript
// 使用示例（middleware.ts 中自动调用）
const tracer = Tracer.getInstance();
const traceId = tracer.startTrace(taskId);

runWithContext({ traceId, taskId }, async () => {
  await tracer.withSpan('task:execute', 'task', async () => {
    // 所有异步调用自动继承上下文
    await tracer.withSpan('tool:web_search', 'tool', async () => {
      // 工具执行
    });
  });
  await tracer.finalizeTrace(traceId);
});
```

---

## 验收标准

- [ ] `startTrace(taskId)` 返回格式正确的 UUID v4
- [ ] `withSpan()` 嵌套调用时，内层 Span 的 `parentSpanId` 等于外层 Span 的 `spanId`
- [ ] `endSpan()` 后 `durationMs` 计算正确（误差 < 10ms）
- [ ] 任务完成后 `workspace/traces/{traceId}.json` 文件存在且内容合法
- [ ] Trace 树形结构正确：rootSpan.children 包含所有子 Span
- [ ] 无活跃 Trace 时 `getCurrentSpan()` 返回 null（不抛异常）
- [ ] 单元测试覆盖率 > 80%
- [ ] TypeScript 编译无错误（strict 模式）
