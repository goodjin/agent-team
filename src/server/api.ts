import { Router, Request, Response } from 'express';
import { ProjectAgent } from '../core/project-agent.js';
import { TaskOrchestrator } from '../core/task-orchestrator.js';
import type {
  Task,
  TaskType,
  RoleType,
  Priority,
  TaskStatus,
  TaskMessage,
} from '../types/index.js';

export function createApiRoutes(agent: ProjectAgent): Router {
  const router = Router();
  const orchestrator = new TaskOrchestrator(agent);

  // ==================== 对话式任务创建 ====================
  
  /**
   * 处理用户输入（智能判断是否属于已有任务或创建新任务）
   */
  router.post('/tasks/chat', async (req: Request, res: Response) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({
          success: false,
          error: '缺少message字段',
        });
      }

      const result = await orchestrator.processUserInput(message);
      const taskManager = agent.getTaskManager();
      const task = taskManager.getTask(result.task.id);

      // 序列化任务
      const serializedTask = serializeTask(task!);

      res.json({
        success: true,
        data: {
          task: serializedTask,
          isNew: result.isNew,
          matchResult: result.matchResult,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || '处理用户输入失败',
      });
    }
  });

  /**
   * 执行任务（对话式）
   */
  router.post('/tasks/:id/chat', async (req: Request, res: Response) => {
    try {
      const { message } = req.body;
      const taskId = req.params.id;
      const taskManager = agent.getTaskManager();

      // 如果有新消息，先添加
      if (message) {
        taskManager.addMessage(taskId, {
          role: 'user',
          content: message,
          timestamp: new Date(),
        });
      }

      // 执行任务
      const result = await orchestrator.executeTaskWithChat(taskId);
      const task = taskManager.getTask(taskId);

      res.json({
        success: true,
        data: {
          response: result.response,
          tokensUsed: result.tokensUsed,
          task: serializeTask(task!),
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || '执行任务失败',
      });
    }
  });

  // ==================== 角色相关 ====================
  
  /**
   * 获取所有可用角色
   */
  router.get('/roles', async (req: Request, res: Response) => {
    try {
      const roles = agent.getAvailableRoles();
      const roleManager = await import('../roles/role-manager.js');
      const manager = roleManager.getRoleManager();
      
      const roleDetails = await Promise.all(
        roles.map(async (roleId) => {
          try {
            const role = manager.getRoleById(roleId);
            return {
              id: roleId,
              name: role?.name || roleId,
              description: role?.description || '',
              capabilities: role?.capabilities || [],
              responsibilities: role?.responsibilities || [],
            };
          } catch {
            return {
              id: roleId,
              name: roleId,
              description: '',
              capabilities: [],
              responsibilities: [],
            };
          }
        })
      );

      res.json({
        success: true,
        data: roleDetails,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || '获取角色列表失败',
      });
    }
  });

  // ==================== 配置相关 ====================
  
  /**
   * 获取系统配置
   */
  router.get('/config', async (req: Request, res: Response) => {
    try {
      const config = agent.getConfig();
      const llmConfig = agent.getLLMConfig();
      const stats = agent.getStats();

      res.json({
        success: true,
        data: {
          project: config,
          llm: llmConfig,
          stats,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || '获取配置失败',
      });
    }
  });

  // ==================== 任务相关 ====================
  
  /**
   * 序列化任务（转换日期等）
   */
  function serializeTask(task: Task): any {
    return {
      ...task,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      startedAt: task.startedAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
      messages: task.messages?.map(m => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      })),
      executionRecords: task.executionRecords?.map(r => ({
        ...r,
        startTime: r.startTime.toISOString(),
        endTime: r.endTime?.toISOString(),
      })),
      subtasks: task.subtasks?.map(st => serializeTask(st)),
    };
  }

  /**
   * 获取所有任务
   */
  router.get('/tasks', async (req: Request, res: Response) => {
    try {
      const taskManager = agent.getTaskManager();
      const tasks = taskManager.getAllTasks();

      // 转换日期为字符串以便JSON序列化
      const serializedTasks = tasks.map(task => serializeTask(task));

      res.json({
        success: true,
        data: serializedTasks,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || '获取任务列表失败',
      });
    }
  });

  /**
   * 获取单个任务
   */
  router.get('/tasks/:id', async (req: Request, res: Response) => {
    try {
      const taskManager = agent.getTaskManager();
      const task = taskManager.getTask(req.params.id);

      if (!task) {
        return res.status(404).json({
          success: false,
          error: '任务不存在',
        });
      }

      const serializedTask = serializeTask(task);

      res.json({
        success: true,
        data: serializedTask,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || '获取任务失败',
      });
    }
  });

  /**
   * 创建任务
   */
  router.post('/tasks', async (req: Request, res: Response) => {
    try {
      const {
        type,
        title,
        description,
        priority = 'medium',
        dependencies = [],
        assignedRole,
        input,
        constraints,
      } = req.body;

      if (!type || !title || !description) {
        return res.status(400).json({
          success: false,
          error: '缺少必需字段: type, title, description',
        });
      }

      const taskManager = agent.getTaskManager();
      const task = taskManager.createTask({
        type: type as TaskType,
        title,
        description,
        priority: priority as Priority,
        dependencies,
        assignedRole: assignedRole as RoleType,
        input,
        constraints,
      });

      res.status(201).json({
        success: true,
        data: serializeTask(task),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || '创建任务失败',
      });
    }
  });

  /**
   * 更新任务状态
   */
  router.put('/tasks/:id/status', async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      const taskManager = agent.getTaskManager();

      if (!status) {
        return res.status(400).json({
          success: false,
          error: '缺少status字段',
        });
      }

      taskManager.updateTaskStatus(req.params.id, status as TaskStatus);
      const task = taskManager.getTask(req.params.id);

      if (!task) {
        return res.status(404).json({
          success: false,
          error: '任务不存在',
        });
      }

      res.json({
        success: true,
        data: serializeTask(task),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || '更新任务状态失败',
      });
    }
  });

  /**
   * 执行任务
   */
  router.post('/tasks/:id/execute', async (req: Request, res: Response) => {
    try {
      const taskManager = agent.getTaskManager();
      const taskId = req.params.id;

      // 异步执行任务
      taskManager.executeTask(taskId).catch((error: Error) => {
        console.error(`任务执行失败 ${taskId}:`, error);
      });

      // 立即返回任务信息
      const task = taskManager.getTask(taskId);
      if (!task) {
        return res.status(404).json({
          success: false,
          error: '任务不存在',
        });
      }

      res.json({
        success: true,
        data: serializeTask(task),
        message: '任务已开始执行',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || '执行任务失败',
      });
    }
  });

  /**
   * 删除任务
   */
  router.delete('/tasks/:id', async (req: Request, res: Response) => {
    try {
      const taskManager = agent.getTaskManager();
      taskManager.deleteTask(req.params.id);

      res.json({
        success: true,
        message: '任务已删除',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || '删除任务失败',
      });
    }
  });

  // ==================== 统计信息 ====================
  
  /**
   * 获取统计信息
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const stats = agent.getStats();
      const taskManager = agent.getTaskManager();
      const tasks = taskManager.getAllTasks();

      // 按角色统计
      const byRole: Record<string, number> = {};
      tasks.forEach((task: Task) => {
        if (task.assignedRole) {
          byRole[task.assignedRole] = (byRole[task.assignedRole] || 0) + 1;
        }
      });

      res.json({
        success: true,
        data: {
          ...stats,
          byRole,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || '获取统计信息失败',
      });
    }
  });

  // ==================== 工作流相关 ====================
  
  /**
   * 获取所有工作流
   */
  router.get('/workflows', async (req: Request, res: Response) => {
    try {
      const workflows = agent.getWorkflows();
      const workflowsArray = Array.from(workflows.values());

      res.json({
        success: true,
        data: workflowsArray,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || '获取工作流列表失败',
      });
    }
  });

  /**
   * 执行工作流
   */
  router.post('/workflows/:id/execute', async (req: Request, res: Response) => {
    try {
      const workflowId = req.params.id;

      // 异步执行工作流
      agent.executeWorkflow(workflowId).catch((error: Error) => {
        console.error(`工作流执行失败 ${workflowId}:`, error);
      });

      res.json({
        success: true,
        message: '工作流已开始执行',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || '执行工作流失败',
      });
    }
  });

  // ==================== 工具相关 ====================
  
  /**
   * 获取可用工具
   */
  router.get('/tools', async (req: Request, res: Response) => {
    try {
      const tools = agent.getAvailableTools();
      const toolRegistry = agent.getToolRegistry();

      const toolDetails = tools.map((toolName) => {
        const toolDef = toolRegistry.getDefinition(toolName);
        return {
          name: toolName,
          description: toolDef?.description || '',
          category: toolDef?.category || 'custom',
        };
      });

      res.json({
        success: true,
        data: toolDetails,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || '获取工具列表失败',
      });
    }
  });

  return router;
}