import OpenAI from 'openai';
import type { LLMProviderConfig } from '../../llm-config.js';
import type { ChatRequest, ChatResponse, LLMService } from '../types.js';

export class OpenAIAdapter implements LLMService {
  private client: OpenAI;
  public readonly provider: string;
  public readonly modelName: string;

  constructor(private config: LLMProviderConfig, model?: string) {
    this.provider = config.name;
    this.modelName = model || Object.keys(config.models)[0];

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || undefined,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model || this.modelName,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      tools: request.tools,
      tool_choice: request.toolChoice,
    });

    const choice = response.choices[0];

    return {
      id: response.id,
      model: response.model,
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.type === 'function' ? tc.function.name : '',
          arguments: tc.type === 'function' ? tc.function.arguments : '',
        },
      })),
      stopReason: this.mapStopReason(choice.finish_reason),
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  }

  private mapStopReason(reason: string): ChatResponse['stopReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }
}
