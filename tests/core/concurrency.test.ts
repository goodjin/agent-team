import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConcurrencyController } from '../../src/core/concurrency.js';

describe('ConcurrencyController', () => {
  let controller: ConcurrencyController;

  beforeEach(() => {
    vi.useRealTimers();
    controller = new ConcurrencyController(3);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createTask = (duration: number, value: number) => {
    return () =>
      new Promise<number>((resolve) => {
        setTimeout(() => resolve(value), duration);
      });
  };

  describe('run', () => {
    it('should execute tasks within concurrency limit', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const task = async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);

        await new Promise((resolve) => setTimeout(resolve, 50));

        concurrent--;
        return concurrent;
      };

      // 启动 10 个任务
      const promises = Array.from({ length: 10 }, () => controller.run(task));

      await Promise.all(promises);

      // 最大并发应该不超过 3
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should queue tasks when concurrency limit reached', async () => {
      const results: number[] = [];

      const task = async (value: number) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        results.push(value);
        return value;
      };

      // 启动 5 个任务，但并发限制为 3
      const promises = [
        controller.run(() => task(1)),
        controller.run(() => task(2)),
        controller.run(() => task(3)),
        controller.run(() => task(4)),
        controller.run(() => task(5)),
      ];

      await Promise.all(promises);

      // 所有任务都应该完成
      expect(results).toHaveLength(5);
      expect(results).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
    });

    it('should handle task errors correctly', async () => {
      const errorTask = async () => {
        throw new Error('Task failed');
      };

      await expect(controller.run(errorTask)).rejects.toThrow('Task failed');

      // 确保错误不影响后续任务
      const result = await controller.run(async () => 'success');
      expect(result).toBe('success');
    });
  });

  describe('runAll', () => {
    it('should run all tasks with concurrency control', async () => {
      const tasks = [
        createTask(50, 1),
        createTask(50, 2),
        createTask(50, 3),
        createTask(50, 4),
        createTask(50, 5),
      ];

      const results = await controller.runAll(tasks);

      expect(results).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('runAllSettled', () => {
    it('should run all tasks and return settled results', async () => {
      const tasks = [
        async () => 'success',
        async () => {
          throw new Error('failed');
        },
        async () => 'another success',
      ];

      const results = await controller.runAllSettled(tasks);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
    });
  });

  describe('getStatus', () => {
    it('should return correct status', async () => {
      const longTask = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'done';
      };

      // 启动 5 个任务
      controller.run(longTask);
      controller.run(longTask);
      controller.run(longTask);
      controller.run(longTask);
      controller.run(longTask);

      // 立即检查状态
      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = controller.getStatus();

      expect(status.running).toBe(3);
      expect(status.queued).toBe(2);
      expect(status.maxConcurrent).toBe(3);
      expect(status.utilization).toBe(100);
    });
  });

  describe('setMaxConcurrent', () => {
    it('should adjust concurrency limit', async () => {
      controller.setMaxConcurrent(5);

      const status = controller.getStatus();
      expect(status.maxConcurrent).toBe(5);
    });

    it('should process queued tasks when limit increased', async () => {
      const results: number[] = [];

      const task = async (value: number) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        results.push(value);
        return value;
      };

      // 启动 10 个任务，并发限制为 3
      const promises = Array.from({ length: 10 }, (_, i) =>
        controller.run(() => task(i))
      );

      // 等待一些任务排队
      await new Promise((resolve) => setTimeout(resolve, 10));

      // 增加并发限制
      controller.setMaxConcurrent(6);

      await Promise.all(promises);

      expect(results).toHaveLength(10);
    });
  });

  describe('clearQueue', () => {
    it('should clear all queued tasks', async () => {
      const longTask = async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return 'done';
      };

      // 启动 10 个任务
      const promises = Array.from({ length: 10 }, () => controller.run(longTask));

      // 等待任务排队
      await new Promise((resolve) => setTimeout(resolve, 10));

      // 清空队列
      controller.clearQueue();

      // 验证队列中的任务被拒绝
      const results = await Promise.allSettled(promises);
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(rejected.length).toBeGreaterThan(0);
    });
  });

  describe('waitForIdle', () => {
    it('should wait for all tasks to complete', async () => {
      const results: number[] = [];

      const task = async (value: number) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        results.push(value);
        return value;
      };

      // 启动任务
      controller.run(() => task(1));
      controller.run(() => task(2));
      controller.run(() => task(3));

      // 等待空闲
      await controller.waitForIdle();

      expect(results).toEqual([1, 2, 3]);
    });
  });
});
