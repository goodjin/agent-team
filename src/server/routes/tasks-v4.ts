import { Router, Request, Response } from 'express';
import { TaskManager } from '../../core/task-manager.js';
import { RetryManager, type RetryInfo } from '../../core/retry-manager.js';
import { ResultsUI } from '../../ui/results-ui.js';
import { ProgressTracker } from '../../core/progress-tracker.js';
import { SubTaskExecutor } from '../../core/subtask-executor.js';
import type { OutputFile } from '../../types/output.js';

export function createTasksV4Router(
  taskManager: TaskManager,
  retryManager: RetryManager,
  progressTracker: ProgressTracker,
  resultsUI: ResultsUI
): Router {
  const router = Router();

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const task = taskManager.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({
          success: false,
          error: { code: 'TASK_NOT_FOUND', message: `Task not found: ${req.params.id}` },
        });
      }

      const retryInfo = retryManager.getRetryInfo(task.id);
      const progress = progressTracker.getProgressSummary(task.id);

      res.json({
        success: true,
        data: {
          task,
          retryInfo,
          canRetry: retryInfo?.canRetry ?? false,
          progress,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: 'GET_TASK_FAILED', message: error.message },
      });
    }
  });

  router.get('/:id/progress', async (req: Request, res: Response) => {
    try {
      const checkpoints = await progressTracker.getCheckpoints(req.params.id);
      const summary = progressTracker.getProgressSummary(req.params.id);

      res.json({
        success: true,
        data: { checkpoints, summary },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: 'GET_PROGRESS_FAILED', message: error.message },
      });
    }
  });

  router.post('/:id/retry', async (req: Request, res: Response) => {
    try {
      const success = await retryManager.manualRetry(req.params.id);
      if (!success) {
        return res.status(400).json({
          success: false,
          error: { code: 'RETRY_FAILED', message: 'Cannot retry task' },
        });
      }

      const retryInfo = retryManager.getRetryInfo(req.params.id);
      res.json({
        success: true,
        data: {
          taskId: req.params.id,
          attemptNumber: (retryInfo?.retryHistory?.length ?? 0) + 1,
          scheduledAt: new Date(),
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: 'RETRY_FAILED', message: error.message },
      });
    }
  });

  router.get('/:id/retry-info', async (req: Request, res: Response) => {
    try {
      const retryInfo = retryManager.getRetryInfo(req.params.id);
      if (!retryInfo) {
        return res.status(404).json({
          success: false,
          error: { code: 'RETRY_INFO_NOT_FOUND', message: 'Retry info not found' },
        });
      }

      res.json({ success: true, data: retryInfo });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: 'GET_RETRY_INFO_FAILED', message: error.message },
      });
    }
  });

  router.post('/:id/cancel-retry', async (req: Request, res: Response) => {
    try {
      const cancelled = retryManager.cancelRetry(req.params.id);
      res.json({
        success: true,
        data: { cancelled },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: 'CANCEL_RETRY_FAILED', message: error.message },
      });
    }
  });

  router.post('/:id/restore', async (req: Request, res: Response) => {
    try {
      const task = taskManager.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({
          success: false,
          error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
        });
      }

      task.status = 'pending';
      if (!task.metadata) {
        task.metadata = {};
      }
      task.metadata.restartCount = (task.metadata.restartCount || 0) + 1;

      res.json({ success: true, data: task });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: 'RESTORE_FAILED', message: error.message },
      });
    }
  });

  router.get('/:id/output', async (req: Request, res: Response) => {
    try {
      const task = taskManager.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({
          success: false,
          error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
        });
      }

      if (!task.output) {
        return res.json({
          success: true,
          data: { output: null, files: [], webPreview: null },
        });
      }

      const files = task.output.files || [];
      const tree = resultsUI.buildFileTree(files);

      res.json({
        success: true,
        data: {
          output: task.output,
          files,
          webPreview: task.output.webPreview,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: 'GET_OUTPUT_FAILED', message: error.message },
      });
    }
  });

  router.get('/:id/output/files/tree', async (req: Request, res: Response) => {
    try {
      const task = taskManager.getTask(req.params.id);
      if (!task || !task.output?.files) {
        return res.json({ success: true, data: { tree: [] } });
      }

      const tree = resultsUI.buildFileTree(task.output.files);
      res.json({ success: true, data: { tree } });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: 'GET_FILE_TREE_FAILED', message: error.message },
      });
    }
  });

  router.get('/:id/output/files/:path(*)', async (req: Request, res: Response) => {
    try {
      const task = taskManager.getTask(req.params.id);
      if (!task || !task.output?.files) {
        return res.status(404).json({
          success: false,
          error: { code: 'FILE_NOT_FOUND', message: 'File not found' },
        });
      }

      const file = task.output.files.find((f: OutputFile) => f.path === req.params.path);
      if (!file) {
        return res.status(404).json({
          success: false,
          error: { code: 'FILE_NOT_FOUND', message: `File not found: ${req.params.path}` },
        });
      }

      const preview = resultsUI.getFilePreview(file);
      res.json({ success: true, data: { file, preview } });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: 'GET_FILE_PREVIEW_FAILED', message: error.message },
      });
    }
  });

  router.get('/:id/execution-history', async (req: Request, res: Response) => {
    try {
      const task = taskManager.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({
          success: false,
          error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
        });
      }

      res.json({
        success: true,
        data: {
          executionRecords: task.executionRecords || [],
          retryHistory: retryManager.getRetryInfo(req.params.id)?.retryHistory || [],
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: 'GET_HISTORY_FAILED', message: error.message },
      });
    }
  });

  router.post('/:id/subtasks/:subtaskId/chat', async (req: Request, res: Response) => {
    try {
      const { message } = req.body;
      if (!message) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Message is required' },
        });
      }

      const task = taskManager.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({
          success: false,
          error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
        });
      }

      const subtaskExecutor = new SubTaskExecutor(
        {
          project: taskManager['projectConfig'],
          currentTask: task,
          history: [],
          variables: new Map(),
          tools: new Map(),
        },
        taskManager['toolRegistry']
      );

      const result = await subtaskExecutor.sendMessageToSubTask(
        req.params.subtaskId,
        message
      );

      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: 'SEND_MESSAGE_FAILED', message: error.message },
      });
    }
  });

  router.get('/:id/subtasks', async (req: Request, res: Response) => {
    try {
      const task = taskManager.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({
          success: false,
          error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
        });
      }

      const subtaskExecutor = new SubTaskExecutor(
        {
          project: taskManager['projectConfig'],
          currentTask: task,
          history: [],
          variables: new Map(),
          tools: new Map(),
        },
        taskManager['toolRegistry']
      );

      const states = subtaskExecutor.getAgentStates();
      const stats = subtaskExecutor.getStats();

      res.json({
        success: true,
        data: {
          states: Object.fromEntries(states),
          stats,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: 'GET_SUBTASKS_FAILED', message: error.message },
      });
    }
  });

  return router;
}
