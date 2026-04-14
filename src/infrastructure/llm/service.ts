import {
  type LLMAdapter,
  type ChatRequest,
  type ChatResponse
} from './types.js';

/**
 * LLM服务
 * 管理多个LLM提供商，支持故障转移
 */
export class LLMService {
  constructor(
    private adapters: Map<string, LLMAdapter>,
    private defaultProvider: string
  ) {}

  /**
   * 使用指定提供商发送聊天请求
   */
  async chat(request: ChatRequest, provider?: string): Promise<ChatResponse> {
    const adapter = this.adapters.get(provider || this.defaultProvider);
    if (!adapter) {
      throw new Error(`Provider not found: ${provider || this.defaultProvider}`);
    }
    return adapter.chat(request);
  }

  /**
   * 使用默认提供商发送聊天请求
   */
  async chatDefault(request: ChatRequest): Promise<ChatResponse> {
    return this.chat(request, this.defaultProvider);
  }

  /**
   * 故障转移：按顺序尝试所有可用的提供商
   */
  async chatWithFallback(request: ChatRequest): Promise<ChatResponse> {
    const errors: string[] = [];

    for (const [name, adapter] of this.adapters) {
      try {
        // 检查适配器是否可用
        const available = await adapter.isAvailable();
        if (!available) {
          errors.push(`${name}: Adapter not available`);
          continue;
        }

        // 尝试调用
        return await adapter.chat(request);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${name}: ${errorMsg}`);
        console.warn(`Provider ${name} failed, trying next...`);
      }
    }

    throw new Error(`All LLM providers failed:\n${errors.join('\n')}`);
  }

  /**
   * 获取所有提供商名称
   */
  getProviders(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * 获取默认提供商名称
   */
  getDefaultProvider(): string {
    return this.defaultProvider;
  }

  getAdapterMeta(provider?: string) {
    const name = provider || this.defaultProvider;
    const adapter = this.adapters.get(name);
    return adapter?.getMeta ? adapter.getMeta() : undefined;
  }

  /**
   * 检查指定提供商是否可用
   */
  async isProviderAvailable(provider: string): Promise<boolean> {
    const adapter = this.adapters.get(provider);
    if (!adapter) return false;
    return adapter.isAvailable();
  }
}
