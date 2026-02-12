/**
 * ObservabilityMiddleware
 *
 * Zero-intrusion integration with AgentLoop via EventEmitter subscriptions.
 * Does NOT modify src/ai/agent-loop.ts.
 *
 * AgentLoop actual events (from agent-loop.ts):
 *   loop:started    { taskId, maxIterations }
 *   loop:iteration  { iteration, maxIterations, tokensUsed }
 *   loop:completed  { iterations, tokensUsed, toolCalls }
 *   loop:error      { iterations, error }
 *   llm:calling     { iteration, estimatedTokens }
 *   llm:response    { iteration, stopReason, contentLength, toolCalls, tokensUsed }
 *   tools:executing { iteration, toolCount }
 *   tools:executed  { iteration, results: [{ name, success, duration }] }
 *   context:compressing { messageCount, estimatedTokens }
 *   context:compressed  { messageCount, estimatedTokens }
 *   budget:warning  (from TokenManager)
 *   budget:critical (from TokenManager)
 */

import { EventEmitter } from 'events';
import { StructuredLogger } from './logger.js';
import { TracingSystem } from './tracer.js';
import { MetricsCollector } from './metrics.js';
import { runWithContext } from './context.js';
import type { TraceContext } from './types.js';

export interface ObservabilityOptions {
  logger?: StructuredLogger;
  tracer?: TracingSystem;
  metrics?: MetricsCollector;
  enableLogger?: boolean;
  enableTracing?: boolean;
  enableMetrics?: boolean;
}

export function attachObservability(
  agentLoop: EventEmitter,
  options: ObservabilityOptions = {}
): void {
  const enableLog = options.enableLogger !== false;
  const enableTrace = options.enableTracing !== false;
  const enableMetrics = options.enableMetrics !== false;

  const logger = options.logger ?? StructuredLogger.getInstance();
  const tracer = options.tracer ?? TracingSystem.getInstance();
  const metrics = options.metrics ?? MetricsCollector.getInstance();

  // taskId → traceContext
  const taskContextMap = new Map<string, TraceContext>();
  // taskId → root span id
  const taskRootSpanMap = new Map<string, string>();
  // iteration key → llm span id (per task+iteration)
  const llmSpanMap = new Map<string, string>();

  // ─── loop:started  (task.started equivalent) ──────────────────
  agentLoop.on(
    'loop:started',
    (data: { taskId: string; maxIterations: number }) => {
      try {
        let ctx: TraceContext = { traceId: '', taskId: data.taskId };

        if (enableTrace) {
          ctx = tracer.startTrace(`task:${data.taskId}`, { taskId: data.taskId });
          taskContextMap.set(data.taskId, ctx);

          // Start root span inside context
          runWithContext(ctx, () => {
            const spanId = tracer.startSpan(`task:${data.taskId}`, {
              kind: 'task',
              taskId: data.taskId,
              maxIterations: data.maxIterations,
            });
            taskRootSpanMap.set(data.taskId, spanId);
            // Update context with rootSpanId
            ctx.currentSpanId = spanId;
          });
        }

        if (enableLog) {
          logger.info('AgentLoop', 'task.started', {
            message: `Task started: ${data.taskId}`,
            taskId: data.taskId,
            traceId: ctx.traceId,
            data: { maxIterations: data.maxIterations },
          });
        }

        if (enableMetrics) {
          metrics.increment('task.total');
          metrics.gauge('task.active_count', taskContextMap.size);
        }
      } catch (err) {
        process.stderr.write(
          `[Observability] loop:started error: ${(err as Error).message}\n`
        );
      }
    }
  );

  // ─── loop:completed  (task.completed equivalent) ──────────────
  agentLoop.on(
    'loop:completed',
    (data: { iterations: number; tokensUsed: number; toolCalls: number; taskId?: string }) => {
      try {
        // AgentLoop does not pass taskId in loop:completed; we need it from context.
        // We store taskId when loop:started fires; attempt to find via last entry.
        const taskId = data.taskId ?? getLastTaskId(taskContextMap);

        if (enableLog) {
          logger.info('AgentLoop', 'task.completed', {
            message: 'Task completed successfully',
            taskId: taskId ?? undefined,
            data: {
              iterations: data.iterations,
              tokensUsed: data.tokensUsed,
              toolCalls: data.toolCalls,
            },
          });
        }

        if (enableMetrics) {
          metrics.increment('task.success_count');
          if (taskId) {
            taskContextMap.delete(taskId);
          }
          metrics.gauge('task.active_count', taskContextMap.size);
          metrics.increment('llm.tokens_total', data.tokensUsed);
        }

        if (enableTrace && taskId) {
          const rootSpanId = taskRootSpanMap.get(taskId);
          if (rootSpanId) {
            tracer.endSpan(rootSpanId, 'completed');
            taskRootSpanMap.delete(taskId);
          }
          const ctx = taskContextMap.get(taskId);
          if (ctx) {
            tracer.finalizeTrace(ctx.traceId).catch(() => {});
            taskContextMap.delete(taskId);
          }
        }
      } catch (err) {
        process.stderr.write(
          `[Observability] loop:completed error: ${(err as Error).message}\n`
        );
      }
    }
  );

  // ─── loop:error  ──────────────────────────────────────────────
  agentLoop.on(
    'loop:error',
    (data: { iterations: number; error: string; taskId?: string }) => {
      try {
        const taskId = data.taskId ?? getLastTaskId(taskContextMap);

        if (enableLog) {
          logger.error('AgentLoop', 'task.failed', {
            message: `Task failed: ${data.error}`,
            taskId: taskId ?? undefined,
            error: { name: 'Error', message: data.error },
            data: { iterations: data.iterations },
          });
        }

        if (enableMetrics) {
          metrics.increment('task.failure_count');
          metrics.increment('errors_total');
        }

        if (enableTrace && taskId) {
          const rootSpanId = taskRootSpanMap.get(taskId);
          if (rootSpanId) {
            tracer.endSpan(rootSpanId, 'error');
            taskRootSpanMap.delete(taskId);
          }
          const ctx = taskContextMap.get(taskId);
          if (ctx) {
            tracer.finalizeTrace(ctx.traceId).catch(() => {});
            taskContextMap.delete(taskId);
          }
        }
      } catch (err) {
        process.stderr.write(
          `[Observability] loop:error error: ${(err as Error).message}\n`
        );
      }
    }
  );

  // ─── tools:executing  (tool.called equivalent) ────────────────
  agentLoop.on(
    'tools:executing',
    (data: { iteration: number; toolCount: number }) => {
      try {
        if (enableLog) {
          logger.info('AgentLoop', 'tool.called', {
            message: `Executing ${data.toolCount} tool(s) in iteration ${data.iteration}`,
            data: { iteration: data.iteration, toolCount: data.toolCount },
          });
        }

        if (enableMetrics) {
          metrics.increment('tool.batch_count');
        }
      } catch (err) {
        process.stderr.write(
          `[Observability] tools:executing error: ${(err as Error).message}\n`
        );
      }
    }
  );

  // ─── tools:executed  (tool.completed equivalent) ──────────────
  agentLoop.on(
    'tools:executed',
    (
      data: {
        iteration: number;
        results: Array<{ name: string; success: boolean; duration: number }>;
      }
    ) => {
      try {
        for (const r of data.results) {
          if (enableLog) {
            if (r.success) {
              logger.info('AgentLoop', 'tool.completed', {
                message: `Tool ${r.name} completed`,
                data: { toolName: r.name, duration: r.duration },
              });
            } else {
              logger.error('AgentLoop', 'tool.failed', {
                message: `Tool ${r.name} failed`,
                error: { name: 'ToolError', message: `Tool ${r.name} returned failure` },
                data: { toolName: r.name },
              });
            }
          }

          if (enableMetrics) {
            metrics.observe('tool.duration', r.duration, { tool_name: r.name });
            metrics.increment(
              r.success ? 'tool.success_count' : 'tool.failure_count',
              1,
              { tool_name: r.name }
            );
            if (!r.success) {
              metrics.increment('errors_total');
            }
          }
        }
      } catch (err) {
        process.stderr.write(
          `[Observability] tools:executed error: ${(err as Error).message}\n`
        );
      }
    }
  );

  // ─── llm:calling  ─────────────────────────────────────────────
  agentLoop.on(
    'llm:calling',
    (data: { iteration: number; estimatedTokens: number }) => {
      try {
        if (enableLog) {
          logger.debug('AgentLoop', 'llm.calling', {
            message: `LLM call started, iteration ${data.iteration}`,
            data: { iteration: data.iteration, estimatedTokens: data.estimatedTokens },
          });
        }

        if (enableMetrics) {
          metrics.increment('llm.request_count');
        }

        if (enableTrace) {
          const ctx = getLastContext(taskContextMap);
          if (ctx) {
            runWithContext(ctx, () => {
              const spanId = tracer.startSpan(`llm:call:${data.iteration}`, {
                kind: 'llm',
                iteration: data.iteration,
              });
              llmSpanMap.set(String(data.iteration), spanId);
            });
          }
        }
      } catch (err) {
        process.stderr.write(
          `[Observability] llm:calling error: ${(err as Error).message}\n`
        );
      }
    }
  );

  // ─── llm:response  ────────────────────────────────────────────
  agentLoop.on(
    'llm:response',
    (data: {
      iteration: number;
      stopReason: string;
      contentLength: number;
      toolCalls: number;
      tokensUsed: number;
    }) => {
      try {
        if (enableLog) {
          logger.info('AgentLoop', 'llm.responded', {
            message: `LLM responded, stopReason=${data.stopReason}`,
            data: {
              iteration: data.iteration,
              stopReason: data.stopReason,
              tokensUsed: data.tokensUsed,
              toolCalls: data.toolCalls,
            },
          });
        }

        if (enableMetrics) {
          metrics.increment('llm.tokens_total', data.tokensUsed);
        }

        if (enableTrace) {
          const spanId = llmSpanMap.get(String(data.iteration));
          if (spanId) {
            tracer.endSpan(spanId, 'completed', {
              stopReason: data.stopReason,
              tokensUsed: data.tokensUsed,
            });
            llmSpanMap.delete(String(data.iteration));
          }
        }
      } catch (err) {
        process.stderr.write(
          `[Observability] llm:response error: ${(err as Error).message}\n`
        );
      }
    }
  );

  // ─── budget:warning / budget:critical  ────────────────────────
  agentLoop.on('budget:warning', (event: unknown) => {
    try {
      if (enableLog) {
        logger.warn('AgentLoop', 'budget.warning', {
          message: 'Token budget warning',
          data: { event: event as Record<string, unknown> },
        });
      }
      if (enableMetrics) {
        metrics.increment('budget.warnings_total');
      }
    } catch {
      // ignore
    }
  });

  agentLoop.on('budget:critical', (event: unknown) => {
    try {
      if (enableLog) {
        logger.error('AgentLoop', 'budget.critical', {
          message: 'Token budget critical',
          data: { event: event as Record<string, unknown> },
        });
      }
      if (enableMetrics) {
        metrics.increment('budget.critical_total');
        metrics.increment('errors_total');
      }
    } catch {
      // ignore
    }
  });
}

// ─── Helpers ──────────────────────────────────────────────────────

function getLastTaskId(map: Map<string, TraceContext>): string | undefined {
  const keys = [...map.keys()];
  return keys[keys.length - 1];
}

function getLastContext(map: Map<string, TraceContext>): TraceContext | undefined {
  const values = [...map.values()];
  return values[values.length - 1];
}

// Also export old API name for backward compat
export const createObservabilityMiddleware = attachObservability;
