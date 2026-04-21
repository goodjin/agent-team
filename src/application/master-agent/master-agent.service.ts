import type { Task } from '../../domain/task/task.entity.js';
import type { ITaskRepository } from '../../domain/task/task.repository.js';
import type { Agent } from '../../domain/agent/agent.entity.js';
import type { IAgentRepository } from '../../domain/agent/agent.repository.js';
import type { IRoleRepository } from '../../domain/role/role.repository.js';
import { RoleMatcher } from '../../domain/agent/role-matcher.js';
import { LLMService, type Message } from '../../infrastructure/llm/index.js';
import type { ILogger } from '../../infrastructure/logger/index.js';
import type { IEventBus } from '../../infrastructure/event-bus/index.js';
import { WebSocketManager } from '../../infrastructure/websocket/index.js';
import { generateId } from '../../infrastructure/utils/id.js';
import type { OrchestratorService } from '../orchestration/orchestrator.service.js';
import type { ContextCompressor } from '../memory/context-compressor.js';
import type { MemoryToolHandlers } from '../memory/memory-tool-handlers.js';
import type { ToolRegistry } from '../../domain/tool/index.js';
import type { TaskService } from '../task/task.service.js';
import { MasterToolExecutor, MASTER_TOOL_DEFINITIONS } from './master-tool-executor.js';
import { formatLLMProviderError, llmErrorMetadata } from '../../infrastructure/llm/error-format.js';
import { splitThinkingAndVisible } from '../../infrastructure/utils/chat-sanitize.js';
import { formatProgressReport, normalizeProgressReport, type ProgressReport } from '../orchestration/progress-report.js';
import { classifyIntent, formatIntentGate } from './intent-gate.js';
import type { PlanReviewService } from '../review/plan-review.service.js';

function buildMasterSystemExtras(agent: Agent): string {
  const parts: string[] = [];
  const idg = agent.context.variables?.internalDigest;
  if (idg) parts.push(`[内部状态累积摘要]\n${String(idg).slice(0, 4000)}`);
  const msi = agent.context.variables?.memorySummaryInternal;
  if (msi) parts.push(`[记忆工具-内部摘要]\n${String(msi).slice(0, 2000)}`);
  const intentGate = agent.context.variables?.intentGate;
  if (intentGate) {
    parts.push(`[IntentGate]\n${formatIntentGate(intentGate)}`);
  }
  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
}

/**
 * v10 主控 Agent：与用户多轮对话；M2 起支持编排工具（LLM function calling）；M3 记忆与压缩
 */
export class MasterAgentService {
  private roleMatcher = new RoleMatcher();
  private toolExecutor: MasterToolExecutor;

  private static readonly MAX_TOOL_TURNS = 14;

  constructor(
    private taskRepo: ITaskRepository,
    private agentRepo: IAgentRepository,
    private llmService: LLMService,
    private logger: ILogger,
    private eventBus: IEventBus,
    private wsManager: WebSocketManager,
    private roleRepo: IRoleRepository,
    private orchestrator: OrchestratorService,
    private contextCompressor: ContextCompressor,
    memoryHandlers: MemoryToolHandlers,
    toolRegistry: ToolRegistry,
    planReviewService: PlanReviewService
  ) {
    this.toolExecutor = new MasterToolExecutor(
      agentRepo,
      roleRepo,
      orchestrator,
      eventBus,
      wsManager,
      memoryHandlers,
      this.logger,
      toolRegistry,
      planReviewService
    );
  }

  /** TaskService 构造完成后注入，以注册 complete_task 等依赖任务状态的工具 */
  attachTaskService(taskService: TaskService): void {
    this.toolExecutor.attachTaskService(taskService);
  }

  /**
   * 确保主控 Agent 与会话存在（系统已统一 v10-master）。
   */
  async ensureSessionStarted(taskId: string): Promise<void> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) {
      return;
    }

    if (task.orchestrationMode !== 'v10-master') {
      task.orchestrationMode = 'v10-master';
    }

    const masterId = task.masterAgentId ?? generateId();
    task.masterAgentId = masterId;
    task.orchestrationState = task.orchestrationState ?? 'intake';
    task.planVersion = task.planVersion ?? 0;

    const existing = await this.agentRepo.findById(masterId);
    if (!existing) {
      const role = this.roleMatcher.getRole('task-master');
      const agent: Agent = {
        id: masterId,
        taskId: task.id,
        roleId: 'task-master',
        kind: 'master',
        status: 'idle',
        context: {
          systemPrompt: role.systemPrompt,
          history: [],
          variables: {},
        },
        createdAt: new Date(),
      };
      await this.agentRepo.save(agent);
      await this.taskRepo.save(task);
      await this.eventBus.publish({
        type: 'master.session.started',
        timestamp: new Date(),
        payload: { taskId: task.id, masterAgentId: masterId },
      });
      return;
    }

    await this.taskRepo.save(task);
  }

  /**
   * 主控会话分页：默认返回末尾 `limit` 条；`before` 为在完整历史中的**切片右端下标**（不包含），用于向上翻更早的 50 条。
   */
  async getConversation(
    taskId: string,
    opts?: { limit?: number; before?: number }
  ): Promise<{
    messages: Array<{ role: string; content: string }>;
    total: number;
    hasOlder: boolean;
    oldestIndex: number;
  }> {
    const task = await this.taskRepo.findById(taskId);
    if (!task?.masterAgentId) {
      return { messages: [], total: 0, hasOlder: false, oldestIndex: 0 };
    }
    const agent = await this.agentRepo.findById(task.masterAgentId);
    if (!agent) {
      return { messages: [], total: 0, hasOlder: false, oldestIndex: 0 };
    }
    const all = agent.context.history.map((h) => ({
      role: h.role,
      content: h.content,
    }));
    const total = all.length;
    const limit = Math.min(100, Math.max(1, opts?.limit ?? 50));
    const beforeOpt = opts?.before;
    const end =
      typeof beforeOpt === 'number' && Number.isFinite(beforeOpt)
        ? Math.max(0, Math.min(total, beforeOpt))
        : total;
    const start = Math.max(0, end - limit);
    const messages = all.slice(start, end);
    return {
      messages,
      total,
      hasOlder: start > 0,
      oldestIndex: start,
    };
  }

  /**
   * 处理用户一句话：主控 LLM + 可选多轮工具调用，返回最后一轮对用户的可见文本（若有）。
   */
  async handleUserMessage(taskId: string, content: string): Promise<string> {
    await this.ensureSessionStarted(taskId);

    const task = await this.taskRepo.findById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    if (!task.masterAgentId) {
      throw new Error('Master session not initialized');
    }

    const agent = await this.agentRepo.findById(task.masterAgentId);
    if (!agent) {
      throw new Error('Master agent not found');
    }

    return this.handleMessageWithAgent(task, agent, content, { broadcastReply: true });
  }

  /**
   * 对任意主控型 agent 执行一轮消息处理；子主控默认不向用户广播回复。
   */
  async handleAgentMessage(
    taskId: string,
    agentId: string,
    content: string,
    opts?: { broadcastReply?: boolean }
  ): Promise<string> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    const agent = await this.agentRepo.findById(agentId);
    if (!agent || agent.taskId !== taskId) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    if (agent.kind !== 'master' && agent.kind !== 'submaster') {
      throw new Error(`Agent is not master-like: ${agentId}`);
    }

    return this.handleMessageWithAgent(task, agent, content, {
      broadcastReply: opts?.broadcastReply ?? false,
    });
  }

  private async handleMessageWithAgent(
    task: Task,
    agent: Agent,
    content: string,
    opts: { broadcastReply: boolean }
  ): Promise<string> {
    const taskId = task.id;

    agent.context.history.push({ role: 'user', content });

    await this.eventBus.publish({
      type: 'master.message.appended',
      timestamp: new Date(),
      payload: { taskId, role: 'user', contentLength: content.length },
    });

    const intentGate = classifyIntent({
      content,
      taskTitle: task.title,
      taskDescription: task.description || '',
    });
    agent.context.variables.intentGate = intentGate;
    await this.eventBus.publish({
      type: 'master.intent.classified',
      timestamp: new Date(),
      payload: {
        taskId,
        agentId: agent.id,
        intent: intentGate.intent,
        complexity: intentGate.complexity,
        suggestedMode: intentGate.suggestedMode,
        reasons: intentGate.reasons,
      },
    });

    await this.contextCompressor.maybeCompressMasterHistory(agent);
    await this.agentRepo.save(agent);

    const taskBlock = `[任务]\n标题: ${task.title}\n描述: ${task.description || '（无）'}\n`;
    const sysPrefix = `${agent.context.systemPrompt}${buildMasterSystemExtras(agent)}`;
    const messages: Message[] = [
      { role: 'system', content: `${sysPrefix}\n\n${taskBlock}` },
      ...agent.context.history.map((h) => ({
        role: h.role,
        content: h.content,
      })),
    ];

    await this.logger.log({
      timestamp: new Date(),
      level: 'info',
      taskId,
      agentId: agent.id,
      type: 'thought',
      content: `Master 收到用户消息: ${content.slice(0, 200)}`,
      metadata: {},
    });

    let lastVisibleReply = '';
    let lastUsage = { prompt: 0, completion: 0, total: 0 };

    for (let turn = 0; turn < MasterAgentService.MAX_TOOL_TURNS; turn++) {
      let response;
      try {
        const provider = this.llmService.getDefaultProvider();
        const meta = this.llmService.getAdapterMeta(provider);
        const endpoint =
          meta?.providerType === 'openai'
            ? `${meta.baseURL ?? 'https://api.openai.com/v1'}/chat/completions`
            : 'https://api.anthropic.com/v1/messages';
        await this.logger.log({
          timestamp: new Date(),
          level: 'debug',
          taskId,
          agentId: agent.id,
          type: 'llm_request',
          content: 'Master LLM 请求',
          metadata: {
            turn,
            provider,
            model: meta?.model,
            url: endpoint,
            messages: messages.length,
            tools: MASTER_TOOL_DEFINITIONS.map((t) => t.name),
            preview: summarizeMessagesForLog(messages, { tail: 8, maxChars: 420 }),
          },
        });
        response = await this.llmService.chatDefault({
          messages,
          tools: MASTER_TOOL_DEFINITIONS,
          temperature: 0.5,
          maxTokens: 4096,
        });
        await this.logger.log({
          timestamp: new Date(),
          level: 'debug',
          taskId,
          agentId: agent.id,
          type: 'llm_response',
          content: 'Master LLM 响应',
          metadata: {
            turn,
            provider,
            model: meta?.model,
            url: endpoint,
            usage: response.usage,
            toolCalls: msgToolCallsCount(response.message),
            responsePreview: summarizeAssistantMessageForLog(response.message, { maxChars: 1200 }),
          },
        });
      } catch (llmErr) {
        const detail = formatLLMProviderError(llmErr);
        await this.logger.log({
          timestamp: new Date(),
          level: 'error',
          taskId,
          agentId: agent.id,
          type: 'error',
          content: `Master LLM 调用失败: ${detail}`,
          metadata: { turn, ...llmErrorMetadata(llmErr) },
        });
        throw new Error(`Master LLM 调用失败: ${detail}`);
      }

      lastUsage = response.usage;
      const msg = response.message;

      if (msg.toolCalls?.length) {
        messages.push({
          role: 'assistant',
          content: msg.content || '',
          toolCalls: msg.toolCalls,
        });

        for (const tc of msg.toolCalls) {
          const args = (tc.arguments ?? {}) as Record<string, unknown>;
          const result = await this.toolExecutor.runTool(tc.name, args, {
            taskId,
            masterAgentId: agent.id,
            currentNodeId:
              typeof agent.context.variables?.currentNodeId === 'string'
                ? agent.context.variables.currentNodeId
                : undefined,
            broadcastReply: opts.broadcastReply,
          }, agent, task);
          messages.push({
            role: 'tool',
            toolCallId: tc.id,
            content: JSON.stringify(result),
          });
          if (tc.name === 'reply_user') {
            lastVisibleReply =
              typeof (result as { visible?: unknown })?.visible === 'string'
                ? String((result as { visible?: unknown }).visible)
                : String(args.content ?? lastVisibleReply);
          }
        }
        continue;
      }

      const reply = msg.content || '';
      if (reply) {
        const { visible, thinking } = splitThinkingAndVisible(reply);
        if (thinking) {
          await this.logger.log({
            timestamp: new Date(),
            level: 'info',
            taskId,
            agentId: agent.id,
            type: 'thought',
            content: `主控 · 思考过程（对话中已隐藏）\n${thinking}`,
            metadata: { source: 'master_direct_reply' },
          });
        }
        agent.context.history.push({ role: 'assistant', content: visible });
        await this.agentRepo.save(agent);
        if (opts.broadcastReply) {
          this.wsManager.broadcast(taskId, {
            type: 'master_reply',
            timestamp: new Date().toISOString(),
            data: { content: visible, usage: response.usage },
          });
        }
        return visible;
      }
      break;
    }

    if (lastVisibleReply) {
      return lastVisibleReply;
    }

    const fallback = '（本轮未产生可见回复；若已执行工具，请查看编排状态或重试。）';
    agent.context.history.push({ role: 'assistant', content: fallback });
    await this.agentRepo.save(agent);
    if (opts.broadcastReply) {
      this.wsManager.broadcast(taskId, {
        type: 'master_reply',
        timestamp: new Date().toISOString(),
        data: { content: fallback, usage: lastUsage },
      });
    }
    return fallback;
  }

  /**
   * 工人执行结果写入主控会话（user + 固定前缀），主控下一轮可见；前端通过 WS 刷新对话。
   */
  async appendWorkerProgressFeed(
    taskId: string,
    payload: {
      taskId: string;
      workerId: string;
      kind: string;
      correlationId?: string;
      detail?: Record<string, unknown>;
    }
  ): Promise<void> {
    if (payload.kind !== 'COMPLETED' && payload.kind !== 'FAILED') return;
    const task = await this.taskRepo.findById(taskId);
    if (!task) return;

    const worker = await this.agentRepo.findById(payload.workerId);
    const supervisorAgentId = worker?.masterAgentId ?? task.masterAgentId;
    if (!supervisorAgentId) return;
    const label = worker?.displayName || worker?.roleId || payload.workerId.slice(0, 8);
    const nodeId = payload.detail?.nodeId != null ? String(payload.detail.nodeId) : '';
    const err = payload.detail?.error != null ? String(payload.detail.error) : '';
    const report = this.coerceProgressReport((payload.detail?.report as ProgressReport | undefined) ?? undefined, {
      statusHint: payload.kind === 'COMPLETED' ? 'done' : 'blocked',
      scopeHint: nodeId ? `原子节点 ${nodeId}` : `工人节点 ${label}`,
      summary:
        payload.detail?.summary != null
          ? String(payload.detail.summary)
          : err,
      nextStepHint:
        payload.kind === 'COMPLETED'
          ? '等待直属上级审查当前节点结果。'
          : '等待直属上级决定返工、重派或升级处理。',
    });
    const lines = formatProgressReport(report, {
      header: `[系统·工人汇报] 「${label}」（${payload.workerId}）`,
    });

    await this.appendProgressFeed(task, supervisorAgentId, lines, 'worker_feed');
  }

  async appendSubmasterProgressFeed(
    taskId: string,
    payload: {
      taskId: string;
      submasterId: string;
      kind: string;
      nodeId?: string;
      summary?: string;
      report?: ProgressReport;
    }
  ): Promise<void> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) return;
    const submaster = await this.agentRepo.findById(payload.submasterId);
    const supervisorAgentId = submaster?.masterAgentId ?? task.masterAgentId;
    if (!supervisorAgentId) return;
    const label = submaster?.displayName || submaster?.roleId || payload.submasterId.slice(0, 8);
    const report = this.coerceProgressReport(payload.report, {
      statusHint:
        payload.kind === 'FAILED'
          ? 'blocked'
          : payload.kind === 'PLANNED'
            ? 'in-progress'
            : 'done',
      scopeHint: payload.nodeId ? `模块节点 ${payload.nodeId}` : `模块任务 ${label}`,
      summary: payload.summary,
      nextStepHint:
        payload.kind === 'PLANNED'
          ? '等待直属子节点继续推进并在收口后复核模块结果。'
          : payload.kind === 'FAILED'
            ? '等待上一级决定是否返工、补充或终止。'
            : '等待上一级审查当前模块结果。',
    });
    const lines = formatProgressReport(report, {
      header: `[系统·子主控汇报] 「${label}」（${payload.submasterId}）`,
    });

    await this.appendProgressFeed(task, supervisorAgentId, lines, 'submaster_feed');
  }

  private coerceProgressReport(
    report: ProgressReport | undefined,
    fallback: {
      statusHint: 'done' | 'blocked' | 'need-change' | 'in-progress';
      scopeHint: string;
      summary?: string;
      nextStepHint?: string;
    }
  ): ProgressReport {
    if (report) return report;
    return normalizeProgressReport(fallback);
  }

  private async appendProgressFeed(
    task: Task,
    targetAgentId: string,
    content: string,
    source: 'worker_feed' | 'submaster_feed'
  ): Promise<void> {
    const agent = await this.agentRepo.findById(targetAgentId);
    if (!agent) return;

    agent.context.history.push({ role: 'user', content });
    await this.contextCompressor.maybeCompressMasterHistory(agent);
    await this.agentRepo.save(agent);

    await this.eventBus.publish({
      type: 'master.message.appended',
      timestamp: new Date(),
      payload: { taskId: task.id, role: 'user', contentLength: content.length, source },
    });
    if (task.masterAgentId && targetAgentId === task.masterAgentId) {
      this.wsManager.broadcast(task.id, {
        type: 'master_conversation_updated',
        timestamp: new Date().toISOString(),
        data: { reason: source, agentId: targetAgentId },
      });
    }
  }
}

function msgToolCallsCount(msg: { toolCalls?: unknown[] } | null | undefined): number {
  const tc = msg && Array.isArray((msg as any).toolCalls) ? (msg as any).toolCalls : [];
  return Array.isArray(tc) ? tc.length : 0;
}

function truncateForLog(input: unknown, maxChars: number): string {
  const s = typeof input === 'string' ? input : JSON.stringify(input);
  if (!s) return '';
  const out = s.length > maxChars ? `${s.slice(0, maxChars)}…(truncated)` : s;
  // 轻度脱敏：常见 key/token 形态
  return out
    .replace(/(sk-[A-Za-z0-9]{10,})/g, 'sk-***redacted***')
    .replace(/(Bearer\\s+)[A-Za-z0-9._-]{10,}/gi, '$1***redacted***')
    .replace(/(api[_-]?key\"?\\s*[:=]\\s*\")([^\"\\n]{6,})/gi, '$1***redacted***');
}

function summarizeMessagesForLog(
  messages: Array<{ role: string; content: string }>,
  opts: { tail: number; maxChars: number }
): Array<{ role: string; contentPreview: string; length: number }> {
  const tail = Math.max(0, opts.tail);
  const slice = tail ? messages.slice(-tail) : messages;
  return slice.map((m) => ({
    role: m.role,
    length: (m.content || '').length,
    contentPreview: truncateForLog(m.content || '', opts.maxChars),
  }));
}

function summarizeAssistantMessageForLog(
  msg: any,
  opts: { maxChars: number }
): { contentPreview: string; toolCalls?: Array<{ name: string; argumentsPreview?: string }> } {
  const toolCalls = Array.isArray(msg?.toolCalls) ? msg.toolCalls : [];
  const tcPreview =
    toolCalls.length > 0
      ? toolCalls.slice(0, 8).map((tc: any) => ({
          name: String(tc?.name ?? ''),
          argumentsPreview:
            tc?.arguments != null ? truncateForLog(tc.arguments, 800) : undefined,
        }))
      : undefined;
  return {
    contentPreview: truncateForLog(msg?.content || '', opts.maxChars),
    toolCalls: tcPreview,
  };
}
