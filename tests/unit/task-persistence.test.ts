import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskPersistence, type PersistenceConfig } from '../../src/core/task-persistence.js';
import type { PersistedTask, TaskMetadata, TaskProgress } from '../../src/types/persistence.js';

function createMockTask(overrides: Partial<PersistedTask> = {}): PersistedTask {
  const defaultTask: PersistedTask = {
    id: `task-${Date.now()}`,
    type: 'development',
    title: 'Test Task',
    description: 'Test Description',
    status: 'pending',
    priority: 'medium',
    dependencies: [],
    input: {},
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      restartCount: 0,
      isRecovered: false,
    },
    progress: {
      completedSteps: [],
      percentage: 0,
    },
    executionRecords: [],
    retryHistory: [],
    ...overrides,
  };
  return defaultTask;
}

function createTempPath(prefix: string): string {
  const tempDir = '/tmp/task-persistence-test';
  return `${tempDir}/${prefix}-${Date.now()}.json`;
}

describe('TaskPersistence', () => {
  let persistence: TaskPersistence;
  let config: PersistenceConfig;

  beforeEach(() => {
    const storagePath = createTempPath('storage');
    const backupPath = createTempPath('backup');

    config = {
      storagePath,
      backupPath,
      autoSaveIntervalMs: 1000,
      maxBackupCount: 5,
    };

    persistence = new TaskPersistence(config);
  });

  afterEach(() => {
    persistence.stopAutoSave();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(persistence['config']).toEqual(config);
    });
  });

  describe('setTaskGetter', () => {
    it('should set the task getter function', () => {
      const getter = () => [];
      persistence.setTaskGetter(getter);
      expect(persistence['taskGetter']).toBe(getter);
    });
  });

  describe('saveTask', () => {
    it('should save a single task', async () => {
      const task = createMockTask();
      await persistence.saveTask(task);

      const loadedTasks = await persistence.loadTasks();
      expect(loadedTasks.length).toBe(1);
      expect(loadedTasks[0].id).toBe(task.id);
      expect(loadedTasks[0].title).toBe(task.title);
    });

    it('should update existing task', async () => {
      const task = createMockTask({ title: 'Original Title' });
      await persistence.saveTask(task);

      task.title = 'Updated Title';
      await persistence.saveTask(task);

      const loadedTasks = await persistence.loadTasks();
      expect(loadedTasks.length).toBe(1);
      expect(loadedTasks[0].title).toBe('Updated Title');
    });
  });

  describe('saveTasks', () => {
    it('should save multiple tasks', async () => {
      const tasks = [
        createMockTask({ id: 'task-1' }),
        createMockTask({ id: 'task-2' }),
        createMockTask({ id: 'task-3' }),
      ];

      await persistence.saveTasks(tasks);

      const loadedTasks = await persistence.loadTasks();
      expect(loadedTasks.length).toBe(3);
    });

    it('should handle empty array', async () => {
      await persistence.saveTasks([]);
      const loadedTasks = await persistence.loadTasks();
      expect(loadedTasks.length).toBe(0);
    });
  });

  describe('loadTasks', () => {
    it('should return empty array when no tasks saved', async () => {
      const tasks = await persistence.loadTasks();
      expect(tasks).toEqual([]);
    });

    it('should preserve all task properties', async () => {
      const task = createMockTask({
        type: 'testing',
        priority: 'high',
        status: 'in-progress',
      });

      await persistence.saveTask(task);
      const loadedTasks = await persistence.loadTasks();

      expect(loadedTasks[0].type).toBe('testing');
      expect(loadedTasks[0].priority).toBe('high');
      expect(loadedTasks[0].status).toBe('in-progress');
    });
  });

  describe('deleteTask', () => {
    it('should delete existing task', async () => {
      const task = createMockTask();
      await persistence.saveTask(task);
      expect((await persistence.loadTasks()).length).toBe(1);

      await persistence.deleteTask(task.id);
      const loadedTasks = await persistence.loadTasks();
      expect(loadedTasks.length).toBe(0);
    });

    it('should handle deleting non-existent task', async () => {
      await persistence.deleteTask('non-existent-id');
      const loadedTasks = await persistence.loadTasks();
      expect(loadedTasks.length).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all tasks', async () => {
      const tasks = [
        createMockTask({ id: 'task-1' }),
        createMockTask({ id: 'task-2' }),
        createMockTask({ id: 'task-3' }),
      ];

      await persistence.saveTasks(tasks);
      expect((await persistence.loadTasks()).length).toBe(3);

      await persistence.clear();
      const loadedTasks = await persistence.loadTasks();
      expect(loadedTasks.length).toBe(0);
    });
  });

  describe('startAutoSave and stopAutoSave', () => {
    it('should start auto-save interval when task getter is set', () => {
      const getter = () => [];
      persistence.setTaskGetter(getter);

      expect(persistence['saveInterval']).toBeUndefined();
      persistence.startAutoSave();
      expect(persistence['saveInterval']).not.toBeUndefined();
    });

    it('should not start auto-save without task getter', () => {
      persistence.startAutoSave();
      expect(persistence['saveInterval']).toBeUndefined();
    });
  });
});

describe('TaskPersistence - Storage Integration', () => {
  let persistence: TaskPersistence;
  let config: PersistenceConfig;

  beforeEach(() => {
    const storagePath = createTempPath('storage');
    const backupPath = createTempPath('backup');

    config = {
      storagePath,
      backupPath,
      autoSaveIntervalMs: 1000,
      maxBackupCount: 5,
    };

    persistence = new TaskPersistence(config);
  });

  afterEach(() => {
    persistence.stopAutoSave();
  });

  it('should persist tasks across different instances', async () => {
    const task = createMockTask({ id: 'persistent-task' });
    await persistence.saveTask(task);

    const newPersistence = new TaskPersistence(config);
    const loadedTasks = await newPersistence.loadTasks();

    expect(loadedTasks.length).toBe(1);
    expect(loadedTasks[0].id).toBe('persistent-task');
  });

  it('should handle multiple saves sequentially', async () => {
      const tasks = Array.from({ length: 10 }, (_, i) =>
        createMockTask({ id: `sequential-task-${i}` })
      );

      for (const task of tasks) {
        await persistence.saveTask(task);
      }

      const loadedTasks = await persistence.loadTasks();
      expect(loadedTasks.length).toBe(10);
    });

  it('should update task status correctly', async () => {
    const task = createMockTask({ status: 'pending' });
    await persistence.saveTask(task);

    task.status = 'completed';
    await persistence.saveTask(task);

    const loadedTasks = await persistence.loadTasks();
    expect(loadedTasks[0].status).toBe('completed');
  });
});
