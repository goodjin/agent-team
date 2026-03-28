import { IFileStore } from '../file-store/index.js';
import { generateId } from '../utils/id.js';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  taskId: string;
  agentId?: string;
  type: 'thought' | 'action' | 'tool_call' | 'tool_result' | 'milestone' | 'status_change' | 'error';
  content: string;
  metadata?: Record<string, any>;
}

export interface QueryOptions {
  startTime?: Date;
  endTime?: Date;
  level?: LogEntry['level'];
  type?: LogEntry['type'];
  order?: 'asc' | 'desc';
  limit?: number;
  /** 仅返回该 Agent 相关日志（与 LogEntry.agentId 匹配） */
  agentId?: string;
}

export interface ILogger {
  log(entry: Omit<LogEntry, 'id'>): Promise<void>;
  query(taskId: string, options?: QueryOptions): Promise<LogEntry[]>;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export class BatchLogger implements ILogger {
  private buffer: Map<string, Omit<LogEntry, 'id'>[]> = new Map();
  private flushInterval: number;
  private maxBufferSize: number;

  constructor(
    private fileStore: IFileStore,
    options: { flushInterval?: number; maxBufferSize?: number } = {}
  ) {
    this.flushInterval = options.flushInterval || 5000;
    this.maxBufferSize = options.maxBufferSize || 100;

    setInterval(() => this.flush(), this.flushInterval);
  }

  async log(entry: Omit<LogEntry, 'id'>): Promise<void> {
    const taskLogs = this.buffer.get(entry.taskId) || [];
    taskLogs.push(entry);
    this.buffer.set(entry.taskId, taskLogs);

    if (taskLogs.length >= this.maxBufferSize) {
      await this.flushTask(entry.taskId);
    }
  }

  private async flush(): Promise<void> {
    for (const taskId of this.buffer.keys()) {
      await this.flushTask(taskId);
    }
  }

  private async flushTask(taskId: string): Promise<void> {
    const logs = this.buffer.get(taskId);
    if (!logs || logs.length === 0) return;

    this.buffer.set(taskId, []);

    const date = formatDate(new Date());
    const content = logs.map(l => JSON.stringify({ ...l, id: generateId() })).join('\n') + '\n';

    await this.fileStore.append(`logs/${taskId}/${date}.log`, content);
  }

  async query(taskId: string, options: QueryOptions = {}): Promise<LogEntry[]> {
    await this.flushTask(taskId);

    const logDir = `logs/${taskId}`;
    const files = await this.fileStore.list(logDir);

    const entries: LogEntry[] = [];

    for (const file of files) {
      if (!file.endsWith('.log')) continue;

      const content = await this.fileStore.readText(`${logDir}/${file}`);
      const lines = content.split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const entry: LogEntry = JSON.parse(line);

          // 过滤条件
          if (options.startTime && new Date(entry.timestamp) < options.startTime) continue;
          if (options.endTime && new Date(entry.timestamp) > options.endTime) continue;
          if (options.level && entry.level !== options.level) continue;
          if (options.type && entry.type !== options.type) continue;
          if (options.agentId && entry.agentId !== options.agentId) continue;

          entries.push(entry);
        } catch {
          // 忽略解析错误的行
        }
      }
    }

    // 排序
    entries.sort((a, b) => {
      const cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return options.order === 'desc' ? -cmp : cmp;
    });

    // 限制数量
    if (options.limit && options.limit > 0) {
      return entries.slice(0, options.limit);
    }

    return entries;
  }
}
