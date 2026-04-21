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
import type { ToolPolicy } from '../../domain/agent/agent.entity.js';
import type { ToolRegistry, ToolContext } from '../../domain/tool/index.js';
import { builtinTools } from '../../domain/tool/index.js';
import type { TaskService } from '../task/task.service.js';
import { isReservedSystemRoleId } from '../bootstrap/seed-system-roles.js';
import * as path from 'path';
import { mkdir } from 'fs/promises';

export interface MasterToolContext {
  taskId: string;
  masterAgentId: string;
  currentNodeId?: string;
  broadcastReply?: boolean;
}

const MASTER_FILE_TOOL_NAMES = new Set(['read_file', 'write_file', 'list_files']);

function masterFileToolDefinitions(): ToolDefinition[] {
  return builtinTools
    .filter((t) => MASTER_FILE_TOOL_NAMES.has(t.name))
    .map((t) => ({
      name: t.name,
      description: `${t.description} 主控调用时工作目录固定为当前任务的 data/workspaces/<taskId>/。`,
      parameters: t.parameters as object,
    }));
}

const MASTER_CORE_TOOL_DEFINITIONS: ToolDefinition[] = [
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
        initialBrief: {
          type: 'string',
          description:
            '工人初始上下文；须含对 docs/REQUIREMENTS.md 的说明（先全局后子任务），与主控「①②③④」派工结构一致',
        },
        toolPolicy: {
          type: 'object',
          description: '工人可用工具策略（可选）；categories/allowTools/denyTools',
          properties: {
            categories: { type: 'array', items: { type: 'string' } },
            allowTools: { type: 'array', items: { type: 'string' } },
            denyTools: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['roleId', 'displayName'],
    },
  },
  {
    name: 'create_submaster',
    description: '在本任务下创建具名子主控 Agent，用于承接模块节点并继续拆分',
    parameters: {
      type: 'object',
      properties: {
        roleId: {
          type: 'string',
          description: '可选；缺省为 task-master。角色应具备主控/模块负责人能力',
        },
        displayName: { type: 'string' },
        initialBrief: {
          type: 'string',
          description: '子主控初始上下文；建议说明负责模块、边界、输入输出与汇报要求',
        },
      },
      required: ['displayName'],
    },
  },
  {
    name: 'submit_plan',
    description:
      '提交 DAG 计划。新格式：{ version, nodes: [{ id, executorType, executorId, nodeKind, dependsOn?, parallelGroup?, brief?, decompositionPolicy? }] }；旧格式中的 workerId 仍兼容并会被视为 worker+atomic。若调用者是 submaster 且已承接某个模块节点，则本工具会把计划视为“当前模块节点的子计划”。提交前须已用 write_file 将用户最新需求写入工作区 docs/REQUIREMENTS.md（用户新提或变更需求时**先更文档再 submit_plan**）。',
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
    description:
      '向工人信箱入队指令，随时可用：body.op 常用 ASSIGN_WORK（派活）、PATCH_BRIEF（改工人上下文说明）、CANCEL、QUERY_STATUS。ASSIGN_WORK 的 body.brief 为「主控派发的任务」段落；系统会把工作区 docs/REQUIREMENTS.md（或任务描述）全文按固定格式拼进工人可见说明（整体需求 + 你的 brief）。planVersion 可省略或填 -1，将自动使用当前任务的 planVersion（与 query_orchestration_state 一致）；仍建议显式传入以免歧义。',
    parameters: {
      type: 'object',
      properties: {
        targetWorkerId: { type: 'string' },
        command: { type: 'string' },
        body: { type: 'object' },
        correlationId: { type: 'string' },
        planVersion: { type: 'number', description: '可选；缺省或 -1 表示当前任务 planVersion' },
      },
      required: ['targetWorkerId', 'command', 'body', 'correlationId'],
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
  {
    name: 'complete_task',
    description:
      '将当前任务标记为已完成（仅当任务 status 为 running 时可用）。请先与用户对齐交付与验收，用 reply_user 说明结案，再调用本工具。调用后系统会异步触发「经验归档员」基于主控对话、复盘快照与文档生成全局总结，写入 docs/CLOSURE_EXPERIENCE.md 与团队经验库。',
    parameters: {
      type: 'object',
      properties: {
        closing_note: {
          type: 'string',
          description: '结案说明（验收结论、遗留项、主控备注；会一并交给经验归档员）',
        },
      },
    },
  },
];

export const MASTER_TOOL_CATEGORY: Record<string, string> = {
  reply_user: 'communication',
  create_role: 'orchestration',
  create_worker: 'orchestration',
  create_submaster: 'orchestration',
  submit_plan: 'orchestration',
  send_worker_command: 'orchestration',
  query_orchestration_state: 'orchestration',
  memory_search: 'memory',
  memory_append: 'memory',
  memory_summarize: 'memory',
  read_file: 'file',
  write_file: 'file',
  list_files: 'file',
  complete_task: 'orchestration',
};

/** 主控可用：编排/记忆/回复 + 任务工作区内文件读写 */
export const MASTER_TOOL_DEFINITIONS: ToolDefinition[] = [
  ...MASTER_CORE_TOOL_DEFINITIONS,
  ...masterFileToolDefinitions(),
];

export class MasterToolExecutor {
  private roleMatcher = new RoleMatcher();
  private taskService: TaskService | null = null;

  constructor(
    private agentRepo: IAgentRepository,
    private roleRepo: IRoleRepository,
    private orchestrator: OrchestratorService,
    private eventBus: IEventBus,
    private wsManager: WebSocketManager,
    private memoryHandlers: MemoryToolHandlers,
    private logger: ILogger,
    private toolRegistry: ToolRegistry
  ) {}

  /** 在 TaskService 实例化后注入，避免与 MasterAgentService 构造环依赖 */
  attachTaskService(taskService: TaskService): void {
    this.taskService = taskService;
  }

  async runTool(
    name: string,
    args: Record<string, unknown>,
    ctx: MasterToolContext,
    agent: Agent,
    task: Task
  ): Promise<unknown> {
    switch (name) {
      case 'reply_user':
        return this.replyUser(agent, task, String(args.content ?? ''), ctx);
      case 'create_role':
        return this.createRole(args);
      case 'create_worker':
        return this.createWorker(args, ctx, task);
      case 'create_submaster':
        return this.createSubmaster(args, ctx, task);
      case 'submit_plan':
        return this.submitPlan(args, ctx, agent);
      case 'send_worker_command':
        return this.sendWorkerCommand(args, ctx, task);
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
      case 'read_file':
      case 'write_file':
      case 'list_files':
        return this.runWorkspaceFileTool(name, args, ctx);
      case 'complete_task':
        return this.completeTaskMaster(ctx, task, args);
      default:
        return { error: `unknown tool ${name}` };
    }
  }

  private async runWorkspaceFileTool(
    name: string,
    args: Record<string, unknown>,
    ctx: MasterToolContext
  ): Promise<unknown> {
    const tool = this.toolRegistry.get(name);
    if (!tool) {
      return { success: false, error: `Tool not found: ${name}` };
    }
    const workingDirectory = path.resolve(process.cwd(), `data/workspaces/${ctx.taskId}`);
    try {
      await mkdir(workingDirectory, { recursive: true });
    } catch {
      // ignore
    }
    const toolContext: ToolContext = {
      taskId: ctx.taskId,
      agentId: ctx.masterAgentId,
      workingDirectory,
    };
    return tool.execute(args, toolContext);
  }

  private async completeTaskMaster(
    ctx: MasterToolContext,
    task: Task,
    args: Record<string, unknown>
  ): Promise<{ ok: true } | { error: string }> {
    if (!this.taskService) {
      return { error: 'TASK_SERVICE_NOT_ATTACHED' };
    }
    if (task.status !== 'running') {
      return { error: `任务当前状态为 ${task.status}，仅 running 可标记完成` };
    }
    const noteRaw =
      typeof args.closing_note === 'string'
        ? args.closing_note
        : typeof args.reason === 'string'
          ? args.reason
          : '';
    await this.taskService.complete(task.id, { masterClosingNote: noteRaw });
    return { ok: true };
  }

  private async replyUser(
    agent: Agent,
    task: Task,
    content: string,
    ctx: MasterToolContext
  ): Promise<{ ok: true; visible: string }> {
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
    if (ctx.broadcastReply !== false) {
      this.wsManager.broadcast(task.id, {
        type: 'master_reply',
        timestamp: new Date().toISOString(),
        data: { content: visible, source: 'reply_user' },
      });
    }
    return { ok: true, visible };
  }

  private async createRole(
    args: Record<string, unknown>
  ): Promise<{ ok: true } | { error: string }> {
    const id = String(args.id ?? '').trim();
    if (!id) return { error: 'id required' };
    if (isReservedSystemRoleId(id)) return { error: 'RESERVED_ROLE_ID' };
    const role: Role = {
      id,
      name: String(args.name ?? id),
      description: String(args.description ?? ''),
      systemPrompt: String(args.systemPrompt ?? ''),
      allowedTools: Array.isArray(args.allowedTools)
        ? (args.allowedTools as unknown[]).filter((x): x is string => typeof x === 'string')
        : ['read_file', 'write_file', 'list_files', 'record_experience'],
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
    if (isReservedSystemRoleId(role.id) || role.isSystem) {
      return { error: 'ROLE_NOT_ASSIGNABLE' };
    }

    const workerId = generateId();
    const initialBrief =
      typeof args.initialBrief === 'string' ? args.initialBrief : '';
    const toolPolicy = parseToolPolicy(args.toolPolicy, role);

    const worker: Agent = {
      id: workerId,
      taskId: task.id,
      roleId,
      kind: 'worker',
      displayName,
      masterAgentId: ctx.masterAgentId,
      toolPolicy,
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

  private async createSubmaster(
    args: Record<string, unknown>,
    ctx: MasterToolContext,
    task: Task
  ): Promise<{ ok: true; submasterId: string } | { error: string }> {
    const roleIdRaw = String(args.roleId ?? '').trim();
    const roleId = roleIdRaw || 'task-master';
    const displayName = String(args.displayName ?? '').trim();
    if (!displayName) return { error: 'displayName required' };

    let role: Role | null = await this.roleRepo.findById(roleId);
    if (!role) role = this.roleMatcher.getBuiltinRole(roleId);
    if (!role) return { error: 'ROLE_NOT_FOUND' };
    if (isReservedSystemRoleId(role.id) || role.isSystem) {
      return { error: 'ROLE_NOT_ASSIGNABLE' };
    }

    const submasterId = generateId();
    const initialBrief = typeof args.initialBrief === 'string' ? args.initialBrief : '';

    const submaster: Agent = {
      id: submasterId,
      taskId: task.id,
      roleId,
      kind: 'submaster',
      displayName,
      masterAgentId: ctx.masterAgentId,
      status: 'idle',
      context: {
        systemPrompt: role.systemPrompt,
        history: [],
        variables: initialBrief ? { submasterBrief: initialBrief } : {},
      },
      createdAt: new Date(),
    };
    await this.agentRepo.save(submaster);

    await this.eventBus.publish({
      type: 'agent.created',
      timestamp: new Date(),
      payload: { agent: submaster, role },
    });

    this.wsManager.broadcast(task.id, {
      type: 'worker.status',
      timestamp: new Date().toISOString(),
      data: { taskId: task.id, workerId: submasterId, displayName, status: 'idle' },
    });

    return { ok: true, submasterId };
  }

  private async submitPlan(
    args: Record<string, unknown>,
    ctx: MasterToolContext,
    agent: Agent
  ): Promise<unknown> {
    const plan = args.plan;
    const expectedPlanVersion =
      typeof args.expectedPlanVersion === 'number' ? args.expectedPlanVersion : undefined;
    if (agent.kind === 'submaster' && ctx.currentNodeId) {
      return this.orchestrator.submitSubplan(
        ctx.taskId,
        ctx.currentNodeId,
        ctx.masterAgentId,
        plan,
        { expectedPlanVersion }
      );
    }
    return this.orchestrator.submitPlan(ctx.taskId, plan, { expectedPlanVersion });
  }

  private async sendWorkerCommand(
    args: Record<string, unknown>,
    ctx: MasterToolContext,
    task: Task
  ): Promise<unknown> {
    const targetWorkerId = String(args.targetWorkerId ?? '');
    const command = String(args.command ?? '');
    const body = (args.body && typeof args.body === 'object'
      ? args.body
      : {}) as Record<string, unknown>;
    const correlationId = String(args.correlationId ?? '');
    let planVersion = typeof args.planVersion === 'number' ? args.planVersion : NaN;
    if (!Number.isFinite(planVersion) || planVersion < 0) {
      planVersion = task.planVersion ?? 0;
    }
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

function parseToolPolicy(raw: unknown, role: Role): ToolPolicy | undefined {
  const fallbackAllow = Array.isArray(role.allowedTools) && role.allowedTools.length
    ? { allowTools: role.allowedTools }
    : undefined;
  if (!raw || typeof raw !== 'object') return fallbackAllow;
  const r = raw as Record<string, unknown>;
  const categories = Array.isArray(r.categories)
    ? (r.categories as unknown[]).filter((x): x is string => typeof x === 'string')
    : undefined;
  const allowTools = Array.isArray(r.allowTools)
    ? (r.allowTools as unknown[]).filter((x): x is string => typeof x === 'string')
    : undefined;
  const denyTools = Array.isArray(r.denyTools)
    ? (r.denyTools as unknown[]).filter((x): x is string => typeof x === 'string')
    : undefined;
  if (!categories?.length && !allowTools?.length && !denyTools?.length) return fallbackAllow;
  return {
    categories: categories?.length ? (categories as any) : undefined,
    allowTools: allowTools?.length ? allowTools : undefined,
    denyTools: denyTools?.length ? denyTools : undefined,
  };
}
