import { EventEmitter } from 'eventemitter3';
import type { Task, TaskStatus } from '../types/index.js';

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatuses: TaskStatus[];
}

export interface RetryInfo {
  canRetry: boolean;
  remainingAttempts: number;
  nextRetryAt: Date | null;
  retryHistory: Task['retryHistory'];
}

export interface RetryEventData {
  taskId: string;
  attemptNumber: number;
  delayMs: number;
  timestamp: Date;
  userId?: string;
}

export class RetryManager extends EventEmitter {
  private config: RetryConfig;
  private taskGetter: () => Map<string, Task>;
  private retryQueue: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    config: Partial<RetryConfig>,
    taskGetter: () => Map<string, Task>
  ) {
    super();
    this.config = {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 60000,
      backoffMultiplier: 2,
      retryableStatuses: ['failed'],
      ...config,
    };
    this.taskGetter = taskGetter;
  }

  async handleFailure(
    taskId: string,
    error: string,
    errorStack?: string
  ): Promise<boolean> {
    const tasks = this.taskGetter();
    const task = tasks.get(taskId);

    if (!task) {
      console.warn(`RetryManager: Task ${taskId} not found`);
      return false;
    }

    const attemptCount = (task.retryHistory || []).length + 1;

    if (attemptCount >= this.config.maxAttempts) {
      console.log(
        `RetryManager: Task ${taskId} reached max attempts (${this.config.maxAttempts})`
      );
      return false;
    }

    const delayMs = this.calculateDelay(attemptCount);

    const retryRecord: NonNullable<Task['retryHistory']>[number] = {
      attemptNumber: attemptCount,
      failedAt: new Date(),
      error,
      errorStack,
      delayMs,
    };

    task.retryHistory = task.retryHistory || [];
    task.retryHistory.push(retryRecord);
    task.status = 'pending';

    this.scheduleRetry(taskId, delayMs);

    return true;
  }

  async manualRetry(taskId: string, userId?: string): Promise<boolean> {
    const tasks = this.taskGetter();
    const task = tasks.get(taskId);

    if (!task) {
      return false;
    }

    task.status = 'pending';
    task.retryHistory = task.retryHistory || [];
    task.retryHistory.push({
      attemptNumber: task.retryHistory.length + 1,
      failedAt: new Date(),
      error: 'Manual retry',
      delayMs: 0,
      retriedAt: new Date(),
      retriedBy: userId || 'user',
    });

    this.emit('retry:manual', { taskId, attemptNumber: task.retryHistory.length, delayMs: 0, timestamp: new Date(), userId } as RetryEventData);
    return true;
  }

  cancelRetry(taskId: string): boolean {
    const timeout = this.retryQueue.get(taskId);

    if (timeout) {
      clearTimeout(timeout);
      this.retryQueue.delete(taskId);

      const tasks = this.taskGetter();
      const task = tasks.get(taskId);

      if (task) {
        task.status = 'failed';
      }

      return true;
    }

    return false;
  }

  getRetryInfo(taskId: string): RetryInfo | null {
    const tasks = this.taskGetter();
    const task = tasks.get(taskId);

    if (!task) {
      return null;
    }

    const history = task.retryHistory || [];
    const attemptCount = history.length;

    const nextRetryAt = this.retryQueue.has(taskId)
      ? new Date(Date.now() + this.calculateDelay(attemptCount + 1))
      : null;

    return {
      canRetry: attemptCount < this.config.maxAttempts,
      remainingAttempts: this.config.maxAttempts - attemptCount,
      nextRetryAt,
      retryHistory: history,
    };
  }

  private calculateDelay(attemptNumber: number): number {
    const delay =
      this.config.initialDelayMs *
      Math.pow(this.config.backoffMultiplier, attemptNumber - 1);

    return Math.min(delay, this.config.maxDelayMs);
  }

  private scheduleRetry(taskId: string, delayMs: number): void {
    const timeout = setTimeout(async () => {
      await this.performRetry(taskId);
      this.retryQueue.delete(taskId);
    }, delayMs);

    this.retryQueue.set(taskId, timeout);
  }

  private async performRetry(taskId: string): Promise<void> {
    const tasks = this.taskGetter();
    const task = tasks.get(taskId);

    if (!task) {
      return;
    }

    task.status = 'pending';
    task.retryHistory = task.retryHistory || [];

    for (let i = 0; i < task.retryHistory.length; i++) {
      if (!task.retryHistory[i].retriedAt) {
        task.retryHistory[i].retriedAt = new Date();
        break;
      }
    }

    this.emit('retry:scheduled', { taskId, attemptNumber: 0, delayMs: 0, timestamp: new Date() } as RetryEventData);
  }

  getStats(): {
    pendingRetries: number;
    totalRetries: number;
    maxAttempts: number;
  } {
    return {
      pendingRetries: this.retryQueue.size,
      totalRetries: this.retryQueue.size,
      maxAttempts: this.config.maxAttempts,
    };
  }
}
