// LLM服务类型定义

/**
 * 消息角色
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * 工具调用
 */
export interface ToolCall {
  /** 工具调用唯一ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  arguments: Record<string, any>;
}

/**
 * 消息
 */
export interface Message {
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** 工具调用列表（仅assistant角色） */
  toolCalls?: ToolCall[];
  /** 工具调用ID（仅tool角色） */
  toolCallId?: string;
}

/**
 * 工具定义（用于传递给LLM）
 */
export interface ToolDefinition {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 工具参数JSON Schema */
  parameters: object;
}

/**
 * Token使用量
 */
export interface TokenUsage {
  /** 输入token数 */
  prompt: number;
  /** 输出token数 */
  completion: number;
  /** 总计 */
  total: number;
}

/**
 * 聊天请求
 */
export interface ChatRequest {
  /** 消息历史 */
  messages: Message[];
  /** 可用工具列表 */
  tools?: ToolDefinition[];
  /** 温度参数（0-2） */
  temperature?: number;
  /** 最大token数 */
  maxTokens?: number;
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  /** 响应消息 */
  message: Message;
  /** Token使用量 */
  usage: TokenUsage;
}

/**
 * LLM适配器接口
 */
export interface LLMAdapter {
  /**
   * 发送聊天请求
   */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * 检查适配器是否可用（API密钥有效）
   */
  isAvailable(): Promise<boolean>;
}
