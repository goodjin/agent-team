import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTasksV4Router } from '../../src/server/routes/tasks-v4.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { RetryManager } from '../../src/core/retry-manager.js';
import { ProgressTracker } from '../../src/core/progress-tracker.js';
import { ResultsUI } from '../../src/ui/results-ui.js';
import type { Task, TaskExecutionRecord, TaskStatus } from '../../src/types/index.js';
import type { OutputFile } from '../../src/types/output.js';

describe('Tasks V4 API', () => {
  let app: express.Application;
  let mockTaskManager: TaskManager;
  let mockRetryManager: RetryManager;
  let mockProgressTracker: ProgressTracker;
  let mockResultsUI: ResultsUI;
  let mockTask: Task;

  const createMockTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'test-task-id',
    type: 'custom',
    title: 'Test Task',
    description: 'Test task description',
    status: 'pending',
    priority: 'medium',
    dependencies: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionRecords: [],
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockTask = createMockTask();

    mockTaskManager = {
      getTask: vi.fn().mockReturnValue(mockTask),
      getAllTasks: vi.fn().mockReturnValue([mockTask]),
      updateTaskStatus: vi.fn(),
      createTask: vi.fn().mockReturnValue(mockTask),
    } as unknown as TaskManager;

    mockRetryManager = {
      manualRetry: vi.fn().mockResolvedValue(true),
      cancelRetry: vi.fn().mockReturnValue(true),
      getRetryInfo: vi.fn().mockReturnValue({
        taskId: 'test-task-id',
        retryCount: 1,
        maxRetries: 3,
        canRetry: true,
        scheduledAt: new Date(),
        retryHistory: [],
      }),
    } as unknown as RetryManager;

    mockProgressTracker = {
      getCheckpoints: vi.fn().mockResolvedValue([]),
      getProgressSummary: vi.fn().mockReturnValue({
        currentStep: 'Step 1',
        percentage: 50,
        totalCheckpoints: 2,
        startedAt: new Date(),
        lastUpdatedAt: new Date(),
      }),
      checkpoint: vi.fn(),
      clearCheckpoints: vi.fn(),
    } as unknown as ProgressTracker;

    mockResultsUI = {
      buildFileTree: vi.fn().mockReturnValue([]),
      getFilePreview: vi.fn().mockReturnValue({ type: 'text', content: 'preview' }),
    } as unknown as ResultsUI;

    app = express();
    app.use(express.json());
    app.use('/api/tasks', createTasksV4Router(
      mockTaskManager,
      mockRetryManager,
      mockProgressTracker,
      mockResultsUI
    ));
  });

  describe('GET /api/tasks/:id', () => {
    it('should return task details with retry info and progress', async () => {
      const response = await request(app)
        .get('/api/tasks/test-task-id')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.task).toBeDefined();
      expect(response.body.data.retryInfo).toBeDefined();
      expect(response.body.data.canRetry).toBe(true);
      expect(response.body.data.progress).toBeDefined();
      expect(mockTaskManager.getTask).toHaveBeenCalledWith('test-task-id');
    });

    it('should return 404 for non-existent task', async () => {
      vi.mocked(mockTaskManager.getTask).mockReturnValueOnce(undefined);

      const response = await request(app)
        .get('/api/tasks/non-existent-id')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TASK_NOT_FOUND');
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(mockTaskManager.getTask).mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .get('/api/tasks/test-task-id')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('GET_TASK_FAILED');
    });
  });

  describe('GET /api/tasks/:id/progress', () => {
    it('should return progress checkpoints and summary', async () => {
      const mockCheckpoints = [
        {
          id: 'cp-1',
          taskId: 'test-task-id',
          step: 'Step 1',
          message: 'Started',
          percentage: 25,
          createdAt: expect.any(Date),
        },
        {
          id: 'cp-2',
          taskId: 'test-task-id',
          step: 'Step 2',
          message: 'Processing',
          percentage: 50,
          createdAt: expect.any(Date),
        },
      ];

      vi.mocked(mockProgressTracker.getCheckpoints).mockResolvedValueOnce(mockCheckpoints);

      const response = await request(app)
        .get('/api/tasks/test-task-id/progress')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.checkpoints).toHaveLength(2);
      expect(response.body.data.checkpoints[0].id).toBe('cp-1');
      expect(response.body.data.checkpoints[0].step).toBe('Step 1');
      expect(response.body.data.summary).toBeDefined();
    });

    it('should handle progress fetch errors', async () => {
      vi.mocked(mockProgressTracker.getCheckpoints).mockRejectedValueOnce(new Error('Progress error'));

      const response = await request(app)
        .get('/api/tasks/test-task-id/progress')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('GET_PROGRESS_FAILED');
    });
  });

  describe('POST /api/tasks/:id/retry', () => {
    it('should retry a failed task', async () => {
      vi.mocked(mockRetryManager.manualRetry).mockResolvedValueOnce(true);

      const response = await request(app)
        .post('/api/tasks/test-task-id/retry')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.taskId).toBe('test-task-id');
      expect(response.body.data.attemptNumber).toBeDefined();
      expect(response.body.data.scheduledAt).toBeDefined();
    });

    it('should return 400 when retry is not allowed', async () => {
      vi.mocked(mockRetryManager.manualRetry).mockResolvedValueOnce(false);

      const response = await request(app)
        .post('/api/tasks/test-task-id/retry')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('RETRY_FAILED');
    });

    it('should handle retry errors', async () => {
      vi.mocked(mockRetryManager.manualRetry).mockRejectedValueOnce(new Error('Retry error'));

      const response = await request(app)
        .post('/api/tasks/test-task-id/retry')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('RETRY_FAILED');
    });
  });

  describe('GET /api/tasks/:id/retry-info', () => {
    it('should return retry information', async () => {
      const mockRetryInfo = {
        taskId: 'test-task-id',
        retryCount: 2,
        maxRetries: 3,
        canRetry: true,
        scheduledAt: expect.any(Date),
        retryHistory: [
          { attemptNumber: 1, scheduledAt: expect.any(Date), executedAt: expect.any(Date), success: false },
        ],
      };

      vi.mocked(mockRetryManager.getRetryInfo).mockReturnValueOnce(mockRetryInfo);

      const response = await request(app)
        .get('/api/tasks/test-task-id/retry-info')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.taskId).toBe('test-task-id');
      expect(response.body.data.retryCount).toBe(2);
      expect(response.body.data.canRetry).toBe(true);
      expect(response.body.data.retryHistory).toHaveLength(1);
    });

    it('should return 404 when retry info not found', async () => {
      vi.mocked(mockRetryManager.getRetryInfo).mockReturnValueOnce(undefined);

      const response = await request(app)
        .get('/api/tasks/test-task-id/retry-info')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('RETRY_INFO_NOT_FOUND');
    });
  });

  describe('POST /api/tasks/:id/cancel-retry', () => {
    it('should cancel pending retry', async () => {
      const response = await request(app)
        .post('/api/tasks/test-task-id/cancel-retry')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.cancelled).toBe(true);
      expect(mockRetryManager.cancelRetry).toHaveBeenCalledWith('test-task-id');
    });

    it('should handle cancel retry errors', async () => {
      vi.mocked(mockRetryManager.cancelRetry).mockImplementationOnce(() => {
        throw new Error('Cancel error');
      });

      const response = await request(app)
        .post('/api/tasks/test-task-id/cancel-retry')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CANCEL_RETRY_FAILED');
    });
  });

  describe('POST /api/tasks/:id/restore', () => {
    it('should restore a failed task', async () => {
      const restoredTask = { ...mockTask, status: 'pending' as TaskStatus };

      vi.mocked(mockTaskManager.getTask).mockReturnValueOnce(restoredTask);

      const response = await request(app)
        .post('/api/tasks/test-task-id/restore')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.metadata.restartCount).toBe(1);
    });

    it('should return 404 for non-existent task', async () => {
      vi.mocked(mockTaskManager.getTask).mockReturnValueOnce(undefined);

      const response = await request(app)
        .post('/api/tasks/non-existent-id/restore')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TASK_NOT_FOUND');
    });

    it('should increment restart count on multiple restores', async () => {
      const taskWithRestarts = {
        ...mockTask,
        metadata: { restartCount: 2 },
      };

      vi.mocked(mockTaskManager.getTask).mockReturnValueOnce(taskWithRestarts);

      const response = await request(app)
        .post('/api/tasks/test-task-id/restore')
        .expect(200);

      expect(response.body.data.metadata.restartCount).toBe(3);
    });
  });

  describe('GET /api/tasks/:id/output', () => {
    it('should return task output and files', async () => {
      const taskWithOutput = {
        ...mockTask,
        output: {
          success: true,
          files: [
            { path: 'src/index.js', content: 'console.log("hello")', mimeType: 'application/javascript' },
            { path: 'README.md', content: '# Project', mimeType: 'text/markdown' },
          ],
          webPreview: '<html></html>',
        },
      };

      vi.mocked(mockTaskManager.getTask).mockReturnValueOnce(taskWithOutput);

      const response = await request(app)
        .get('/api/tasks/test-task-id/output')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.output).toBeDefined();
      expect(response.body.data.files).toHaveLength(2);
      expect(response.body.data.webPreview).toBeDefined();
    });

    it('should return empty data when no output', async () => {
      const response = await request(app)
        .get('/api/tasks/test-task-id/output')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.output).toBeNull();
      expect(response.body.data.files).toEqual([]);
    });

    it('should return 404 for non-existent task', async () => {
      vi.mocked(mockTaskManager.getTask).mockReturnValueOnce(undefined);

      const response = await request(app)
        .get('/api/tasks/non-existent-id/output')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TASK_NOT_FOUND');
    });
  });

  describe('GET /api/tasks/:id/output/files/tree', () => {
    it('should return file tree structure', async () => {
      const mockTree = [
        {
          name: 'src',
          path: 'src',
          type: 'directory' as const,
          children: [
            { name: 'index.js', path: 'src/index.js', type: 'file' as const, mimeType: 'application/javascript' },
          ],
        },
      ];

      vi.mocked(mockResultsUI.buildFileTree).mockReturnValueOnce(mockTree);
      vi.mocked(mockTaskManager.getTask).mockReturnValueOnce({
        ...mockTask,
        output: {
          files: [
            { id: 'f1', path: 'src/index.js', name: 'index.js', type: 'source' as const, size: 100, mimeType: 'application/javascript' },
          ],
        },
      });

      const response = await request(app)
        .get('/api/tasks/test-task-id/output/files/tree')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tree).toEqual(mockTree);
    });

    it('should return empty tree for non-existent files', async () => {
      vi.mocked(mockTaskManager.getTask).mockReturnValueOnce({
        ...mockTask,
        output: { files: [] },
      });

      const response = await request(app)
        .get('/api/tasks/test-task-id/output/files/tree')
        .expect(200);

      expect(response.body.data.tree).toEqual([]);
    });
  });

  describe('GET /api/tasks/:id/output/files/:path(*)', () => {
    it('should return file and preview', async () => {
      const mockFile: OutputFile = {
        id: 'file-1',
        path: 'src/index.js',
        name: 'index.js',
        type: 'source',
        size: 100,
        content: 'console.log("hello")',
        mimeType: 'application/javascript',
      };

      vi.mocked(mockTaskManager.getTask).mockReturnValueOnce({
        ...mockTask,
        output: { files: [mockFile] },
      });

      const response = await request(app)
        .get('/api/tasks/test-task-id/output/files/src/index.js')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.file).toEqual(mockFile);
      expect(response.body.data.preview).toBeDefined();
    });

    it('should return 404 for non-existent file', async () => {
      vi.mocked(mockTaskManager.getTask).mockReturnValueOnce({
        ...mockTask,
        output: { files: [] },
      });

      const response = await request(app)
        .get('/api/tasks/test-task-id/output/files/non-existent.js')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FILE_NOT_FOUND');
    });

    it('should return 404 for task without output files', async () => {
      vi.mocked(mockTaskManager.getTask).mockReturnValueOnce(undefined);

      const response = await request(app)
        .get('/api/tasks/test-task-id/output/files/src/index.js')
        .expect(404);

      expect(response.body.error.code).toBe('FILE_NOT_FOUND');
    });
  });

  describe('GET /api/tasks/:id/execution-history', () => {
    it('should return execution records and retry history', async () => {
      const mockExecutionRecords: TaskExecutionRecord[] = [
        {
          id: 'record-1',
          role: 'developer',
          action: 'Initial execution',
          startTime: new Date(),
          endTime: new Date(),
          duration: 5000,
          result: { success: false, error: 'Failed' },
        },
      ];

      vi.mocked(mockTaskManager.getTask).mockReturnValueOnce({
        ...mockTask,
        executionRecords: mockExecutionRecords,
      });

      vi.mocked(mockRetryManager.getRetryInfo).mockReturnValueOnce({
        taskId: 'test-task-id',
        retryCount: 1,
        maxRetries: 3,
        canRetry: true,
        scheduledAt: new Date(),
        retryHistory: [
          { attemptNumber: 1, scheduledAt: new Date(), success: false },
        ],
      });

      const response = await request(app)
        .get('/api/tasks/test-task-id/execution-history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.executionRecords).toHaveLength(1);
      expect(response.body.data.retryHistory).toHaveLength(1);
    });

    it('should return empty arrays when no history', async () => {
      vi.mocked(mockRetryManager.getRetryInfo).mockReturnValueOnce(undefined);

      const response = await request(app)
        .get('/api/tasks/test-task-id/execution-history')
        .expect(200);

      expect(response.body.data.executionRecords).toEqual([]);
      expect(response.body.data.retryHistory).toEqual([]);
    });

    it('should return 404 for non-existent task', async () => {
      vi.mocked(mockTaskManager.getTask).mockReturnValueOnce(undefined);

      const response = await request(app)
        .get('/api/tasks/non-existent-id/execution-history')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TASK_NOT_FOUND');
    });
  });
});
