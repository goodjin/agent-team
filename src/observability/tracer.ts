import { randomUUID } from 'crypto';
import { createWriteStream, mkdirSync, WriteStream } from 'fs';
import { join } from 'path';
import { traceContextStorage, getTraceContext } from './context.js';
import type { Span, SpanKind, SpanStatus, TraceContext } from './types.js';

export type { Span, SpanKind, SpanStatus, TraceContext };

export interface SpanNode extends Span {
  children: SpanNode[];
}

export interface TraceTree {
  traceId: string;
  taskId: string;
  startTime: string;
  endTime?: string;
  totalDurationMs?: number;
  status: 'running' | 'success' | 'error';
  spans: Span[];
  rootSpan: SpanNode;
}

export class TracingSystem {
  private static _instance: TracingSystem | undefined;

  private activeSpans = new Map<string, Span>();
  private activeTraces = new Map<string, Span[]>();
  private traceStreams = new Map<string, WriteStream>();
  private readonly tracesDir: string;

  constructor(tracesDir?: string) {
    this.tracesDir = tracesDir ?? 'workspace/traces';
    mkdirSync(this.tracesDir, { recursive: true });
  }

  static getInstance(): TracingSystem {
    if (!TracingSystem._instance) {
      TracingSystem._instance = new TracingSystem();
    }
    return TracingSystem._instance;
  }

  /**
   * Start a new trace. Returns a TraceContext that must be used with runInContext().
   */
  startTrace(name: string, metadata?: Record<string, unknown>): TraceContext {
    const traceId = randomUUID();
    this.activeTraces.set(traceId, []);

    const filePath = join(this.tracesDir, `${traceId}.json`);
    const stream = createWriteStream(filePath, { flags: 'w' });
    // Suppress ENOENT errors that can occur when trace dir is deleted in tests
    stream.on('error', () => {});
    this.traceStreams.set(traceId, stream);

    const ctx: TraceContext = { traceId, taskId: (metadata?.taskId as string) ?? name };
    return ctx;
  }

  /**
   * Start a span inside the current AsyncLocalStorage context.
   * Returns the spanId.
   */
  startSpan(name: string, metadata?: Record<string, unknown>): string {
    const ctx = getTraceContext();
    if (!ctx?.traceId) {
      throw new Error('No active trace context. Call startTrace() and runInContext() first.');
    }

    const span: Span = {
      spanId: randomUUID(),
      traceId: ctx.traceId,
      parentSpanId: ctx.currentSpanId,
      name,
      kind: (metadata?.kind as SpanKind) ?? 'task',
      startTime: new Date().toISOString(),
      status: 'running',
      attributes: metadata ?? {},
      events: [],
    };

    this.activeSpans.set(span.spanId, span);
    this.activeTraces.get(ctx.traceId)?.push(span);

    return span.spanId;
  }

  /**
   * End a span by spanId.
   */
  endSpan(
    spanId: string,
    status: 'completed' | 'error' = 'completed',
    metadata?: Record<string, unknown>
  ): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.endTime = new Date().toISOString();
    span.durationMs = Date.now() - new Date(span.startTime).getTime();
    span.status = status === 'completed' ? 'success' : 'error';

    if (metadata) {
      Object.assign(span.attributes, metadata);
    }

    if (metadata?.error instanceof Error) {
      span.error = {
        name: (metadata.error as Error).name,
        message: (metadata.error as Error).message,
      };
    }

    this.activeSpans.delete(spanId);
    this.writeSpan(span);
  }

  /**
   * Add an event to an active span.
   */
  addSpanEvent(
    spanId: string,
    eventName: string,
    attrs?: Record<string, unknown>
  ): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;
    span.events.push({
      time: new Date().toISOString(),
      name: eventName,
      attributes: attrs,
    });
  }

  /**
   * Get current TraceContext from AsyncLocalStorage.
   */
  getCurrentContext(): TraceContext | undefined {
    return getTraceContext();
  }

  /**
   * Run a function inside a given TraceContext.
   */
  runInContext<T>(context: TraceContext, fn: () => T): T {
    return traceContextStorage.run(context, fn);
  }

  /**
   * Run an async function inside a span. The span is automatically started
   * and ended; child operations inherit an updated context.
   */
  async withSpan<T>(
    name: string,
    kind: SpanKind,
    fn: () => Promise<T>
  ): Promise<T> {
    const ctx = getTraceContext();
    if (!ctx) throw new Error('No active trace context');

    const spanId = this.startSpan(name, { kind });
    const newCtx: TraceContext = { ...ctx, currentSpanId: spanId };

    return traceContextStorage.run(newCtx, async () => {
      try {
        const result = await fn();
        this.endSpan(spanId, 'completed');
        return result;
      } catch (err) {
        this.endSpan(spanId, 'error', { error: err });
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

    const rootSpan = spans.find((s) => !s.parentSpanId);
    if (!rootSpan) return null;

    return {
      traceId,
      taskId: (rootSpan.attributes.taskId as string) ?? '',
      startTime: rootSpan.startTime,
      endTime: rootSpan.endTime,
      totalDurationMs: rootSpan.durationMs,
      status: rootSpan.status as 'running' | 'success' | 'error',
      spans,
      rootSpan: this.buildTree(rootSpan, spans),
    };
  }

  async flushTrace(traceId: string): Promise<void> {
    const trace = this.getTrace(traceId);
    const stream = this.traceStreams.get(traceId);
    if (trace && stream) {
      await new Promise<void>((resolve) => {
        stream.write(JSON.stringify(trace, null, 2), () => {
          stream.end(resolve);
        });
      });
    } else {
      stream?.end();
    }
    this.traceStreams.delete(traceId);
    this.activeTraces.delete(traceId);
  }

  /** Alias for flushTrace (task-doc naming) */
  async finalizeTrace(traceId: string): Promise<void> {
    return this.flushTrace(traceId);
  }

  close(): void {
    for (const [, stream] of this.traceStreams) {
      stream.end();
    }
    this.traceStreams.clear();
    this.activeSpans.clear();
    this.activeTraces.clear();
  }

  private writeSpan(span: Span): void {
    const stream = this.traceStreams.get(span.traceId);
    if (stream) {
      stream.write(JSON.stringify(span) + '\n');
    }
  }

  private buildTree(node: Span, allSpans: Span[]): SpanNode {
    const children = allSpans
      .filter((s) => s.parentSpanId === node.spanId)
      .map((child) => this.buildTree(child, allSpans));
    return { ...node, children };
  }
}

// Backward-compat alias
export { TracingSystem as Tracer };
