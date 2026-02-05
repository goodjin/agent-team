import { Router, Request, Response } from 'express';
import type { Task, TaskStatus } from '../../types/index.js';

export interface TaskRouter {
  getTasks(req: Request, res: Response): Promise<void>;
  getTask(req: Request, res: Response): Promise<void>;
  createTask(req: Request, res: Response): Promise<void>;
  updateTaskStatus(req: Request, res: Response): Promise<void>;
  deleteTask(req: Request, res: Response): Promise<void>;
}

export function createTaskRouter(): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const tasks = await getTasks(req, res);
      res.json({
        success: true,
        data: tasks,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_TASKS_FAILED',
          message: error.message || 'Failed to get tasks',
        },
      });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const task = await getTask(req, res);
      if (!task) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TASK_NOT_FOUND',
            message: `Task not found: ${req.params.id}`,
          },
        });
      }
      res.json({
        success: true,
        data: task,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_TASK_FAILED',
          message: error.message || 'Failed to get task',
        },
      });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const task = await createTask(req, res);
      res.status(201).json({
        success: true,
        data: task,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'CREATE_TASK_FAILED',
          message: error.message || 'Failed to create task',
        },
      });
    }
  });

  router.patch('/:id/status', async (req: Request, res: Response) => {
    try {
      const task = await updateTaskStatus(req, res);
      res.json({
        success: true,
        data: task,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_TASK_STATUS_FAILED',
          message: error.message || 'Failed to update task status',
        },
      });
    }
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await deleteTask(req, res);
      res.json({
        success: true,
        message: 'Task deleted successfully',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'DELETE_TASK_FAILED',
          message: error.message || 'Failed to delete task',
        },
      });
    }
  });

  return router;
}

async function getTasks(req: Request, _res: Response): Promise<Task[]> {
  const { projectId } = req.params;
  const { category, status } = req.query;
  return [];
}

async function getTask(req: Request, _res: Response): Promise<Task | null> {
  const { projectId, id } = req.params;
  return null;
}

async function createTask(req: Request, _res: Response): Promise<Task> {
  const { projectId } = req.params;
  const { description } = req.body;
  if (!description) {
    throw new Error('Task description is required');
  }
  return {
    id: `task-${Date.now()}`,
    type: 'custom',
    title: description.substring(0, 50),
    description,
    status: 'pending',
    priority: 'medium',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function updateTaskStatus(req: Request, _res: Response): Promise<Task> {
  const { projectId, id } = req.params;
  const { status } = req.body;
  if (!['pending', 'running', 'done'].includes(status)) {
    throw new Error('Invalid status. Must be pending, running, or done');
  }
  return {
    id,
    type: 'custom',
    title: 'Task',
    description: 'Task description',
    status: status as TaskStatus,
    priority: 'medium',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function deleteTask(req: Request, _res: Response): Promise<void> {
  const { projectId, id } = req.params;
}
