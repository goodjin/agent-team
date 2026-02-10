import { Router, Request, Response } from 'express';
import { ProjectAgent } from '../core/project-agent.js';
import { TaskOrchestrator } from '../core/task-orchestrator.js';
import { createAgentRouter } from './routes/agents.js';
import { createWorkflowRouter } from './routes/workflows.js';
import { createProjectRouter } from './routes/projects.js';
import { createWorkDirRouter } from './routes/work-dir.js';
import { createTasksV4Router } from './routes/tasks-v4.js';
import { broadcastTaskEvent, broadcastAgentEvent } from './routes/tasks.js';
import { ResultsUI } from '../ui/results-ui.js';
import type {
  Task,
  TaskType,
  RoleType,
  Priority,
  TaskStatus,
  TaskMessage,
} from '../types/index.js';

function log(...args: any[]) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${msg}`);
}

function errorLog(...args: any[]) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  console.error(`[ERROR] ${msg}`);
}

export function createApiRoutes(agent: ProjectAgent): Router {
  const router = Router();
  const orchestrator = new TaskOrchestrator(agent);

  // 智能体管理路由
  router.use('/agents', createAgentRouter(agent.getAgentMgr()));

  // 工作流管理路由
  router.use('/workflows', createWorkflowRouter(agent).router);

  // 项目管理路由
  router.use('/projects', createProjectRouter(agent.getTaskManager(), agent.getAgentMgr()));

  // 工作目录管理路由
  router.use('/', createWorkDirRouter(agent.getWorkDirManager()));

  // ==================== 对话式任务创建 ====================
  
  /**
   * 处理用户输入（智能判断是否属于已有任务或创建新任务）
   */
  router.post('/tasks/chat', async (req: Request, res: Response) => {
    log('[API] 收到 /tasks/chat 请求');
    log('[API] 请求体:', req.body);
    
    try {
      const { message } = req.body as { message?: string };
      
      if (!message?.trim()) {
        log('[API] 消息无效');
        return res.status(400).json({ success: false, error: '消息不能为空' });
      }
      
      log('[API] 用户消息:', message?.substring(0, 50));
      
      log('[API] 调用 orchestrator.processUserInput...');
      const result = await orchestrator.processUserInput(message);
      
      if (result?.task) {
        log('[API] processUserInput 返回:', result?.task?.id);
        log('[API] 任务已创建, role:', result.task.assignedRole);
        
        // 异步执行新任务
        if (result.isNew && result.task) {
          const taskManager = agent.getTaskManager();
          log('[API] 自动执行新任务:', result.task.id);
          taskManager.executeTask(result.task.id).catch((error: Error) => {
            errorLog('[API] 任务执行失败:', result.task.id, error.message);
          });
        }
        
        return res.json({
          success: true,
          data: {
            taskId: result.task.id,
            role: result.task.assignedRole,
            isNew: result.isNew,
            matchResult: result.matchResult,
          },
        });
      }
      
      return res.json({
        success: true,
        data: {
          taskId: result?.task?.id,
          isNew: result?.isNew,
        },
      });
    } catch (error: any) {
      errorLog('[API] 处理失败:', error.message);
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
    log('[EXECUTE] 收到执行任务请求, taskId:', req.params.id);
    
    try {
      const taskManager = agent.getTaskManager();
      const taskId = req.params.id;
      log('[EXECUTE] 获取 TaskManager, taskId:', taskId);

      // 获取任务详情
      const taskBefore = taskManager.getTask(taskId);
      log('[EXECUTE] 任务执行前:', {
        id: taskBefore?.id,
        title: taskBefore?.title,
        assignedRole: taskBefore?.assignedRole,
        status: taskBefore?.status
      });

      // 异步执行任务
      log('[EXECUTE] 开始异步执行任务...');
      taskManager.executeTask(taskId).then((result) => {
        // 只在有错误时打印 error
        if (result.error) {
          log('[EXECUTE] 任务执行完成, result:', {
            success: result.success,
            error: result.error
          });
        } else {
          log('[EXECUTE] 任务执行完成, result:', {
            success: result.success
          });
        }
      }).catch((error: Error) => {
        errorLog(`[EXECUTE] 任务执行失败 ${taskId}:`, error.message);
        errorLog(`[EXECUTE] 错误堆栈:`, error.stack);
      });

      // 立即返回任务信息
      const task = taskManager.getTask(taskId);
      log('[EXECUTE] 返回任务信息, role:', task?.assignedRole);
      
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
      errorLog('[EXECUTE] 执行异常:', error.message);
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

  // ==================== SSE 实时更新端点 ====================

  /**
   * GET /api/tasks/:id/events - 任务实时更新 SSE
   */
  router.get('/tasks/:id/events', (req: Request, res: Response) => {
    const taskId = req.params.id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // 注册 SSE 客户端（使用从 routes/tasks.ts 导入的广播机制）
    // 发送初始连接确认
    res.write(`data: ${JSON.stringify({ type: 'connected', taskId })}\n\n`);

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    // 监听任务事件并转发
    let closed = false;
    const taskMgr = agent.getTaskManager();
    const onTaskEvent = (event: any) => {
      if (closed) return;
      if (event.data?.task?.id === taskId || event.data?.taskId === taskId) {
        try {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          closed = true;
        }
      }
    };

    taskMgr.on('task:updated', onTaskEvent);
    taskMgr.on('task:completed', onTaskEvent);
    taskMgr.on('task:failed', onTaskEvent);
    taskMgr.on('task:started', onTaskEvent);

    req.on('close', () => {
      closed = true;
      clearInterval(heartbeat);
    });
  });

  /**
   * GET /api/tasks/:id/agents - 获取任务关联的 Agent 列表
   */
  router.get('/tasks/:id/agents', async (req: Request, res: Response) => {
    try {
      const agentMgr = agent.getAgentMgr();
      const agents = await agentMgr.getAgents({});
      const taskAgents = agents.filter((a: any) => a.currentTaskId === req.params.id);
      res.json({
        success: true,
        data: taskAgents,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || '获取任务 Agent 列表失败',
      });
    }
  });

  /**
   * GET /api/tasks/:id/agents/events - Agent 状态实时更新 SSE
   */
  router.get('/tasks/:id/agents/events', (req: Request, res: Response) => {
    const taskId = req.params.id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: 'connected', taskId })}\n\n`);

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    let agentClosed = false;
    const agentMgr = agent.getAgentMgr();
    const onAgentEvent = (event: any) => {
      if (agentClosed) return;
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        agentClosed = true;
      }
    };

    agentMgr.on('agent.status.changed', onAgentEvent);
    agentMgr.on('agent.created', onAgentEvent);

    req.on('close', () => {
      agentClosed = true;
      clearInterval(heartbeat);
    });
  });

  // ==================== 任务成果路由 (v4) ====================
  const taskManager = agent.getTaskManager();
  router.use('/tasks', createTasksV4Router(
    taskManager,
    taskManager.getRetryManager(),
    taskManager.getProgressTracker(),
    new ResultsUI()
  ));

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
      errorLog('获取角色列表失败:', error);
      // 返回空列表而不是错误
      res.json({
        success: true,
        data: [],
        warnings: ['角色加载失败，将使用默认角色'],
      });
    }
  });

  // ==================== 工作流管理 ====================
  
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