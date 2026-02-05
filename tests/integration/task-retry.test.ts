import { describe, it, expect, beforeEach } from 'vitest';
import { RetryManager } from '../../src/core/retry-manager.js';
import type { Task } from '../../src/types/index.js';

function createTask(id: string): Task {
  return {
    id,
    type: 'custom',
    title: 'Test',
    description: 'Test',
    status: 'failed',
    priority: 'medium',
    dependencies: [],
    input: {},
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      restartCount: 0,
      isRecovered: false,
    },
    progress: { completedSteps: [], percentage: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
    messages: [],
    executionRecords: [],
    retryHistory: [],
  };
}

describe('Retry Manager', () => {
  describe('Handle Failure', () => {
    it('should handle failure and schedule retry', async () => {
      const tasks = new Map<string, Task>();
      tasks.set('hf-test-1', createTask('hf-test-1'));

      const retryManager = new RetryManager({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        retryableStatuses: ['failed'],
      }, () => tasks);

      const result = await retryManager.handleFailure('hf-test-1', 'Network error', 'Error stack');
      expect(result).toBe(true);

      const info = retryManager.getRetryInfo('hf-test-1');
      expect(info?.canRetry).toBe(true);
      expect(info?.remainingAttempts).toBe(2);
    });

    it('should deny retry after max attempts', async () => {
      const tasks = new Map<string, Task>();
      const task = createTask('hf-test-2');
      tasks.set('hf-test-2', task);

      const retryManager = new RetryManager({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        retryableStatuses: ['failed'],
      }, () => tasks);

      await retryManager.handleFailure('hf-test-2', 'Error 1');
      await retryManager.handleFailure('hf-test-2', 'Error 2');
      const r3 = await retryManager.handleFailure('hf-test-2', 'Error 3');

      expect(r3).toBe(false);

      const info = retryManager.getRetryInfo('hf-test-2');
      expect(info?.retryHistory?.length).toBe(2);
      expect(info?.remainingAttempts).toBe(1);
    });

    it('should track retry history', async () => {
      const tasks = new Map<string, Task>();
      tasks.set('hf-test-3', createTask('hf-test-3'));

      const retryManager = new RetryManager({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        retryableStatuses: ['failed'],
      }, () => tasks);

      await retryManager.handleFailure('hf-test-3', 'First error');
      await retryManager.handleFailure('hf-test-3', 'Second error');

      const info = retryManager.getRetryInfo('hf-test-3');
      expect(info?.retryHistory?.length).toBe(2);
    });
  });

  describe('Manual Retry', () => {
    it('should allow manual retry for existing task', async () => {
      const tasks = new Map<string, Task>();
      tasks.set('mr-test-1', createTask('mr-test-1'));

      const retryManager = new RetryManager({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        retryableStatuses: ['failed'],
      }, () => tasks);

      const result = await retryManager.manualRetry('mr-test-1', 'test-user');
      expect(result).toBe(true);

      const info = retryManager.getRetryInfo('mr-test-1');
      expect(info?.canRetry).toBe(true);
    });

    it('should return false for non-existent task', async () => {
      const tasks = new Map<string, Task>();

      const retryManager = new RetryManager({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        retryableStatuses: ['failed'],
      }, () => tasks);

      const result = await retryManager.manualRetry('nonexistent', 'test-user');
      expect(result).toBe(false);
    });
  });

  describe('Retry Info', () => {
    it('should return null for non-existent task', () => {
      const tasks = new Map<string, Task>();

      const retryManager = new RetryManager({}, () => tasks);

      const info = retryManager.getRetryInfo('nonexistent');
      expect(info).toBeNull();
    });

    it('should return correct retry info', async () => {
      const tasks = new Map<string, Task>();
      tasks.set('ri-test-1', createTask('ri-test-1'));

      const retryManager = new RetryManager({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        retryableStatuses: ['failed'],
      }, () => tasks);

      await retryManager.handleFailure('ri-test-1', 'Error');

      const info = retryManager.getRetryInfo('ri-test-1');
      expect(info).not.toBeNull();
      expect(info?.canRetry).toBe(true);
      expect(info?.remainingAttempts).toBe(2);
    });

    it('should show next retry time when scheduled', async () => {
      const tasks = new Map<string, Task>();
      tasks.set('ri-test-2', createTask('ri-test-2'));

      const retryManager = new RetryManager({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        retryableStatuses: ['failed'],
      }, () => tasks);

      await retryManager.handleFailure('ri-test-2', 'Error');

      const info = retryManager.getRetryInfo('ri-test-2');
      expect(info?.nextRetryAt).not.toBeNull();
    });
  });

  describe('Cancel Retry', () => {
    it('should cancel retry for existing task', async () => {
      const tasks = new Map<string, Task>();
      tasks.set('cr-test-1', createTask('cr-test-1'));

      const retryManager = new RetryManager({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        retryableStatuses: ['failed'],
      }, () => tasks);

      await retryManager.handleFailure('cr-test-1', 'Error');
      const result = retryManager.cancelRetry('cr-test-1');
      expect(result).toBe(true);

      const info = retryManager.getRetryInfo('cr-test-1');
      expect(info?.nextRetryAt).toBeNull();
    });

    it('should return false for non-existent task', () => {
      const tasks = new Map<string, Task>();

      const retryManager = new RetryManager({}, () => tasks);

      const result = retryManager.cancelRetry('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('Retry Stats', () => {
    it('should return correct stats', async () => {
      const tasks = new Map<string, Task>();
      tasks.set('rs-test-1', createTask('rs-test-1'));
      tasks.set('rs-test-2', createTask('rs-test-2'));

      const retryManager = new RetryManager({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        retryableStatuses: ['failed'],
      }, () => tasks);

      await retryManager.handleFailure('rs-test-1', 'Error');
      await retryManager.handleFailure('rs-test-2', 'Error');

      const stats = retryManager.getStats();
      expect(stats.pendingRetries).toBe(2);
      expect(stats.maxAttempts).toBe(3);
    });
  });

  describe('Retry Configuration', () => {
    it('should use custom configuration', () => {
      const tasks = new Map<string, Task>();

      const customManager = new RetryManager({
        maxAttempts: 5,
        initialDelayMs: 200,
        maxDelayMs: 5000,
        backoffMultiplier: 3,
        retryableStatuses: ['failed'],
      }, () => tasks);

      const info = customManager.getRetryInfo('nonexistent');
      expect(info).toBeNull();
    });

    it('should use default configuration when not provided', () => {
      const tasks = new Map<string, Task>();

      const defaultManager = new RetryManager({}, () => tasks);

      const info = defaultManager.getRetryInfo('nonexistent');
      expect(info).toBeNull();
    });
  });
});
