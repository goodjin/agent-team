import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RetryManager } from '../../src/core/retry-manager.js';
import type { Task } from '../../src/types/index.js';

describe('RetryManager', () => {
  let retryManager: RetryManager;
  let mockTaskGetter: () => Map<string, Task>;
  let mockTasks: Map<string, Task>;

  const createMockTask = (overrides: Partial<Task> = {}): Task => {
    const task: Task = {
      id: 'task-1',
      type: 'development',
      title: 'Test Task',
      description: 'Test Description',
      status: 'pending',
      priority: 'medium',
      createdAt: new Date(),
      updatedAt: new Date(),
      retryHistory: [],
      ...overrides,
    };
    if (overrides.retryHistory) {
      task.retryHistory = overrides.retryHistory;
    }
    return task;
  };

  beforeEach(() => {
    mockTasks = new Map<string, Task>();
    mockTaskGetter = () => mockTasks;
    retryManager = new RetryManager(
      {
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        retryableStatuses: ['failed'],
      },
      mockTaskGetter
    );
  });

  afterEach(() => {
    const stats = retryManager.getStats();
    for (const taskId of mockTasks.keys()) {
      retryManager.cancelRetry(taskId);
    }
    vi.clearAllTimers();
  });

  describe('handleFailure', () => {
    it('should schedule a retry for a failed task', async () => {
      const task = createMockTask({ status: 'failed' });
      mockTasks.set(task.id, task);

      const result = await retryManager.handleFailure(task.id, 'Test error');

      expect(result).toBe(true);
      expect(task.status).toBe('pending');
      expect(task.retryHistory!).toHaveLength(1);
      expect(task.retryHistory![0].attemptNumber).toBe(1);
      expect(task.retryHistory![0].error).toBe('Test error');
      expect(task.retryHistory![0].delayMs).toBe(100);
    });

    it('should return false for non-existent task', async () => {
      const result = await retryManager.handleFailure('non-existent', 'Error');

      expect(result).toBe(false);
    });

    it('should stop retrying after max attempts', async () => {
      const task = createMockTask({
        status: 'failed',
        retryHistory: [
          {
            attemptNumber: 1,
            failedAt: new Date(),
            error: 'Error 1',
            delayMs: 100,
          },
          {
            attemptNumber: 2,
            failedAt: new Date(),
            error: 'Error 2',
            delayMs: 200,
          },
          {
            attemptNumber: 3,
            failedAt: new Date(),
            error: 'Error 3',
            delayMs: 400,
          },
        ],
      });
      mockTasks.set(task.id, task);

      const result = await retryManager.handleFailure(task.id, 'Error 4');

      expect(result).toBe(false);
    });

    it('should calculate exponential backoff delay', async () => {
      const task1 = createMockTask({ id: 'task-1', status: 'failed' });
      const task2 = createMockTask({ id: 'task-2', status: 'failed' });
      const task3 = createMockTask({ id: 'task-3', status: 'failed' });
      mockTasks.set(task1.id, task1);
      mockTasks.set(task2.id, task2);
      mockTasks.set(task3.id, task3);

      await retryManager.handleFailure(task1.id, 'Error 1');
      expect(task1.retryHistory![0].delayMs).toBe(100);

      await retryManager.handleFailure(task2.id, 'Error 2');
      expect(task2.retryHistory![0].delayMs).toBe(100);

      await retryManager.handleFailure(task3.id, 'Error 3');
      expect(task3.retryHistory![0].delayMs).toBe(100);
    });

    it('should cap delay at maxDelayMs', async () => {
      retryManager = new RetryManager(
        {
          maxAttempts: 5,
          initialDelayMs: 100,
          maxDelayMs: 500,
          backoffMultiplier: 2,
          retryableStatuses: ['failed'],
        },
        mockTaskGetter
      );

      const task = createMockTask({ status: 'failed' });
      mockTasks.set(task.id, task);

      for (let i = 0; i < 4; i++) {
        task.status = 'failed';
        await retryManager.handleFailure(task.id, `Error ${i + 1}`);
      }

      expect(task.retryHistory![0].delayMs).toBe(100);
      expect(task.retryHistory![1].delayMs).toBe(200);
      expect(task.retryHistory![2].delayMs).toBe(400);
      expect(task.retryHistory![3].delayMs).toBe(500);
    });

    it('should store error stack when provided', async () => {
      const task = createMockTask({ status: 'failed' });
      mockTasks.set(task.id, task);

      await retryManager.handleFailure(task.id, 'Test error', 'Error stack trace');

      expect(task.retryHistory![0].errorStack).toBe('Error stack trace');
    });
  });

  describe('manualRetry', () => {
    it('should manually retry a task', async () => {
      const task = createMockTask({ status: 'failed' });
      mockTasks.set(task.id, task);

      const result = await retryManager.manualRetry(task.id, 'user-123');

      expect(result).toBe(true);
      expect(task.status).toBe('pending');
      expect(task.retryHistory!).toHaveLength(1);
      expect(task.retryHistory![0].error).toBe('Manual retry');
      expect(task.retryHistory![0].retriedBy).toBe('user-123');
      expect(task.retryHistory![0].retriedAt).toBeInstanceOf(Date);
    });

    it('should return false for non-existent task', async () => {
      const result = await retryManager.manualRetry('non-existent');

      expect(result).toBe(false);
    });

    it('should use default user id when not provided', async () => {
      const task = createMockTask({ status: 'failed' });
      mockTasks.set(task.id, task);

      await retryManager.manualRetry(task.id);

      expect(task.retryHistory![0].retriedBy).toBe('user');
    });

    it('should emit retry:manual event', async () => {
      const task = createMockTask({ status: 'failed' });
      mockTasks.set(task.id, task);

      const eventHandler = vi.fn();
      retryManager.on('retry:manual', eventHandler);

      await retryManager.manualRetry(task.id, 'test-user');

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: task.id,
          userId: 'test-user',
          attemptNumber: 1,
        })
      );
    });

    it('should append to existing retry history', async () => {
      const task = createMockTask({
        status: 'failed',
        retryHistory: [
          {
            attemptNumber: 1,
            failedAt: new Date(),
            error: 'Previous error',
            delayMs: 100,
          },
        ],
      });
      mockTasks.set(task.id, task);

      await retryManager.manualRetry(task.id);

      expect(task.retryHistory!).toHaveLength(2);
      expect(task.retryHistory![1].attemptNumber).toBe(2);
    });
  });

  describe('cancelRetry', () => {
    it('should cancel a scheduled retry', async () => {
      const task = createMockTask({ status: 'failed' });
      mockTasks.set(task.id, task);

      await retryManager.handleFailure(task.id, 'Error');
      const result = retryManager.cancelRetry(task.id);

      expect(result).toBe(true);
      const info = retryManager.getRetryInfo(task.id);
      expect(info?.nextRetryAt).toBeNull();
    });

    it('should return false for non-existent retry', () => {
      const result = retryManager.cancelRetry('non-existent');

      expect(result).toBe(false);
    });

    it('should set task status to failed when cancelling', async () => {
      const task = createMockTask({ status: 'failed' });
      mockTasks.set(task.id, task);

      await retryManager.handleFailure(task.id, 'Error');
      retryManager.cancelRetry(task.id);

      expect(task.status).toBe('failed');
    });
  });

  describe('getRetryInfo', () => {
    it('should return retry info for a task', async () => {
      const task = createMockTask({ status: 'failed' });
      mockTasks.set(task.id, task);

      await retryManager.handleFailure(task.id, 'Error');

      const info = retryManager.getRetryInfo(task.id);

      expect(info).not.toBeNull();
      expect(info?.canRetry).toBe(true);
      expect(info?.remainingAttempts).toBe(2);
      expect(info?.retryHistory).toHaveLength(1);
      expect(info?.nextRetryAt).not.toBeNull();
    });

    it('should return null for non-existent task', () => {
      const info = retryManager.getRetryInfo('non-existent');

      expect(info).toBeNull();
    });

    it('should calculate remaining attempts correctly', async () => {
      const task = createMockTask({
        status: 'failed',
        retryHistory: [
          { attemptNumber: 1, failedAt: new Date(), error: 'E1', delayMs: 100 },
          { attemptNumber: 2, failedAt: new Date(), error: 'E2', delayMs: 200 },
        ],
      });
      mockTasks.set(task.id, task);

      const info = retryManager.getRetryInfo(task.id);

      expect(info?.remainingAttempts).toBe(1);
      expect(info?.canRetry).toBe(true);
    });

    it('should indicate cannot retry when at max attempts', async () => {
      const task = createMockTask({
        status: 'failed',
        retryHistory: [
          { attemptNumber: 1, failedAt: new Date(), error: 'E1', delayMs: 100 },
          { attemptNumber: 2, failedAt: new Date(), error: 'E2', delayMs: 200 },
          { attemptNumber: 3, failedAt: new Date(), error: 'E3', delayMs: 400 },
        ],
      });
      mockTasks.set(task.id, task);

      const info = retryManager.getRetryInfo(task.id);

      expect(info?.remainingAttempts).toBe(0);
      expect(info?.canRetry).toBe(false);
    });

    it('should return null for nextRetryAt when no retry scheduled', () => {
      const task = createMockTask({ status: 'pending' });
      mockTasks.set(task.id, task);

      const info = retryManager.getRetryInfo(task.id);

      expect(info?.nextRetryAt).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const task1 = createMockTask({ id: 'task-1', status: 'failed' });
      const task2 = createMockTask({ id: 'task-2', status: 'failed' });
      mockTasks.set(task1.id, task1);
      mockTasks.set(task2.id, task2);

      await retryManager.handleFailure(task1.id, 'Error 1');
      await retryManager.handleFailure(task2.id, 'Error 2');

      const stats = retryManager.getStats();

      expect(stats.pendingRetries).toBe(2);
      expect(stats.totalRetries).toBe(2);
      expect(stats.maxAttempts).toBe(3);
    });

    it('should return zero pending retries when none scheduled', () => {
      const stats = retryManager.getStats();

      expect(stats.pendingRetries).toBe(0);
    });
  });

  describe('retry scheduling', () => {
    it('should perform retry after delay', async () => {
      vi.useFakeTimers();
      const task = createMockTask({ status: 'failed' });
      mockTasks.set(task.id, task);

      const eventHandler = vi.fn();
      retryManager.on('retry:scheduled', eventHandler);

      await retryManager.handleFailure(task.id, 'Error');

      expect(task.status).toBe('pending');
      expect(eventHandler).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(task.retryHistory![0].retriedAt).toBeInstanceOf(Date);

      vi.useRealTimers();
    });

    it('should schedule retry correctly', async () => {
      const task = createMockTask({
        status: 'failed',
        retryHistory: [
          { attemptNumber: 1, failedAt: new Date(), error: 'E1', delayMs: 100 },
        ],
      });
      mockTasks.set(task.id, task);

      await retryManager.handleFailure(task.id, 'E2');

      expect(task.retryHistory![1].delayMs).toBe(200);
      expect(task.status).toBe('pending');

      const info = retryManager.getRetryInfo(task.id);
      expect(info?.nextRetryAt).not.toBeNull();
    });
  });

  describe('configuration', () => {
    it('should use default configuration when not provided', () => {
      retryManager = new RetryManager({}, mockTaskGetter);

      const stats = retryManager.getStats();

      expect(stats.maxAttempts).toBe(3);
    });

    it('should override default configuration', () => {
      retryManager = new RetryManager(
        {
          maxAttempts: 5,
          initialDelayMs: 2000,
          maxDelayMs: 30000,
          backoffMultiplier: 1.5,
          retryableStatuses: ['failed', 'blocked'],
        },
        mockTaskGetter
      );

      const stats = retryManager.getStats();
      expect(stats.maxAttempts).toBe(5);
    });
  });
});
