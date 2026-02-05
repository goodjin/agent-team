/**
 * LLM Service
 * 统一 LLM 调用接口，支持多服务商和故障转移
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  TokenStats,
  ProviderInfo,
  ToolDefinition,
} from '../../types/index.js';
import { ConfigManager } from '../../config/config-manager.js';
import type { ProviderConfig, LLMConfigSection } from '../../config/types.js';

export interface LLMServiceOptions {
  configManager?: ConfigManager;
  defaultTimeout?: number;
  maxRetries?: number;
}

export class LLMService {
  private configManager: ConfigManager;
  private defaultTimeout: number;
  private maxRetries: number;
  private currentProvider: string;
  private tokenStats: TokenStats;
  private providers: Map<string, LLMProviderAdapter>;

  constructor(options: LLMServiceOptions = {}) {
    this.configManager = options.configManager || new ConfigManager();
    this.defaultTimeout = options.defaultTimeout || 60000;
    this.maxRetries = options.maxRetries || 3;
    this.currentProvider = '';
    this.tokenStats = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    this.providers = new Map();
  }

  async initialize(): Promise<void> {
    await this.configManager.loadConfig();
    this.currentProvider = this.configManager.getDefaultProvider();
    this.initializeAdapters();
  }

  private initializeAdapters(): void {
    const llmConfig = this.configManager.getLLMConfig();
    for (const [name, provider] of Object.entries(llmConfig.providers)) {
      if (provider.enabled) {
        const adapter = this.createAdapter(name, provider);
        if (adapter) {
          this.providers.set(name, adapter);
        }
      }
    }
  }

  private createAdapter(name: string, config: ProviderConfig): LLMProviderAdapter | null {
    switch (config.provider) {
      case 'openai':
        return new OpenAIAdapter(config);
      case 'anthropic':
        return new AnthropicAdapter(config);
      case 'ollama':
        return new OllamaAdapter(config);
      default:
        return new OpenAIAdapter(config);
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.providers.has(this.currentProvider)) {
      await this.initialize();
    }

    const providerName = request.model || this.currentProvider;
    const adapter = this.providers.get(providerName) || this.providers.get(this.currentProvider);

    if (!adapter) {
      throw new Error(`No available provider for: ${providerName}`);
    }

    const fallbackOrder = this.configManager.getFallbackOrder();
    const attemptedProviders: string[] = [];
    let lastError: Error | null = null;

    for (const provider of [providerName, ...fallbackOrder]) {
      if (attemptedProviders.includes(provider)) continue;
      attemptedProviders.push(provider);

      const currentAdapter = this.providers.get(provider);
      if (!currentAdapter) continue;

      try {
        const response = await this.executeWithRetry(
          () => currentAdapter.chat(request),
          provider
        );
        this.updateStats(response.usage);
        this.currentProvider = provider;
        return response;
      } catch (error) {
        lastError = error as Error;
        console.warn(`Provider ${provider} failed, trying fallback...`);
        this.recordFailure(provider);
      }
    }

    throw lastError || new Error('All providers failed');
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<ChatResponse> {
    if (!this.providers.has(this.currentProvider)) {
      await this.initialize();
    }

    const adapter = this.providers.get(this.currentProvider);
    if (!adapter) {
      throw new Error(`No available provider: ${this.currentProvider}`);
    }

    try {
      for await (const chunk of adapter.chatStream(request)) {
        this.updateStats(chunk.usage);
        yield chunk;
      }
    } catch (error) {
      const success = await this.failover(this.currentProvider);
      if (!success) {
        throw error;
      }
      yield* this.chatStream(request);
    }
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    provider: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.withTimeout(operation(), provider);
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    provider: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${provider} timeout`)), this.defaultTimeout)
      ),
    ]);
  }

  private updateStats(usage?: { promptTokens: number; completionTokens: number; totalTokens: number }): void {
    if (usage) {
      this.tokenStats.promptTokens += usage.promptTokens;
      this.tokenStats.completionTokens += usage.completionTokens;
      this.tokenStats.totalTokens += usage.totalTokens;
    }
  }

  private recordFailure(provider: string): void {
    // Track failures for smart failover decisions
  }

  getAvailableProviders(): ProviderInfo[] {
    try {
      const llmConfig = this.configManager.getLLMConfig();
      if (!llmConfig?.providers) {
        return [];
      }

      const providers: ProviderInfo[] = [];
      for (const [name, config] of Object.entries(llmConfig.providers)) {
        providers.push({
          name,
          enabled: config.enabled,
          models: Object.keys(config.models || {}),
        });
      }
      return providers;
    } catch {
      return [];
    }
  }

  getDefaultProvider(): string {
    return this.currentProvider;
  }

  setDefaultProvider(provider: string): void {
    try {
      const config = this.configManager.getProviderConfig(provider);
      if (config && config.enabled) {
        this.currentProvider = provider;
      } else {
        throw new Error(`Provider ${provider} is not available or disabled`);
      }
    } catch {
      throw new Error(`Provider ${provider} is not available or disabled`);
    }
  }

  async failover(provider: string): Promise<boolean> {
    try {
      const fallbackOrder = this.configManager.getFallbackOrder();
      if (!fallbackOrder || !Array.isArray(fallbackOrder)) {
        return false;
      }

      const currentIndex = fallbackOrder.indexOf(provider);
      if (currentIndex === -1) {
        return false;
      }

      for (let i = currentIndex + 1; i < fallbackOrder.length; i++) {
        const candidate = fallbackOrder[i];
        const config = this.configManager.getProviderConfig(candidate);
        if (config && config.enabled) {
          const health = await this.healthCheck(candidate);
          if (health) {
            this.currentProvider = candidate;
            return true;
          }
        }
      }
    } catch {
      return false;
    }

    return false;
  }

  getCurrentProvider(): string {
    return this.currentProvider;
  }

  getStats(): TokenStats {
    return { ...this.tokenStats };
  }

  resetStats(): void {
    this.tokenStats = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  async healthCheck(provider?: string): Promise<boolean> {
    const targetProvider = provider || this.currentProvider;
    const adapter = this.providers.get(targetProvider);

    if (!adapter) {
      return false;
    }

    try {
      return await adapter.healthCheck();
    } catch {
      return false;
    }
  }
}

interface LLMProviderAdapter {
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncGenerator<ChatResponse>;
  healthCheck(): Promise<boolean>;
}

class OpenAIAdapter implements LLMProviderAdapter {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const apiKey = this.config.apiKey;
    const baseURL = this.config.baseURL || 'https://api.openai.com/v1';

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.getModel(request.model),
        messages: request.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data: any = await response.json();

    return {
      id: data.id || uuidv4(),
      model: data.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: data.choices[0]?.message?.content || '',
        },
        finishReason: data.choices[0]?.finish_reason || 'stop',
      }],
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<ChatResponse> {
    const apiKey = this.config.apiKey;
    const baseURL = this.config.baseURL || 'https://api.openai.com/v1';

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.getModel(request.model),
        messages: request.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
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
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content || '';

            if (content) {
              yield {
                id: parsed.id || uuidv4(),
                model: parsed.model,
                choices: [{
                  index: 0,
                  message: {
                    role: 'assistant',
                    content,
                  },
                  finishReason: '',
                }],
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              };
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const apiKey = this.config.apiKey;
      const baseURL = this.config.baseURL || 'https://api.openai.com/v1';

      const response = await fetch(`${baseURL}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private getModel(requestedModel?: string): string {
    if (requestedModel) {
      const modelConfig = this.config.models[requestedModel];
      return modelConfig?.model || requestedModel;
    }
    const defaultModel = Object.values(this.config.models)[0];
    return defaultModel?.model || 'gpt-4';
  }
}

class AnthropicAdapter implements LLMProviderAdapter {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const apiKey = this.config.apiKey;

    const systemMessage = request.messages.find(m => m.role === 'system');
    const userMessages = request.messages.filter(m => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.getModel(request.model),
        max_tokens: request.maxTokens || 4000,
        temperature: request.temperature,
        system: systemMessage?.content || '',
        messages: userMessages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data: any = await response.json();

    return {
      id: data.id || uuidv4(),
      model: data.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: data.content[0]?.text || '',
        },
        finishReason: data.stop_reason || 'stop',
      }],
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<ChatResponse> {
    // Simplified: return non-streaming response for now
    const response = await this.chat(request);
    yield response;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const apiKey = this.config.apiKey;
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.getModel(),
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });
      return response.ok || response.status === 400;
    } catch {
      return false;
    }
  }

  private getModel(requestedModel?: string): string {
    if (requestedModel) {
      const modelConfig = this.config.models[requestedModel];
      return modelConfig?.model || requestedModel;
    }
    const defaultModel = Object.values(this.config.models)[0];
    return defaultModel?.model || 'claude-3-sonnet-20240229';
  }
}

class OllamaAdapter implements LLMProviderAdapter {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const baseURL = this.config.baseURL || 'http://localhost:11434';

    const response = await fetch(`${baseURL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.getModel(request.model),
        prompt: request.messages.map(m => m.content).join('\n'),
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data: any = await response.json();

    return {
      id: uuidv4(),
      model: data.model || this.getModel(request.model),
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: data.response || '',
        },
        finishReason: data.done ? 'stop' : 'length',
      }],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<ChatResponse> {
    const baseURL = this.config.baseURL || 'http://localhost:11434';

    const response = await fetch(`${baseURL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.getModel(request.model),
        prompt: request.messages.map(m => m.content).join('\n'),
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              yield {
                id: uuidv4(),
                model: this.getModel(request.model),
                choices: [{
                  index: 0,
                  message: { role: 'assistant', content: data.response },
                  finishReason: data.done ? 'stop' : '',
                }],
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              };
            }
            if (data.done) return;
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const baseURL = this.config.baseURL || 'http://localhost:11434';
      const response = await fetch(`${baseURL}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  private getModel(requestedModel?: string): string {
    if (requestedModel) {
      const modelConfig = this.config.models[requestedModel];
      return modelConfig?.model || requestedModel;
    }
    const defaultModel = Object.values(this.config.models)[0];
    return defaultModel?.model || 'llama2';
  }
}

let globalLLMService: LLMService | null = null;

export function getLLMService(options?: LLMServiceOptions): LLMService {
  if (!globalLLMService) {
    globalLLMService = new LLMService(options);
  }
  return globalLLMService;
}

export function setLLMService(service: LLMService): void {
  globalLLMService = service;
}

export function resetLLMService(): void {
  globalLLMService = null;
}
