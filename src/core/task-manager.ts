import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'eventemitter3';
import type {
  Task,
  TaskStatus,
  TaskType,
  Priority,
  ToolResult,
  AgentEvent,
  AgentEventData,
  ExecutionContext,
  TaskMessage,
  TaskExecutionRecord,
} from '../types/index.js';
import { RoleFactory } from '../roles/index.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { LLMServiceFactory } from '../services/llm.service.js';
import { getLLMConfigManager } from '../services/llm-config.js';
import type { ProjectConfig } from '../types/index.js';
import { BaseRole } from '../roles/base.js';
import type { LLMService } from '../services/llm.service.js';
import {
  getUserFriendlyError,
  ErrorWithCode,
  ErrorCode,
} from '../types/errors.js';
import { ErrorDisplay } from '../utils/error-display.js';

/**
 * 任务管理器
 * 负责任务的创建、调度、执行和监控
 */
export class TaskManager extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private projectConfig: ProjectConfig;
  private toolRegistry: ToolRegistry;
  private llmService?: LLMService; // 改为可选
  private executingTasks: Set<string> = new Set();
  private errorDisplay: ErrorDisplay;

  constructor(projectConfig: ProjectConfig, toolRegistry: ToolRegistry) {
    super();
    this.projectConfig = projectConfig;
    this.toolRegistry = toolRegistry;
    // llmConfig 现在是可选的，如果提供则创建服务
    if (projectConfig.llmConfig) {
      this.llmService = LLMServiceFactory.create(projectConfig.llmConfig);
    }
    // 初始化错误展示器
    this.errorDisplay = new ErrorDisplay({
      showDetails: true,
      showSuggestions: true,
      colorOutput: process.stdout.isTTY,
    });
  }

  /**
   * 创建任务
   */
  createTask(params: {
    type?: TaskType;
    title: string;
    description: string;
    priority?: Priority;
    dependencies?: string[];
    assignedRole?: Task['assignedRole'];
    ownerRole?: Task['ownerRole'];
    input?: any;
    constraints?: Task['constraints'];
    subtasks?: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'status'>[];
    initialMessage?: string; // 初始用户消息
  }): Task {
    const task: Task = {
      id: uuidv4(),
      type: params.type || 'custom',
      title: params.title,
      description: params.description,
      status: 'pending',
      priority: params.priority || 'medium',
      dependencies: params.dependencies || [],
      assignedRole: params.assignedRole,
      ownerRole: params.ownerRole,
      input: params.input,
      constraints: params.constraints,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      subtasks: params.subtasks?.map((s: any) => ({
        ...s,
        id: uuidv4(),
        status: s.status || 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      })) || [],
      messages: params.initialMessage ? [{
        role: 'user',
        content: params.initialMessage,
        timestamp: new Date(),
      }] : [],
      executionRecords: [],
    };

    this.tasks.set(task.id, task);

    this.emit('task:created', {
      event: 'task:created',
      timestamp: new Date(),
      data: { task },
    } as AgentEventData);

    return task;
  }

  /**
   * 添加消息到任务
   */
  addMessage(taskId: string, message: TaskMessage): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (!task.messages) {
      task.messages = [];
    }

    task.messages.push(message);
    task.updatedAt = new Date();

    this.emit('task:message:added', {
      event: 'task:message:added',
      timestamp: new Date(),
      data: { taskId, message },
    } as AgentEventData);
  }

  /**
   * 添加执行记录
   */
  addExecutionRecord(taskId: string, record: Omit<TaskExecutionRecord, 'id'>): TaskExecutionRecord {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (!task.executionRecords) {
      task.executionRecords = [];
    }

    const fullRecord: TaskExecutionRecord = {
      id: uuidv4(),
      ...record,
    };

    task.executionRecords.push(fullRecord);
    task.updatedAt = new Date();

    this.emit('task:execution:recorded', {
      event: 'task:execution:recorded',
      timestamp: new Date(),
      data: { taskId, record: fullRecord },
    } as AgentEventData);

    return fullRecord;
  }

  /**
   * 获取任务
   */
  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 按状态获取任务
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    return Array.from(this.tasks.values()).filter(t => t.status === status);
  }

  /**
   * 按类型获取任务
   */
  getTasksByType(type: TaskType): Task[] {
    return Array.from(this.tasks.values()).filter(t => t.type === type);
  }

  /**
   * 更新任务状态
   */
  updateTaskStatus(id: string, status: TaskStatus): void {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    task.status = status;
    task.updatedAt = new Date();

    if (status === 'in-progress' && !task.startedAt) {
      task.startedAt = new Date();
    }

    if (status === 'completed' || status === 'failed') {
      task.completedAt = new Date();
      this.executingTasks.delete(id);
    }

    this.emit(`task:${status}`, {
      event: `task:${status}`,
      timestamp: new Date(),
      data: { task },
    } as AgentEventData);
  }

  /**
   * 设置任务结果
   */
  setTaskResult(id: string, result: ToolResult): void {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    task.result = result;
    task.updatedAt = new Date();
  }

  /**
   * 执行任务
   */
  async executeTask(taskId: string): Promise<ToolResult> {
    const task = this.tasks.get(taskId);
    console.log('[TaskManager.executeTask] 获取任务:', {
      id: task?.id,
      title: task?.title,
      assignedRole: task?.assignedRole
    });
    
    if (!task) {
      console.error('[TaskManager.executeTask] 任务不存在:', taskId);
      throw new Error(`Task not found: ${taskId}`);
    }

    // 检查任务是否已经在执行
    if (this.executingTasks.has(taskId)) {
      throw new Error(`Task is already executing: ${taskId}`);
    }

    // 检查依赖是否完成
    if (task.dependencies && task.dependencies.length > 0) {
      for (const depId of task.dependencies) {
        const depTask = this.tasks.get(depId);
        if (!depTask || depTask.status !== 'completed') {
          this.updateTaskStatus(taskId, 'blocked');
          return {
            success: false,
            error: `Task dependencies not satisfied: ${depId}`,
          };
        }
      }
    }

    // 更新任务状态为执行中
    this.updateTaskStatus(taskId, 'in-progress');
    this.executingTasks.add(taskId);

    try {
      // 构建执行上下文
      const context = await this.buildContext(task);

      // 获取角色
      const role = this.getRoleForTask(task);
      if (!role) {
        throw new ErrorWithCode(
          ErrorCode.TASK_ROLE_NOT_ASSIGNED,
          `任务未分配角色: ${taskId}`,
          { details: `任务标题: ${task.title}` }
        );
      }

      // 记录执行开始
      const executionStartTime = new Date();
      const roleType = task.assignedRole || 'developer';
      
      // 获取使用的模型信息
      const manager = getLLMConfigManager();
      const roleLLMConfig = manager.getRoleLLMConfig(roleType);
      const modelInfo = roleLLMConfig ? {
        model: roleLLMConfig.model,
        provider: roleLLMConfig.provider,
      } : undefined;

      // 执行任务
      const result = await role.execute(task, context);

      // 记录执行结束
      const executionEndTime = new Date();
      const duration = executionEndTime.getTime() - executionStartTime.getTime();

      // 从result.metadata中提取tokens信息
      const tokensUsed = result.metadata?.tokensUsed || result.metadata?.usage;

      // 添加执行记录
      this.addExecutionRecord(taskId, {
        role: roleType,
        action: `执行任务: ${task.title}`,
        startTime: executionStartTime,
        endTime: executionEndTime,
        duration,
        result,
        tokensUsed: tokensUsed ? {
          promptTokens: tokensUsed.promptTokens || tokensUsed.inputTokens || 0,
          completionTokens: tokensUsed.completionTokens || tokensUsed.outputTokens || 0,
          totalTokens: tokensUsed.totalTokens || (tokensUsed.promptTokens || 0) + (tokensUsed.completionTokens || 0),
        } : undefined,
        model: modelInfo?.model || result.metadata?.model,
        provider: modelInfo?.provider || result.metadata?.provider,
      });

      // 设置结果
      this.setTaskResult(taskId, result);

      // 更新状态
      this.updateTaskStatus(taskId, result.success ? 'completed' : 'failed');

      // 执行子任务
      if (result.success && task.subtasks && task.subtasks.length > 0) {
        const subtaskResults = [];
        for (const subtask of task.subtasks) {
          // 添加子任务到任务列表
          this.tasks.set(subtask.id, subtask);
          // 执行子任务
          const subResult = await this.executeTask(subtask.id);
          subtaskResults.push(subResult);
        }

        // 如果有子任务失败，主任务也标记为失败
        if (subtaskResults.some(r => !r.success)) {
          this.updateTaskStatus(taskId, 'failed');
        }
      }

      // 清理结果，确保没有 undefined
      const cleanResult: any = {
        success: result.success,
        data: result.data,
        metadata: result.metadata,
      };
      
      // 只有在有错误时才添加 error 字段
      if (result.error) {
        cleanResult.error = result.error;
      }

      return cleanResult as ToolResult;
    } catch (error) {
      // 详细的错误日志
      console.error('='.repeat(60));
      console.error('❌ 任务执行异常');
      console.error('='.repeat(60));
      console.error(`任务ID: ${taskId}`);
      console.error(`任务标题: ${task.title}`);
      console.error(`分配角色: ${task.assignedRole}`);
      if (error instanceof Error) {
        console.error(`错误类型: ${error.constructor.name}`);
        console.error(`错误消息: ${error.message}`);
        console.error(`错误堆栈: ${error.stack}`);
      } else {
        console.error(`错误内容: ${error}`);
      }
      console.error('='.repeat(60));

      // 转换为用户友好错误
      const userError = getUserFriendlyError(error as Error, {
        taskId,
        taskTitle: task.title,
      });

      // 输出友好错误
      this.errorDisplay.display(userError);

      // 记录错误结果
      const errorResult: ToolResult = {
        success: false,
        error: userError.message,
        metadata: {
          errorCode: userError.code,
          errorCategory: userError.category,
          userSuggestions: userError.suggestions,
        },
      };

      this.setTaskResult(taskId, errorResult);
      this.updateTaskStatus(taskId, 'failed');

      this.emit('error', {
        event: 'error',
        timestamp: new Date(),
        data: { taskId, error: errorResult.error, errorCode: userError.code },
      } as AgentEventData);

      return errorResult;
    }
  }

  /**
   * 批量执行任务
   */
  async executeTasks(taskIds: string[], parallel = true): Promise<ToolResult[]> {
    if (parallel) {
      // 并行执行
      const promises = taskIds.map(id => this.executeTask(id));
      return Promise.all(promises);
    } else {
      // 串行执行
      const results: ToolResult[] = [];
      for (const id of taskIds) {
        const result = await this.executeTask(id);
        results.push(result);

        // 如果任务失败，停止后续任务
        if (!result.success) {
          break;
        }
      }
      return results;
    }
  }

  /**
   * 构建执行上下文
   */
  private async buildContext(task: Task): Promise<ExecutionContext> {
    // 获取历史任务结果
    const history: ToolResult[] = [];
    if (task.dependencies) {
      for (const depId of task.dependencies) {
        const depTask = this.tasks.get(depId);
        if (depTask && depTask.result) {
          history.push(depTask.result);
        }
      }
    }

    // 获取可用的工具
    const tools = new Map<string, any>();
    for (const toolName of this.toolRegistry.getAllNames()) {
      const toolDef = this.toolRegistry.getDefinition(toolName);
      if (toolDef) {
        tools.set(toolName, toolDef);
      }
    }

    return {
      project: this.projectConfig,
      currentTask: task,
      history,
      variables: new Map(),
      tools,
    };
  }

  /**
   * 获取任务对应的角色
   * 支持为不同角色使用不同的 LLM 服务商
   */
  private getRoleForTask(task: Task): BaseRole | null {
    if (!task.assignedRole) {
      return null;
    }

    // 尝试使用配置管理器为角色创建专属 LLM 服务
    let llmService: LLMService | undefined = this.llmService;

    try {
      const roleLLMService = LLMServiceFactory.createForRole(task.assignedRole);
      if (roleLLMService) {
        llmService = roleLLMService;
      }
    } catch (error) {
      // 如果配置管理器失败，使用默认的 LLM 服务
      console.warn(`Failed to create LLM service for role ${task.assignedRole}, using default`);
    }

    // 如果仍然没有 LLM 服务，返回 null
    if (!llmService) {
      console.error(`No LLM service available for role ${task.assignedRole}`);
      return null;
    }

    return RoleFactory.createRole(task.assignedRole, llmService);
  }

  /**
   * 删除任务
   */
  deleteTask(id: string): void {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    if (this.executingTasks.has(id)) {
      throw new Error(`Cannot delete executing task: ${id}`);
    }

    this.tasks.delete(id);

    this.emit('task:deleted', {
      event: 'task:deleted',
      timestamp: new Date(),
      data: { taskId: id },
    } as AgentEventData);
  }

  /**
   * 清空所有任务
   */
  clear(): void {
    if (this.executingTasks.size > 0) {
      throw new Error('Cannot clear tasks while some are executing');
    }

    this.tasks.clear();
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    byStatus: Record<TaskStatus, number>;
    byType: Record<string, number>;
    executing: number;
  } {
    const byStatus: Record<TaskStatus, number> = {
      pending: 0,
      'in-progress': 0,
      completed: 0,
      failed: 0,
      blocked: 0,
    };

    const byType: Record<string, number> = {};

    for (const task of this.tasks.values()) {
      byStatus[task.status]++;
      byType[task.type] = (byType[task.type] || 0) + 1;
    }

    return {
      total: this.tasks.size,
      byStatus,
      byType,
      executing: this.executingTasks.size,
    };
  }

  /**
   * 等待任务完成
   */
  async waitForTask(id: string, timeout = 60000): Promise<Task> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const task = this.tasks.get(id);

        if (!task) {
          clearInterval(checkInterval);
          reject(new Error(`Task not found: ${id}`));
          return;
        }

        if (task.status === 'completed' || task.status === 'failed') {
          clearInterval(checkInterval);
          resolve(task);
          return;
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error(`Task timeout after ${timeout}ms`));
        }
      }, 100);
    });
  }
}
