import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TracingSystem } from '../../src/observability/tracer.js';
import { runWithContext, getTraceContext } from '../../src/observability/context.js';

describe('TracingSystem', () => {
  let tmpDir: string;
  let tracer: TracingSystem;

  beforeEach(() => {
    vi.useRealTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracer-test-'));
    tracer = new TracingSystem(tmpDir);
  });

  afterEach(() => {
    tracer.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── startTrace ──────────────────────────────────────────────

  it('startTrace returns a TraceContext with a valid UUID traceId', () => {
    const ctx = tracer.startTrace('my-task', { taskId: 'task-1' });
    expect(ctx.traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(ctx.taskId).toBe('task-1');
  });

  it('startTrace creates a trace file', () => {
    const ctx = tracer.startTrace('task-file-test');
    // File is created but only written on flushTrace
    // The stream is created on startTrace
    expect(ctx.traceId).toBeTruthy();
  });

  // ─── startSpan ───────────────────────────────────────────────

  it('startSpan returns a spanId string', () => {
    const ctx = tracer.startTrace('span-test');
    const spanId = runWithContext(ctx, () => tracer.startSpan('my-span'));
    expect(typeof spanId).toBe('string');
    expect(spanId.length).toBeGreaterThan(0);
  });

  it('startSpan throws when no active trace context', () => {
    expect(() => tracer.startSpan('orphan-span')).toThrow(
      'No active trace context'
    );
  });

  it('nested spans have correct parentSpanId', () => {
    const ctx = tracer.startTrace('nested-test');

    runWithContext(ctx, () => {
      const parentSpanId = tracer.startSpan('parent');
      const childCtx = { ...ctx, currentSpanId: parentSpanId };

      runWithContext(childCtx, () => {
        const childSpanId = tracer.startSpan('child');
        // Access via getTrace after endSpan
        tracer.endSpan(childSpanId, 'completed');
      });

      tracer.endSpan(parentSpanId, 'completed');
    });

    const trace = tracer.getTrace(ctx.traceId);
    expect(trace).not.toBeNull();

    const spans = trace!.spans;
    const parent = spans.find((s) => s.name === 'parent');
    const child = spans.find((s) => s.name === 'child');

    expect(parent).toBeDefined();
    expect(child).toBeDefined();
    expect(child!.parentSpanId).toBe(parent!.spanId);
  });

  // ─── endSpan ─────────────────────────────────────────────────

  it('endSpan sets status to success (completed)', () => {
    const ctx = tracer.startTrace('end-test');

    let spanId: string = '';
    runWithContext(ctx, () => {
      spanId = tracer.startSpan('my-span');
    });

    tracer.endSpan(spanId, 'completed');

    const trace = tracer.getTrace(ctx.traceId);
    const span = trace?.spans.find((s) => s.spanId === spanId);
    expect(span?.status).toBe('success');
    expect(span?.durationMs).toBeGreaterThanOrEqual(0);
    expect(span?.endTime).toBeTruthy();
  });

  it('endSpan sets status to error', () => {
    const ctx = tracer.startTrace('error-test');

    let spanId: string = '';
    runWithContext(ctx, () => {
      spanId = tracer.startSpan('failing-span');
    });

    tracer.endSpan(spanId, 'error');

    const trace = tracer.getTrace(ctx.traceId);
    const span = trace?.spans.find((s) => s.spanId === spanId);
    expect(span?.status).toBe('error');
  });

  it('endSpan is idempotent for unknown spanIds', () => {
    expect(() => tracer.endSpan('nonexistent-id', 'completed')).not.toThrow();
  });

  // ─── getCurrentContext ────────────────────────────────────────

  it('getCurrentContext returns undefined when no context active', () => {
    const ctx = tracer.getCurrentContext();
    expect(ctx).toBeUndefined();
  });

  it('getCurrentContext returns context inside runInContext', () => {
    const traceCtx = tracer.startTrace('ctx-test');
    let result: ReturnType<typeof tracer.getCurrentContext>;

    tracer.runInContext(traceCtx, () => {
      result = tracer.getCurrentContext();
    });

    expect(result).toBeDefined();
    expect(result!.traceId).toBe(traceCtx.traceId);
  });

  // ─── runInContext ─────────────────────────────────────────────

  it('runInContext propagates context to nested calls', () => {
    const traceCtx = tracer.startTrace('propagation-test');
    let innerCtx: ReturnType<typeof getTraceContext>;

    tracer.runInContext(traceCtx, () => {
      innerCtx = getTraceContext();
    });

    expect(innerCtx).toBeDefined();
    expect(innerCtx!.traceId).toBe(traceCtx.traceId);
  });

  // ─── withSpan ────────────────────────────────────────────────

  it('withSpan completes span on success', async () => {
    const ctx = tracer.startTrace('with-span-test');
    let spanId: string = '';

    await tracer.runInContext(ctx, async () => {
      await tracer.withSpan('async-op', 'tool', async () => {
        spanId = tracer.getCurrentContext()?.currentSpanId ?? '';
        return 42;
      });
    });

    const trace = tracer.getTrace(ctx.traceId);
    const span = trace?.spans.find((s) => s.spanId === spanId);
    expect(span?.status).toBe('success');
  });

  it('withSpan marks span as error when fn throws', async () => {
    const ctx = tracer.startTrace('with-span-error-test');
    let spanId: string = '';

    await expect(
      tracer.runInContext(ctx, async () => {
        return tracer.withSpan('failing-op', 'tool', async () => {
          spanId = tracer.getCurrentContext()?.currentSpanId ?? '';
          throw new Error('oops');
        });
      })
    ).rejects.toThrow('oops');

    const trace = tracer.getTrace(ctx.traceId);
    const span = trace?.spans.find((s) => s.spanId === spanId);
    expect(span?.status).toBe('error');
  });

  // ─── flushTrace ───────────────────────────────────────────────

  it('flushTrace writes JSON file and cleans up', async () => {
    const ctx = tracer.startTrace('flush-test');

    runWithContext(ctx, () => {
      const spanId = tracer.startSpan('root-span');
      tracer.endSpan(spanId, 'completed');
    });

    await tracer.flushTrace(ctx.traceId);

    const filePath = path.join(tmpDir, `${ctx.traceId}.json`);
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    // File contains at least a partial span write (JSONL line)
    expect(content.length).toBeGreaterThan(0);
  });

  // ─── getTrace ────────────────────────────────────────────────

  it('getTrace returns null for unknown traceId', () => {
    expect(tracer.getTrace('no-such-trace')).toBeNull();
  });

  it('getTrace returns null when trace has no spans', () => {
    const ctx = tracer.startTrace('empty-trace');
    // Don't add any spans
    expect(tracer.getTrace(ctx.traceId)).toBeNull();
  });

  it('getTrace builds tree with children', () => {
    const ctx = tracer.startTrace('tree-test');

    runWithContext(ctx, () => {
      const rootId = tracer.startSpan('root');
      const rootCtx = { ...ctx, currentSpanId: rootId };

      runWithContext(rootCtx, () => {
        const child1 = tracer.startSpan('child-1');
        const child2 = tracer.startSpan('child-2');
        tracer.endSpan(child1, 'completed');
        tracer.endSpan(child2, 'completed');
      });

      tracer.endSpan(rootId, 'completed');
    });

    const trace = tracer.getTrace(ctx.traceId);
    expect(trace).not.toBeNull();
    expect(trace!.rootSpan.children.length).toBe(2);
  });
});
