import Anthropic from '@anthropic-ai/sdk';
import type { LLMProviderConfig } from '../../llm-config.js';
import type { ChatRequest, ChatResponse, LLMService, Message } from '../types.js';

export class AnthropicAdapter implements LLMService {
  private client: Anthropic;
  public readonly provider: string;
  public readonly modelName: string;

  constructor(private config: LLMProviderConfig, model?: string) {
    this.provider = config.name;
    this.modelName = model || Object.keys(config.models)[0];

    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // 分离系统消息
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const messages = request.messages.filter((m) => m.role !== 'system');

    const response = await this.client.messages.create({
      model: request.model || this.modelName,
      max_tokens: request.maxTokens || 4096,
      system: systemMessage?.content,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      temperature: request.temperature ?? 0.7,
      tools: request.tools,
      tool_choice: request.toolChoice && request.toolChoice !== 'required'
        ? { type: request.toolChoice as 'auto' | 'none' }
        : request.toolChoice === 'required'
        ? { type: 'any' }
        : undefined,
    });

    // 提取文本内容
    const textContent = response.content
      .filter((c) => c.type === 'text')
      .map((c: any) => c.text)
      .join('');

    // 提取工具调用
    const toolCalls = response.content
      .filter((c) => c.type === 'tool_use')
      .map((c: any) => ({
        id: c.id,
        type: 'function' as const,
        function: {
          name: c.name,
          arguments: JSON.stringify(c.input),
        },
      }));

    return {
      id: response.id,
      model: response.model,
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: this.mapStopReason(response.stop_reason),
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  private mapStopReason(reason: string | null): ChatResponse['stopReason'] {
    switch (reason) {
      case 'end_turn':
        return 'end_turn';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'stop';
    }
  }
}
