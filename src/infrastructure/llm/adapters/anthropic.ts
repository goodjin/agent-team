import Anthropic from '@anthropic-ai/sdk';
import {
  type LLMAdapter,
  type ChatRequest,
  type ChatResponse,
  type Message,
  type ToolCall,
  type TokenUsage,
  type ToolDefinition
} from '../types.js';

/**
 * Anthropic LLM适配器
 * 支持Claude模型和工具调用
 */
export class AnthropicAdapter implements LLMAdapter {
  private client: Anthropic;

  constructor(
    apiKey: string | undefined,
    private model: string = 'claude-3-5-sonnet-20241022'
  ) {
    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }
    this.client = new Anthropic({ apiKey });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // 转换消息格式
    const systemMessage = request.messages.find(m => m.role === 'system')?.content || '';
    const chatMessages = this.convertMessages(request.messages);

    // 转换工具定义
    const tools = request.tools?.map(this.convertToolDefinition);

    // 调用Anthropic API
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7,
      system: systemMessage,
      messages: chatMessages,
      tools: tools?.length ? tools : undefined
    });

    // 解析响应
    const message = this.parseResponse(response.content);

    return {
      message,
      usage: {
        prompt: response.usage.input_tokens,
        completion: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens
      }
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      // 简单的健康检查
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 转换消息格式为Anthropic格式
   */
  private convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue; // system消息单独处理

      if (msg.role === 'tool') {
        // 工具结果消息
        result.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.toolCallId || '',
            content: msg.content
          }]
        });
      } else if (msg.role === 'assistant' && msg.toolCalls) {
        // 包含工具调用的assistant消息
        const content: any[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments
          });
        }
        result.push({ role: 'assistant', content });
      } else {
        // 普通用户或assistant消息
        result.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        });
      }
    }

    return result;
  }

  /**
   * 转换工具定义
   */
  private convertToolDefinition(tool: ToolDefinition): Anthropic.Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Anthropic.Tool.InputSchema
    };
  }

  /**
   * 解析Anthropic响应
   */
  private parseResponse(content: any[]): Message {
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const block of content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, any>
        });
      }
    }

    return {
      role: 'assistant',
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }
}
