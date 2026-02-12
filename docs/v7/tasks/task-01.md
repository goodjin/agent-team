# Task 01：StructuredLogger（结构化日志系统）

**优先级**: P0
**预估工时**: 4h
**依赖**: 无
**阶段**: Phase 1

---

## 目标

实现统一的结构化日志系统，替换现有代码中散乱的 `console.log`，输出标准 JSON 格式日志，支持持久化到文件，不依赖任何外部日志库。

---

## 输入文件

- `docs/v7/01-requirements.md` - 第 3.1.1 节（StructuredLogger 需求）
- `docs/v7/02-architecture.md` - StructuredLogger 架构设计
- `src/ai/agent-loop.ts` - 了解现有代码结构

---

## 输出文件

| 文件 | 说明 |
|------|------|
| `src/observability/types.ts` | 所有核心类型定义（LogEntry, Span, MetricPoint 等） |
| `src/observability/context.ts` | AsyncLocalStorage 上下文管理 |
| `src/observability/logger.ts` | StructuredLogger 主体实现 |
| `tests/observability/logger.test.ts` | 单元测试 |

---

## 实现步骤

### 步骤 1：创建核心类型文件 `src/observability/types.ts`

定义所有共享类型，供后续模块引用：

```typescript
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
```

### 步骤 2：创建上下文管理 `src/observability/context.ts`

```typescript
import { AsyncLocalStorage } from 'async_hooks';
import type { TraceContext } from './types.js';

export const traceContextStorage = new AsyncLocalStorage<TraceContext>();

export function getTraceContext(): TraceContext | undefined {
  return traceContextStorage.getStore();
}

export function runWithContext<T>(context: TraceContext, fn: () => T): T {
  return traceContextStorage.run(context, fn);
}

export function updateContext(updates: Partial<TraceContext>): void {
  const current = traceContextStorage.getStore();
  if (current) {
    Object.assign(current, updates);
  }
}
```

### 步骤 3：实现 StructuredLogger `src/observability/logger.ts`

关键设计：
- 单例模式，通过 `Logger.getInstance()` 获取
- 写入缓冲区：积累 100 条或每秒批量 flush
- 文件写入使用 `fs.createWriteStream` + append 模式
- 上下文字段（traceId、taskId）从 AsyncLocalStorage 自动读取

```typescript
import { createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync, WriteStream } from 'fs';
import { join } from 'path';
import { getTraceContext } from './context.js';
import type { LogEntry, LogLevel } from './types.js';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

export class Logger {
  private static instance: Logger;
  private level: LogLevel = 'info';
  private buffer: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private writeStream: WriteStream | null = null;
  private currentDate: string = '';
  private readonly logDir: string;
  private readonly module: string;
  private readonly context: Partial<LogEntry>;

  private constructor(
    logDir: string,
    module = 'app',
    context: Partial<LogEntry> = {}
  ) {
    this.logDir = logDir;
    this.module = module;
    this.context = context;
    mkdirSync(logDir, { recursive: true });
    this.ensureStream();
    this.scheduleFlush();
  }

  static getInstance(logDir = 'workspace/logs'): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(logDir);
    }
    return Logger.instance;
  }

  child(context: Partial<LogEntry>): Logger {
    return new Logger(this.logDir, this.module, { ...this.context, ...context });
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, data?: Record<string, any>): void {
    this.log('debug', message, data);
  }
  info(message: string, data?: Record<string, any>): void {
    this.log('info', message, data);
  }
  warn(message: string, data?: Record<string, any>): void {
    this.log('warn', message, data);
  }
  error(message: string, error?: Error, data?: Record<string, any>): void {
    this.log('error', message, data, error);
  }

  private log(level: LogLevel, message: string, data?: Record<string, any>, error?: Error): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) return;

    const ctx = getTraceContext();
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module: this.module,
      message,
      ...this.context,
      ...(ctx?.traceId && { traceId: ctx.traceId }),
      ...(ctx?.taskId && { taskId: ctx.taskId }),
      ...(ctx?.agentId && { agentId: ctx.agentId }),
      ...(data && { data }),
      ...(error && {
        error: { name: error.name, message: error.message, stack: error.stack },
      }),
    };

    // 控制台输出
    this.writeConsole(entry);

    // 加入缓冲区
    this.buffer.push(entry);
    if (this.buffer.length >= 100) {
      this.flush();
    }
  }

  private writeConsole(entry: LogEntry): void {
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      const colors: Record<LogLevel, string> = {
        debug: '\x1b[37m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m',
      };
      process.stdout.write(
        `${colors[entry.level]}[${entry.level.toUpperCase()}]\x1b[0m `
        + `[${entry.module}] ${entry.message}\n`
      );
    } else {
      process.stdout.write(JSON.stringify(entry) + '\n');
    }
  }

  private ensureStream(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.currentDate === today && this.writeStream) return;

    this.writeStream?.end();
    this.currentDate = today;
    const filePath = join(this.logDir, `${today}.log`);
    this.writeStream = createWriteStream(filePath, { flags: 'a' });
    this.cleanOldLogs();
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const entries = this.buffer.splice(0);
    this.ensureStream();
    const data = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    await new Promise<void>((resolve, reject) => {
      this.writeStream!.write(data, (err) => err ? reject(err) : resolve());
    });
  }

  private scheduleFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {});
    }, 1000);
    this.flushTimer.unref();
  }

  private cleanOldLogs(): void {
    try {
      const files = readdirSync(this.logDir)
        .filter(f => f.endsWith('.log'))
        .map(f => ({ name: f, mtime: statSync(join(this.logDir, f)).mtime.getTime() }))
        .sort((a, b) => b.mtime - a.mtime);

      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
      files.filter(f => f.mtime < cutoff)
           .forEach(f => unlinkSync(join(this.logDir, f.name)));
    } catch { /* 清理失败不影响主流程 */ }
  }
}

export function getLogger(module: string): Logger {
  return Logger.getInstance().child({ module } as any);
}
```

---

## 验收标准

- [ ] 调用 `logger.info('test', { foo: 'bar' })` 后，控制台有彩色输出，文件有 JSON 行
- [ ] 设置 `logger.setLevel('warn')` 后，`debug`/`info` 调用不输出
- [ ] 创建 child logger 后，child 的日志携带父级 context 字段
- [ ] 跨日时自动创建新的日志文件（2026-02-12.log）
- [ ] 30 天前的日志文件自动清理
- [ ] 单元测试覆盖率 > 80%
- [ ] TypeScript 编译无错误（strict 模式）
