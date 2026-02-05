import type { LLMAdapter, ProviderConfig } from '../adapter.js';
import type { ChatRequest, ChatResponse, ChatMessage, ToolCall, ToolDefinition } from '../../../types/index.js';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OpenAIToolCall[];
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIChatParams {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: any[];
  tool_choice?: any;
}

interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string | null;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIAdapter implements LLMAdapter {
  readonly provider = 'openai';
  readonly supportedModels: string[];

  private apiKey: string;
  private baseURL: string;
  private models: ProviderConfig['models'];

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.models = config.models;
    this.supportedModels = Object.keys(config.models);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const modelConfig = this.getModelConfig(request.model);
    const openaiRequest = this.buildRequest(request, modelConfig);

    const response = await this.callAPI<OpenAIChatResponse>('/chat/completions', openaiRequest);

    return this.buildResponse(response, request.model);
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatResponse> {
    const modelConfig = this.getModelConfig(request.model);
    const openaiRequest = this.buildRequest(request, modelConfig);
    openaiRequest.stream = true;

    const streamResponse = await this.callAPI<Record<string, unknown>>('/chat/completions', openaiRequest, true);

    const reader = (streamResponse as unknown as { body: ReadableStream }).body?.getReader();
    if (!reader) {
      return;
    }

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
              const choice = chunk.choices[0];
              yield this.buildChunkResponse(chunk, request.model);
            }
          } catch {
          }
        }
      }
    }
  }

  async embed(input: string | string[]): Promise<number[][]> {
    const embeddings = await this.callAPI<{ data: { embedding: number[] }[] }>('/embeddings', {
      model: this.getEmbeddingModel(),
      input: input,
    });

    return embeddings.data.map(item => item.embedding);
  }

  getModelList(): { id: string; name: string; maxTokens: number }[] {
    return Object.entries(this.models).map(([key, config]) => ({
      id: config.model,
      name: config.description || key,
      maxTokens: config.maxTokens || 4096,
    }));
  }

  getPricing(model: string): { input: number; output: number } {
    return { input: 0.01, output: 0.03 };
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

  private getEmbeddingModel(): string {
    for (const [key, config] of Object.entries(this.models)) {
      if (key.includes('embedding')) {
        return config.model;
      }
    }
    return 'text-embedding-3-small';
  }

  private buildRequest(request: ChatRequest, modelConfig: ProviderConfig['models'][string]): OpenAIChatParams {
    const messages: OpenAIMessage[] = request.messages.map(msg => this.convertMessage(msg));

    return {
      model: modelConfig.model,
      messages,
      temperature: request.temperature ?? modelConfig.temperature,
      max_tokens: request.maxTokens ?? modelConfig.maxTokens,
      stream: request.stream,
      tools: request.tools ? this.convertTools(request.tools) : undefined,
      tool_choice: request.toolChoice,
    };
  }

  private convertMessage(msg: ChatMessage): OpenAIMessage {
    const result: OpenAIMessage = {
      role: msg.role === 'tool' ? 'assistant' : msg.role,
      content: msg.content,
    };

    if (msg.toolCalls) {
      result.tool_calls = msg.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));
    }

    return result;
  }

  private convertTools(tools: any[]): any[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
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
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    if (stream) {
      return response as unknown as T;
    }

    return response.json() as Promise<T>;
  }

  private buildResponse(response: OpenAIChatResponse, model?: string): ChatResponse {
    return {
      id: response.id,
      model: response.model,
      choices: response.choices.map(choice => ({
        index: choice.index,
        message: {
          role: 'assistant',
          content: choice.message.content || '',
          toolCalls: choice.message.tool_calls?.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        },
        finishReason: choice.finish_reason || 'stop',
      })),
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
    };
  }

  private buildChunkResponse(chunk: any, model?: string): ChatResponse {
    const choice = chunk.choices[0];
    return {
      id: chunk.id || 'chunk',
      model: chunk.model || model || 'unknown',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: choice.delta?.content || '',
        },
        finishReason: choice.finish_reason || '',
      }],
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }
}
