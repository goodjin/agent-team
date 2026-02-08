import { TokenManager } from './token-manager.js';
import type { LLMService } from '../services/llm/types.js';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompressionOptions {
  /**
   * Token 阈值，超过此值触发压缩
   */
  threshold: number;

  /**
   * 保留最近 N 条消息
   */
  keepRecent: number;

  /**
   * 压缩策略
   */
  strategy: 'sliding-window' | 'summarization';

  /**
   * 总结用的 LLM 服务（仅在 summarization 策略下使用）
   */
  llmService?: LLMService;
}

export class ContextCompressor {
  constructor(
    private tokenManager: TokenManager,
    private options: CompressionOptions
  ) {}

  /**
   * 检查是否需要压缩
   */
  needsCompression(messages: Message[]): boolean {
    const estimatedTokens = TokenManager.estimateMessagesTokens(messages);
    return estimatedTokens > this.options.threshold;
  }

  /**
   * 压缩上下文
   */
  async compress(messages: Message[]): Promise<Message[]> {
    if (!this.needsCompression(messages)) {
      return messages;
    }

    switch (this.options.strategy) {
      case 'sliding-window':
        return this.compressSlidingWindow(messages);
      case 'summarization':
        return await this.compressSummarization(messages);
      default:
        return messages;
    }
  }

  /**
   * 滑动窗口策略
   */
  private compressSlidingWindow(messages: Message[]): Message[] {
    // 分离系统消息和对话消息
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // 保留最近的 N 条消息
    const recentMessages = conversationMessages.slice(-this.options.keepRecent);

    // 组合：系统消息 + 最近消息
    return [...systemMessages, ...recentMessages];
  }

  /**
   * 智能总结策略
   */
  private async compressSummarization(messages: Message[]): Promise<Message[]> {
    if (!this.options.llmService) {
      // 如果没有 LLM 服务，回退到滑动窗口
      return this.compressSlidingWindow(messages);
    }

    // 分离系统消息和对话消息
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // 保留最近的消息
    const recentMessages = conversationMessages.slice(-this.options.keepRecent);

    // 需要总结的消息
    const toSummarize = conversationMessages.slice(
      0,
      -this.options.keepRecent
    );

    if (toSummarize.length === 0) {
      return messages;
    }

    // 生成总结
    const summary = await this.summarizeMessages(toSummarize);

    // 组合：系统消息 + 总结 + 最近消息
    return [
      ...systemMessages,
      {
        role: 'assistant' as const,
        content: `[Previous conversation summary]\n${summary}`,
      },
      ...recentMessages,
    ];
  }

  /**
   * 总结消息
   */
  private async summarizeMessages(messages: Message[]): Promise<string> {
    if (!this.options.llmService) {
      throw new Error('LLM service required for summarization');
    }

    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n\n');

    const response = await this.options.llmService.chat({
      model: this.options.llmService.modelName,
      messages: [
        {
          role: 'system',
          content:
            'Summarize the following conversation concisely, preserving key information and decisions. Focus on facts, not opinions.',
        },
        {
          role: 'user',
          content: conversationText,
        },
      ],
      temperature: 0.3,
      maxTokens: 1000,
    });

    return response.content;
  }

  /**
   * 估算压缩后的 Token 数量
   */
  estimateCompressedTokens(messages: Message[]): number {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    let estimated = 0;

    // 系统消息
    estimated += TokenManager.estimateMessagesTokens(systemMessages);

    // 最近消息
    const recentMessages = conversationMessages.slice(-this.options.keepRecent);
    estimated += TokenManager.estimateMessagesTokens(recentMessages);

    if (this.options.strategy === 'summarization') {
      // 总结大约 500-1000 tokens
      estimated += 750;
    }

    return estimated;
  }
}
