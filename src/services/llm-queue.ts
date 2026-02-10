import { EventEmitter } from 'eventemitter3';
import type { LLMResponse, Message, LLMConfig } from '../types/index.js';
import { LLMServiceFactory } from './llm.service.js';

export interface QueueConfig {
  maxConcurrent: number;
  retryOnRateLimit: boolean;
  retryDelayMs: number;
  maxRetries: number;
}

export interface QueueItem {
  id: string;
  messages: Message[];
  options?: {
    temperature?: number;
    maxTokens?: number;
    config?: LLMConfig;
  };
  resolve: (response: LLMResponse) => void;
  reject: (error: Error) => void;
  priority: number;
  createdAt: Date;
  retryCount: number;
}

function log(level: 'info' | 'warn' | 'error', ...args: any[]): void {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
  const prefix = `[${timestamp}] [LLM-Queue]`;
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
  const msg = `${prefix} ${message}`;
  if (level === 'error') {
    console.error(msg);
  } else if (level === 'warn') {
    console.warn(msg);
  } else {
    console.log(msg);
  }
}

export class LLMQueue extends EventEmitter {
  private queue: QueueItem[] = [];
  private running: Map<string, Promise<LLMResponse>> = new Map();
  private config: QueueConfig;
  private processing: boolean = false;

  constructor(config?: Partial<QueueConfig>) {
    super();
    this.config = {
      maxConcurrent: config?.maxConcurrent ?? 3,
      retryOnRateLimit: config?.retryOnRateLimit ?? true,
      retryDelayMs: config?.retryDelayMs ?? 2000,
      maxRetries: config?.maxRetries ?? 3,
    };
    log('info', `队列初始化，最大并发: ${this.config.maxConcurrent}`);
  }

  async request(
    messages: Message[],
    options?: { temperature?: number; maxTokens?: number; config?: LLMConfig }
  ): Promise<LLMResponse> {
    const id = this.generateId();
    const llmConfig = options?.config;
    const model = llmConfig?.model || 'unknown';
    const provider = llmConfig?.provider || 'unknown';

    log('info', `请求入队: id=${id}, model=${model}, provider=${provider}`);

    return new Promise((resolve, reject) => {
      const item: QueueItem = {
        id,
        messages,
        options: {
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
          config: llmConfig,
        },
        resolve,
        reject,
        priority: 0,
        createdAt: new Date(),
        retryCount: 0,
      };

      this.enqueue(item);
    });
  }

  private enqueue(item: QueueItem): void {
    this.queue.push(item);
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    log('info', `入队成功，队列长度: ${this.queue.length}`);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.running.size >= this.config.maxConcurrent) {
      log('info', `达到最大并发 ${this.running.size}/${this.config.maxConcurrent}，等待中...`);
      return;
    }

    if (this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.processItem(item);
  }

  private async processItem(item: QueueItem): Promise<void> {
    const config = item.options?.config;
    const model = config?.model || 'unknown';

    log('info', `开始处理请求: id=${item.id}, model=${model}, 重试次数=${item.retryCount}`);

    const promise = this.executeRequest(item);
    this.running.set(item.id, promise);

    try {
      const response = await promise;
      const inputTokens = response.usage?.promptTokens || 0;
      const outputTokens = response.usage?.completionTokens || 0;
      log('info', `✅ 请求成功: id=${item.id}, model=${model}, 输入tokens=${inputTokens}, 输出tokens=${outputTokens}`);
      item.resolve(response);
      this.emit('completed', { id: item.id, response });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isRateLimit = this.isRateLimitError(error);

      if (isRateLimit && item.retryCount < this.config.maxRetries && this.config.retryOnRateLimit) {
        item.retryCount++;
        log('warn', `⚠️ 速率限制，准备重试: id=${item.id}, 重试=${item.retryCount}/${this.config.maxRetries}`);
        this.emit('retry', { id: item.id, retryCount: item.retryCount });

        await this.delay(this.config.retryDelayMs * item.retryCount);
        this.enqueue(item);
        return;
      }

      log('error', `❌ 请求失败: id=${item.id}, model=${model}, 错误=${errorMsg}`);
      item.reject(error instanceof Error ? error : new Error(errorMsg));
      this.emit('failed', { id: item.id, error });
    } finally {
      this.running.delete(item.id);
      this.processQueue();
    }
  }

  private async executeRequest(item: QueueItem): Promise<LLMResponse> {
    let config = item.options?.config;

    if (!config) {
      throw new Error('LLM配置缺失，请检查配置文件');
    }

    if (!config.apiKey) {
      throw new Error(`API Key未配置: provider=${config.provider}, model=${config.model}`);
    }

    const llmService = LLMServiceFactory.create(config);
    if (!llmService) {
      throw new Error(`无法创建LLM服务: provider=${config.provider}, model=${config.model}`);
    }

    log('info', `调用LLM服务: provider=${config.provider}, model=${config.model}`);

    return llmService.complete(item.messages, {
      temperature: item.options?.temperature ?? config.temperature,
      maxTokens: item.options?.maxTokens ?? config.maxTokens,
    });
  }

  private isRateLimitError(error: any): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') ||
        message.includes('429') ||
        message.includes('too many requests')
      );
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getStats(): {
    queueLength: number;
    runningCount: number;
    maxConcurrent: number;
  } {
    return {
      queueLength: this.queue.length,
      runningCount: this.running.size,
      maxConcurrent: this.config.maxConcurrent,
    };
  }

  clear(): void {
    for (const item of this.queue) {
      item.reject(new Error('队列已清空'));
    }
    this.queue = [];
    log('warn', '队列已清空');
  }
}

export const llmQueue = new LLMQueue({
  maxConcurrent: 3,
  retryOnRateLimit: true,
  retryDelayMs: 2000,
  maxRetries: 3,
});
