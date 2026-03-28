import { EventEmitter } from 'events';
import { Agent } from '../../domain/agent/index.js';
import { Task } from '../../domain/task/index.js';
import { ToolRegistry, ToolContext } from '../../domain/tool/index.js';
import { LLMService, Message, ToolCall } from '../../infrastructure/llm/index.js';
import { ILogger } from '../../infrastructure/logger/index.js';
import { IEventBus } from '../../infrastructure/event-bus/index.js';
import type { ContextCompressor } from '../memory/context-compressor.js';
import { formatLLMProviderError, llmErrorMetadata } from '../../infrastructure/llm/error-format.js';
import * as path from 'path';

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

    const tools = this.toolRegistry.list().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    let response;
    try {
      response = await this.llmService.chatDefault({
        messages: context.messages,
        tools,
        temperature: 0.7,
        maxTokens: 4000,
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
    const tool = this.toolRegistry.get(toolCall.name);
    if (!tool) {
      throw new Error(`Tool not found: ${toolCall.name}`);
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
      },
    });

    if (tool.name === 'write_file' && result.success) {
      await this.eventBus.publish({
        type: 'file.created',
        timestamp: new Date(),
        payload: {
          taskId: context.task.id,
          filePath: toolCall.arguments.path,
          fileSize: Buffer.byteLength(toolCall.arguments.content || '', 'utf-8'),
        },
      });
    }

    context.messages.push({
      role: 'tool',
      content: JSON.stringify(result.success ? result.data : { error: result.error }),
      toolCallId: toolCall.id,
    });

    return { success: result.success, duration };
  }

  private buildInitialMessages(agent: Agent, task: Task): Message[] {
    const workerBrief =
      agent.kind === 'worker' &&
      typeof agent.context.variables?.workerBrief === 'string' &&
      agent.context.variables.workerBrief.trim()
        ? `\n\n## 主控派工说明\n${agent.context.variables.workerBrief.trim()}\n`
        : '';

    return [
      {
        role: 'system',
        content: agent.context.systemPrompt,
      },
      {
        role: 'user',
        content: `请完成以下任务:

标题: ${task.title}
描述: ${task.description || '无'}${workerBrief}

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
}
