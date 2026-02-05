import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ToolCall,
  ToolDefinition,
  TokenStats,
  ProviderInfo
} from '../../types/index.js';

export type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ToolCall,
  ToolDefinition,
  TokenStats,
  ProviderInfo
};

export interface LLMAdapter {
  readonly provider: string;
  readonly supportedModels: string[];

  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<ChatResponse>;

  embed(input: string | string[]): Promise<number[][]>;

  getModelList(): { id: string; name: string; maxTokens: number }[];
  getPricing(model: string): { input: number; output: number };

  healthCheck(): Promise<boolean>;
}

export interface LLMAdapterFactory {
  createAdapter(config: ProviderConfig): LLMAdapter;
  getAdapter(provider: string): LLMAdapter | null;
  registerAdapter(provider: string, adapterClass: new (config: ProviderConfig) => LLMAdapter): void;
  getRegisteredProviders(): string[];
}

export interface ProviderConfig {
  name: string;
  provider: string;
  apiKey: string;
  baseURL?: string;
  enabled: boolean;
  models: {
    [modelName: string]: {
      model: string;
      maxTokens?: number;
      temperature?: number;
      description?: string;
    };
  };
}

export interface LLMConfig {
  defaultProvider: string;
  providers: { [providerName: string]: ProviderConfig };
  fallbackOrder?: string[];
}
