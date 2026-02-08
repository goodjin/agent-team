# Task 6: 实现并发控制器

**优先级**: P0
**预计工时**: 4 小时
**依赖**: 无
**状态**: 待执行

---

## 目标

1. 实现 ConcurrencyController 类
2. 实现队列机制
3. 实现并发限制

---

## 输入

- 架构设计：`docs/v5/02-architecture.md`

---

## 输出

- `src/core/concurrency.ts`
- 单元测试：`tests/core/concurrency.test.ts`

---

## 实现步骤

### 步骤 1: 实现 ConcurrencyController

创建 `src/core/concurrency.ts`：

```typescript
import { EventEmitter } from 'events';

export interface QueuedTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  id: string;
  timestamp: Date;
}

export class ConcurrencyController extends EventEmitter {
  private running: number = 0;
  private maxConcurrent: number;
  private queue: QueuedTask<any>[] = [];
  private taskIdCounter: number = 0;

  constructor(maxConcurrent: number) {
    super();
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * 运行任务（带并发控制）
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const taskId = `task-${++this.taskIdCounter}`;

    // 如果当前并发未满，直接执行
    if (this.running < this.maxConcurrent) {
      return this.execute(taskId, fn);
    }

    // 否则加入队列
    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        fn,
        resolve,
        reject,
        id: taskId,
        timestamp: new Date(),
      };

      this.queue.push(task);

      this.emit('task:queued', {
        id: taskId,
        queueLength: this.queue.length,
      });
    });
  }

  /**
   * 执行任务
   */
  private async execute<T>(id: string, fn: () => Promise<T>): Promise<T> {
    this.running++;

    this.emit('task:started', {
      id,
      running: this.running,
      queued: this.queue.length,
    });

    try {
      const result = await fn();

      this.emit('task:completed', {
        id,
        success: true,
      });

      return result;
    } catch (error: any) {
      this.emit('task:completed', {
        id,
        success: false,
        error: error.message,
      });

      throw error;
    } finally {
      this.running--;

      // 从队列中取出下一个任务
      this.processNext();
    }
  }

  /**
   * 处理队列中的下一个任务
   */
  private processNext(): void {
    if (this.queue.length === 0) {
      return;
    }

    if (this.running >= this.maxConcurrent) {
      return;
    }

    const task = this.queue.shift();
    if (!task) {
      return;
    }

    this.emit('task:dequeued', {
      id: task.id,
      queueLength: this.queue.length,
      waitTime: Date.now() - task.timestamp.getTime(),
    });

    // 执行任务
    this.execute(task.id, task.fn)
      .then(task.resolve)
      .catch(task.reject);
  }

  /**
   * 批量运行任务（全部完成）
   */
  async runAll<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
    return Promise.all(tasks.map((task) => this.run(task)));
  }

  /**
   * 批量运行任务（首个成功）
   */
  async runRace<T>(tasks: Array<() => Promise<T>>): Promise<T> {
    return Promise.race(tasks.map((task) => this.run(task)));
  }

  /**
   * 批量运行任务（全部完成，包含成功和失败）
   */
  async runAllSettled<T>(
    tasks: Array<() => Promise<T>>
  ): Promise<PromiseSettledResult<T>[]> {
    return Promise.allSettled(tasks.map((task) => this.run(task)));
  }

  /**
   * 获取状态
   */
  getStatus(): {
    running: number;
    queued: number;
    maxConcurrent: number;
    utilization: number;
  } {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      utilization: (this.running / this.maxConcurrent) * 100,
    };
  }

  /**
   * 调整并发限制
   */
  setMaxConcurrent(max: number): void {
    const oldMax = this.maxConcurrent;
    this.maxConcurrent = max;

    this.emit('concurrency:adjusted', {
      oldMax,
      newMax: max,
    });

    // 如果增加了并发限制，尝试处理队列
    if (max > oldMax) {
      const diff = max - oldMax;
      for (let i = 0; i < diff; i++) {
        this.processNext();
      }
    }
  }

  /**
   * 清空队列
   */
  clearQueue(): void {
    const cleared = this.queue.length;

    this.queue.forEach((task) => {
      task.reject(new Error('Queue cleared'));
    });

    this.queue = [];

    this.emit('queue:cleared', { cleared });
  }

  /**
   * 等待所有任务完成
   */
  async waitForIdle(): Promise<void> {
    if (this.running === 0 && this.queue.length === 0) {
      return;
    }

    return new Promise((resolve) => {
      const check = () => {
        if (this.running === 0 && this.queue.length === 0) {
          this.off('task:completed', check);
          resolve();
        }
      };

      this.on('task:completed', check);
    });
  }
}
```

### 步骤 2: 创建单元测试

创建 `tests/core/concurrency.test.ts`：

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ConcurrencyController } from '../../src/core/concurrency.js';

describe('ConcurrencyController', () => {
  let controller: ConcurrencyController;

  beforeEach(() => {
    controller = new ConcurrencyController(3);
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
```

---

## 验收标准

- ✅ 并发限制生效（最多 N 个同时运行）
- ✅ 超出限制时正确排队
- ✅ 先进先出（FIFO）
- ✅ 状态查询正确
- ✅ 单元测试覆盖率 > 80%

---

## 使用示例

```typescript
import { ConcurrencyController } from './core/concurrency.js';

// 创建并发控制器，限制最多 3 个并发
const controller = new ConcurrencyController(3);

// 监听事件
controller.on('task:started', (event) => {
  console.log(`Task ${event.id} started (running: ${event.running}, queued: ${event.queued})`);
});

controller.on('task:queued', (event) => {
  console.log(`Task ${event.id} queued (queue length: ${event.queueLength})`);
});

// 使用
const task = async (id: number) => {
  console.log(`Task ${id} executing...`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log(`Task ${id} done`);
  return id;
};

// 启动 10 个任务，但最多 3 个并发
const promises = Array.from({ length: 10 }, (_, i) =>
  controller.run(() => task(i))
);

const results = await Promise.all(promises);
console.log('All tasks completed:', results);
```

---

## 相关文档

- 架构设计：`docs/v5/02-architecture.md`
- 任务拆分：`docs/v5/04-task-breakdown.md`

---

**任务完成标志**：

- [ ] ConcurrencyController 类实现完成
- [ ] 队列机制实现完成
- [ ] 并发限制实现完成
- [ ] 单元测试通过
- [ ] 测试覆盖率 > 80%
