import type { LLMAdapter, ProviderConfig } from '../adapter.js';
import type { ChatRequest, ChatResponse, ChatMessage } from '../../../types/index.js';

interface QwenMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface QwenChatParams {
  model: string;
  input: {
    messages: QwenMessage[];
  };
  parameters: {
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
  };
}

interface QwenChatResponse {
  output: {
    choices: Array<{
      finish_reason: string;
      message: {
        role: string;
        content: string;
      };
    }>;
  };
  usage: {
    total_tokens: number;
    output_tokens: number;
    input_tokens: number;
  };
  request_id: string;
}

export class QwenAdapter implements LLMAdapter {
  readonly provider = 'qwen';
  readonly supportedModels: string[];

  private apiKey: string;
  private baseURL: string;
  private models: ProviderConfig['models'];

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    this.models = config.models;
    this.supportedModels = Object.keys(config.models);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const modelConfig = this.getModelConfig(request.model);
    const qwenRequest = this.buildRequest(request, modelConfig);

    const response = await this.callAPI<QwenChatResponse>('/chat/completions', qwenRequest);

    return this.buildResponse(response, request.model);
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatResponse> {
    const modelConfig = this.getModelConfig(request.model);
    const qwenRequest = this.buildRequest(request, modelConfig);
    qwenRequest.parameters.stream = true;

    const response = await this.callAPI<Record<string, unknown>>('/chat/completions', qwenRequest, true);

    const reader = (response as unknown as { body: ReadableStream }).body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const chunk = JSON.parse(data);
            if (chunk.choices?.[0]) {
              yield this.buildChunkResponse(chunk, request.model);
            }
          } catch {
          }
        }
      }
    }
  }

  async embed(input: string | string[]): Promise<number[][]> {
    throw new Error('Embeddings not directly supported by Qwen API');
  }

  getModelList(): { id: string; name: string; maxTokens: number }[] {
    return Object.entries(this.models).map(([key, config]) => ({
      id: config.model,
      name: config.description || key,
      maxTokens: config.maxTokens || 131072,
    }));
  }

  getPricing(model: string): { input: number; output: number } {
    return { input: 0.002, output: 0.008 };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.callAPI('/models', {});
      return true;
    } catch {
      return false;
    }
  }

  private getModelConfig(model?: string): ProviderConfig['models'][string] {
    if (model && this.models[model]) {
      return this.models[model];
    }
    const defaultModel = Object.keys(this.models)[0];
    return this.models[defaultModel];
  }

  private buildRequest(request: ChatRequest, modelConfig: ProviderConfig['models'][string]): QwenChatParams {
    const messages: QwenMessage[] = request.messages.map(msg => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    }));

    return {
      model: modelConfig.model,
      input: { messages },
      parameters: {
        temperature: request.temperature ?? modelConfig.temperature,
        max_tokens: request.maxTokens ?? modelConfig.maxTokens,
        stream: request.stream,
      },
    };
  }

  private async callAPI<T>(endpoint: string, body: any, stream?: boolean): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Qwen API error: ${response.status} - ${error}`);
    }

    if (stream) {
      return response as unknown as T;
    }

    return response.json() as Promise<T>;
  }

  private buildResponse(response: QwenChatResponse, model?: string): ChatResponse {
    const choice = response.output.choices[0];

    return {
      id: response.request_id,
      model: model || 'qwen',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: choice.message.content,
        },
        finishReason: choice.finish_reason,
      }],
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.total_tokens,
      },
    };
  }

  private buildChunkResponse(chunk: any, model?: string): ChatResponse {
    const choice = chunk.choices?.[0];
    return {
      id: chunk.id || 'chunk',
      model: chunk.model || model || 'unknown',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: choice?.delta?.content || choice?.message?.content || '',
        },
        finishReason: choice?.finish_reason || '',
      }],
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }
}
