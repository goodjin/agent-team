import type { ToolDefinition } from '../../infrastructure/llm/types.js';
import type { Task } from '../../domain/task/task.entity.js';
import type { Agent, Role } from '../../domain/agent/agent.entity.js';
import type { IAgentRepository } from '../../domain/agent/agent.repository.js';
import type { IRoleRepository } from '../../domain/role/role.repository.js';
import { RoleMatcher } from '../../domain/agent/role-matcher.js';
import type { IEventBus } from '../../infrastructure/event-bus/index.js';
import { WebSocketManager } from '../../infrastructure/websocket/index.js';
import { generateId } from '../../infrastructure/utils/id.js';
import type { OrchestratorService } from '../orchestration/orchestrator.service.js';
import type { MemoryToolHandlers } from '../memory/memory-tool-handlers.js';
import type { ILogger } from '../../infrastructure/logger/index.js';
import { splitThinkingAndVisible } from '../../infrastructure/utils/chat-sanitize.js';

export interface MasterToolContext {
  taskId: string;
  masterAgentId: string;
}

export const MASTER_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'reply_user',
    description: '向用户发送本轮可见回复（写入主会话并推送 WS）',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '对用户展示的中文回复' },
      },
      required: ['content'],
    },
  },
  {
    name: 'create_role',
    description: '持久化自定义角色（供 create_worker 引用）',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        systemPrompt: { type: 'string' },
        allowedTools: { type: 'array', items: { type: 'string' } },
        maxTokensPerTask: { type: 'number' },
        temperature: { type: 'number' },
        timeout: { type: 'number' },
      },
      required: ['id', 'name', 'systemPrompt'],
    },
  },
  {
    name: 'create_worker',
    description: '在本任务下创建具名工人 Agent',
    parameters: {
      type: 'object',
      properties: {
        roleId: { type: 'string' },
        displayName: { type: 'string' },
        initialBrief: { type: 'string' },
      },
      required: ['roleId', 'displayName'],
    },
  },
  {
    name: 'submit_plan',
    description: '提交 DAG 计划：{ version, nodes: [{ id, workerId, dependsOn?, parallelGroup?, brief? }] }',
    parameters: {
      type: 'object',
      properties: {
        plan: { type: 'object' },
        expectedPlanVersion: { type: 'number' },
      },
      required: ['plan'],
    },
  },
  {
    name: 'send_worker_command',
    description: '向工人发送指令（须匹配当前 task.planVersion）',
    parameters: {
      type: 'object',
      properties: {
        targetWorkerId: { type: 'string' },
        command: { type: 'string' },
        body: { type: 'object' },
        correlationId: { type: 'string' },
        planVersion: { type: 'number' },
      },
      required: ['targetWorkerId', 'command', 'body', 'correlationId', 'planVersion'],
    },
  },
  {
    name: 'query_orchestration_state',
    description: '查询 planVersion、DAG 节点与信箱深度',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'memory_search',
    description: '命名空间检索记忆（默认同主控；可查 targetAgentId 工人）',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        topK: { type: 'number' },
        targetAgentId: { type: 'string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_append',
    description: '追加记忆；track=userFacing|internal',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        title: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        track: { type: 'string' },
      },
      required: ['content'],
    },
  },
  {
    name: 'memory_summarize',
    description: '双轨摘要；scope=namespace 时仅根据已存记忆',
    parameters: {
      type: 'object',
      properties: {
        scope: { type: 'string' },
        targetAgentId: { type: 'string' },
        writeToVariables: { type: 'boolean' },
        appendMemory: { type: 'boolean' },
      },
    },
  },
];

export class MasterToolExecutor {
  private roleMatcher = new RoleMatcher();

  constructor(
    private agentRepo: IAgentRepository,
    private roleRepo: IRoleRepository,
    private orchestrator: OrchestratorService,
    private eventBus: IEventBus,
    private wsManager: WebSocketManager,
    private memoryHandlers: MemoryToolHandlers,
    private logger: ILogger
  ) {}

  async runTool(
    name: string,
    args: Record<string, unknown>,
    ctx: MasterToolContext,
    agent: Agent,
    task: Task
  ): Promise<unknown> {
    switch (name) {
      case 'reply_user':
        return this.replyUser(agent, task, String(args.content ?? ''));
      case 'create_role':
        return this.createRole(args);
      case 'create_worker':
        return this.createWorker(args, ctx, task);
      case 'submit_plan':
        return this.submitPlan(args, ctx);
      case 'send_worker_command':
        return this.sendWorkerCommand(args, ctx);
      case 'query_orchestration_state':
        return this.queryState(ctx.taskId);
      case 'memory_search':
        return this.memoryHandlers.search(
          { taskId: ctx.taskId, agentId: ctx.masterAgentId },
          {
            query: String(args.query ?? ''),
            topK: typeof args.topK === 'number' ? args.topK : undefined,
            targetAgentId:
              typeof args.targetAgentId === 'string' ? args.targetAgentId : undefined,
          }
        );
      case 'memory_append':
        return this.memoryHandlers.append(
          { taskId: ctx.taskId, agentId: ctx.masterAgentId },
          {
            content: String(args.content ?? ''),
            title: typeof args.title === 'string' ? args.title : undefined,
            tags: Array.isArray(args.tags)
              ? (args.tags as unknown[]).filter((x): x is string => typeof x === 'string')
              : undefined,
            track: typeof args.track === 'string' ? args.track : undefined,
          }
        );
      case 'memory_summarize':
        return this.memoryHandlers.summarize(
          { taskId: ctx.taskId, agentId: ctx.masterAgentId },
          {
            scope: typeof args.scope === 'string' ? args.scope : undefined,
            targetAgentId:
              typeof args.targetAgentId === 'string' ? args.targetAgentId : undefined,
            writeToVariables:
              typeof args.writeToVariables === 'boolean' ? args.writeToVariables : undefined,
            appendMemory:
              typeof args.appendMemory === 'boolean' ? args.appendMemory : undefined,
          }
        );
      default:
        return { error: `unknown tool ${name}` };
    }
  }

  private async replyUser(agent: Agent, task: Task, content: string): Promise<{ ok: true }> {
    const { visible, thinking } = splitThinkingAndVisible(content);
    if (thinking) {
      await this.logger.log({
        timestamp: new Date(),
        level: 'info',
        taskId: task.id,
        agentId: agent.id,
        type: 'thought',
        content: `主控 · 思考过程（对话中已隐藏）\n${thinking}`,
        metadata: { source: 'reply_user' },
      });
    }
    agent.context.history.push({ role: 'assistant', content: visible });
    await this.agentRepo.save(agent);
    await this.eventBus.publish({
      type: 'master.message.appended',
      timestamp: new Date(),
      payload: { taskId: task.id, role: 'assistant', contentLength: visible.length },
    });
    this.wsManager.broadcast(task.id, {
      type: 'master_reply',
      timestamp: new Date().toISOString(),
      data: { content: visible, source: 'reply_user' },
    });
    return { ok: true };
  }

  private async createRole(
    args: Record<string, unknown>
  ): Promise<{ ok: true } | { error: string }> {
    const id = String(args.id ?? '').trim();
    if (!id) return { error: 'id required' };
    const role: Role = {
      id,
      name: String(args.name ?? id),
      description: String(args.description ?? ''),
      systemPrompt: String(args.systemPrompt ?? ''),
      allowedTools: Array.isArray(args.allowedTools)
        ? (args.allowedTools as unknown[]).filter((x): x is string => typeof x === 'string')
        : ['read_file', 'write_file', 'list_files'],
      maxTokensPerTask: typeof args.maxTokensPerTask === 'number' ? args.maxTokensPerTask : 8000,
      temperature: typeof args.temperature === 'number' ? args.temperature : 0.4,
      timeout: typeof args.timeout === 'number' ? args.timeout : 600,
    };
    await this.roleRepo.save(role);
    return { ok: true };
  }

  private async createWorker(
    args: Record<string, unknown>,
    ctx: MasterToolContext,
    task: Task
  ): Promise<{ ok: true; workerId: string } | { error: string }> {
    const roleId = String(args.roleId ?? '').trim();
    const displayName = String(args.displayName ?? '').trim();
    if (!roleId || !displayName) return { error: 'roleId and displayName required' };

    let role: Role | null = await this.roleRepo.findById(roleId);
    if (!role) role = this.roleMatcher.getBuiltinRole(roleId);
    if (!role) return { error: 'ROLE_NOT_FOUND' };

    const workerId = generateId();
    const initialBrief =
      typeof args.initialBrief === 'string' ? args.initialBrief : '';

    const worker: Agent = {
      id: workerId,
      taskId: task.id,
      roleId,
      kind: 'worker',
      displayName,
      masterAgentId: ctx.masterAgentId,
      status: 'idle',
      context: {
        systemPrompt: role.systemPrompt,
        history: [],
        variables: initialBrief ? { workerBrief: initialBrief } : {},
      },
      createdAt: new Date(),
    };
    await this.agentRepo.save(worker);

    await this.eventBus.publish({
      type: 'agent.created',
      timestamp: new Date(),
      payload: { agent: worker, role },
    });

    this.wsManager.broadcast(task.id, {
      type: 'worker.status',
      timestamp: new Date().toISOString(),
      data: { taskId: task.id, workerId, displayName, status: 'idle' },
    });

    return { ok: true, workerId };
  }

  private async submitPlan(
    args: Record<string, unknown>,
    ctx: MasterToolContext
  ): Promise<unknown> {
    const plan = args.plan;
    const expectedPlanVersion =
      typeof args.expectedPlanVersion === 'number' ? args.expectedPlanVersion : undefined;
    return this.orchestrator.submitPlan(ctx.taskId, plan, { expectedPlanVersion });
  }

  private async sendWorkerCommand(
    args: Record<string, unknown>,
    ctx: MasterToolContext
  ): Promise<unknown> {
    const targetWorkerId = String(args.targetWorkerId ?? '');
    const command = String(args.command ?? '');
    const body = (args.body && typeof args.body === 'object'
      ? args.body
      : {}) as Record<string, unknown>;
    const correlationId = String(args.correlationId ?? '');
    const planVersion = typeof args.planVersion === 'number' ? args.planVersion : -1;
    if (!targetWorkerId || !command || !correlationId) {
      return { ok: false, error: 'missing fields' };
    }
    return this.orchestrator.enqueueAdHocCommand(
      ctx.taskId,
      targetWorkerId,
      command,
      body,
      correlationId,
      planVersion
    );
  }

  private async queryState(taskId: string): Promise<unknown> {
    return this.orchestrator.getSnapshot(taskId);
  }
}
