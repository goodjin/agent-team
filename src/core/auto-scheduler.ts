import { EventEmitter } from 'events';
import type { Task, TaskStatus, Priority } from '../types/index.js';
import type { TaskManager } from './task-manager.js';

export interface SchedulerConfig {
  maxConcurrentTasks: number;
  checkIntervalMs: number;
  priorityEnabled: boolean;
}

export interface SchedulerState {
  running: Map<string, NodeJS.Timeout>;
  scheduled: Set<string>;
}

export interface SchedulerEvents {
  'started': [];
  'stopped': [];
  'task:scheduled': [{ taskId: string }];
  'task:started': [{ taskId: string }];
  'task:completed': [{ taskId: string }];
  'task:failed': [{ taskId: string; error: Error }];
  'check:completed': [{ executableCount: number }];
}

export class AutoScheduler extends EventEmitter {
  private config: SchedulerConfig;
  private taskManager: TaskManager;
  private state: SchedulerState;
  private checkInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(config: Partial<SchedulerConfig>, taskManager: TaskManager) {
    super();
    this.config = {
      maxConcurrentTasks: 3,
      checkIntervalMs: 1000,
      priorityEnabled: true,
      ...config,
    };
    this.taskManager = taskManager;
    this.state = {
      running: new Map(),
      scheduled: new Set(),
    };
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.checkAndSchedule();

    this.checkInterval = setInterval(() => {
      this.checkAndSchedule();
    }, this.config.checkIntervalMs);

    this.emit('started');
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    for (const timeout of this.state.running.values()) {
      clearTimeout(timeout);
    }
    this.state.running.clear();
    this.state.scheduled.clear();

    this.emit('stopped');
  }

  protected async checkAndSchedule(): Promise<void> {
    if (!this.isRunning) return;

    const executableTasks = await this.getExecutableTasks();

    for (const task of executableTasks) {
      if (this.state.running.size >= this.config.maxConcurrentTasks) {
        break;
      }

      if (this.state.scheduled.has(task.id)) {
        continue;
      }

      await this.executeTask(task);
    }

    this.emit('check:completed', { executableCount: executableTasks.length });
  }

  private async getExecutableTasks(): Promise<Task[]> {
    const allTasks = this.taskManager.getAllTasks();
    const executableTasks: Task[] = [];

    for (const task of allTasks) {
      if (task.status !== 'pending') continue;
      if (this.state.scheduled.has(task.id)) continue;
      if (this.state.running.has(task.id)) continue;

      if (task.dependencies && task.dependencies.length > 0) {
        const depsCompleted = task.dependencies.every(depId => {
          const depTask = this.taskManager.getTask(depId);
          return depTask && depTask.status === 'completed';
        });
        if (!depsCompleted) continue;
      }

      executableTasks.push(task);
    }

    if (this.config.priorityEnabled) {
      const priorityOrder: Priority[] = ['critical', 'high', 'medium', 'low'];
      executableTasks.sort((a, b) => {
        const priorityA = priorityOrder.indexOf(a.priority);
        const priorityB = priorityOrder.indexOf(b.priority);
        return priorityA - priorityB;
      });
    }

    return executableTasks;
  }

  protected async executeTask(task: Task): Promise<void> {
    this.state.scheduled.add(task.id);
    this.emit('task:scheduled', { taskId: task.id });

    try {
      await this.executeAsync(task);
    } catch (error) {
      this.state.scheduled.delete(task.id);
      this.emit('task:failed', { taskId: task.id, error: error as Error });
    }
  }

  private async executeAsync(task: Task): Promise<void> {
    try {
      await this.taskManager.updateTaskStatus(task.id, 'in-progress');

      this.state.scheduled.delete(task.id);
      const timeoutId = setTimeout(() => {}, Infinity);
      this.state.running.set(task.id, timeoutId);

      this.emit('task:started', { taskId: task.id });

      await this.taskManager.updateTaskStatus(task.id, 'completed');
      this.state.running.delete(task.id);
      this.emit('task:completed', { taskId: task.id });
      this.checkAndSchedule();
    } catch (error) {
      this.state.running.delete(task.id);
      this.state.scheduled.delete(task.id);
      throw error;
    }
  }

  private async handleTaskCompletion(task: Task): Promise<void> {
    this.state.running.delete(task.id);
    this.emit('task:completed', { taskId: task.id });
    await this.checkAndSchedule();
  }

  getState(): SchedulerState {
    return {
      running: new Map(this.state.running),
      scheduled: new Set(this.state.scheduled),
    };
  }

  getStats(): {
    runningCount: number;
    scheduledCount: number;
    maxConcurrent: number;
  } {
    return {
      runningCount: this.state.running.size,
      scheduledCount: this.state.scheduled.size,
      maxConcurrent: this.config.maxConcurrentTasks,
    };
  }

  isActive(): boolean {
    return this.isRunning;
  }
}
