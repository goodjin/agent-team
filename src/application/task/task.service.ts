import {
  Task,
  CreateTaskParams,
  ITaskRepository,
  TaskStateMachine,
  InvalidStateTransitionError,
  ComplexityAnalyzer,
  DependencyManager,
  ISplitStrategy,
  RoleBasedSplitStrategy,
  ModuleBasedSplitStrategy
} from '../../domain/task/index.js';
import { IEventBus, DomainEvent } from '../../infrastructure/event-bus/index.js';
import { ILogger, LogEntry } from '../../infrastructure/logger/index.js';
import { IScheduler } from '../../infrastructure/scheduler/index.js';
import { generateId } from '../../infrastructure/utils/id.js';
import { AgentService } from '../agent/agent.service.js';
import { MasterAgentService } from '../master-agent/master-agent.service.js';

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`);
    this.name = 'TaskNotFoundError';
  }
}

export class DependenciesNotMetError extends Error {
  constructor(taskId: string) {
    super(`Dependencies not met for task: ${taskId}`);
    this.name = 'DependenciesNotMetError';
  }
}

export class TaskService {
  private stateMachine = new TaskStateMachine();
  private complexityAnalyzer = new ComplexityAnalyzer();
  private dependencyManager = new DependencyManager();

  constructor(
    private taskRepo: ITaskRepository,
    private eventBus: IEventBus,
    private logger: ILogger,
    private scheduler: IScheduler,
    private agentService: AgentService,
    private masterAgentService: MasterAgentService
  ) {}

  async create(params: CreateTaskParams): Promise<Task> {
    const title = (params.title && String(params.title).trim()) || '新对话';
    const description = params.description != null ? String(params.description) : '';
    const task: Task = {
      id: generateId(),
      title,
      description,
      status: 'pending',
      role: params.role || 'task-analyzer',
      parentId: params.parentId,
      dependencies: params.dependencies || [],
      createdAt: new Date(),
      artifactIds: [],
      logIds: [],
      subtaskIds: [],
      orchestrationMode: params.orchestrationMode,
    };

    await this.taskRepo.save(task);

    await this.logTaskEvent(task.id, 'status_change', `任务创建: ${task.title}`, {
      status: 'pending'
    });

    await this.eventBus.publish({
      type: 'task.created',
      timestamp: new Date(),
      payload: { task }
    });

    return task;
  }

  async get(taskId: string): Promise<Task> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) throw new TaskNotFoundError(taskId);
    return task;
  }

  async list(options?: { status?: Task['status'] }): Promise<Task[]> {
    return this.taskRepo.findAll(options);
  }

  async start(taskId: string): Promise<void> {
    const task = await this.get(taskId);

    // 检查依赖
    if (task.dependencies.length > 0) {
      const deps = await Promise.all(
        task.dependencies.map(id => this.taskRepo.findById(id))
      );
      const allCompleted = deps.every(d => d?.status === 'completed');
      if (!allCompleted) {
        throw new DependenciesNotMetError(taskId);
      }
    }

    // 状态转换
    this.stateMachine.validateTransition(task.status, 'running');

    task.status = 'running';
    task.startedAt = new Date();
    await this.taskRepo.save(task);

    await this.logTaskEvent(task.id, 'status_change', '任务开始执行', {
      oldStatus: 'pending',
      newStatus: 'running'
    });

    await this.eventBus.publish({
      type: 'task.status_changed',
      timestamp: new Date(),
      payload: { taskId, oldStatus: 'pending', newStatus: 'running' }
    });

    const mode = task.orchestrationMode ?? 'v9-legacy';
    if (mode === 'v10-master') {
      await this.masterAgentService.ensureSessionStarted(taskId);
      await this.logTaskEvent(task.id, 'milestone', 'v10 主控会话已启动（intake），等待用户通过 WS/REST 发消息', {});
      return;
    }

    // 分析复杂度并可能拆分
    const complexity = this.complexityAnalyzer.analyze(task);
    await this.logTaskEvent(task.id, 'thought', `任务复杂度分析: ${complexity.level}`, {
      score: complexity.score
    });

    if (complexity.level !== 'simple' && complexity.strategy) {
      await this.splitTask(task.id, complexity.strategy);
    }

    // 调度执行
    this.scheduler.schedule(taskId, async () => {
      await this.execute(task.id);
    });
  }

  async pause(taskId: string): Promise<void> {
    const task = await this.get(taskId);
    this.stateMachine.validateTransition(task.status, 'paused');

    task.status = 'paused';
    await this.taskRepo.save(task);
    this.scheduler.pause(taskId);

    await this.logTaskEvent(taskId, 'status_change', '任务已暂停', {
      oldStatus: 'running',
      newStatus: 'paused'
    });

    await this.eventBus.publish({
      type: 'task.status_changed',
      timestamp: new Date(),
      payload: { taskId, oldStatus: 'running', newStatus: 'paused' }
    });
  }

  async resume(taskId: string): Promise<void> {
    const task = await this.get(taskId);
    this.stateMachine.validateTransition(task.status, 'running');

    task.status = 'running';
    await this.taskRepo.save(task);
    this.scheduler.resume(taskId);

    await this.logTaskEvent(taskId, 'status_change', '任务已恢复', {
      oldStatus: 'paused',
      newStatus: 'running'
    });

    await this.eventBus.publish({
      type: 'task.status_changed',
      timestamp: new Date(),
      payload: { taskId, oldStatus: 'paused', newStatus: 'running' }
    });
  }

  async retry(taskId: string): Promise<void> {
    const task = await this.get(taskId);
    this.stateMachine.validateTransition(task.status, 'pending');

    task.status = 'pending';
    task.startedAt = undefined;
    task.completedAt = undefined;
    await this.taskRepo.save(task);

    await this.start(taskId);
  }

  async complete(taskId: string): Promise<void> {
    const task = await this.get(taskId);
    this.stateMachine.validateTransition(task.status, 'completed');

    task.status = 'completed';
    task.completedAt = new Date();
    await this.taskRepo.save(task);

    await this.logTaskEvent(taskId, 'milestone', '任务完成', {
      duration: task.completedAt.getTime() - (task.startedAt?.getTime() || task.createdAt.getTime())
    });

    await this.eventBus.publish({
      type: 'task.status_changed',
      timestamp: new Date(),
      payload: { taskId, oldStatus: 'running', newStatus: 'completed' }
    });
  }

  async fail(taskId: string, error: string): Promise<void> {
    const task = await this.get(taskId);
    this.stateMachine.validateTransition(task.status, 'failed');

    task.status = 'failed';
    task.completedAt = new Date();
    await this.taskRepo.save(task);

    await this.logTaskEvent(taskId, 'error', `任务失败: ${error}`, { error });

    await this.eventBus.publish({
      type: 'task.status_changed',
      timestamp: new Date(),
      payload: { taskId, oldStatus: 'running', newStatus: 'failed', error }
    });
  }

  async splitTask(taskId: string, strategy: 'role-based' | 'module-based' | 'step-based'): Promise<Task[]> {
    const task = await this.get(taskId);

    let splitStrategy: ISplitStrategy;
    switch (strategy) {
      case 'module-based':
        splitStrategy = new ModuleBasedSplitStrategy();
        break;
      default:
        splitStrategy = new RoleBasedSplitStrategy();
    }

    const subtaskData = splitStrategy.split(task);
    const subtasks: Task[] = [];

    for (const data of subtaskData) {
      const subtask: Task = {
        ...data,
        createdAt: new Date(),
        artifactIds: [],
        logIds: [],
        subtaskIds: []
      };

      await this.taskRepo.save(subtask);
      subtasks.push(subtask);

      await this.logTaskEvent(taskId, 'action', `创建子任务: ${subtask.title}`, {
        subtaskId: subtask.id,
        role: subtask.role
      });
    }

    // 更新父任务的子任务列表
    task.subtaskIds = subtasks.map(s => s.id);
    await this.taskRepo.save(task);

    await this.eventBus.publish({
      type: 'task.split',
      timestamp: new Date(),
      payload: { taskId, subtasks }
    });

    return subtasks;
  }

  async getSubtasks(taskId: string): Promise<Task[]> {
    return this.taskRepo.findByParentId(taskId);
  }

  private async execute(taskId: string): Promise<void> {
    try {
      const task = await this.get(taskId);
      const subtasks = await this.getSubtasks(taskId);

      if (subtasks.length > 0) {
        // 检查循环依赖
        if (this.dependencyManager.hasCycle(subtasks)) {
          throw new Error('Circular dependency detected in subtasks');
        }

        // 获取执行顺序
        const executionOrder = this.dependencyManager.getExecutionOrder(subtasks);

        for (const level of executionOrder) {
          // 同层任务并行执行
          await Promise.all(level.map(st => this.executeSubtask(st)));
        }
      } else {
        // 无子任务，直接执行
        await this.executeDirectly(task);
      }

      // 汇总结果
      await this.logTaskEvent(taskId, 'milestone', '任务执行完成，汇总结果', {});

      // 标记完成
      await this.complete(taskId);
    } catch (error) {
      await this.fail(taskId, String(error));
    }
  }

  private async executeSubtask(subtask: Task): Promise<void> {
    await this.logTaskEvent(subtask.id, 'action', `开始执行子任务: ${subtask.title}`, {
      role: subtask.role
    });

    const agent = await this.agentService.createAgent(subtask.id, subtask.role);
    try {
      await this.agentService.execute(agent.id, subtask);
    } catch (err) {
      await this.fail(subtask.id, String(err));
      throw err;
    }

    await this.complete(subtask.id);
  }

  private async executeDirectly(task: Task): Promise<void> {
    await this.logTaskEvent(task.id, 'action', '开始直接执行任务', {
      role: task.role
    });

    // 为任务创建Agent并执行
    const agent = await this.agentService.createAgent(task.id, task.role);
    await this.agentService.execute(agent.id, task);
  }

  private async logTaskEvent(taskId: string, type: LogEntry['type'], content: string, metadata: any): Promise<void> {
    await this.logger.log({
      timestamp: new Date(),
      level: type === 'error' ? 'error' : 'info',
      taskId,
      type,
      content,
      metadata
    });
  }
}
