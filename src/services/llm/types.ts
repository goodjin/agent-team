export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  tools?: any[];
  toolChoice?: 'auto' | 'required' | 'none';
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResponse {
  id: string;
  model: string;
  content: string;
  toolCalls?: ToolCall[];
  stopReason: 'stop' | 'length' | 'tool_calls' | 'end_turn';
  usage: TokenUsage;
}

export interface LLMService {
  chat(request: ChatRequest): Promise<ChatResponse>;
  readonly provider: string;
  readonly modelName: string;
}
