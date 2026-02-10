import { LLMConfigManager, LLMProviderConfig } from '../llm-config.js';
import { OpenAIAdapter } from './adapters/openai.js';
import { AnthropicAdapter } from './adapters/anthropic.js';
import { BigModelAdapter } from './adapters/bigmodel.js';
import type { LLMService } from './types.js';

export class LLMServiceFactory {
  constructor(private configManager: LLMConfigManager) {}

  /**
   * 创建 LLM 服务实例
   */
  create(providerName?: string, model?: string): LLMService {
    let providerConfig: LLMProviderConfig;

    if (providerName) {
      const config = this.configManager.getProvider(providerName);
      if (!config) {
        throw new Error(`Provider "${providerName}" not available`);
      }
      providerConfig = config;
    } else {
      // 按权重选择
      providerConfig = this.configManager.selectProvider();
    }

    return this.createAdapter(providerConfig, model);
  }

  /**
   * 为角色创建 LLM 服务
   */
  createForRole(role: string): LLMService {
    const providerConfig = this.configManager.getProviderForRole(role);

    if (!providerConfig) {
      throw new Error(`No provider configured for role "${role}"`);
    }

    return this.createAdapter(providerConfig);
  }

  /**
   * 创建适配器（带 Fallback）
   */
  createWithFallback(
    preferredProvider?: string,
    model?: string
  ): LLMService {
    // 尝试首选服务商
    if (preferredProvider) {
      try {
        return this.create(preferredProvider, model);
      } catch (error) {
        console.warn(`Failed to create ${preferredProvider}, trying fallback...`);
      }
    }

    // 按权重从高到低尝试
    const available = this.configManager.getAvailableProviders();
    available.sort((a, b) => b.weight - a.weight);

    for (const provider of available) {
      try {
        return this.createAdapter(provider, model);
      } catch (error) {
        console.warn(`Failed to create ${provider.name}, trying next...`);
      }
    }

    throw new Error('All providers failed');
  }

  /**
   * 根据配置创建适配器
   */
  private createAdapter(config: LLMProviderConfig, model?: string): LLMService {
    switch (config.provider) {
      case 'openai':
        return new OpenAIAdapter(config, model);
      case 'anthropic':
        return new AnthropicAdapter(config, model);
      case 'bigmodel':
        return new BigModelAdapter(config, model);
      default:
        throw new Error(`Unknown provider type: ${config.provider}`);
    }
  }
}
