import { EventEmitter } from 'events';
import { AgentLoop, Task, ExecutionContext, LoopResult } from './agent-loop.js';
import { AgentCommunicator } from './agent-communicator.js';
import type { LLMService } from '../services/llm/types.js';
import { ToolExecutor } from '../tools/tool-executor.js';

export interface SubAgentConfig {
  id: string;
  role: string;
  llmService: LLMService;
  toolExecutor: ToolExecutor;
  communicator: AgentCommunicator;
  systemPrompt?: string;
}

export type SubAgentStatus = 'idle' | 'working' | 'completed' | 'failed';

export interface SubAgentProgress {
  agentId: string;
  status: SubAgentStatus;
  currentTask?: string;
  progress: number; // 0-100
  message?: string;
  timestamp: Date;
}

export class SubAgent extends EventEmitter {
  private id: string;
  private role: string;
  private status: SubAgentStatus = 'idle';
  private agentLoop: AgentLoop;
  private communicator: AgentCommunicator;
  private currentTask: Task | null = null;
  private progress: number = 0;

  constructor(config: SubAgentConfig) {
    super();

    this.id = config.id;
    this.role = config.role;
    this.communicator = config.communicator;

    // 创建 AgentLoop
    this.agentLoop = new AgentLoop(
      config.llmService,
      config.toolExecutor,
      {
        systemPrompt: config.systemPrompt,
      }
    );

    // 监听 AgentLoop 事件
    this.setupLoopListeners();

    // 监听通信消息
    this.setupCommunicationListeners();
  }

  /**
   * 执行任务
   */
  async executeTask(
    task: Task,
    context: ExecutionContext
  ): Promise<LoopResult> {
    this.currentTask = task;
    this.status = 'working';
    this.progress = 0;

    this.reportProgress({
      status: this.status,
      currentTask: task.title,
      progress: this.progress,
      message: 'Task started',
    });

    try {
      const result = await this.agentLoop.execute(task, context);

      if (result.success) {
        this.status = 'completed';
        this.progress = 100;

        this.reportProgress({
          status: this.status,
          currentTask: task.title,
          progress: this.progress,
          message: 'Task completed successfully',
        });
      } else {
        this.status = 'failed';

        this.reportProgress({
          status: this.status,
          currentTask: task.title,
          progress: this.progress,
          message: `Task failed: ${result.error}`,
        });
      }

      return result;
    } catch (error: any) {
      this.status = 'failed';

      this.reportProgress({
        status: this.status,
        currentTask: task.title,
        progress: this.progress,
        message: `Task error: ${error.message}`,
      });

      return {
        success: false,
        error: error.message,
        iterations: 0,
        tokensUsed: 0,
        toolCalls: 0,
      };
    } finally {
      this.currentTask = null;
    }
  }

  /**
   * 上报进度
   */
  private reportProgress(update: Partial<SubAgentProgress>): void {
    const progressReport: SubAgentProgress = {
      agentId: this.id,
      status: update.status || this.status,
      currentTask: update.currentTask,
      progress: update.progress ?? this.progress,
      message: update.message,
      timestamp: new Date(),
    };

    // 触发本地事件
    this.emit('progress', progressReport);

    // 广播给其他 Agent
    this.communicator.broadcast({
      type: 'progress-update',
      agent: this.id,
      progress: progressReport,
    });
  }

  /**
   * 设置 AgentLoop 监听器
   */
  private setupLoopListeners(): void {
    this.agentLoop.on('loop:iteration', (event) => {
      // 根据迭代次数更新进度
      const maxIterations = event.maxIterations || 10;
      this.progress = Math.min(
        90,
        (event.iteration / maxIterations) * 100
      );

      this.reportProgress({
        progress: this.progress,
        message: `Iteration ${event.iteration}/${maxIterations}`,
      });
    });

    this.agentLoop.on('tools:executing', (event) => {
      this.reportProgress({
        message: `Executing ${event.toolCount} tool(s)`,
      });
    });

    this.agentLoop.on('context:compressing', () => {
      this.reportProgress({
        message: 'Compressing context...',
      });
    });

    this.agentLoop.on('budget:warning', (event) => {
      this.emit('budget:warning', {
        agentId: this.id,
        ...event,
      });
    });

    this.agentLoop.on('budget:critical', (event) => {
      this.emit('budget:critical', {
        agentId: this.id,
        ...event,
      });
    });
  }

  /**
   * 设置通信监听器
   */
  private setupCommunicationListeners(): void {
    // 处理请求
    this.communicator.onMessageType('request', async (message) => {
      const { action } = message.payload;

      let response: any;

      try {
        switch (action) {
          case 'get-status':
            response = this.getStatus();
            break;

          case 'get-progress':
            response = this.getProgress();
            break;

          case 'pause':
            // TODO: 实现暂停功能
            response = { success: false, error: 'Not implemented' };
            break;

          case 'resume':
            // TODO: 实现恢复功能
            response = { success: false, error: 'Not implemented' };
            break;

          default:
            response = { success: false, error: 'Unknown action' };
        }
      } catch (error: any) {
        response = { success: false, error: error.message };
      }

      this.communicator.respond(message.requestId!, message.from, response);
    });
  }

  /**
   * 获取状态
   */
  getStatus(): {
    id: string;
    role: string;
    status: SubAgentStatus;
    currentTask: string | null;
  } {
    return {
      id: this.id,
      role: this.role,
      status: this.status,
      currentTask: this.currentTask?.title || null,
    };
  }

  /**
   * 获取进度
   */
  getProgress(): SubAgentProgress {
    return {
      agentId: this.id,
      status: this.status,
      currentTask: this.currentTask?.title,
      progress: this.progress,
      timestamp: new Date(),
    };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      id: this.id,
      role: this.role,
      status: this.status,
      ...this.agentLoop.getStats(),
    };
  }

  /**
   * 重置 Agent
   */
  reset(): void {
    this.status = 'idle';
    this.currentTask = null;
    this.progress = 0;
    this.agentLoop.reset();
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.communicator.destroy();
    this.removeAllListeners();
  }
}
