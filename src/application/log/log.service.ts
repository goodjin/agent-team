import { ILogger, LogEntry, QueryOptions } from '../../infrastructure/logger/index.js';

export interface TimelineEntry {
  id: string;
  timestamp: Date;
  icon: string;
  description: string;
  details: any;
  level: LogEntry['level'];
}

export class LogService {
  constructor(private logger: ILogger) {}

  async log(entry: Omit<LogEntry, 'id'>): Promise<void> {
    await this.logger.log(entry);
  }

  async getTimeline(taskId: string, options?: QueryOptions): Promise<TimelineEntry[]> {
    const logs = await this.logger.query(taskId, {
      ...options,
      order: 'asc'
    });

    return logs.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      icon: this.getIconForType(log.type),
      type: log.type,
      description: log.content,
      details: log.metadata,
      level: log.level
    }));
  }

  async query(taskId: string, options?: QueryOptions): Promise<LogEntry[]> {
    return this.logger.query(taskId, options);
  }

  private getIconForType(type: LogEntry['type']): string {
    const icons: Record<string, string> = {
      'thought': '💭',
      'action': '⚡',
      'tool_call': '🔧',
      'tool_result': '✅',
      'milestone': '🏁',
      'status_change': '🔄',
      'error': '❌'
    };
    return icons[type] || '📝';
  }
}
