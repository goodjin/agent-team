import {
  createWriteStream,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  WriteStream,
} from 'fs';
import { join } from 'path';
import { getTraceContext } from './context.js';
import type { LogEntry, LogLevel } from './types.js';

export type { LogLevel, LogEntry };

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[37m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

export interface LoggerOptions {
  logDir?: string;
  minLevel?: LogLevel;
  console?: boolean;
  module?: string;
  context?: Partial<LogEntry>;
}

export class StructuredLogger {
  private static _instance: StructuredLogger | undefined;

  private level: LogLevel;
  private buffer: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private writeStream: WriteStream | null = null;
  private currentDate: string = '';
  private readonly logDir: string;
  private readonly enableConsole: boolean;
  private readonly moduleName: string;
  private readonly context: Partial<LogEntry>;

  constructor(options: LoggerOptions = {}) {
    this.logDir = options.logDir ?? 'workspace/logs';
    this.level = options.minLevel ?? 'info';
    this.enableConsole = options.console !== false;
    this.moduleName = options.module ?? 'app';
    this.context = options.context ?? {};

    mkdirSync(this.logDir, { recursive: true });
    this.ensureStream();
    this.scheduleFlush();
  }

  static getInstance(): StructuredLogger {
    if (!StructuredLogger._instance) {
      StructuredLogger._instance = new StructuredLogger();
    }
    return StructuredLogger._instance;
  }

  static setInstance(logger: StructuredLogger): void {
    StructuredLogger._instance = logger;
  }

  /** Create a child logger with extra context fields */
  child(context: Partial<LogEntry>): StructuredLogger {
    return new StructuredLogger({
      logDir: this.logDir,
      minLevel: this.level,
      console: this.enableConsole,
      module: this.moduleName,
      context: { ...this.context, ...context },
    });
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(module: string, event: string, data?: Partial<LogEntry>): void {
    this.log('debug', module, event, data);
  }

  info(module: string, event: string, data?: Partial<LogEntry>): void {
    this.log('info', module, event, data);
  }

  warn(module: string, event: string, data?: Partial<LogEntry>): void {
    this.log('warn', module, event, data);
  }

  error(module: string, event: string, data?: Partial<LogEntry>): void {
    this.log('error', module, event, data);
  }

  private log(
    level: LogLevel,
    module: string,
    event: string,
    extra?: Partial<LogEntry>
  ): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) return;

    const ctx = getTraceContext();
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      event,
      message: extra?.message ?? event,
      ...this.context,
      ...(ctx?.traceId && { traceId: ctx.traceId }),
      ...(ctx?.taskId && { taskId: ctx.taskId }),
      ...(ctx?.agentId && { agentId: ctx.agentId }),
      ...extra,
    };
    // Ensure core identity fields are not overwritten by spread
    entry.level = level;
    entry.module = module;
    entry.event = event;

    if (this.enableConsole) {
      this.writeConsole(entry);
    }

    this.buffer.push(entry);
    if (this.buffer.length >= 100) {
      this.flushSync();
    }
  }

  private writeConsole(entry: LogEntry): void {
    const time = entry.timestamp.slice(11, 19); // HH:MM:SS
    const color = LEVEL_COLORS[entry.level];
    const reset = '\x1b[0m';
    const line = `[${time}] ${color}[${entry.level.toUpperCase()}]${reset} [${entry.module}] ${entry.event} - ${entry.message}\n`;
    process.stdout.write(line);
  }

  private flushSync(): void {
    if (this.buffer.length === 0) return;
    const entries = this.buffer.splice(0);
    try {
      this.ensureStream();
      const data = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
      this.writeStream?.write(data, () => {});
    } catch {
      // ignore write errors (e.g. directory deleted in tests)
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const entries = this.buffer.splice(0);
    try {
      this.ensureStream();
      const data = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
      await new Promise<void>((resolve) => {
        if (!this.writeStream) { resolve(); return; }
        this.writeStream.write(data, () => resolve());
      });
    } catch {
      // ignore write errors (e.g. directory deleted in tests)
    }
  }

  close(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushSync();
    this.writeStream?.end();
    this.writeStream = null;
  }

  private ensureStream(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.currentDate === today && this.writeStream) return;

    this.writeStream?.end();
    this.currentDate = today;
    const filePath = join(this.logDir, `${today}.log`);
    const stream = createWriteStream(filePath, { flags: 'a' });
    // Suppress ENOENT / EPERM errors that can happen when the log dir is
    // deleted during tests while a background flush timer is still running.
    stream.on('error', () => {});
    this.writeStream = stream;
    this.cleanOldLogs();
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
        .filter((f) => f.endsWith('.log'))
        .map((f) => ({
          name: f,
          mtime: statSync(join(this.logDir, f)).mtime.getTime(),
        }));

      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      files
        .filter((f) => f.mtime < cutoff)
        .forEach((f) => {
          try {
            unlinkSync(join(this.logDir, f.name));
          } catch {
            // ignore
          }
        });
    } catch {
      // clean-up failure should not affect main flow
    }
  }
}

export function getLogger(module: string): StructuredLogger {
  return StructuredLogger.getInstance().child({ module } as Partial<LogEntry>);
}

// Backward-compat alias
export { StructuredLogger as Logger };
