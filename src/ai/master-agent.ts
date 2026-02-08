import { EventEmitter } from 'events';
import EventEmitter3 from 'eventemitter3';
import { SubAgent, SubAgentConfig, SubAgentProgress } from './sub-agent.js';
import { AgentCommunicator } from './agent-communicator.js';
import { ConcurrencyController } from '../core/concurrency.js';
import { AgentLoop, Task, ExecutionContext, LoopResult } from './agent-loop.js';
import type { LLMService } from '../services/llm/types.js';
import { ToolExecutor } from '../tools/tool-executor.js';

export interface SubTask {
  id: string;
  title: string;
  description: string;
  assignedTo?: string; // sub-agent ID
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: LoopResult;
}

export interface MasterAgentConfig {
  id: string;
  llmService: LLMService;
  toolExecutor: ToolExecutor;
  maxConcurrentSubAgents?: number;
  workspaceDir: string;
}

export class MasterAgent extends EventEmitter {
  private id: string;
  private llmService: LLMService;
  private toolExecutor: ToolExecutor;
  private agentLoop: AgentLoop;
  private eventBus: EventEmitter3;
  private communicator: AgentCommunicator;
  private concurrencyController: ConcurrencyController;
  private subAgents: Map<string, SubAgent> = new Map();
  private subAgentCounter: number = 0;
  private workspaceDir: string;

  constructor(config: MasterAgentConfig) {
    super();

    this.id = config.id;
    this.llmService = config.llmService;
    this.toolExecutor = config.toolExecutor;
    this.workspaceDir = config.workspaceDir;

    // 创建事件总线
    this.eventBus = new EventEmitter3();

    // 创建通信器
    this.communicator = new AgentCommunicator(this.id, this.eventBus);

    // 创建并发控制器
    this.concurrencyController = new ConcurrencyController(
      config.maxConcurrentSubAgents || 3
    );

    // 创建 AgentLoop（用于任务分析）
    this.agentLoop = new AgentLoop(
      this.llmService,
      this.toolExecutor,
      {
        systemPrompt: `You are a master agent responsible for analyzing and breaking down complex tasks into smaller subtasks.

Your responsibilities:
1. Analyze the task requirements
2. Break down the task into smaller, manageable subtasks
3. Determine dependencies between subtasks
4. Assign subtasks to sub-agents

Output format (JSON):
{
  "analysis": "Brief analysis of the task",
  "subtasks": [
    {
      "id": "subtask-1",
      "title": "Subtask title",
      "description": "Detailed description",
      "dependencies": []
    }
  ]
}`,
      }
    );
  }

  /**
   * 执行任务
   */
  async executeTask(task: Task): Promise<{
    success: boolean;
    subtasks: SubTask[];
    results: LoopResult[];
    error?: string;
  }> {
    this.emit('task:started', {
      taskId: task.id,
      title: task.title,
    });

    try {
      // 1. 分析任务并拆分为子任务
      this.emit('task:analyzing', { taskId: task.id });

      const subtasks = await this.analyzeAndSplitTask(task);

      this.emit('task:analyzed', {
        taskId: task.id,
        subtaskCount: subtasks.length,
      });

      // 2. 执行子任务
      const results = await this.executeSubtasks(task, subtasks);

      // 3. 汇总结果
      const allSuccess = results.every((r) => r.success);

      this.emit('task:completed', {
        taskId: task.id,
        success: allSuccess,
        subtaskCount: subtasks.length,
      });

      return {
        success: allSuccess,
        subtasks,
        results,
      };
    } catch (error: any) {
      this.emit('task:error', {
        taskId: task.id,
        error: error.message,
      });

      return {
        success: false,
        subtasks: [],
        results: [],
        error: error.message,
      };
    }
  }

  /**
   * 分析任务并拆分为子任务
   */
  private async analyzeAndSplitTask(task: Task): Promise<SubTask[]> {
    const analysisTask: Task = {
      id: `analysis-${task.id}`,
      title: 'Analyze and split task',
      description: `Analyze the following task and break it down into subtasks:\n\nTask: ${task.title}\n\nDescription: ${task.description}`,
      context: task.context,
    };

    const result = await this.agentLoop.execute(analysisTask, {
      workspaceDir: this.workspaceDir,
      taskId: task.id,
    });

    if (!result.success) {
      throw new Error(`Task analysis failed: ${result.error}`);
    }

    // 解析结果
    try {
      const analysis = JSON.parse(result.result || '{}');

      const subtasks: SubTask[] = analysis.subtasks.map((st: any) => ({
        id: st.id,
        title: st.title,
        description: st.description,
        status: 'pending' as const,
      }));

      return subtasks;
    } catch (error) {
      // 如果解析失败，创建一个单一的子任务
      return [
        {
          id: 'subtask-1',
          title: task.title,
          description: task.description,
          status: 'pending' as const,
        },
      ];
    }
  }

  /**
   * 执行子任务
   */
  private async executeSubtasks(
    parentTask: Task,
    subtasks: SubTask[]
  ): Promise<LoopResult[]> {
    const results: LoopResult[] = [];

    // 创建执行函数
    const executeSubtask = async (subtask: SubTask): Promise<LoopResult> => {
      // 创建子 Agent
      const subAgent = this.createSubAgent();

      this.emit('subtask:started', {
        parentTaskId: parentTask.id,
        subtaskId: subtask.id,
        agentId: subAgent.getStatus().id,
      });

      // 监听进度
      subAgent.on('progress', (progress: SubAgentProgress) => {
        this.emit('subtask:progress', {
          parentTaskId: parentTask.id,
          subtaskId: subtask.id,
          progress,
        });
      });

      // 执行任务
      const task: Task = {
        id: subtask.id,
        title: subtask.title,
        description: subtask.description,
      };

      const context: ExecutionContext = {
        workspaceDir: this.workspaceDir,
        taskId: subtask.id,
        parentTaskId: parentTask.id,
      };

      const result = await subAgent.executeTask(task, context);

      subtask.status = result.success ? 'completed' : 'failed';
      subtask.result = result;

      this.emit('subtask:completed', {
        parentTaskId: parentTask.id,
        subtaskId: subtask.id,
        success: result.success,
      });

      // 清理子 Agent
      this.destroySubAgent(subAgent.getStatus().id);

      return result;
    };

    // 使用并发控制器执行
    const tasks = subtasks.map((subtask) => () => executeSubtask(subtask));

    results.push(...(await this.concurrencyController.runAll(tasks)));

    return results;
  }

  /**
   * 创建子 Agent
   */
  private createSubAgent(): SubAgent {
    const id = `${this.id}-sub-${++this.subAgentCounter}`;

    const communicator = new AgentCommunicator(id, this.eventBus);

    const subAgent = new SubAgent({
      id,
      role: 'worker',
      llmService: this.llmService,
      toolExecutor: this.toolExecutor,
      communicator,
    });

    this.subAgents.set(id, subAgent);

    this.emit('subagent:created', { id, count: this.subAgents.size });

    return subAgent;
  }

  /**
   * 销毁子 Agent
   */
  private destroySubAgent(id: string): void {
    const subAgent = this.subAgents.get(id);

    if (subAgent) {
      subAgent.destroy();
      this.subAgents.delete(id);

      this.emit('subagent:destroyed', { id, count: this.subAgents.size });
    }
  }

  /**
   * 获取所有子 Agent 状态
   */
  getSubAgentsStatus(): Array<{
    id: string;
    role: string;
    status: string;
    currentTask: string | null;
  }> {
    return Array.from(this.subAgents.values()).map((agent) => agent.getStatus());
  }

  /**
   * 获取并发状态
   */
  getConcurrencyStatus() {
    return this.concurrencyController.getStatus();
  }

  /**
   * 调整并发限制
   */
  setMaxConcurrent(max: number): void {
    this.concurrencyController.setMaxConcurrent(max);
  }

  /**
   * 清理所有子 Agent
   */
  cleanup(): void {
    for (const [id] of this.subAgents) {
      this.destroySubAgent(id);
    }

    this.communicator.destroy();
  }
}
