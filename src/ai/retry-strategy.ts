/**
 * 智能重试策略 (Smart Retry Strategy)
 * 根据错误类型动态调整重试策略
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
  retryableErrors: string[];
  nonRetryableErrors: string[];
}

export interface RetryState {
  attempt: number;
  lastAttemptTime: number;
  totalDelay: number;
  history: RetryAttempt[];
}

export interface RetryAttempt {
  attempt: number;
  timestamp: number;
  error: string;
  errorType: string;
  delay: number;
  success: boolean;
}

export interface RetryDecision {
  shouldRetry: boolean;
  delay: number;
  reason: string;
  strategy?: string;
}

export interface ErrorClassifier {
  type: 'rate_limit' | 'auth' | 'network' | 'timeout' | 'validation' | 'server' | 'unknown';
  severity: 'recoverable' | 'non_recoverable' | 'unknown';
  suggestedAction: 'retry' | 'wait' | 'abort' | 'fallback';
  retryAfter?: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
  retryableErrors: [
    'rate_limit',
    'timeout',
    'network',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ENETUNREACH',
  ],
  nonRetryableErrors: [
    'authentication',
    'authorization',
    'validation',
    'invalid_request',
    'unauthorized',
    'forbidden',
  ],
};

/**
 * 智能重试策略管理器
 */
export class SmartRetryStrategy {
  private config: RetryConfig;
  private state: Map<string, RetryState> = new Map();

  constructor(config?: Partial<RetryConfig>) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * 创建重试上下文
   */
  createContext(operationId: string): RetryState {
    const state: RetryState = {
      attempt: 0,
      lastAttemptTime: 0,
      totalDelay: 0,
      history: [],
    };
    this.state.set(operationId, state);
    return state;
  }

  /**
   * 获取重试状态
   */
  getState(operationId: string): RetryState | undefined {
    return this.state.get(operationId);
  }

  /**
   * 清除重试状态
   */
  clearState(operationId: string): void {
    this.state.delete(operationId);
  }

  /**
   * 决定是否重试
   */
  shouldRetry(operationId: string, error: Error | string): RetryDecision {
    const state = this.state.get(operationId);
    if (!state) {
      return this.makeDecision(0, error);
    }

    return this.makeDecision(state.attempt, error);
  }

  /**
   * 做出重试决策
   */
  private makeDecision(attempt: number, error: Error | string): RetryDecision {
    const errorStr = error instanceof Error ? error.message : String(error);
    const classifier = this.classifyError(errorStr);

    // 不可恢复的错误
    if (classifier.type === 'auth' || classifier.suggestedAction === 'abort') {
      return {
        shouldRetry: false,
        delay: 0,
        reason: `错误类型 "${classifier.type}" 不支持重试`,
        strategy: 'abort',
      };
    }

    // 达到最大重试次数
    if (attempt >= this.config.maxRetries) {
      return {
        shouldRetry: false,
        delay: 0,
        reason: `已达到最大重试次数 (${this.config.maxRetries})`,
        strategy: 'abort',
      };
    }

    // 速率限制
    if (classifier.type === 'rate_limit') {
      const delay = classifier.retryAfter || this.calculateDelay(attempt);
      return {
        shouldRetry: true,
        delay,
        reason: '触发速率限制，需要等待后重试',
        strategy: 'rate_limit_backoff',
      };
    }

    // 网络错误 - 指数退避
    if (classifier.type === 'network' || classifier.type === 'timeout') {
      const delay = this.calculateDelay(attempt);
      return {
        shouldRetry: true,
        delay,
        reason: `网络错误，${this.getBackoffDescription(attempt)}后重试`,
        strategy: 'exponential_backoff',
      };
    }

    // 服务器错误 - 指数退避
    if (classifier.type === 'server') {
      const delay = this.calculateDelay(attempt);
      return {
        shouldRetry: true,
        delay,
        reason: `服务器错误，${this.getBackoffDescription(attempt)}后重试`,
        strategy: 'exponential_backoff',
      };
    }

    // 未知错误 - 有限重试
    if (classifier.severity === 'unknown') {
      if (attempt < 2) {
        const delay = this.calculateDelay(attempt);
        return {
          shouldRetry: true,
          delay,
          reason: `未知错误，尝试重新执行`,
          strategy: 'conservative_retry',
        };
      }
      return {
        shouldRetry: false,
        delay: 0,
        reason: '未知错误重试失败，停止重试',
        strategy: 'abort',
      };
    }

    // 默认：可恢复错误
    const delay = this.calculateDelay(attempt);
    return {
      shouldRetry: true,
      delay,
      reason: `可恢复错误，${this.getBackoffDescription(attempt)}后重试`,
      strategy: 'default_retry',
    };
  }

  /**
   * 记录重试尝试
   */
  recordAttempt(
    operationId: string,
    error: Error | string,
    success: boolean
  ): void {
    let state = this.state.get(operationId);
    if (!state) {
      state = this.createContext(operationId);
    }

    const errorStr = error instanceof Error ? error.message : String(error);
    const classifier = this.classifyError(errorStr);

    const attempt: RetryAttempt = {
      attempt: state.attempt,
      timestamp: Date.now(),
      error: errorStr,
      errorType: classifier.type,
      delay: state.totalDelay,
      success,
    };

    state.history.push(attempt);

    if (success) {
      state.attempt = 0;
      state.totalDelay = 0;
    } else {
      state.attempt++;
    }

    state.lastAttemptTime = Date.now();
  }

  /**
   * 计算延迟时间
   */
  private calculateDelay(attempt: number): number {
    // 指数退避
    const exponentialDelay = this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt);

    // 添加抖动
    const jitter = exponentialDelay * this.config.jitterFactor * Math.random();

    // 限制最大延迟
    const delay = Math.min(exponentialDelay + jitter, this.config.maxDelayMs);

    return Math.floor(delay);
  }

  /**
   * 获取退避描述
   */
  private getBackoffDescription(attempt: number): string {
    const delay = this.calculateDelay(attempt);
    if (delay < 1000) {
      return `${delay}ms`;
    }
    return `${(delay / 1000).toFixed(1)}秒`;
  }

  /**
   * 错误分类
   */
  classifyError(error: string): ErrorClassifier {
    const lowerError = error.toLowerCase();

    // 速率限制
    if (lowerError.includes('rate_limit') || lowerError.includes('429') || lowerError.includes('too many requests')) {
      return {
        type: 'rate_limit',
        severity: 'recoverable',
        suggestedAction: 'wait',
        retryAfter: this.extractRetryAfter(error),
      };
    }

    // 认证错误
    if (lowerError.includes('auth') || lowerError.includes('401') || lowerError.includes('unauthorized')) {
      return {
        type: 'auth',
        severity: 'non_recoverable',
        suggestedAction: 'abort',
      };
    }

    // 授权错误
    if (lowerError.includes('403') || lowerError.includes('forbidden') || lowerError.includes('permission')) {
      return {
        type: 'auth',
        severity: 'non_recoverable',
        suggestedAction: 'abort',
      };
    }

    // 网络错误
    if (
      lowerError.includes('network') ||
      lowerError.includes('econnreset') ||
      lowerError.includes('enetunreach') ||
      lowerError.includes('enotfound') ||
      lowerError.includes('econnrefused')
    ) {
      return {
        type: 'network',
        severity: 'recoverable',
        suggestedAction: 'retry',
      };
    }

    // 超时
    if (lowerError.includes('timeout') || lowerError.includes('etimedout') || lowerError.includes('timed out')) {
      return {
        type: 'timeout',
        severity: 'recoverable',
        suggestedAction: 'retry',
      };
    }

    // 验证错误
    if (lowerError.includes('validation') || lowerError.includes('invalid') || lowerError.includes('malformed')) {
      return {
        type: 'validation',
        severity: 'non_recoverable',
        suggestedAction: 'abort',
      };
    }

    // 服务器错误
    if (lowerError.includes('500') || lowerError.includes('502') || lowerError.includes('503') || lowerError.includes('504')) {
      return {
        type: 'server',
        severity: 'recoverable',
        suggestedAction: 'retry',
      };
    }

    // 未知
    return {
      type: 'unknown',
      severity: 'unknown',
      suggestedAction: 'retry',
    };
  }

  /**
   * 从错误信息中提取 retry-after
   */
  private extractRetryAfter(error: string): number | undefined {
    const match = error.match(/retry[- ]?after[:\s]*(\d+)/i);
    if (match) {
      return parseInt(match[1], 10) * 1000;
    }
    return undefined;
  }

  /**
   * 等待指定时间
   */
  async wait(delay: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * 执行带重试的操作
   */
  async executeWithRetry<T>(
    operationId: string,
    operation: () => Promise<T>,
    onRetry?: (attempt: number, error: Error) => void
  ): Promise<T> {
    this.createContext(operationId);

    while (true) {
      try {
        const result = await operation();
        this.recordAttempt(operationId, '', true);
        return result;
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        this.recordAttempt(operationId, errorObj, false);

        const decision = this.shouldRetry(operationId, errorObj);

        if (!decision.shouldRetry) {
          throw error;
        }

        if (onRetry) {
          const state = this.getState(operationId);
          onRetry(state?.attempt || 0, errorObj);
        }

        await this.wait(decision.delay);
      }
    }
  }

  /**
   * 获取重试统计
   */
  getStats(operationId: string): { attempts: number; success: boolean; history: RetryAttempt[] } | undefined {
    const state = this.state.get(operationId);
    if (!state) return undefined;

    const successCount = state.history.filter(a => a.success).length;
    return {
      attempts: state.history.length,
      success: successCount > 0,
      history: state.history,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }
}

// 导出工厂函数
export function createSmartRetryStrategy(config?: Partial<RetryConfig>): SmartRetryStrategy {
  return new SmartRetryStrategy(config);
}
