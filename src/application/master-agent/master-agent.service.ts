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
import { MasterToolExecutor, MASTER_TOOL_DEFINITIONS } from './master-tool-executor.js';
import { formatLLMProviderError, llmErrorMetadata } from '../../infrastructure/llm/error-format.js';
import { splitThinkingAndVisible } from '../../infrastructure/utils/chat-sanitize.js';

function buildMasterSystemExtras(agent: Agent): string {
  const parts: string[] = [];
  const idg = agent.context.variables?.internalDigest;
  if (idg) parts.push(`[内部状态累积摘要]\n${String(idg).slice(0, 4000)}`);
  const msi = agent.context.variables?.memorySummaryInternal;
  if (msi) parts.push(`[记忆工具-内部摘要]\n${String(msi).slice(0, 2000)}`);
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
    memoryHandlers: MemoryToolHandlers
  ) {
    this.toolExecutor = new MasterToolExecutor(
      agentRepo,
      roleRepo,
      orchestrator,
      eventBus,
      wsManager,
      memoryHandlers,
      this.logger
    );
  }

  /**
   * 确保主控 Agent 与会话存在。遗留 v9 任务在可安全切换时升级为 v10-master（传统模式且执行中则拒绝，避免双轨执行）。
   */
  async ensureSessionStarted(taskId: string): Promise<void> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) {
      return;
    }

    const mode = task.orchestrationMode ?? 'v9-legacy';
    if (mode === 'v9-legacy' && task.status === 'running') {
      throw new Error(
        '任务正以传统模式执行中，请待执行结束后再使用主控对话'
      );
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

  /** 返回主控与用户/助手的对话历史（用于前端恢复会话） */
  async getConversation(taskId: string): Promise<{ messages: Array<{ role: string; content: string }> }> {
    const task = await this.taskRepo.findById(taskId);
    if (!task?.masterAgentId) {
      return { messages: [] };
    }
    const agent = await this.agentRepo.findById(task.masterAgentId);
    if (!agent) {
      return { messages: [] };
    }
    return {
      messages: agent.context.history.map((h) => ({
        role: h.role,
        content: h.content,
      })),
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

    agent.context.history.push({ role: 'user', content });

    await this.eventBus.publish({
      type: 'master.message.appended',
      timestamp: new Date(),
      payload: { taskId, role: 'user', contentLength: content.length },
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
        response = await this.llmService.chatDefault({
          messages,
          tools: MASTER_TOOL_DEFINITIONS,
          temperature: 0.5,
          maxTokens: 4096,
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
          }, agent, task);
          messages.push({
            role: 'tool',
            toolCallId: tc.id,
            content: JSON.stringify(result),
          });
          if (tc.name === 'reply_user') {
            lastVisibleReply = String(args.content ?? lastVisibleReply);
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
        this.wsManager.broadcast(taskId, {
          type: 'master_reply',
          timestamp: new Date().toISOString(),
          data: { content: visible, usage: response.usage },
        });
        return visible;
      }
      break;
    }

    if (lastVisibleReply) {
      const { visible, thinking } = splitThinkingAndVisible(lastVisibleReply);
      if (thinking) {
        await this.logger.log({
          timestamp: new Date(),
          level: 'info',
          taskId,
          agentId: agent.id,
          type: 'thought',
          content: `主控 · 思考过程（对话中已隐藏）\n${thinking}`,
          metadata: { source: 'master_tool_round' },
        });
      }
      agent.context.history.push({ role: 'assistant', content: visible });
      await this.agentRepo.save(agent);
      this.wsManager.broadcast(taskId, {
        type: 'master_reply',
        timestamp: new Date().toISOString(),
        data: { content: visible, usage: lastUsage },
      });
      return visible;
    }

    const fallback = '（本轮未产生可见回复；若已执行工具，请查看编排状态或重试。）';
    agent.context.history.push({ role: 'assistant', content: fallback });
    await this.agentRepo.save(agent);
    this.wsManager.broadcast(taskId, {
      type: 'master_reply',
      timestamp: new Date().toISOString(),
      data: { content: fallback, usage: lastUsage },
    });
    return fallback;
  }
}
