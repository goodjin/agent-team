import type { LLMProviderConfig } from '../../llm-config.js';
import type { ChatRequest, ChatResponse, LLMService } from '../types.js';

export class BigModelAdapter implements LLMService {
  public readonly provider: string;
  public readonly modelName: string;
  private baseURL: string;
  private apiKey: string;
  private timeout: number;

  constructor(private config: LLMProviderConfig, model?: string) {
    this.provider = config.name;
    this.modelName = model || Object.keys(config.models)[0];
    this.baseURL = config.baseURL || 'https://open.bigmodel.cn/api/paas/v4';
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model || this.modelName,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens,
          tools: request.tools,
          tool_choice: request.toolChoice,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`BigModel API error: ${response.status} ${error}`);
      }

      const data: any = await response.json();
      const choice = data.choices[0];

      return {
        id: data.id,
        model: data.model,
        content: choice.message.content || '',
        toolCalls: choice.message.tool_calls?.map((tc: any) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
        stopReason: this.mapStopReason(choice.finish_reason),
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
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
