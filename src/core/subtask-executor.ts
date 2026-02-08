import { EventEmitter } from 'eventemitter3';
import type { Task, ExecutionContext, ToolResult, TaskMessage, RoleType } from '../types/index.js';
import { LLMService, LLMServiceFactory } from '../services/llm.service.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { SubAgent } from './sub-agent.js';
import { llmQueue, LLMQueue } from '../services/llm-queue.js';
import { v4 as uuidv4 } from 'uuid';

export interface SubTaskDefinition {
  id?: string;
  type: string;
  title: string;
  description?: string;
  assignedRole: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  dependencies?: string[];
  input?: Record<string, any>;
}

export interface SubTaskResult {
  taskId: string;
  title: string;
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
  toolCount: number;
  files?: any[];
  messages?: TaskMessage[];
}

export interface ParallelExecutorConfig {
  maxConcurrent: number;
  queue: LLMQueue;
  timeoutMs: number;
}

function log(level: 'info' | 'warn' | 'error', ...args: any[]): void {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
  const prefix = `[${timestamp}] [SubTaskExecutor]`;
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
  if (level === 'error') {
    console.error(`${prefix} ${msg}`);
  } else if (level === 'warn') {
    console.warn(`${prefix} ${msg}`);
  } else {
    console.log(`${prefix} ${msg}`);
  }
}

export class SubTaskExecutor extends EventEmitter {
  private context: ExecutionContext;
  private toolRegistry: ToolRegistry;
  private config: ParallelExecutorConfig;
  private agents: Map<string, SubAgent> = new Map();
  private taskIdToSubTaskId: Map<string, string> = new Map();

  constructor(
    context: ExecutionContext,
    toolRegistry: ToolRegistry,
    config?: Partial<ParallelExecutorConfig>
  ) {
    super();
    this.context = context;
    this.toolRegistry = toolRegistry;
    this.config = {
      maxConcurrent: config?.maxConcurrent ?? 5,
      queue: config?.queue ?? llmQueue,
      timeoutMs: config?.timeoutMs ?? 600000,
    };
    log('info', `初始化执行器，最大并发: ${this.config.maxConcurrent}, 超时: ${this.config.timeoutMs}ms`);
  }

  async execute(
    mainTask: Task,
    subtasks: SubTaskDefinition[]
  ): Promise<SubTaskResult[]> {
    const results: SubTaskResult[] = [];
    const runningPromises: Map<string, Promise<SubTaskResult>> = new Map();

    log('info', `🚀 开始执行子任务: 任务=${mainTask.title}, 子任务数=${subtasks.length}, 最大并发=${this.config.maxConcurrent}`);

    for (const subtask of subtasks) {
      const taskId = subtask.id || uuidv4();

      const task: Task = {
        id: taskId,
        type: subtask.type as Task['type'],
        title: subtask.title,
        description: subtask.description || '',
        status: 'pending',
        priority: subtask.priority || 'medium',
        assignedRole: subtask.assignedRole as RoleType,
        ownerRole: mainTask.assignedRole as RoleType,
        dependencies: subtask.dependencies || [],
        input: {
          ...mainTask.input,
          ...subtask.input,
          parentTaskId: mainTask.id,
          workDir: subtask.input?.workDir || mainTask.input?.workDir,
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          restartCount: 0,
          isRecovered: false,
        },
        progress: {
          completedSteps: [],
          percentage: 0,
        },
        messages: mainTask.messages || [],
        executionRecords: [],
        retryHistory: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const subAgent = this.createSubAgent(task);
      this.agents.set(taskId, subAgent);
      this.taskIdToSubTaskId.set(task.id, taskId);

      const promise = this.executeSubTask(subAgent, subtask);
      runningPromises.set(taskId, promise);
    }

    log('info', `⏳ 等待所有子任务完成...`);

    const allResults = await Promise.all(runningPromises.values());
    results.push(...allResults);

    const successCount = allResults.filter(r => r.success).length;
    const failCount = allResults.length - successCount;

    log('info', `📊 子任务执行完成: 成功=${successCount}/${allResults.length}, 失败=${failCount}`);

    if (failCount > 0) {
      const failedTasks = allResults.filter(r => !r.success).map(r => r.title).join(', ');
      log('warn', `⚠️ 失败的任务: ${failedTasks}`);
    }

    return results;
  }

  async sendMessageToSubTask(
    subtaskId: string,
    message: string
  ): Promise<ToolResult> {
    const taskId = this.taskIdToSubTaskId.get(subtaskId);
    if (!taskId) {
      const errorMsg = `子任务不存在: ${subtaskId}`;
      log('error', errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }

    const agent = this.agents.get(taskId);
    if (!agent) {
      const errorMsg = `Agent不存在: ${subtaskId}`;
      log('error', errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }

    log('info', `发送消息到子任务: ${subtaskId}`);
    return agent.sendMessage(message);
  }

  private createSubAgent(task: Task): SubAgent {
    const roleLLMConfig = this.context.project.llmConfig;
    let llmService: LLMService | undefined;

    try {
      if (task.assignedRole) {
        const service = LLMServiceFactory.createForRole(task.assignedRole);
        if (service) {
          llmService = service;
          log('info', `创建LLM服务: role=${task.assignedRole}, provider=${service.getProvider()}, model=${service.getModel()}`);
        }
      }
    } catch (e) {
      log('error', `创建LLM服务失败: role=${task.assignedRole}, 错误=${e}`);
    }

    if (!llmService && roleLLMConfig) {
      llmService = LLMServiceFactory.create(roleLLMConfig);
    }

    if (!llmService) {
      const errorMsg = `无法为角色创建LLM服务: ${task.assignedRole || 'unknown'}`;
      log('error', errorMsg);
      throw new Error(errorMsg);
    }

    return new SubAgent(task, this.context, llmService, this.toolRegistry, {
      maxIterations: 10,
      maxToolCallsPerIteration: 5,
      queue: this.config.queue,
    });
  }

  private async executeSubTask(
    agent: SubAgent,
    subtask: SubTaskDefinition
  ): Promise<SubTaskResult> {
    const startTime = Date.now();

    log('info', `▶️ 开始执行子任务: title=${subtask.title}, role=${subtask.assignedRole}, id=${subtask.id}`);

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`任务超时（${this.config.timeoutMs}ms）`)), this.config.timeoutMs);
      });

      const resultPromise = agent.start();
      const result = await Promise.race([resultPromise, timeoutPromise]);

      const duration = Date.now() - startTime;
      const stats = agent.getStats();

      if (result.success) {
        const filesCount = result.data?.files?.length || 0;
        log('info', `✅ 子任务成功: title=${subtask.title}, 耗时=${duration}ms, 工具调用=${stats.toolCalls}, 创建文件=${filesCount}`);
      } else {
        log('error', `❌ 子任务失败: title=${subtask.title}, 错误=${result.error || '未知错误'}`);
      }

      return {
        taskId: subtask.id || '',
        title: subtask.title,
        success: result.success,
        data: result.data,
        error: result.error,
        duration,
        toolCount: stats.toolCalls,
        files: result.data?.files,
        messages: agent.getState().messages,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      log('error', `💥 子任务异常: title=${subtask.title}, 错误=${errorMsg}, 耗时=${duration}ms`);

      return {
        taskId: subtask.id || '',
        title: subtask.title,
        success: false,
        error: errorMsg,
        duration,
        toolCount: 0,
      };
    }
  }

  getAgentStates(): Map<string, any> {
    const states = new Map();

    for (const [taskId, agent] of this.agents) {
      states.set(taskId, agent.getState());
    }

    return states;
  }

  getStats(): {
    totalSubtasks: number;
    running: number;
    completed: number;
    failed: number;
    queueStats: any;
  } {
    let running = 0, completed = 0, failed = 0;

    for (const agent of this.agents.values()) {
      const state = agent.getState();
      switch (state.status) {
        case 'running':
          running++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
      }
    }

    return {
      totalSubtasks: this.agents.size,
      running,
      completed,
      failed,
      queueStats: this.config.queue.getStats(),
    };
  }

  async shutdown(): Promise<void> {
    log('info', `关闭执行器，清理 ${this.agents.size} 个子任务`);
    for (const [taskId, agent] of this.agents) {
      log('info', `关闭子任务: ${taskId}`);
    }
    this.agents.clear();
    this.taskIdToSubTaskId.clear();
  }
}
