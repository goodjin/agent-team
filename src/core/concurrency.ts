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

      // 如果空闲，触发 idle 事件
      if (this.running === 0 && this.queue.length === 0) {
        this.emit('idle');
      }
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
        this.off('idle', check);
        resolve();
      };

      this.on('idle', check);
    });
  }
}
