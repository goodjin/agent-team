import { Router, Request, Response } from 'express';
import type { Task, TaskStatus } from '../../types/index.js';

export interface TaskRouter {
  getTasks(req: Request, res: Response): Promise<void>;
  getTask(req: Request, res: Response): Promise<void>;
  createTask(req: Request, res: Response): Promise<void>;
  updateTaskStatus(req: Request, res: Response): Promise<void>;
  deleteTask(req: Request, res: Response): Promise<void>;
}

// 存储活跃的 SSE 连接 (taskId -> Set<Response>)
const taskSseClients = new Map<string, Set<Response>>();

// 存储活跃的 Agent SSE 连接 (taskId -> Set<Response>)
const agentSseClients = new Map<string, Set<Response>>();

/**
 * 广播任务事件到所有订阅的客户端
 */
export function broadcastTaskEvent(taskId: string, event: any): void {
  const clients = taskSseClients.get(taskId);
  if (!clients || clients.size === 0) return;

  const data = `data: ${JSON.stringify(event)}\n\n`;

  for (const client of clients) {
    try {
      client.write(data);
    } catch (error) {
      console.error('Failed to send SSE event to task client:', error);
      clients.delete(client);
    }
  }
}

/**
 * 广播 Agent 事件到所有订阅的客户端
 */
export function broadcastAgentEvent(taskId: string, event: any): void {
  const clients = agentSseClients.get(taskId);
  if (!clients || clients.size === 0) return;

  const data = `data: ${JSON.stringify(event)}\n\n`;

  for (const client of clients) {
    try {
      client.write(data);
    } catch (error) {
      console.error('Failed to send SSE event to agent client:', error);
      clients.delete(client);
    }
  }
}

export function createTaskRouter(): Router {
  const router = Router();

  /**
   * GET /api/tasks - 获取任务列表
   */
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

  /**
   * GET /api/tasks/:taskId - 获取任务详情
   */
  router.get('/:taskId', async (req: Request, res: Response) => {
    try {
      const task = await getTask(req, res);
      if (!task) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TASK_NOT_FOUND',
            message: `Task not found: ${req.params.taskId}`,
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

  /**
   * GET /api/tasks/:taskId/events - SSE 任务实时更新
   */
  router.get('/:taskId/events', (req: Request, res: Response) => {
    const { taskId } = req.params;

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // 注册客户端
    if (!taskSseClients.has(taskId)) {
      taskSseClients.set(taskId, new Set());
    }
    taskSseClients.get(taskId)!.add(res);

    // 发送初始连接确认
    res.write(`data: ${JSON.stringify({ type: 'connected', taskId })}\n\n`);

    // 发送心跳保持连接
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    // 清理连接
    req.on('close', () => {
      clearInterval(heartbeat);
      const clients = taskSseClients.get(taskId);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) {
          taskSseClients.delete(taskId);
        }
      }
    });
  });

  /**
   * GET /api/tasks/:taskId/agents - 获取任务关联的 Agent 列表
   */
  router.get('/:taskId/agents', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      // TODO: 从 AgentMgr 获取与任务关联的 agents
      res.json({
        success: true,
        data: [],
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_TASK_AGENTS_FAILED',
          message: error.message || 'Failed to get task agents',
        },
      });
    }
  });

  /**
   * GET /api/tasks/:taskId/agents/events - Agent 状态 SSE 实时更新
   */
  router.get('/:taskId/agents/events', (req: Request, res: Response) => {
    const { taskId } = req.params;

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // 注册客户端
    if (!agentSseClients.has(taskId)) {
      agentSseClients.set(taskId, new Set());
    }
    agentSseClients.get(taskId)!.add(res);

    // 发送初始连接确认
    res.write(`data: ${JSON.stringify({ type: 'connected', taskId })}\n\n`);

    // 发送心跳保持连接
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    // 清理连接
    req.on('close', () => {
      clearInterval(heartbeat);
      const clients = agentSseClients.get(taskId);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) {
          agentSseClients.delete(taskId);
        }
      }
    });
  });

  /**
   * POST /api/tasks - 创建任务
   */
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
  const { category, status } = req.query;
  return [];
}

async function getTask(req: Request, _res: Response): Promise<Task | null> {
  const { taskId } = req.params;
  return null;
}

async function createTask(req: Request, _res: Response): Promise<Task> {
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
  const { id } = req.params;
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
  const { id } = req.params;
}
