# Task 04：ObservabilityMiddleware - AgentLoop 集成

**优先级**: P0
**预估工时**: 4h
**依赖**: Task 1（Logger）、Task 2（Tracer）、Task 3（MetricsCollector）
**阶段**: Phase 1

---

## 目标

通过 EventEmitter 事件监听实现零侵入集成：不修改 AgentLoop、MasterAgent、ToolExecutor 核心代码，通过订阅已有事件自动记录日志、创建 Span、采集指标。同时创建统一的 observability 模块入口。

---

## 输入文件

- `src/ai/agent-loop.ts` - 了解 AgentLoop 已有事件列表
- `src/ai/master-agent.ts` - 了解 MasterAgent 事件
- `src/tools/tool-executor.ts` - 了解 ToolExecutor 事件
- `src/observability/logger.ts` - Task 1 输出
- `src/observability/tracer.ts` - Task 2 输出
- `src/observability/metrics.ts` - Task 3 输出

---

## 输出文件

| 文件 | 说明 |
|------|------|
| `src/observability/middleware.ts` | ObservabilityMiddleware 实现 |
| `src/observability/index.ts` | 统一导出 |

---

## 实现步骤

### 步骤 1：审查 AgentLoop 现有事件

首先阅读 `src/ai/agent-loop.ts` 完整代码，列出所有 `this.emit(...)` 调用，确认事件名称和参数结构。

常见的 AgentLoop 事件（基于代码审查补充）：
```
task:start      { id, title, description }
task:end        { id, success, result, error, tokensUsed, toolCalls }
tool:call       { toolName, params, agentId }
tool:result     { toolName, result, durationMs, agentId }
tool:error      { toolName, error, agentId }
llm:request     { prompt, model, agentId }
llm:response    { response, tokensUsed, durationMs }
llm:error       { error, agentId }
agent:created   { agentId, parentId }
agent:finished  { agentId, result }
```

如果 AgentLoop 缺少某些事件发射点，在 `middleware.ts` 注释中说明，并在步骤 2 末尾决定是否最小化修改 agent-loop.ts 补充缺失的 emit 调用（仅添加 emit，不改变逻辑）。

### 步骤 2：实现 middleware.ts

```typescript
import { EventEmitter } from 'events';
import { Logger } from './logger.js';
import { Tracer } from './tracer.js';
import { MetricsCollector } from './metrics.js';
import { runWithContext } from './context.js';
import type { TraceContext } from './types.js';

export interface ObservabilityOptions {
  logger?: boolean;    // 默认 true
  tracing?: boolean;   // 默认 true
  metrics?: boolean;   // 默认 true
  workspaceDir?: string;
}

export function createObservabilityMiddleware(
  agentLoop: EventEmitter,
  options: ObservabilityOptions = {}
): void {
  const { logger: enableLog = true, tracing: enableTrace = true, metrics: enableMetrics = true } = options;

  const logger = Logger.getInstance();
  const tracer = Tracer.getInstance();
  const metrics = MetricsCollector.getInstance();

  // 活跃任务的 traceId 映射
  const taskTraceMap = new Map<string, string>();
  // 活跃工具调用的 spanId 映射
  const toolSpanMap = new Map<string, string>();

  // ─── 任务开始 ───────────────────────────────────────────────
  agentLoop.on('task:start', (task: { id: string; title?: string; description?: string }) => {
    try {
      let traceId: string | undefined;

      if (enableTrace) {
        traceId = tracer.startTrace(task.id);
        taskTraceMap.set(task.id, traceId);
      }

      const ctx: TraceContext = {
        traceId: traceId ?? '',
        taskId: task.id,
      };

      // 启动 root span（在 runWithContext 内部，让后续事件能继承上下文）
      runWithContext(ctx, () => {
        if (enableTrace) {
          const rootSpan = tracer.startSpan(`task:${task.title ?? task.id}`, 'task');
          rootSpan.attributes.taskId = task.id;
        }
      });

      if (enableLog) {
        logger.info('Task started', {
          event: 'task.started',
          taskId: task.id,
          traceId,
          data: { title: task.title },
        } as any);
      }

      if (enableMetrics) {
        metrics.increment('task.total');
        metrics.gauge('task.active_count', taskTraceMap.size);
      }
    } catch (err) {
      process.stderr.write(`[Observability] task:start error: ${(err as Error).message}\n`);
    }
  });

  // ─── 任务结束 ───────────────────────────────────────────────
  agentLoop.on('task:end', (result: { id: string; success: boolean; error?: Error; durationMs?: number }) => {
    try {
      const traceId = taskTraceMap.get(result.id);

      if (enableLog) {
        logger.info(result.success ? 'Task completed' : 'Task failed', {
          event: result.success ? 'task.completed' : 'task.failed',
          taskId: result.id,
          traceId,
          durationMs: result.durationMs,
          data: result.success ? undefined : { error: result.error?.message },
        } as any);
      }

      if (enableMetrics && result.durationMs != null) {
        metrics.timing('task.duration', result.durationMs);
        metrics.increment(result.success ? 'task.success_count' : 'task.failure_count');
        taskTraceMap.delete(result.id);
        metrics.gauge('task.active_count', taskTraceMap.size);
      }

      if (enableTrace && traceId) {
        tracer.finalizeTrace(traceId).catch(() => {});
      }
    } catch (err) {
      process.stderr.write(`[Observability] task:end error: ${(err as Error).message}\n`);
    }
  });

  // ─── 工具调用 ───────────────────────────────────────────────
  agentLoop.on('tool:call', (data: { toolName: string; params: Record<string, any>; agentId?: string; callId?: string }) => {
    try {
      if (enableLog) {
        logger.info('Tool called', {
          event: 'tool.called',
          agentId: data.agentId,
          data: { toolName: data.toolName, params: data.params },
        } as any);
      }

      if (enableTrace) {
        const span = tracer.startSpan(`tool:${data.toolName}`, 'tool');
        span.attributes.toolName = data.toolName;
        span.attributes.agentId = data.agentId;
        if (data.callId) toolSpanMap.set(data.callId, span.spanId);
      }

      if (enableMetrics) {
        metrics.increment('tool.call_count', { tool_name: data.toolName });
      }
    } catch (err) {
      process.stderr.write(`[Observability] tool:call error: ${(err as Error).message}\n`);
    }
  });

  // ─── 工具结果 ───────────────────────────────────────────────
  agentLoop.on('tool:result', (data: { toolName: string; durationMs: number; callId?: string }) => {
    try {
      if (enableLog) {
        logger.info('Tool succeeded', {
          event: 'tool.succeeded',
          durationMs: data.durationMs,
          data: { toolName: data.toolName },
        } as any);
      }

      if (enableTrace && data.callId) {
        const spanId = toolSpanMap.get(data.callId);
        if (spanId) {
          tracer.endSpan(spanId, 'success');
          toolSpanMap.delete(data.callId);
        }
      }

      if (enableMetrics) {
        metrics.timing('tool.duration', data.durationMs, { tool_name: data.toolName });
        metrics.increment('tool.success_count', { tool_name: data.toolName });
      }
    } catch (err) {
      process.stderr.write(`[Observability] tool:result error: ${(err as Error).message}\n`);
    }
  });

  // ─── 工具错误 ───────────────────────────────────────────────
  agentLoop.on('tool:error', (data: { toolName: string; error: Error; callId?: string }) => {
    try {
      if (enableLog) {
        logger.error('Tool failed', data.error, {
          event: 'tool.failed',
          data: { toolName: data.toolName },
        } as any);
      }

      if (enableTrace && data.callId) {
        const spanId = toolSpanMap.get(data.callId);
        if (spanId) {
          tracer.endSpan(spanId, 'error', data.error);
          toolSpanMap.delete(data.callId);
        }
      }

      if (enableMetrics) {
        metrics.increment('tool.failure_count', { tool_name: data.toolName });
      }
    } catch (err) {
      process.stderr.write(`[Observability] tool:error error: ${(err as Error).message}\n`);
    }
  });

  // ─── LLM 请求 ───────────────────────────────────────────────
  agentLoop.on('llm:request', (data: { model?: string; agentId?: string; promptTokens?: number }) => {
    try {
      if (enableLog) {
        logger.info('LLM requested', {
          event: 'llm.requested',
          agentId: data.agentId,
          data: { model: data.model },
        } as any);
      }
      if (enableMetrics) {
        metrics.increment('llm.request_count', { provider: data.model ?? 'unknown' });
        if (data.promptTokens) {
          metrics.increment('llm.token_input_total', undefined, data.promptTokens);
        }
      }
    } catch (err) {
      process.stderr.write(`[Observability] llm:request error: ${(err as Error).message}\n`);
    }
  });

  // ─── LLM 响应 ───────────────────────────────────────────────
  agentLoop.on('llm:response', (data: { durationMs: number; outputTokens?: number; model?: string }) => {
    try {
      if (enableLog) {
        logger.info('LLM responded', {
          event: 'llm.responded',
          durationMs: data.durationMs,
        } as any);
      }
      if (enableMetrics) {
        metrics.timing('llm.duration', data.durationMs, { provider: data.model ?? 'unknown' });
        if (data.outputTokens) {
          metrics.increment('llm.token_output_total', undefined, data.outputTokens);
        }
      }
    } catch (err) {
      process.stderr.write(`[Observability] llm:response error: ${(err as Error).message}\n`);
    }
  });
}
```

### 步骤 3：创建统一导出 `src/observability/index.ts`

```typescript
export { Logger, getLogger } from './logger.js';
export { Tracer } from './tracer.js';
export { MetricsCollector, startSystemMetrics } from './metrics.js';
export { createObservabilityMiddleware } from './middleware.js';
export { traceContextStorage, getTraceContext, runWithContext } from './context.js';
export type {
  LogLevel, LogEntry, Span, SpanKind, SpanStatus,
  TraceContext, MetricSummary
} from './types.js';
```

### 步骤 4：应用入口集成示例

```typescript
// src/index.ts 或应用入口（不修改 AgentLoop，只在外部调用一次）
import { AgentLoop } from './ai/agent-loop.js';
import { createObservabilityMiddleware } from './observability/index.js';

const agentLoop = new AgentLoop(llmService, toolExecutor);

// 一行代码开启全部可观测性
createObservabilityMiddleware(agentLoop, {
  logger: true,
  tracing: true,
  metrics: true,
});
```

---

## 验收标准

- [ ] 调用 `createObservabilityMiddleware(agentLoop)` 后，执行一次任务，`workspace/logs/` 有日志文件
- [ ] 任务执行后 `workspace/traces/{traceId}.json` 文件存在
- [ ] 所有 task.started / tool.called / llm.requested 事件均有对应日志记录
- [ ] 手动在监听器内抛出异常，不影响 AgentLoop 任务继续执行
- [ ] 未修改 `src/ai/agent-loop.ts`（或只增加了 emit 调用，未改变逻辑）
- [ ] 单元测试覆盖率 > 80%
- [ ] TypeScript 编译无错误（strict 模式）
