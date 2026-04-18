import {
  Task,
  CreateTaskParams,
  ITaskRepository,
  TaskStateMachine,
  InvalidStateTransitionError,
} from '../../domain/task/index.js';
import { IEventBus } from '../../infrastructure/event-bus/index.js';
import { ILogger, LogEntry } from '../../infrastructure/logger/index.js';
import { generateId } from '../../infrastructure/utils/id.js';
import { MasterAgentService } from '../master-agent/master-agent.service.js';
import { ensureTaskWorkspaceLayout } from '../bootstrap/ensure-workspace-layout.js';

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

  constructor(
    private taskRepo: ITaskRepository,
    private eventBus: IEventBus,
    private logger: ILogger,
    private masterAgentService: MasterAgentService
  ) {}

  async create(params: CreateTaskParams): Promise<Task> {
    const title = (params.title && String(params.title).trim()) || '新对话';
    const description = params.description != null ? String(params.description) : '';
    // 系统已统一为主控编排：忽略/覆盖任何非 v10 的入参，避免再次进入传统一键执行路径
    const orchestrationMode: Task['orchestrationMode'] = 'v10-master';
    const task: Task = {
      id: generateId(),
      title,
      description,
      status: 'pending',
      role: params.role || 'task-master',
      taskKind: params.taskKind ?? 'epic',
      depth: params.depth ?? 0,
      parentId: params.parentId,
      supervisorAgentId: params.supervisorAgentId,
      decompositionStatus: params.decompositionStatus ?? 'not_decomposed',
      dependencies: params.dependencies || [],
      createdAt: new Date(),
      artifactIds: [],
      logIds: [],
      subtaskIds: [],
      orchestrationMode,
    };

    await this.taskRepo.save(task);
    await ensureTaskWorkspaceLayout(task.id).catch(() => {});

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

    if (task.orchestrationMode !== 'v10-master') {
      const previousMode = task.orchestrationMode;
      task.orchestrationMode = 'v10-master';
      await this.taskRepo.save(task);
      await this.logTaskEvent(task.id, 'milestone', '任务已升级为 v10 主控编排（传统模式已停用）', {
        previousMode,
      });
    }

    await this.masterAgentService.ensureSessionStarted(taskId);
    await ensureTaskWorkspaceLayout(taskId).catch(() => {});
    await this.logTaskEvent(task.id, 'milestone', 'v10 主控会话已启动（intake），等待用户通过 WS/REST 发消息', {});
    return;
  }

  async pause(taskId: string): Promise<void> {
    const task = await this.get(taskId);
    this.stateMachine.validateTransition(task.status, 'paused');

    task.status = 'paused';
    await this.taskRepo.save(task);

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

  async complete(
    taskId: string,
    opts?: { masterClosingNote?: string }
  ): Promise<void> {
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

    const masterClosingNote =
      opts?.masterClosingNote != null ? String(opts.masterClosingNote).slice(0, 8000) : '';
    await this.eventBus.publish({
      type: 'experience.task_closure_requested',
      timestamp: new Date(),
      payload: { taskId, masterClosingNote },
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

  async getSubtasks(taskId: string): Promise<Task[]> {
    return this.taskRepo.findByParentId(taskId);
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
