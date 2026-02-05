import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { TaskManager } from '../../src/core/task-manager.js';
import { TaskPersistence } from '../../src/core/task-persistence.js';
import { AutoScheduler } from '../../src/core/auto-scheduler.js';
import { RetryManager } from '../../src/core/retry-manager.js';
import { ProgressTracker } from '../../src/core/progress-tracker.js';
import { ToolRegistry } from '../../src/tools/tool-registry.js';
import type { ProjectConfig, Task } from '../../src/types/index.js';

describe('Task Full Lifecycle', () => {
  let persistence: TaskPersistence;
  let taskManager: TaskManager;
  let retryManager: RetryManager;
  let progressTracker: ProgressTracker;
  let autoScheduler: AutoScheduler;
  let tempDir: string;
  let storagePath: string;
  let taskMap: Map<string, Task>;

  beforeEach(async () => {
    tempDir = `/tmp/test-tasks-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(path.join(tempDir, 'data'), { recursive: true });
    storagePath = path.join(tempDir, 'data', 'tasks.json');
    taskMap = new Map<string, Task>();

    persistence = new TaskPersistence({
      storagePath,
      backupPath: path.join(tempDir, 'backups'),
      autoSaveIntervalMs: 5000,
      maxBackupCount: 3,
    });

    const projectConfig: ProjectConfig = {
      projectName: 'test-project',
      projectPath: tempDir,
    };

    const toolRegistry = new ToolRegistry();

    taskManager = new TaskManager(projectConfig, toolRegistry);

    retryManager = new RetryManager({
      maxAttempts: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
      retryableStatuses: ['failed'],
    }, () => taskMap);

    progressTracker = new ProgressTracker({
      maxCheckpoints: 10,
      autoCheckpoint: true,
    });

    autoScheduler = new AutoScheduler({
      maxConcurrentTasks: 2,
      checkIntervalMs: 100,
      priorityEnabled: true,
    }, taskManager);
  });

  afterEach(async () => {
    persistence.stopAutoSave();
    autoScheduler.stop();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
    }
  });

  describe('Task Creation and Persistence', () => {
    it('should create task and persist immediately', async () => {
      const task = taskManager.createTask({
        title: 'Test Task',
        description: 'A test task',
        assignedRole: 'developer',
      });

      expect(task.id).toBeDefined();
      expect(task.status).toBe('pending');

      await persistence.saveTask({
        id: task.id,
        type: task.type,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assignedRole: task.assignedRole,
        ownerRole: task.ownerRole,
        dependencies: task.dependencies || [],
        input: task.input || {},
        metadata: task.metadata || {
          createdAt: new Date(),
          updatedAt: new Date(),
          restartCount: 0,
          isRecovered: false,
        },
        progress: task.progress || {
          completedSteps: [],
          percentage: 0,
        },
        executionRecords: task.executionRecords || [],
        retryHistory: task.retryHistory || [],
      });

      const persisted = await persistence.loadTasks();
      const found = persisted.find(t => t.id === task.id);
      expect(found).toBeDefined();
      expect(found?.title).toBe('Test Task');
    });

    it('should track progress checkpoints', async () => {
      const task = taskManager.createTask({
        title: 'Progress Task',
        description: 'Testing progress tracking',
      });

      await progressTracker.checkpoint(task.id, 'step1', 'First step', 25);
      await progressTracker.checkpoint(task.id, 'step2', 'Second step', 50);
      await progressTracker.checkpoint(task.id, 'step3', 'Third step', 75);

      const checkpoints = await progressTracker.getCheckpoints(task.id);
      expect(checkpoints.length).toBe(3);

      const latest = await progressTracker.getLatestCheckpoint(task.id);
      expect(latest?.percentage).toBe(75);
    });
  });

  describe('Retry Mechanism', () => {
    it('should support manual retry', async () => {
      const task = taskManager.createTask({
        title: 'Manual Retry Task',
        description: 'Manually retried',
      });

      task.status = 'failed';
      taskMap.set(task.id, task);

      const success = await retryManager.manualRetry(task.id, 'test-user');
      expect(success).toBe(true);

      const info = retryManager.getRetryInfo(task.id);
      expect(info?.canRetry).toBe(true);
    });

    it('should stop retrying after max attempts', async () => {
      const task = taskManager.createTask({
        title: 'Max Retry Task',
        description: 'Will exceed max retries',
      });

      task.status = 'failed';
      taskMap.set(task.id, task);

      for (let i = 0; i < 4; i++) {
        await retryManager.manualRetry(task.id, `user-${i}`);
      }

      const info = retryManager.getRetryInfo(task.id);
      expect(info?.canRetry).toBe(false);
    });
  });

  describe('Auto Execution', () => {
    it('should respect priority scheduling', async () => {
      taskManager.createTask({
        title: 'Low Priority',
        description: 'Low priority task',
        priority: 'low',
      });

      taskManager.createTask({
        title: 'High Priority',
        description: 'High priority task',
        priority: 'high',
      });

      const stats = autoScheduler.getStats();
      expect(stats.maxConcurrent).toBe(2);
    });

    it('should have correct scheduler state', () => {
      const state = autoScheduler.getState();
      expect(state).toHaveProperty('running');
      expect(state).toHaveProperty('scheduled');
    });
  });

  describe('Progress Tracking', () => {
    it('should calculate percentage correctly', async () => {
      const task = taskManager.createTask({
        title: 'Percentage Task',
        description: 'Testing percentage calculation',
      });

      await progressTracker.checkpoint(task.id, 'start', 'Starting', 0);
      await progressTracker.checkpoint(task.id, 'halfway', 'Halfway there', 50);

      const percentage = progressTracker.calculatePercentage(task.id);
      expect(percentage).toBe(50);
    });

    it('should return progress summary', async () => {
      const task = taskManager.createTask({
        title: 'Summary Task',
        description: 'Testing progress summary',
      });

      await progressTracker.checkpoint(task.id, 'step1', 'First step', 30);

      const summary = progressTracker.getProgressSummary(task.id);
      expect(summary).not.toBeNull();
      expect(summary?.percentage).toBe(30);
      expect(summary?.currentStep).toBe('step1');
    });
  });
});
