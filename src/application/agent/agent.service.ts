import { Agent, Role, AgentContext, IAgentRepository, RoleMatcher } from '../../domain/agent/index.js';
import { Task, ITaskRepository } from '../../domain/task/index.js';
import { IEventBus } from '../../infrastructure/event-bus/index.js';
import { ILogger } from '../../infrastructure/logger/index.js';
import { ToolRegistry } from '../../domain/tool/index.js';
import { generateId } from '../../infrastructure/utils/id.js';
import { AgentExecutionEngine } from './execution-engine.js';

export class AgentService {
  private roleMatcher: RoleMatcher;

  constructor(
    private agentRepo: IAgentRepository,
    private taskRepo: ITaskRepository,
    private eventBus: IEventBus,
    private logger: ILogger,
    private executionEngine: AgentExecutionEngine,
    /** 与 AgentExecutionEngine 共用，含内置工具 + 插件工具 */
    private toolRegistry: ToolRegistry
  ) {
    this.roleMatcher = new RoleMatcher();
  }

  async createAgent(taskId: string, roleId: string): Promise<Agent> {
    const role = this.roleMatcher.getRole(roleId);

    const agent: Agent = {
      id: generateId(),
      taskId,
      roleId,
      status: 'idle',
      context: {
        systemPrompt: role.systemPrompt,
        history: [],
        variables: {}
      },
      createdAt: new Date()
    };

    await this.agentRepo.save(agent);

    await this.eventBus.publish({
      type: 'agent.created',
      timestamp: new Date(),
      payload: { agent, role }
    });

    return agent;
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    return this.agentRepo.findById(agentId);
  }

  async getAgentsByTask(taskId: string): Promise<Agent[]> {
    return this.agentRepo.findByTaskId(taskId);
  }

  async execute(
    agentId: string,
    task?: Task,
    engineOptions?: { signal?: AbortSignal }
  ): Promise<void> {
    const agent = await this.getAgent(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    // 如果没有传入task，尝试从repository获取
    if (!task) {
      const taskData = await this.taskRepo.findById(agent.taskId);
      if (!taskData) throw new Error(`Task not found: ${agent.taskId}`);
      task = taskData;
    }

    agent.status = 'running';
    agent.startedAt = new Date();
    await this.agentRepo.save(agent);

    await this.logger.log({
      timestamp: new Date(),
      level: 'info',
      taskId: agent.taskId,
      agentId: agent.id,
      type: 'status_change',
      content: `Agent ${agent.roleId} 开始执行`
    });

    try {
      await this.runAgentLoop(agent, task, engineOptions);

      agent.status = 'completed';
      agent.completedAt = new Date();
      await this.agentRepo.save(agent);

      await this.eventBus.publish({
        type: 'agent.completed',
        timestamp: new Date(),
        payload: { agentId }
      });
    } catch (error) {
      agent.status = 'failed';
      agent.error = String(error);
      agent.completedAt = new Date();
      await this.agentRepo.save(agent);

      await this.eventBus.publish({
        type: 'agent.failed',
        timestamp: new Date(),
        payload: { agentId, error: String(error) }
      });

      throw error;
    }
  }

  private async runAgentLoop(
    agent: Agent,
    task: Task,
    engineOptions?: { signal?: AbortSignal }
  ): Promise<void> {
    await this.executionEngine.execute(agent, task, engineOptions);
  }

  matchRole(description: string): string {
    return this.roleMatcher.match(description);
  }

  getRole(roleId: string): Role {
    return this.roleMatcher.getRole(roleId);
  }

  getAllRoles(): Role[] {
    return this.roleMatcher.getAllRoles();
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }
}
