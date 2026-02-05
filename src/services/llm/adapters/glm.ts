import type { LLMAdapter, ProviderConfig } from '../adapter.js';
import type { ChatRequest, ChatResponse, ChatMessage } from '../../../types/index.js';

interface GLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
  }>;
}

interface GLMChatParams {
  model: string;
  messages: GLMMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface GLMChatResponse {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export class GLMAdapter implements LLMAdapter {
  readonly provider = 'glm';
  readonly supportedModels: string[];

  private apiKey: string;
  private baseURL: string;
  private models: ProviderConfig['models'];

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://open.bigmodel.cn/api/paas/v4';
    this.models = config.models;
    this.supportedModels = Object.keys(config.models);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const modelConfig = this.getModelConfig(request.model);
    const glmRequest = this.buildRequest(request, modelConfig);

    const response = await this.callAPI<GLMChatResponse>('/chat/completions', glmRequest);

    return this.buildResponse(response, request.model);
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatResponse> {
    const modelConfig = this.getModelConfig(request.model);
    const glmRequest = this.buildRequest(request, modelConfig);
    glmRequest.stream = true;

    const response = await this.callAPI<Record<string, unknown>>('/chat/completions', glmRequest, true);

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
    throw new Error('Embeddings not directly supported by GLM API');
  }

  getModelList(): { id: string; name: string; maxTokens: number }[] {
    return Object.entries(this.models).map(([key, config]) => ({
      id: config.model,
      name: config.description || key,
      maxTokens: config.maxTokens || 128000,
    }));
  }

  getPricing(model: string): { input: number; output: number } {
    return { input: 0.005, output: 0.02 };
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

  private buildRequest(request: ChatRequest, modelConfig: ProviderConfig['models'][string]): GLMChatParams {
    const messages: GLMMessage[] = request.messages.map(msg => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    }));

    return {
      model: modelConfig.model,
      messages,
      temperature: request.temperature ?? modelConfig.temperature,
      max_tokens: request.maxTokens ?? modelConfig.maxTokens,
      stream: request.stream,
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
      throw new Error(`GLM API error: ${response.status} - ${error}`);
    }

    if (stream) {
      return response as unknown as T;
    }

    return response.json() as Promise<T>;
  }

  private buildResponse(response: GLMChatResponse, model?: string): ChatResponse {
    const choice = response.choices[0];

    return {
      id: response.id,
      model: response.model,
      choices: [{
        index: choice.index,
        message: {
          role: 'assistant',
          content: choice.message.content,
        },
        finishReason: choice.finish_reason,
      }],
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
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
