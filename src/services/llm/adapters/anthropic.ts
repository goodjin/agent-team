import type { LLMAdapter, ProviderConfig } from '../adapter.js';
import type { ChatRequest, ChatResponse, ChatMessage, ToolDefinition } from '../../../types/index.js';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'tool_use' | 'tool_result';
    text?: string;
    id?: string;
    name?: string;
    input?: string;
    result?: string;
  }>;
}

interface AnthropicChatParams {
  model: string;
  messages: AnthropicMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: any[];
}

interface AnthropicChatResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: 'text' | 'tool_use' | 'tool_result';
    text?: string;
    id?: string;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicAdapter implements LLMAdapter {
  readonly provider = 'anthropic';
  readonly supportedModels: string[];

  private apiKey: string;
  private baseURL: string;
  private models: ProviderConfig['models'];

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://api.anthropic.com/v1';
    this.models = config.models;
    this.supportedModels = Object.keys(config.models);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const modelConfig = this.getModelConfig(request.model);
    const anthropicRequest = this.buildRequest(request, modelConfig);

    const response = await this.callAPI<AnthropicChatResponse>('/messages', anthropicRequest);

    return this.buildResponse(response, request.model);
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatResponse> {
    const modelConfig = this.getModelConfig(request.model);
    const anthropicRequest = this.buildRequest(request, modelConfig);
    anthropicRequest.stream = true;

    const response = await this.callAPI<Record<string, unknown>>('/messages', anthropicRequest, true);

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
            if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
              yield this.buildChunkResponse(chunk, request.model);
            }
          } catch {
          }
        }
      }
    }
  }

  async embed(input: string | string[]): Promise<number[][]> {
    throw new Error('Embeddings not supported by Anthropic API');
  }

  getModelList(): { id: string; name: string; maxTokens: number }[] {
    return Object.entries(this.models).map(([key, config]) => ({
      id: config.model,
      name: config.description || key,
      maxTokens: config.maxTokens || 200000,
    }));
  }

  getPricing(model: string): { input: number; output: number } {
    return { input: 0.015, output: 0.075 };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.callAPI('/messages', { model: this.supportedModels[0], messages: [] });
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

  private buildRequest(request: ChatRequest, modelConfig: ProviderConfig['models'][string]): AnthropicChatParams {
    const messages: AnthropicMessage[] = request.messages
      .filter(m => m.role !== 'system')
      .map(msg => this.convertMessage(msg));

    const systemMessage = request.messages.find(m => m.role === 'system');

    const tools = request.tools?.map((tool: any) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));

    return {
      model: modelConfig.model,
      messages: systemMessage
        ? [{ role: 'user', content: systemMessage.content }, ...messages]
        : messages,
      max_tokens: request.maxTokens ?? modelConfig.maxTokens,
      temperature: request.temperature ?? modelConfig.temperature,
      stream: request.stream,
      tools,
    };
  }

  private convertMessage(msg: ChatMessage): AnthropicMessage {
    if (msg.role === 'tool') {
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            id: msg.toolCallId || '',
            result: msg.content,
          },
        ],
      };
    }

    if (msg.toolCalls) {
      return {
        role: 'assistant',
        content: msg.toolCalls.map(tc => ({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        })),
      };
    }

    return {
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    };
  }

  private async callAPI<T>(endpoint: string, body: any, stream?: boolean): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    if (stream) {
      return response as unknown as T;
    }

    return response.json() as Promise<T>;
  }

  private buildResponse(response: AnthropicChatResponse, model?: string): ChatResponse {
    const content = response.content.find(c => c.type === 'text');
    const toolUse = response.content.find(c => c.type === 'tool_use') as { type: string; id?: string; name?: string; input?: Record<string, unknown> } | undefined;

    return {
      id: response.id,
      model: response.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: content?.text || '',
          toolCalls: toolUse ? [{
            id: toolUse.id || '',
            type: 'function',
            function: {
              name: toolUse.name || '',
              arguments: JSON.stringify(toolUse.input || {}),
            },
          }] : undefined,
        },
        finishReason: response.stop_reason,
      }],
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  private buildChunkResponse(chunk: any, model?: string): ChatResponse {
    return {
      id: 'chunk',
      model: chunk.model || model || 'unknown',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: chunk.delta?.text || '',
        },
        finishReason: '',
      }],
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }
}
