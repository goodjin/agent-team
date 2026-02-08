import { EventEmitter } from 'events';
import { TokenManager } from './token-manager.js';
import { ContextCompressor } from './context-compressor.js';
import { ToolExecutor } from '../tools/tool-executor.js';
import type { LLMService } from '../services/llm/types.js';
import type { Message } from './context-compressor.js';

export interface Task {
  id: string;
  title: string;
  description: string;
  context?: Record<string, any>;
}

export interface ExecutionContext {
  workspaceDir: string;
  taskId: string;
  [key: string]: any;
}

export interface LoopResult {
  success: boolean;
  result?: string;
  error?: string;
  iterations: number;
  tokensUsed: number;
  toolCalls: number;
}

export interface AgentLoopOptions {
  maxIterations?: number;
  tokenBudget?: number;
  compressionThreshold?: number;
  keepRecentMessages?: number;
  systemPrompt?: string;
}

export class AgentLoop extends EventEmitter {
  private tokenManager: TokenManager;
  private contextCompressor: ContextCompressor;
  private toolExecutor: ToolExecutor;
  private llmService: LLMService;
  private options: Required<AgentLoopOptions>;
  private loopDetector: Map<string, number> = new Map();

  constructor(
    llmService: LLMService,
    toolExecutor: ToolExecutor,
    options: AgentLoopOptions = {}
  ) {
    super();

    this.llmService = llmService;
    this.toolExecutor = toolExecutor;

    this.options = {
      maxIterations: options.maxIterations ?? 10,
      tokenBudget: options.tokenBudget ?? 50000,
      compressionThreshold: options.compressionThreshold ?? 30000,
      keepRecentMessages: options.keepRecentMessages ?? 10,
      systemPrompt: options.systemPrompt ?? 'You are a helpful AI assistant.',
    };

    // 初始化组件
    this.tokenManager = new TokenManager(this.options.tokenBudget);
    this.contextCompressor = new ContextCompressor(this.tokenManager, {
      threshold: this.options.compressionThreshold,
      keepRecent: this.options.keepRecentMessages,
      strategy: 'sliding-window',
      llmService: this.llmService,
    });

    // 监听预算告警
    this.tokenManager.on('budget:warning', (event) => {
      this.emit('budget:warning', event);
    });

    this.tokenManager.on('budget:critical', (event) => {
      this.emit('budget:critical', event);
    });
  }

  /**
   * 执行任务
   */
  async execute(task: Task, context: ExecutionContext): Promise<LoopResult> {
    let iteration = 0;
    let toolCallCount = 0;
    const messages: Message[] = this.buildInitialMessages(task, context);

    this.emit('loop:started', {
      taskId: task.id,
      maxIterations: this.options.maxIterations,
    });

    try {
      while (iteration < this.options.maxIterations) {
        iteration++;

        this.emit('loop:iteration', {
          iteration,
          maxIterations: this.options.maxIterations,
          tokensUsed: this.tokenManager.getStats().used,
        });

        // 检查是否需要压缩上下文
        if (this.contextCompressor.needsCompression(messages)) {
          this.emit('context:compressing', {
            messageCount: messages.length,
            estimatedTokens: TokenManager.estimateMessagesTokens(messages),
          });

          const compressed = await this.contextCompressor.compress(messages);
          messages.length = 0;
          messages.push(...compressed);

          this.emit('context:compressed', {
            messageCount: messages.length,
            estimatedTokens: TokenManager.estimateMessagesTokens(messages),
          });
        }

        // 估算 Token 使用
        const estimatedTokens = TokenManager.estimateMessagesTokens(messages);

        // 检查预算
        if (!this.tokenManager.checkBudget(estimatedTokens + 2000)) {
          throw new Error('Token budget exceeded');
        }

        // 调用 LLM
        this.emit('llm:calling', {
          iteration,
          estimatedTokens,
        });

        const response = await this.llmService.chat({
          model: this.llmService.modelName,
          messages,
          temperature: 0.7,
          maxTokens: 4096,
          tools: this.toolExecutor.getToolDefinitions(),
          toolChoice: 'auto',
        });

        // 记录 Token 使用
        this.tokenManager.recordUsage(response.usage);

        this.emit('llm:response', {
          iteration,
          stopReason: response.stopReason,
          contentLength: response.content.length,
          toolCalls: response.toolCalls?.length || 0,
          tokensUsed: response.usage.totalTokens,
        });

        // 添加 Assistant 响应到消息列表
        messages.push({
          role: 'assistant',
          content: response.content,
        });

        // 检查是否完成
        if (response.stopReason === 'end_turn' || response.stopReason === 'stop') {
          if (!response.toolCalls || response.toolCalls.length === 0) {
            this.emit('loop:completed', {
              iterations: iteration,
              tokensUsed: this.tokenManager.getStats().used,
              toolCalls: toolCallCount,
            });

            return {
              success: true,
              result: response.content,
              iterations: iteration,
              tokensUsed: this.tokenManager.getStats().used,
              toolCalls: toolCallCount,
            };
          }
        }

        // 执行工具调用
        if (response.toolCalls && response.toolCalls.length > 0) {
          // 转换工具调用格式：LLM format -> ToolExecutor format
          const toolCalls = response.toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          }));

          // 检测循环
          if (this.detectLoop(toolCalls)) {
            throw new Error('Tool call loop detected');
          }

          this.emit('tools:executing', {
            iteration,
            toolCount: toolCalls.length,
          });

          const toolResults = await this.toolExecutor.executeBatch(toolCalls);

          toolCallCount += toolResults.length;

          this.emit('tools:executed', {
            iteration,
            results: toolResults.map((r) => ({
              name: r.name,
              success: r.success,
              duration: r.duration,
            })),
          });

          // 添加工具结果到消息列表
          const toolResultsText = toolResults
            .map(
              (r) =>
                `Tool: ${r.name}\nSuccess: ${r.success}\nResult: ${
                  r.success ? r.result : r.error
                }`
            )
            .join('\n\n');

          messages.push({
            role: 'user',
            content: `Tool execution results:\n\n${toolResultsText}`,
          });
        }
      }

      // 达到最大迭代次数
      throw new Error(`Max iterations (${this.options.maxIterations}) reached`);
    } catch (error: any) {
      this.emit('loop:error', {
        iterations: iteration,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
        iterations: iteration,
        tokensUsed: this.tokenManager.getStats().used,
        toolCalls: toolCallCount,
      };
    } finally {
      this.loopDetector.clear();
    }
  }

  /**
   * 构建初始消息
   */
  private buildInitialMessages(task: Task, context: ExecutionContext): Message[] {
    const messages: Message[] = [
      {
        role: 'system',
        content: this.options.systemPrompt,
      },
    ];

    // 添加任务描述
    let taskPrompt = `Task: ${task.title}\n\nDescription: ${task.description}`;

    // 添加上下文
    if (task.context) {
      taskPrompt += `\n\nContext:\n${JSON.stringify(task.context, null, 2)}`;
    }

    // 添加执行上下文
    taskPrompt += `\n\nExecution Context:\n`;
    taskPrompt += `- Workspace: ${context.workspaceDir}\n`;
    taskPrompt += `- Task ID: ${context.taskId}\n`;

    for (const [key, value] of Object.entries(context)) {
      if (key !== 'workspaceDir' && key !== 'taskId') {
        taskPrompt += `- ${key}: ${value}\n`;
      }
    }

    messages.push({
      role: 'user',
      content: taskPrompt,
    });

    return messages;
  }

  /**
   * 检测工具调用循环
   */
  private detectLoop(toolCalls: Array<{ name: string; arguments: string }>): boolean {
    for (const toolCall of toolCalls) {
      const key = `${toolCall.name}:${toolCall.arguments}`;
      const count = this.loopDetector.get(key) || 0;

      if (count >= 3) {
        // 同样的工具调用重复 3 次，认为是循环
        return true;
      }

      this.loopDetector.set(key, count + 1);
    }

    return false;
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.tokenManager.reset(this.options.tokenBudget);
    this.loopDetector.clear();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return this.tokenManager.getStats();
  }
}
