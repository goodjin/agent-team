/**
 * 错误展示工具
 * 将错误信息格式化为用户友好的输出
 */

import type { UserFriendlyError } from '../types/errors.js';
import { getUserFriendlyError, ErrorWithCode, ErrorCode } from '../types/errors.js';

/**
 * 错误展示选项
 */
export interface ErrorDisplayOptions {
  /** 是否显示详细信息 */
  showDetails?: boolean;
  /** 是否显示建议操作 */
  showSuggestions?: boolean;
  /** 是否使用颜色输出 */
  colorOutput?: boolean;
  /** 是否显示堆栈跟踪（仅技术模式） */
  showStackTrace?: boolean;
  /** 输出目标 */
  outputTarget?: 'console' | 'string';
}

/**
 * 错误展示器
 * 将错误信息格式化为用户友好的输出
 */
export class ErrorDisplay {
  private options: Required<ErrorDisplayOptions>;

  constructor(options: ErrorDisplayOptions = {}) {
    this.options = {
      showDetails: options.showDetails ?? true,
      showSuggestions: options.showSuggestions ?? true,
      colorOutput: options.colorOutput ?? true,
      showStackTrace: options.showStackTrace ?? true,
      outputTarget: options.outputTarget ?? 'console',
    };
  }

  /**
   * 展示用户友好错误
   */
  display(error: UserFriendlyError): string | void {
    const lines: string[] = [];

    // 标题行
    const title = this.getSeverityIcon(error.severity) + ' ' + error.title;
    lines.push(this.color('='.repeat(50), 'gray'));
    lines.push(this.color(title, this.getSeverityColor(error.severity)));
    lines.push(this.color('='.repeat(50), 'gray'));
    lines.push('');

    // 错误消息
    lines.push(error.message);
    lines.push('');

    // 错误代码
    lines.push(this.color('错误代码: ', 'gray') + error.code);
    lines.push(this.color('错误分类: ', 'gray') + error.category);
    lines.push('');

    // 详细信息
    if (this.options.showDetails && error.details) {
      lines.push(this.color('详细信息:', 'blue'));
      lines.push(error.details);
      lines.push('');
    }

    // 建议操作
    if (this.options.showSuggestions && error.suggestions.length > 0) {
      lines.push(this.color('建议操作:', 'green'));
      error.suggestions.forEach((s, i) => {
        lines.push(`  ${i + 1}. ${s}`);
      });
      lines.push('');
    }

    // 文档链接
    if (error.documentation) {
      lines.push(this.color('参考文档: ', 'gray') + error.documentation);
    }

    // 底部
    lines.push(this.color('-'.repeat(50), 'gray'));

    const output = lines.join('\n');

    if (this.options.outputTarget === 'string') {
      return output;
    }

    console.log(output);
  }

  /**
   * 展示技术错误（供开发者使用）
   */
  displayTechnical(error: Error, context?: Record<string, any>): string | void {
    const lines: string[] = [];

    lines.push(this.color('='.repeat(50), 'gray'));
    lines.push(this.color('技术错误详情', 'yellow'));
    lines.push(this.color('='.repeat(50), 'gray'));
    lines.push('');

    // 错误类型
    lines.push(this.color('错误类型: ', 'gray') + error.constructor.name);

    // 错误消息
    lines.push(this.color('错误消息: ', 'gray') + error.message);

    // 上下文信息
    if (context && Object.keys(context).length > 0) {
      lines.push('');
      lines.push(this.color('上下文:', 'blue'));
      Object.entries(context).forEach(([key, value]) => {
        const formattedValue = typeof value === 'object'
          ? JSON.stringify(value, null, 2)
          : String(value);
        lines.push(this.color(`  ${key}: `, 'gray') + formattedValue);
      });
    }

    // 堆栈跟踪
    if (this.options.showStackTrace && error.stack) {
      lines.push('');
      lines.push(this.color('堆栈跟踪:', 'blue'));
      lines.push(error.stack);
    }

    lines.push(this.color('-'.repeat(50), 'gray'));

    const output = lines.join('\n');

    if (this.options.outputTarget === 'string') {
      return output;
    }

    console.log(output);
  }

  /**
   * 展示原始错误
   * 自动判断是用户错误还是技术错误
   */
  displayMixed(error: Error | string, context?: Record<string, any>): void {
    const userError = typeof error === 'string'
      ? getUserFriendlyError(error)
      : getUserFriendlyError(error);

    this.display(userError);

    // 如果是未知错误或系统错误，显示技术详情
    if (
      userError.code.startsWith('SYS_') ||
      userError.code === ErrorCode.UNKNOWN_ERROR
    ) {
      const actualError = typeof error === 'string' ? new Error(error) : error;
      console.log('');
      this.displayTechnical(actualError, context);
    }
  }

  /**
   * 展示简洁错误（仅显示关键信息）
   */
  displayBrief(error: UserFriendlyError): void {
    const icon = this.getSeverityIcon(error.severity);
    const message = `${icon} ${error.code}: ${error.title} - ${error.message}`;

    console.log(this.color(message, this.getSeverityColor(error.severity)));

    if (error.suggestions.length > 0) {
      console.log(this.color(`  建议: ${error.suggestions[0]}`, 'gray'));
    }
  }

  /**
   * 格式化错误为结构化数据
   */
  formatAsJSON(error: UserFriendlyError): string {
    return JSON.stringify(error, null, 2);
  }

  /**
   * 颜色化文本
   */
  private color(text: string, color: string): string {
    if (!this.options.colorOutput || !process.stdout.isTTY) {
      return text;
    }

    const colors: Record<string, string> = {
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      gray: '\x1b[90m',
      reset: '\x1b[0m',
    };

    return `${colors[color] || colors.reset}${text}${colors.reset}`;
  }

  /**
   * 获取严重程度对应的颜色
   */
  private getSeverityColor(severity: string): string {
    const colorMap: Record<string, string> = {
      info: 'blue',
      warning: 'yellow',
      error: 'red',
      critical: 'red',
    };
    return colorMap[severity] || 'gray';
  }

  /**
   * 获取严重程度对应的图标
   */
  private getSeverityIcon(severity: string): string {
    const iconMap: Record<string, string> = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      critical: '🚨',
    };
    return iconMap[severity] || '❓';
  }
}

/**
 * 便捷函数：展示错误
 */
export function displayError(
  error: Error | string,
  context?: {
    taskId?: string;
    toolName?: string;
    provider?: string;
    filePath?: string;
    roleType?: string;
  }
): void {
  const display = new ErrorDisplay();
  const userError = getUserFriendlyError(error, context);
  display.display(userError);
}

/**
 * 便捷函数：展示技术错误
 */
export function displayTechnicalError(
  error: Error,
  context?: Record<string, any>
): void {
  const display = new ErrorDisplay();
  display.displayTechnical(error, context);
}

/**
 * 创建错误展示器实例
 */
export function createErrorDisplay(options?: ErrorDisplayOptions): ErrorDisplay {
  return new ErrorDisplay(options);
}

/**
 * 错误格式化工具
 */
export const ErrorFormatter = {
  /**
   * 格式化简洁错误消息
   */
  brief(error: UserFriendlyError): string {
    const display = new ErrorDisplay({ colorOutput: false, outputTarget: 'string' });
    return display.formatAsJSON(error);
  },

  /**
   * 格式化详细错误消息
   */
  detailed(error: UserFriendlyError): string {
    const display = new ErrorDisplay({ colorOutput: false, outputTarget: 'string' });
    return display.display(error) as string;
  },

  /**
   * 格式化技术错误
   */
  technical(error: Error, context?: Record<string, any>): string {
    const display = new ErrorDisplay({ colorOutput: false, outputTarget: 'string' });
    return display.displayTechnical(error, context) as string;
  },
};

/**
 * 进度指示器
 */
export class ProgressIndicator {
  private frames: string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private message: string;
  private interval: NodeJS.Timeout | null = null;
  private currentFrame = 0;
  private static activeIndicators = new Set<ProgressIndicator>();

  constructor(message: string) {
    this.message = message;
  }

  /**
   * 检查是否有活动的进度指示器
   */
  static hasActive(): boolean {
    return this.activeIndicators.size > 0;
  }

  /**
   * 开始显示进度
   */
  start(): void {
    if (!process.stdout.isTTY) return;

    ProgressIndicator.activeIndicators.add(this);

    this.interval = setInterval(() => {
      const frame = this.frames[this.currentFrame];
      // 使用 clearLine 清除当前行，避免与日志输出冲突
      process.stdout.cursorTo(0);
      process.stdout.clearLine(0);
      process.stdout.write(`${frame} ${this.message}`);
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 100);
  }

  /**
   * 完成并停止进度显示
   */
  stop(success = true): void {
    ProgressIndicator.activeIndicators.delete(this);

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (process.stdout.isTTY) {
      // 清除当前行
      process.stdout.cursorTo(0);
      process.stdout.clearLine(0);
      const icon = success ? '✓' : '✗';
      const color = success ? '\x1b[32m' : '\x1b[31m';
      const reset = '\x1b[0m';
      process.stdout.write(`${color}${icon}${reset} ${this.message}\n`);
    } else {
      const result = success ? '完成' : '失败';
      console.log(`${result}: ${this.message}`);
    }
  }

  /**
   * 更新消息
   */
  update(message: string): void {
    this.message = message;
  }
}

/**
 * 进度显示辅助函数
 */
export function showProgress(
  message: string,
  callback: () => Promise<void>
): Promise<void> {
  const progress = new ProgressIndicator(message);
  progress.start();

  return callback().then(
    () => progress.stop(true),
    (error) => {
      progress.stop(false);
      throw error;
    }
  );
}
