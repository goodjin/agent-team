import readline from 'readline';

/**
 * 进度类型
 */
export type ProgressType = 'loading' | 'downloading' | 'processing' | 'uploading';

/**
 * 进度显示选项
 */
export interface ProgressOptions {
  type?: ProgressType;
  prefix?: string;
  suffix?: string;
  width?: number;
  showPercentage?: boolean;
  showSpeed?: boolean;
  showETA?: boolean;
}

/**
 * 进度信息接口
 */
export interface ProgressInfo {
  current: number;
  total: number;
  message: string;
  percentage: number;
}

/**
 * 进度显示管理器
 * 提供统一的进度显示功能，支持多种进度类型
 */
export class ProgressManager {
  private options: ProgressOptions;
  private currentProgress: number;
  private total: number;
  private startTime: number;
  private lastUpdate: number;
  private frameIndex: number;
  private interval: NodeJS.Timeout | null = null;
  private message: string;

  private static readonly FRAMES: Record<ProgressType, string[]> = {
    loading: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    downloading: ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆'],
    processing: ['◐', '◓', '◑', '◒', '◐', '◓', '◑', '◒'],
    uploading: ['█', '▇', '▆', '▅', '▄', '▃', '▂', '▁'],
  };

  private static readonly COLOR_FRAMES: Record<ProgressType, string> = {
    loading: 'cyan',
    downloading: 'green',
    processing: 'magenta',
    uploading: 'blue',
  };

  constructor(options: ProgressOptions = {}) {
    this.options = {
      type: 'loading',
      width: 40,
      showPercentage: true,
      showSpeed: false,
      showETA: false,
      ...options,
    };
    this.currentProgress = 0;
    this.total = 100;
    this.startTime = Date.now();
    this.lastUpdate = Date.now();
    this.frameIndex = 0;
    this.message = '';
  }

  /**
   * 开始进度显示
   */
  start(message: string, total: number = 100): void {
    this.message = message;
    this.total = total;
    this.currentProgress = 0;
    this.startTime = Date.now();
    this.lastUpdate = Date.now();
    this.frameIndex = 0;

    if (process.stdout.isTTY) {
      this.render();
      this.startAnimation();
    } else {
      console.log(`${message}...`);
    }
  }

  /**
   * 更新进度
   */
  update(current: number, message?: string): void {
    this.currentProgress = current;
    if (message) {
      this.message = message;
    }
    this.lastUpdate = Date.now();

    if (process.stdout.isTTY) {
      this.render();
    }
  }

  /**
   * 增加进度
   */
  increment(delta: number = 1, message?: string): void {
    this.update(this.currentProgress + delta, message);
  }

  /**
   * 完成进度
   */
  complete(message?: string): void {
    this.currentProgress = this.total;
    if (message) {
      this.message = message;
    }

    if (process.stdout.isTTY) {
      this.stopAnimation();
      this.render();
      process.stdout.write('\n');
    } else {
      console.log(`${this.message} - 完成`);
    }
  }

  /**
   * 失败
   */
  fail(message?: string): void {
    this.stopAnimation();
    if (process.stdout.isTTY) {
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
    }
    console.error(`${this.message} - ${message || '失败'}`);
  }

  /**
   * 显示信息（不更新进度）
   */
  info(message: string): void {
    this.stopAnimation();
    if (process.stdout.isTTY) {
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
    }
    console.log(message);
    this.startAnimation();
  }

  /**
   * 获取当前进度信息
   */
  getProgress(): ProgressInfo {
    const percentage = this.total > 0
      ? Math.round((this.currentProgress / this.total) * 100)
      : 0;
    return {
      current: this.currentProgress,
      total: this.total,
      message: this.message,
      percentage,
    };
  }

  /**
   * 开始动画
   */
  private startAnimation(): void {
    if (this.interval) return;

    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % 10;
      this.render();
    }, 100);
  }

  /**
   * 停止动画
   */
  private stopAnimation(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * 渲染进度条
   */
  private render(): void {
    const percentage = this.total > 0
      ? Math.round((this.currentProgress / this.total) * 100)
      : 0;

    const frames = ProgressManager.FRAMES[this.options.type || 'loading'];
    const frame = frames[this.frameIndex % frames.length];
    const frameColor = ProgressManager.COLOR_FRAMES[this.options.type || 'loading'];

    let line = `\r${this.color(frame, frameColor)} ${this.message}`;

    if (this.options.showPercentage) {
      const barWidth = this.options.width || 40;
      const filled = Math.round((barWidth * percentage) / 100);
      const empty = barWidth - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      line += ` [${bar}] ${percentage}%`;
    }

    if (this.options.showSpeed && this.total > 0) {
      const elapsed = (Date.now() - this.startTime) / 1000;
      const speed = elapsed > 0 ? this.currentProgress / elapsed : 0;
      line += ` ${speed.toFixed(1)}/s`;
    }

    if (this.options.showETA && percentage > 0) {
      const remaining = this.total - this.currentProgress;
      const elapsed = Date.now() - this.startTime;
      const avgSpeed = elapsed > 0 ? this.currentProgress / elapsed : 0;
      const etaSeconds = avgSpeed > 0 ? remaining / avgSpeed / 1000 : 0;
      line += ` ETA: ${Math.round(etaSeconds)}s`;
    }

    process.stdout.write(line);
  }

  /**
   * 颜色化文本
   */
  private color(text: string, color: string): string {
    if (!process.stdout.isTTY) {
      return text;
    }

    const colors: Record<string, string> = {
      black: '\x1b[30m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',
      gray: '\x1b[90m',
      bold: '\x1b[1m',
      reset: '\x1b[0m',
    };

    const reset = colors.reset;
    const code = colors[color] || '';

    return `${code}${text}${reset}`;
  }
}

/**
 * 异步包装器，带进度显示
 */
export async function withProgress<T>(
  message: string,
  fn: (progress: ProgressManager) => Promise<T>,
  options: ProgressOptions = {}
): Promise<T> {
  const progress = new ProgressManager(options);

  try {
    const result = await fn(progress);
    progress.complete();
    return result;
  } catch (error) {
    progress.fail(String(error));
    throw error;
  }
}

/**
 * 简单的加载动画
 */
export async function withLoading<T>(
  message: string,
  fn: () => Promise<T>
): Promise<T> {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let loading = true;

  const interval = setInterval(() => {
    if (loading) {
      process.stdout.write(`\r${frames[i % frames.length]} ${message}`);
      i++;
    }
  }, 80);

  try {
    const result = await fn();
    loading = false;
    clearInterval(interval);
    process.stdout.write(`\r✓ ${message}\n`);
    return result;
  } catch (error) {
    loading = false;
    clearInterval(interval);
    process.stdout.write(`\r✗ ${message}\n`);
    throw error;
  }
}
