import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { TaskPersistence } from '../../src/core/task-persistence.js';
import type { PersistedTask } from '../../src/types/persistence.js';

describe('Task Persistence', () => {
  let tempDir: string;
  let storagePath: string;
  let persistence: TaskPersistence;

  beforeEach(async () => {
    tempDir = `/tmp/test-persistence-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });
    storagePath = path.join(tempDir, 'tasks.json');

    persistence = new TaskPersistence({
      storagePath,
      backupPath: path.join(tempDir, 'backups'),
      autoSaveIntervalMs: 1000,
      maxBackupCount: 3,
    });
  });

  afterEach(async () => {
    persistence.stopAutoSave();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
    }
  });

  describe('Save and Load', () => {
    it('should save and load tasks', async () => {
      const task: PersistedTask = {
        id: 'test-task-1',
        type: 'custom',
        title: 'Test Task',
        description: 'A test task for persistence',
        status: 'pending',
        priority: 'medium',
        assignedRole: 'developer',
        ownerRole: 'developer',
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
      };

      await persistence.saveTask(task);

      const loaded = await persistence.loadTasks();
      expect(loaded.length).toBe(1);
      expect(loaded[0].id).toBe('test-task-1');
      expect(loaded[0].title).toBe('Test Task');
    });

    it('should save multiple tasks', async () => {
      const tasks: PersistedTask[] = [
        {
          id: 'task-1',
          type: 'custom',
          title: 'Task 1',
          description: 'First task',
          status: 'pending',
          priority: 'medium',
          assignedRole: 'developer',
          ownerRole: 'developer',
          dependencies: [],
          input: {},
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            restartCount: 0,
            isRecovered: false,
          },
          progress: { completedSteps: [], percentage: 0 },
          executionRecords: [],
          retryHistory: [],
        },
        {
          id: 'task-2',
          type: 'custom',
          title: 'Task 2',
          description: 'Second task',
          status: 'completed',
          priority: 'high',
          assignedRole: 'developer',
          ownerRole: 'developer',
          dependencies: [],
          input: {},
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            restartCount: 0,
            isRecovered: false,
          },
          progress: { completedSteps: [], percentage: 100 },
          executionRecords: [],
          retryHistory: [],
        },
      ];

      await persistence.saveTasks(tasks);

      const loaded = await persistence.loadTasks();
      expect(loaded.length).toBe(2);
    });

    it('should update existing task', async () => {
      const task: PersistedTask = {
        id: 'update-test',
        type: 'custom',
        title: 'Original Title',
        description: 'Original description',
        status: 'pending',
        priority: 'medium',
        assignedRole: 'developer',
        ownerRole: 'developer',
        dependencies: [],
        input: {},
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          restartCount: 0,
          isRecovered: false,
        },
        progress: { completedSteps: [], percentage: 0 },
        executionRecords: [],
        retryHistory: [],
      };

      await persistence.saveTask(task);

      task.title = 'Updated Title';
      task.status = 'completed';
      await persistence.saveTask(task);

      const loaded = await persistence.loadTasks();
      const found = loaded.find(t => t.id === 'update-test');
      expect(found?.title).toBe('Updated Title');
      expect(found?.status).toBe('completed');
    });

    it('should delete task', async () => {
      const task1: PersistedTask = {
        id: 'to-delete',
        type: 'custom',
        title: 'Task to Delete',
        description: 'Will be deleted',
        status: 'pending',
        priority: 'medium',
        assignedRole: 'developer',
        ownerRole: 'developer',
        dependencies: [],
        input: {},
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          restartCount: 0,
          isRecovered: false,
        },
        progress: { completedSteps: [], percentage: 0 },
        executionRecords: [],
        retryHistory: [],
      };

      const task2: PersistedTask = {
        id: 'to-keep',
        type: 'custom',
        title: 'Task to Keep',
        description: 'Will remain',
        status: 'pending',
        priority: 'medium',
        assignedRole: 'developer',
        ownerRole: 'developer',
        dependencies: [],
        input: {},
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          restartCount: 0,
          isRecovered: false,
        },
        progress: { completedSteps: [], percentage: 0 },
        executionRecords: [],
        retryHistory: [],
      };

      await persistence.saveTasks([task1, task2]);
      await persistence.deleteTask('to-delete');

      const loaded = await persistence.loadTasks();
      expect(loaded.length).toBe(1);
      expect(loaded[0].id).toBe('to-keep');
    });

    it('should clear all tasks', async () => {
      const tasks: PersistedTask[] = Array.from({ length: 5 }, (_, i) => ({
        id: `task-${i}`,
        type: 'custom' as const,
        title: `Task ${i}`,
        description: `Description ${i}`,
        status: 'pending' as const,
        priority: 'medium' as const,
        assignedRole: 'developer',
        ownerRole: 'developer',
        dependencies: [],
        input: {},
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          restartCount: 0,
          isRecovered: false,
        },
        progress: { completedSteps: [], percentage: 0 },
        executionRecords: [],
        retryHistory: [],
      }));

      await persistence.saveTasks(tasks);
      expect((await persistence.loadTasks()).length).toBe(5);

      await persistence.clear();

      const loaded = await persistence.loadTasks();
      expect(loaded.length).toBe(0);
    });

    it('should handle non-existent storage file', async () => {
      const newStoragePath = path.join(tempDir, 'nonexistent', 'tasks.json');
      const newPersistence = new TaskPersistence({
        storagePath: newStoragePath,
        autoSaveIntervalMs: 1000,
        maxBackupCount: 3,
      });

      const loaded = await newPersistence.loadTasks();
      expect(loaded).toEqual([]);
    });

    it.skip('should auto-save tasks', async () => {
      const getter = () => [
        {
          id: 'auto-save-task',
          type: 'custom' as const,
          title: 'Auto Save Task',
          description: 'Testing auto-save',
          status: 'pending' as const,
          priority: 'medium' as const,
          assignedRole: 'developer',
          ownerRole: 'developer',
          dependencies: [],
          input: {},
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            restartCount: 0,
            isRecovered: false,
          },
          progress: { completedSteps: [], percentage: 0 },
          executionRecords: [],
          retryHistory: [],
        },
      ];

      persistence.setTaskGetter(getter);
      persistence.startAutoSave();

      await new Promise(resolve => setTimeout(resolve, 100));

      const loaded = await persistence.loadTasks();
      expect(loaded.length).toBe(1);
      expect(loaded[0].id).toBe('auto-save-task');
    });
  });
});
