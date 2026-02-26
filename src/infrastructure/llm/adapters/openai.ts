import OpenAI from 'openai';
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
 * OpenAI LLM适配器
 * 支持GPT模型和Function Calling
 * 支持自定义baseURL（用于OpenAI兼容API）
 */
export class OpenAIAdapter implements LLMAdapter {
  private client: OpenAI;

  constructor(
    apiKey: string | undefined,
    private model: string = 'gpt-4o',
    baseURL?: string
  ) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || undefined // 使用自定义baseURL或默认值
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // 转换消息格式
    const messages = this.convertMessages(request.messages);

    // 转换工具定义
    const tools = request.tools?.map(this.convertToolDefinition);

    // 调用OpenAI API
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools: tools?.length ? tools : undefined,
      tool_choice: tools?.length ? 'auto' : undefined,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.7
    });

    const choice = response.choices[0];
    const message = choice.message;

    // 解析工具调用
    const toolCalls: ToolCall[] = [];
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        if ('function' in tc && tc.function) {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments)
          });
        }
      }
    }

    return {
      message: {
        role: 'assistant',
        content: message.content || '',
        toolCalls: toolCalls?.length ? toolCalls : undefined
      },
      usage: {
        prompt: response.usage?.prompt_tokens || 0,
        completion: response.usage?.completion_tokens || 0,
        total: response.usage?.total_tokens || 0
      }
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 转换消息格式为OpenAI格式
   */
  private convertMessages(messages: Message[]): any[] {
    const result: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'tool') {
        // 工具结果消息
        result.push({
          role: 'tool',
          tool_call_id: msg.toolCallId || '',
          content: msg.content
        });
      } else if (msg.role === 'assistant' && msg.toolCalls) {
        // 包含工具调用的assistant消息
        result.push({
          role: 'assistant',
          content: msg.content,
          tool_calls: msg.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments)
            }
          }))
        });
      } else {
        // 普通消息
        result.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    return result;
  }

  /**
   * 转换工具定义
   */
  private convertToolDefinition(tool: ToolDefinition): any {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as Record<string, unknown>
      }
    };
  }
}
