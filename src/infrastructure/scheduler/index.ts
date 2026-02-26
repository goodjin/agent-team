export interface ScheduledTask {
  taskId: string;
  executeFn: () => Promise<void>;
  priority: number;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  error?: Error;
}

export interface IScheduler {
  schedule(taskId: string, executeFn: () => Promise<void>, priority?: number): void;
  pause(taskId: string): void;
  resume(taskId: string): void;
  cancel(taskId: string): void;
  getRunningCount(): number;
  getQueueLength(): number;
}

export class Scheduler implements IScheduler {
  private maxConcurrent: number;
  private running: Map<string, { controller: AbortController; task: ScheduledTask }> = new Map();
  private queue: ScheduledTask[] = [];

  constructor(maxConcurrent: number = 10) {
    this.maxConcurrent = maxConcurrent;
  }

  schedule(taskId: string, executeFn: () => Promise<void>, priority: number = 0): void {
    if (this.running.has(taskId)) {
      console.warn(`Task ${taskId} is already running`);
      return;
    }

    const task: ScheduledTask = {
      taskId,
      executeFn,
      priority,
      status: 'queued'
    };

    if (this.running.size >= this.maxConcurrent) {
      this.queue.push(task);
      this.queue.sort((a, b) => b.priority - a.priority);
      return;
    }

    this.execute(task);
  }

  private async execute(task: ScheduledTask): Promise<void> {
    const controller = new AbortController();
    task.status = 'running';
    this.running.set(task.taskId, { controller, task });

    try {
      await task.executeFn();
      task.status = 'completed';
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error : new Error(String(error));
      console.error(`Task ${task.taskId} failed:`, error);
    } finally {
      this.running.delete(task.taskId);
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.queue.length === 0 || this.running.size >= this.maxConcurrent) return;

    const next = this.queue.shift()!;
    if (next.status === 'queued') {
      this.execute(next);
    }
  }

  pause(taskId: string): void {
    const entry = this.running.get(taskId);
    if (entry) {
      entry.controller.abort();
      entry.task.status = 'paused';
    }
  }

  resume(taskId: string): void {
    const entry = this.running.get(taskId);
    if (entry && entry.task.status === 'paused') {
      this.execute(entry.task);
    }
  }

  cancel(taskId: string): void {
    this.running.delete(taskId);
    this.queue = this.queue.filter(t => t.taskId !== taskId);
  }

  getRunningCount(): number {
    return this.running.size;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}
