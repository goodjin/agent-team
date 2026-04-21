import { EventEmitter } from 'events';
import { Agent } from '../../domain/agent/index.js';
import { Task } from '../../domain/task/index.js';
import { ToolRegistry, ToolContext, type Tool } from '../../domain/tool/index.js';
import { LLMService, Message, ToolCall } from '../../infrastructure/llm/index.js';
import { ILogger } from '../../infrastructure/logger/index.js';
import { IEventBus } from '../../infrastructure/event-bus/index.js';
import type { ContextCompressor } from '../memory/context-compressor.js';
import { formatLLMProviderError, llmErrorMetadata } from '../../infrastructure/llm/error-format.js';
import * as path from 'path';
import {
  TOOL_CATALOG_TITLES,
  formatToolCatalogSection,
  groupToolsByCategory,
} from '../../domain/agent/prompt-utils.js';

/** DomainEvent `agent.execution.finished` 的 payload，供 SelfEvaluator / 记忆等订阅 */
export interface AgentExecutionFinishedPayload {
  taskId: string;
  agentId: string;
  success: boolean;
  toolCallCount: number;
  tokenUsed: number;
  durationMs: number;
  iterationCount: number;
  summary?: string;
  toolsUsed: string[];
  errorMessage?: string;
}

/**
 * 执行上下文
 */
interface ExecutionContext {
  agent: Agent;
  task: Task;
  messages: Message[];
  iterationCount: number;
}

/**
 * Agent执行引擎
 * 实现ReAct（Reasoning + Acting）执行循环；扩展 EventEmitter 以接入 observability/middleware。
 */
export class AgentExecutionEngine extends EventEmitter {
  constructor(
    private llmService: LLMService,
    private toolRegistry: ToolRegistry,
    private logger: ILogger,
    private eventBus: IEventBus,
    private maxIterations: number = 50,
    private contextCompressor: ContextCompressor | null = null
  ) {
    super();
  }

  /**
   * 执行Agent任务
   * @param options.signal 可选中止信号（v10+）
   */
  async execute(
    agent: Agent,
    task: Task,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    const signal = options?.signal;
    const context: ExecutionContext = {
      agent,
      task,
      messages: this.buildInitialMessages(agent, task),
      iterationCount: 0,
    };

    const runStart = Date.now();
    let totalTokens = 0;
    let toolCallCount = 0;
    const toolsUsed: string[] = [];
    let lastSummary = '';

    await this.updateProgress(context, 0);

    this.emit('loop:started', { taskId: task.id, maxIterations: this.maxIterations });

    let didCompressMessages = false;

    try {
      while (context.iterationCount < this.maxIterations) {
        if (signal?.aborted) {
          throw new Error('Aborted');
        }
        context.iterationCount++;

        if (!didCompressMessages && this.contextCompressor) {
          context.messages = await this.contextCompressor.maybeCompressMessages(context.messages);
          didCompressMessages = true;
        }

        const progress = Math.min(90, Math.floor((context.iterationCount / this.maxIterations) * 100));
        await this.updateProgress(context, progress);

        this.emit('llm:calling', {
          iteration: context.iterationCount,
          estimatedTokens: Math.min(8000, context.messages.length * 400),
        });

        const response = await this.think(context);
        totalTokens += response.usage?.total ?? 0;

        if (response.message.toolCalls && response.message.toolCalls.length > 0) {
          const batch = response.message.toolCalls;
          this.emit('tools:executing', {
            iteration: context.iterationCount,
            toolCount: batch.length,
          });

          const results: Array<{ name: string; success: boolean; duration: number }> = [];
          for (const toolCall of batch) {
            const { success, duration } = await this.executeTool(context, toolCall);
            results.push({ name: toolCall.name, success, duration });
            toolCallCount++;
            toolsUsed.push(toolCall.name);
          }
          this.emit('tools:executed', { iteration: context.iterationCount, results });
        } else {
          lastSummary = response.message.content || '';
          await this.logCompletion(context, lastSummary);
          break;
        }
      }

      if (context.iterationCount >= this.maxIterations) {
        throw new Error(`Max iterations (${this.maxIterations}) reached`);
      }

      context.agent.context.variables.lastRunSummary = lastSummary;

      this.emit('loop:completed', {
        taskId: context.task.id,
        iterations: context.iterationCount,
        tokensUsed: totalTokens,
        toolCalls: toolCallCount,
      });

      await this.publishExecutionFinished(context, {
        success: true,
        totalTokens,
        toolCallCount,
        toolsUsed,
        runStart,
        summary: lastSummary,
      });

      await this.updateProgress(context, 100);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      context.agent.context.variables.lastRunSummary = errMsg;
      this.emit('loop:error', {
        taskId: context.task.id,
        iterations: context.iterationCount,
        error: errMsg,
      });

      await this.publishExecutionFinished(context, {
        success: false,
        totalTokens,
        toolCallCount,
        toolsUsed,
        runStart,
        errorMessage: errMsg,
      });

      await this.logger.log({
        timestamp: new Date(),
        level: 'error',
        taskId: context.task.id,
        agentId: context.agent.id,
        type: 'error',
        content: `Agent执行失败: ${errMsg}`,
        metadata: {
          iteration: context.iterationCount,
          ...(error instanceof Error && error.message !== errMsg
            ? { causeMessage: error.message }
            : {}),
          ...llmErrorMetadata(error),
        },
      });
      throw error;
    }
  }

  private async publishExecutionFinished(
    context: ExecutionContext,
    opts: {
      success: boolean;
      totalTokens: number;
      toolCallCount: number;
      toolsUsed: string[];
      runStart: number;
      summary?: string;
      errorMessage?: string;
    }
  ): Promise<void> {
    const durationMs = Date.now() - opts.runStart;
    const payload: AgentExecutionFinishedPayload = {
      taskId: context.task.id,
      agentId: context.agent.id,
      success: opts.success,
      toolCallCount: opts.toolCallCount,
      tokenUsed: opts.totalTokens,
      durationMs,
      iterationCount: context.iterationCount,
      summary: opts.summary,
      toolsUsed: opts.toolsUsed,
      errorMessage: opts.errorMessage,
    };
    await this.eventBus.publish({
      type: 'agent.execution.finished',
      timestamp: new Date(),
      payload,
    });
  }

  private async updateProgress(context: ExecutionContext, percent: number): Promise<void> {
    await this.eventBus.publish({
      type: 'task.progress',
      timestamp: new Date(),
      payload: {
        taskId: context.task.id,
        percent,
        iteration: context.iterationCount,
      },
    });
  }

  private async think(
    context: ExecutionContext
  ): Promise<{ message: Message; usage: { prompt: number; completion: number; total: number } }> {
    await this.logger.log({
      timestamp: new Date(),
      level: 'debug',
      taskId: context.task.id,
      agentId: context.agent.id,
      type: 'thought',
      content: 'Agent正在思考...',
      metadata: { iteration: context.iterationCount },
    });

    const allowedTools = selectAllowedTools(this.toolRegistry.list(), context.agent.toolPolicy);
    const tools = allowedTools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

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
        taskId: context.task.id,
        agentId: context.agent.id,
        type: 'llm_request',
        content: 'Agent LLM 请求',
        metadata: {
          iteration: context.iterationCount,
          provider,
          model: meta?.model,
          url: endpoint,
          messages: context.messages.length,
          tools: tools.slice(0, 40).map((t) => t.name),
          preview: summarizeMessagesForLog(context.messages as any, { tail: 8, maxChars: 420 }),
        },
      });
      response = await this.llmService.chatDefault({
        messages: context.messages,
        tools,
        temperature: 0.7,
        maxTokens: 4000,
      });
      await this.logger.log({
        timestamp: new Date(),
        level: 'debug',
        taskId: context.task.id,
        agentId: context.agent.id,
        type: 'llm_response',
        content: 'Agent LLM 响应',
        metadata: {
          iteration: context.iterationCount,
          provider,
          model: meta?.model,
          url: endpoint,
          usage: response.usage,
          toolCalls: Array.isArray(response.message?.toolCalls) ? response.message.toolCalls.length : 0,
          responsePreview: summarizeAssistantMessageForLog(response.message, { maxChars: 1200 }),
        },
      });
    } catch (llmErr) {
      const detail = formatLLMProviderError(llmErr);
      const meta = llmErrorMetadata(llmErr);
      await this.logger.log({
        timestamp: new Date(),
        level: 'error',
        taskId: context.task.id,
        agentId: context.agent.id,
        type: 'error',
        content: `LLM 调用失败: ${detail}`,
        metadata: { phase: 'think', ...meta },
      });
      throw new Error(`LLM 调用失败: ${detail}`);
    }

    this.emit('llm:response', {
      iteration: context.iterationCount,
      stopReason: response.message.toolCalls?.length ? 'tool_use' : 'end_turn',
      contentLength: (response.message.content || '').length,
      toolCalls: response.message.toolCalls?.length ?? 0,
      tokensUsed: response.usage?.total ?? 0,
    });

    await this.logger.log({
      timestamp: new Date(),
      level: 'info',
      taskId: context.task.id,
      agentId: context.agent.id,
      type: 'thought',
      content: response.message.content || (response.message.toolCalls ? '执行工具调用' : ''),
      metadata: {
        iteration: context.iterationCount,
        hasToolCalls: !!response.message.toolCalls?.length,
        usage: response.usage,
      },
    });

    context.messages.push(response.message);

    return response;
  }

  /**
   * 执行工具调用，返回是否成功与耗时（供 observability tools:executed）
   */
  private async executeTool(
    context: ExecutionContext,
    toolCall: ToolCall
  ): Promise<{ success: boolean; duration: number }> {
    const allowed = selectAllowedTools(this.toolRegistry.list(), context.agent.toolPolicy);
    const allowSet = new Set(allowed.map((t) => t.name));
    if (!allowSet.has(toolCall.name)) {
      throw new Error(`Tool not allowed for this agent: ${toolCall.name}`);
    }
    const tool = this.toolRegistry.get(toolCall.name);
    if (!tool) {
      throw new Error(`Tool not found: ${toolCall.name}`);
    }

    if (toolCall.name === 'execute_command' && context.agent.kind === 'worker') {
      const args = toolCall.arguments as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(args, 'outputs')) {
        throw new Error(
          'execute_command requires explicit outputs field (use outputs: [] when no files are produced)'
        );
      }
      if (!Array.isArray((args as { outputs?: unknown }).outputs)) {
        throw new Error('execute_command outputs must be an array of strings');
      }
    }

    await this.logger.log({
      timestamp: new Date(),
      level: 'info',
      taskId: context.task.id,
      agentId: context.agent.id,
      type: 'tool_call',
      content: `调用工具: ${toolCall.name}`,
      metadata: {
        toolName: toolCall.name,
        toolInput: toolCall.arguments,
        nodeId:
          context.agent.kind === 'worker' &&
          typeof context.agent.context.variables?.currentNodeId === 'string'
            ? context.agent.context.variables.currentNodeId
            : undefined,
      },
    });

    const { mkdir } = await import('fs/promises');
    const workingDirectory = path.resolve(process.cwd(), `data/workspaces/${context.task.id}`);
    try {
      await mkdir(workingDirectory, { recursive: true });
    } catch {
      // ignore
    }

    const startTime = Date.now();
    const toolContext: ToolContext = {
      taskId: context.task.id,
      agentId: context.agent.id,
      workingDirectory,
    };

    let result;
    try {
      result = await tool.execute(toolCall.arguments, toolContext);
    } catch (error) {
      result = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const duration = Date.now() - startTime;

    await this.logger.log({
      timestamp: new Date(),
      level: result.success ? 'info' : 'error',
      taskId: context.task.id,
      agentId: context.agent.id,
      type: 'tool_result',
      content: result.success ? '工具执行成功' : `工具执行失败: ${result.error}`,
      metadata: {
        toolName: toolCall.name,
        toolOutput: result.success ? result.data : result.error,
        duration,
        nodeId:
          context.agent.kind === 'worker' &&
          typeof context.agent.context.variables?.currentNodeId === 'string'
            ? context.agent.context.variables.currentNodeId
            : undefined,
      },
    });

    const nodeId =
      typeof context.agent.context.variables?.currentNodeId === 'string'
        ? context.agent.context.variables.currentNodeId
        : undefined;

    if (tool.name === 'write_file' && result.success) {
      await this.eventBus.publish({
        type: 'file.created',
        timestamp: new Date(),
        payload: {
          taskId: context.task.id,
          agentId: context.agent.id,
          nodeId,
          filePath: toolCall.arguments.path,
          fileSize: Buffer.byteLength(toolCall.arguments.content || '', 'utf-8'),
        },
      });
    }

    if (tool.name === 'execute_command' && result.success) {
      const outputs =
        (toolCall.arguments as any)?.outputs && Array.isArray((toolCall.arguments as any).outputs)
          ? ((toolCall.arguments as any).outputs as unknown[])
          : [];
      for (const p of outputs) {
        if (typeof p !== 'string' || !p.trim()) continue;
        await this.eventBus.publish({
          type: 'file.created',
          timestamp: new Date(),
          payload: {
            taskId: context.task.id,
            agentId: context.agent.id,
            nodeId,
            filePath: p,
            fileSize: 0,
          },
        });
      }
    }

    context.messages.push({
      role: 'tool',
      content: JSON.stringify(result.success ? result.data : { error: result.error }),
      toolCallId: toolCall.id,
    });

    return { success: result.success, duration };
  }

  private buildInitialMessages(agent: Agent, task: Task): Message[] {
    const workspaceRoot = path.resolve(process.cwd(), `data/workspaces/${task.id}`);
    const allowedTools = selectAllowedTools(this.toolRegistry.list(), agent.toolPolicy);
    const toolCatalog = formatToolCatalogSection(
      TOOL_CATALOG_TITLES.worker,
      groupToolsByCategory(allowedTools)
    );
    const systemPrompt = toolCatalog
      ? `${agent.context.systemPrompt}\n\n${toolCatalog}`
      : agent.context.systemPrompt;
    const workerBrief =
      agent.kind === 'worker' &&
      typeof agent.context.variables?.workerBrief === 'string' &&
      agent.context.variables.workerBrief.trim()
        ? `\n\n## 主控派工说明\n${agent.context.variables.workerBrief.trim()}\n`
        : '';

    const experienceHint =
      agent.kind === 'worker'
        ? `\n\n## 任务内经验（必读）\n- 工作区 \`docs/EXPERIENCE.md\` 由 **record_experience** 工具追加；开工前请 **read_file** 该文件（若存在），按标题/标签筛选与当前派工相关的条目。\n- 在你独立完成某一类问题且方案已验证后，在收尾前调用 **record_experience**（标题、场景、做法、避坑、标签），避免团队重复踩坑。\n`
        : '';

    return [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: `请完成以下任务:

标题: ${task.title}
描述: ${task.description || '无'}${workerBrief}${experienceHint}

## 工作空间（必须遵守）

- **任务工作空间根目录**：\`${workspaceRoot}\`
- **全局需求**：派工说明中「整体任务的需求」段由系统从 \`docs/REQUIREMENTS.md\`（或任务描述）注入；若需核对最新版可再 \`read_file\` \`docs/REQUIREMENTS.md\`
- **文件工具路径规则**：\`read_file\` / \`write_file\` / \`list_files\` 的 \`path\` / \`dir\` **优先使用相对路径**（相对上述根目录），例如 \`README.md\`、\`frontend/src/App.jsx\`、\`report.md\`
- **不要写到工作空间外**：任何路径最终都必须落在上述根目录内；若你误用系统绝对路径且不在该目录下，工具会拒绝执行

## 执行要求

1. **分析任务**：理解任务目标，规划执行步骤
2. **使用工具**：使用 write_file 等工具执行具体操作
3. **输出成品**：所有最终成果必须保存为文件！

## 成品输出规则（重要！）

以下类型的输出**必须**使用 write_file 工具保存为文件：
- 📄 **报告**：研究报告、分析报告、调研报告 → 保存为 report.md 或类似文件
- 📋 **规格说明**：PRD、技术规格、需求文档 → 保存为 spec.md 或 PRD.md
- 📖 **指南**：使用指南、部署指南、开发指南 → 保存为 GUIDE.md
- 📝 **文档**：API文档、架构文档、README → 保存为对应 .md 文件
- 💻 **代码**：源代码、脚本 → 保存为对应语言文件
- 📊 **数据**：JSON、CSV、配置文件 → 保存为对应格式文件

## 文件命名建议
- 使用有意义的英文名称
- Markdown 文档用 .md 后缀
- 代码文件用对应语言后缀
- 可以创建多个文件组织内容

完成后请简要总结：创建了哪些文件，存放在哪里。`,
      },
    ];
  }

  private async logCompletion(context: ExecutionContext, summary: string): Promise<void> {
    await this.logger.log({
      timestamp: new Date(),
      level: 'info',
      taskId: context.task.id,
      agentId: context.agent.id,
      type: 'milestone',
      content: `任务完成: ${summary}`,
      metadata: { totalIterations: context.iterationCount },
    });
  }

  // ===== log helpers (kept local to avoid leaking huge payloads) =====
}

function selectAllowedTools(all: Tool[], policy?: { categories?: string[]; allowTools?: string[]; denyTools?: string[] }): Tool[] {
  let out = all;
  if (policy?.categories?.length) {
    const cats = new Set(policy.categories);
    out = out.filter((t) => cats.has(t.category));
  }
  if (policy?.allowTools?.length) {
    const allow = new Set(policy.allowTools);
    out = out.filter((t) => allow.has(t.name));
  }
  if (policy?.denyTools?.length) {
    const deny = new Set(policy.denyTools);
    out = out.filter((t) => !deny.has(t.name));
  }
  return out;
}

function truncateForLog(input: unknown, maxChars: number): string {
  const s = typeof input === 'string' ? input : JSON.stringify(input);
  if (!s) return '';
  const out = s.length > maxChars ? `${s.slice(0, maxChars)}…(truncated)` : s;
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
