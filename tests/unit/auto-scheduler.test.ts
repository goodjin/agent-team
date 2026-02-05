import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AutoScheduler, type SchedulerConfig } from '../../src/core/auto-scheduler.js';
import type { Task, TaskStatus } from '../../src/types/index.js';

interface MockTaskManager {
  getAllTasks: () => Task[];
  getTask: (id: string) => Task | undefined;
  updateTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
}

function createMockTask(overrides: Partial<Task> = {}): Task {
  const defaultTask: Task = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: 'development',
    title: 'Test Task',
    description: 'Test Description',
    status: 'pending',
    priority: 'medium',
    dependencies: [],
    input: {},
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  return defaultTask;
}

class TestableAutoScheduler extends AutoScheduler {
  public async triggerCheck(): Promise<void> {
    await this.checkAndSchedule();
  }

  public async runTask(task: Task): Promise<void> {
    await this.executeTask(task);
  }
}

describe('AutoScheduler', () => {
  let mockTaskManager: MockTaskManager;
  let tasks: Map<string, Task>;
  let defaultConfig: SchedulerConfig;

  beforeEach(() => {
    tasks = new Map<string, Task>();
    mockTaskManager = {
      getAllTasks: () => Array.from(tasks.values()),
      getTask: (id: string) => tasks.get(id),
      updateTaskStatus: async (id: string, status: TaskStatus) => {
        const task = tasks.get(id);
        if (task) {
          task.status = status;
          task.updatedAt = new Date();
        }
      },
    };
    defaultConfig = {
      maxConcurrentTasks: 3,
      checkIntervalMs: 10000,
      priorityEnabled: true,
    };
  });

  describe('constructor', () => {
    it('should initialize with default config when no config provided', () => {
      const scheduler = new AutoScheduler({}, mockTaskManager as any);
      const stats = scheduler.getStats();

      expect(stats.maxConcurrent).toBe(3);
      expect(stats.runningCount).toBe(0);
      expect(stats.scheduledCount).toBe(0);
    });

    it('should merge provided config with defaults', () => {
      const scheduler = new AutoScheduler({ maxConcurrentTasks: 5 }, mockTaskManager as any);
      const stats = scheduler.getStats();

      expect(stats.maxConcurrent).toBe(5);
    });

    it('should respect priorityEnabled setting', () => {
      const scheduler = new AutoScheduler({ priorityEnabled: false }, mockTaskManager as any);
      expect(scheduler.getState()).toBeDefined();
    });
  });

  describe('start and stop', () => {
    it('should start scheduler and emit started event', () => {
      const scheduler = new AutoScheduler(defaultConfig, mockTaskManager as any);
      const startedHandler = vi.fn();
      scheduler.on('started', startedHandler);

      scheduler.start();

      expect(scheduler.isActive()).toBe(true);
      expect(startedHandler).toHaveBeenCalledTimes(1);
    });

    it('should not start multiple times', () => {
      const scheduler = new AutoScheduler(defaultConfig, mockTaskManager as any);
      const startedHandler = vi.fn();
      scheduler.on('started', startedHandler);

      scheduler.start();
      scheduler.start();
      scheduler.start();

      expect(startedHandler).toHaveBeenCalledTimes(1);
    });

    it('should stop scheduler and emit stopped event', () => {
      const scheduler = new AutoScheduler(defaultConfig, mockTaskManager as any);
      scheduler.start();

      const stoppedHandler = vi.fn();
      scheduler.on('stopped', stoppedHandler);

      scheduler.stop();

      expect(scheduler.isActive()).toBe(false);
      expect(stoppedHandler).toHaveBeenCalledTimes(1);
    });

    it('should clear running and scheduled tasks when stopped', () => {
      const scheduler = new AutoScheduler(defaultConfig, mockTaskManager as any);
      scheduler.start();

      const task1 = createMockTask({ title: 'Task 1' });
      tasks.set(task1.id, task1);

      scheduler.stop();

      const state = scheduler.getState();
      expect(state.running.size).toBe(0);
      expect(state.scheduled.size).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct running count', () => {
      const scheduler = new AutoScheduler(defaultConfig, mockTaskManager as any);
      scheduler.start();

      const stats = scheduler.getStats();
      expect(stats.runningCount).toBe(0);

      scheduler.stop();
    });

    it('should return correct scheduled count', () => {
      const scheduler = new AutoScheduler(defaultConfig, mockTaskManager as any);
      scheduler.start();

      const stats = scheduler.getStats();
      expect(stats.scheduledCount).toBe(0);

      scheduler.stop();
    });

    it('should return max concurrent from config', () => {
      const customConfig = { ...defaultConfig, maxConcurrentTasks: 7 };
      const scheduler = new AutoScheduler(customConfig, mockTaskManager as any);

      const stats = scheduler.getStats();
      expect(stats.maxConcurrent).toBe(7);
    });
  });

  describe('getState', () => {
    it('should return copy of running map', () => {
      const scheduler = new AutoScheduler(defaultConfig, mockTaskManager as any);
      scheduler.start();

      const state = scheduler.getState();
      expect(state.running).toBeInstanceOf(Map);

      scheduler.stop();
    });

    it('should return copy of scheduled set', () => {
      const scheduler = new AutoScheduler(defaultConfig, mockTaskManager as any);
      scheduler.start();

      const state = scheduler.getState();
      expect(state.scheduled).toBeInstanceOf(Set);

      scheduler.stop();
    });
  });

  describe('checkAndSchedule', () => {
    it('should not schedule completed tasks', async () => {
      const scheduler = new TestableAutoScheduler(defaultConfig, mockTaskManager as any);
      scheduler.start();

      const completedTask = createMockTask({ title: 'Completed Task', status: 'completed' });
      tasks.set(completedTask.id, completedTask);

      await scheduler.triggerCheck();

      const state = scheduler.getState();
      expect(state.scheduled.has(completedTask.id)).toBe(false);

      scheduler.stop();
    });

    it('should not schedule failed tasks', async () => {
      const scheduler = new TestableAutoScheduler(defaultConfig, mockTaskManager as any);
      scheduler.start();

      const failedTask = createMockTask({ title: 'Failed Task', status: 'failed' });
      tasks.set(failedTask.id, failedTask);

      await scheduler.triggerCheck();

      const state = scheduler.getState();
      expect(state.scheduled.has(failedTask.id)).toBe(false);

      scheduler.stop();
    });

    it('should not schedule tasks with incomplete dependencies', async () => {
      const scheduler = new TestableAutoScheduler(defaultConfig, mockTaskManager as any);
      scheduler.start();

      const depTask = createMockTask({ title: 'Dependency Task', status: 'pending' });
      const dependentTask = createMockTask({
        title: 'Dependent Task',
        status: 'pending',
        dependencies: [depTask.id],
      });
      tasks.set(depTask.id, depTask);
      tasks.set(dependentTask.id, dependentTask);

      await scheduler.triggerCheck();

      const state = scheduler.getState();
      expect(state.scheduled.has(dependentTask.id)).toBe(false);

      scheduler.stop();
    });

    it('should schedule task after dependency completes', async () => {
      const scheduler = new TestableAutoScheduler(defaultConfig, mockTaskManager as any);
      scheduler.start();

      const scheduledHandler = vi.fn();
      scheduler.on('task:scheduled', scheduledHandler);

      const depTask = createMockTask({ title: 'Dependency Task', status: 'completed' });
      const dependentTask = createMockTask({
        title: 'Dependent Task',
        status: 'pending',
        dependencies: [depTask.id],
      });
      tasks.set(depTask.id, depTask);
      tasks.set(dependentTask.id, dependentTask);

      await scheduler.triggerCheck();

      expect(scheduledHandler).toHaveBeenCalled();
      expect(scheduledHandler.mock.calls.some((call: any[]) => call[0].taskId === dependentTask.id)).toBe(true);

      scheduler.stop();
    });

    it('should respect max concurrent tasks limit', async () => {
      const limitedConfig = { ...defaultConfig, maxConcurrentTasks: 2 };
      const scheduler = new TestableAutoScheduler(limitedConfig, mockTaskManager as any);
      scheduler.start();

      const task1 = createMockTask({ title: 'Task 1', status: 'pending' });
      const task2 = createMockTask({ title: 'Task 2', status: 'pending' });
      const task3 = createMockTask({ title: 'Task 3', status: 'pending' });
      const task4 = createMockTask({ title: 'Task 4', status: 'pending' });
      tasks.set(task1.id, task1);
      tasks.set(task2.id, task2);
      tasks.set(task3.id, task3);
      tasks.set(task4.id, task4);

      await scheduler.triggerCheck();

      const stats = scheduler.getStats();
      expect(stats.runningCount + stats.scheduledCount).toBeLessThanOrEqual(limitedConfig.maxConcurrentTasks);

      scheduler.stop();
    });
  });

  describe('executeTask', () => {
    it('should emit task:scheduled event', async () => {
      const scheduler = new TestableAutoScheduler(defaultConfig, mockTaskManager as any);
      scheduler.start();

      const scheduledHandler = vi.fn();
      scheduler.on('task:scheduled', scheduledHandler);

      const task = createMockTask({ title: 'Task', status: 'pending' });
      tasks.set(task.id, task);

      await scheduler.runTask(task);

      expect(scheduledHandler).toHaveBeenCalled();
      expect(scheduledHandler.mock.calls[0][0]).toHaveProperty('taskId', task.id);

      scheduler.stop();
    });

    it('should emit task:started event', async () => {
      const scheduler = new TestableAutoScheduler(defaultConfig, mockTaskManager as any);
      scheduler.start();

      const startedHandler = vi.fn();
      scheduler.on('task:started', startedHandler);

      const task = createMockTask({ title: 'Test Task', status: 'pending' });
      tasks.set(task.id, task);

      await scheduler.runTask(task);

      expect(startedHandler).toHaveBeenCalled();
      expect(startedHandler.mock.calls[0][0]).toHaveProperty('taskId', task.id);

      scheduler.stop();
    });

    it('should emit task:completed event', async () => {
      const scheduler = new TestableAutoScheduler(defaultConfig, mockTaskManager as any);
      scheduler.start();

      const completedHandler = vi.fn();
      scheduler.on('task:completed', completedHandler);

      const task = createMockTask({ title: 'Test Task', status: 'pending' });
      tasks.set(task.id, task);

      await scheduler.runTask(task);

      expect(completedHandler).toHaveBeenCalled();
      expect(completedHandler.mock.calls[0][0]).toHaveProperty('taskId', task.id);

      scheduler.stop();
    });

    it('should update task status to in-progress then completed', async () => {
      const scheduler = new TestableAutoScheduler(defaultConfig, mockTaskManager as any);
      scheduler.start();

      const task = createMockTask({ title: 'Test Task', status: 'pending' });
      tasks.set(task.id, task);

      await scheduler.runTask(task);

      const updatedTask = tasks.get(task.id);
      expect(updatedTask?.status).toBe('completed');

      scheduler.stop();
    });
  });

  describe('events', () => {
    it('should emit check:completed event', async () => {
      const scheduler = new TestableAutoScheduler(defaultConfig, mockTaskManager as any);
      scheduler.start();

      const checkHandler = vi.fn();
      scheduler.on('check:completed', checkHandler);

      const task = createMockTask({ title: 'Task', status: 'pending' });
      tasks.set(task.id, task);

      await scheduler.triggerCheck();

      expect(checkHandler).toHaveBeenCalled();

      scheduler.stop();
    });

    it('should emit task:scheduled event', async () => {
      const scheduler = new TestableAutoScheduler(defaultConfig, mockTaskManager as any);
      scheduler.start();

      const scheduledHandler = vi.fn();
      scheduler.on('task:scheduled', scheduledHandler);

      const task = createMockTask({ title: 'Task', status: 'pending' });
      tasks.set(task.id, task);

      await scheduler.runTask(task);

      expect(scheduledHandler).toHaveBeenCalled();

      scheduler.stop();
    });
  });
});
