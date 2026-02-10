/**
 * 日志系统
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * 日志配置
 */
export interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
  logDir: string;
  logToFile: boolean;
  logToConsole: boolean;
  maxFileSize: number; // 最大文件大小（字节）
  maxFiles: number; // 保留的最大文件数
  dateFormat: string; // 日期格式
}

/**
 * 默认日志配置
 */
const DEFAULT_CONFIG: LoggerConfig = {
  enabled: true,
  level: LogLevel.INFO,
  logDir: path.join(os.homedir(), '.agent-team', 'logs'),
  logToFile: true,
  logToConsole: true,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 30, // 保留30天的日志
  dateFormat: 'YYYY-MM-DD',
};

/**
 * 日志记录器
 */
export class Logger {
  private config: LoggerConfig;
  private currentLogFile: string | null = null;
  private logStream: fs.FileHandle | null = null;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureLogDir();
  }

  /**
   * 确保日志目录存在
   */
  private async ensureLogDir(): Promise<void> {
    if (this.config.logToFile && this.config.enabled) {
      try {
        await fs.mkdir(this.config.logDir, { recursive: true });
      } catch (error) {
        console.error(`无法创建日志目录 ${this.config.logDir}:`, error);
      }
    }
  }

  /**
   * 获取当前日志文件名
   */
  private getLogFileName(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `agent-team-${year}-${month}-${day}.log`;
  }

  /**
   * 获取日志文件路径
   */
  private getLogFilePath(): string {
    return path.join(this.config.logDir, this.getLogFileName());
  }

  /**
   * 格式化日志消息
   */
  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const formattedMessage = args.length > 0 
      ? `${message} ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ')}`
      : message;
    
    return `[${timestamp}] [${levelName}] ${formattedMessage}\n`;
  }

  /**
   * 写入日志文件
   */
  private async writeToFile(message: string): Promise<void> {
    if (!this.config.logToFile || !this.config.enabled) {
      return;
    }

    try {
      const logFilePath = this.getLogFilePath();
      
      // 如果日志文件改变了，关闭旧的文件流
      if (this.currentLogFile !== logFilePath && this.logStream) {
        await this.logStream.close();
        this.logStream = null;
        this.currentLogFile = null;
      }

      // 打开新的文件流（如果需要）
      if (!this.logStream || this.currentLogFile !== logFilePath) {
        this.currentLogFile = logFilePath;
        try {
          if (this.logStream) {
            await this.logStream.close().catch(() => {});
          }
          this.logStream = await fs.open(logFilePath, 'a');
        } catch (error) {
          if (this.config.logToConsole) {
            console.error('打开日志文件失败:', error);
          }
          return;
        }
      }

      // 写入日志（追加模式）
      if (this.logStream) {
        await this.logStream.write(message + '\n').catch(() => {});
      }

      // 检查文件大小，如果超过限制则轮转
      const stats = await fs.stat(logFilePath);
      if (stats.size > this.config.maxFileSize) {
        await this.rotateLogFile();
      }
    } catch (error) {
      // 如果写入失败，至少输出到控制台
      if (this.config.logToConsole) {
        console.error('日志写入失败:', error);
      }
    }
  }

  /**
   * 轮转日志文件
   */
  private async rotateLogFile(): Promise<void> {
    if (this.logStream) {
      await this.logStream.close();
      this.logStream = null;
    }

    const logFilePath = this.getLogFilePath();
    const timestamp = Date.now();
    const rotatedPath = `${logFilePath}.${timestamp}`;
    
    try {
      await fs.rename(logFilePath, rotatedPath);
      await this.cleanOldLogs();
    } catch (error) {
      console.error('日志轮转失败:', error);
    }
  }

  /**
   * 清理旧日志文件
   */
  private async cleanOldLogs(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.logDir);
      const logFiles = files
        .filter(f => f.startsWith('agent-team-') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.config.logDir, f),
        }));

      // 按修改时间排序
      const filesWithStats = await Promise.all(
        logFiles.map(async (f) => ({
          ...f,
          stats: await fs.stat(f.path),
        }))
      );

      filesWithStats.sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

      // 删除超过保留数量的文件
      if (filesWithStats.length > this.config.maxFiles) {
        const toDelete = filesWithStats.slice(this.config.maxFiles);
        for (const file of toDelete) {
          await fs.unlink(file.path);
        }
      }
    } catch (error) {
      console.error('清理旧日志失败:', error);
    }
  }

  /**
   * 记录日志
   */
  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (!this.config.enabled || level < this.config.level) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, ...args);

    // 输出到控制台（如果有活动的进度指示器，跳过控制台输出以避免冲突）
    if (this.config.logToConsole) {
      // 检查是否有活动的进度指示器
      let hasActiveProgress = false;
      try {
        const { ProgressIndicator } = require('./error-display.js');
        hasActiveProgress = ProgressIndicator.hasActive();
      } catch {
        // 如果无法导入，忽略
      }

      // 只有在没有活动进度指示器时才输出到控制台
      if (!hasActiveProgress) {
        const consoleMethod = level === LogLevel.ERROR ? console.error
          : level === LogLevel.WARN ? console.warn
          : level === LogLevel.DEBUG ? console.debug
          : console.log;
        
        consoleMethod(formattedMessage.trim());
      }
    }

    // 写入文件（异步，不阻塞）
    this.writeToFile(formattedMessage).catch(err => {
      if (this.config.logToConsole) {
        console.error('日志写入失败:', err);
      }
    });
  }

  /**
   * Debug 级别日志
   */
  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  /**
   * Info 级别日志
   */
  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  /**
   * Warn 级别日志
   */
  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  /**
   * Error 级别日志
   */
  error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.logDir) {
      this.ensureLogDir();
    }
  }

  /**
   * 获取配置
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  /**
   * 关闭日志系统
   */
  async close(): Promise<void> {
    if (this.logStream) {
      await this.logStream.close();
      this.logStream = null;
    }
  }
}

/**
 * 全局日志记录器实例
 */
let globalLogger: Logger | null = null;

/**
 * 获取全局日志记录器
 */
export function getLogger(config?: Partial<LoggerConfig>): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(config);
  } else if (config) {
    globalLogger.updateConfig(config);
  }
  return globalLogger;
}

/**
 * 设置全局日志记录器
 */
export function setLogger(logger: Logger): void {
  globalLogger = logger;
}

/**
 * 重置全局日志记录器
 */
export function resetLogger(): void {
  if (globalLogger) {
    globalLogger.close();
    globalLogger = null;
  }
}
