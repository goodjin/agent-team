import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

/**
 * LLM提供商配置
 */
export interface LLMProviderConfig {
  /** 提供商名称（唯一标识） */
  name: string;
  /** 提供商类型：anthropic | openai */
  type: 'anthropic' | 'openai';
  /** API密钥 */
  apiKey: string;
  /** 模型名称 */
  model: string;
  /** 是否启用 */
  enabled: boolean;
  /** 优先级（数字越小优先级越高） */
  priority: number;
  /** 温度参数 */
  temperature?: number;
  /** 最大token数 */
  maxTokens?: number;
  /** 自定义API地址（用于OpenAI兼容API） */
  baseURL?: string;
}

/**
 * LLM配置文件结构
 */
export interface LLMConfig {
  /** 提供商列表 */
  providers: LLMProviderConfig[];
  /** 默认提供商名称 */
  defaultProvider: string;
}

/**
 * 外部LLM服务配置格式（~/.llm/llm_services.json）
 */
interface ExternalLLMServiceConfig {
  version?: string;
  services: ExternalLLMService[];
}

interface ExternalLLMService {
  id: string;
  name: string;
  weight: number;
  baseURL: string;
  model: string;
  apiKey: string;
  maxTokens?: number;
  capabilityTags?: string[];
  description?: string;
}

const DEFAULT_CONFIG: LLMConfig = {
  providers: [
    {
      name: 'anthropic',
      type: 'anthropic',
      apiKey: '',
      model: 'claude-3-5-sonnet-20241022',
      enabled: true,
      priority: 1
    },
    {
      name: 'openai',
      type: 'openai',
      apiKey: '',
      model: 'gpt-4o',
      enabled: false,
      priority: 2
    }
  ],
  defaultProvider: 'anthropic'
};

/**
 * 获取配置文件路径
 */
function getConfigPath(): string {
  return join(homedir(), '.llm', 'llm_services.json');
}

/**
 * 加载LLM配置
 * 从 ~/.llm/llm_services.json 读取配置
 * 支持两种格式：
 * 1. 新格式: { providers: [...], defaultProvider: "..." }
 * 2. 外部格式: { version: "...", services: [...] }
 */
export function loadLLMConfig(): LLMConfig {
  const configPath = getConfigPath();

  // 如果配置文件不存在，创建默认配置
  if (!existsSync(configPath)) {
    ensureConfigDir();
    saveLLMConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const rawConfig = JSON.parse(content);

    // 检测配置格式
    if ('services' in rawConfig && Array.isArray(rawConfig.services)) {
      // 外部格式：转换为新格式
      return convertExternalConfig(rawConfig as ExternalLLMServiceConfig);
    } else if ('providers' in rawConfig && Array.isArray(rawConfig.providers)) {
      // 新格式：直接使用
      return validateAndMergeConfig(rawConfig as LLMConfig);
    } else {
      console.warn('Unknown config format, using defaults');
      return DEFAULT_CONFIG;
    }
  } catch (error) {
    console.warn('Failed to load LLM config, using defaults:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * 转换外部配置格式为内部格式
 */
function convertExternalConfig(external: ExternalLLMServiceConfig): LLMConfig {
  const providers: LLMProviderConfig[] = external.services
    .filter(s => s.weight > 0 && s.apiKey) // 只启用weight > 0的服务
    .map((service, index) => ({
      name: service.id,
      type: 'openai' as const, // 外部服务都是OpenAI兼容格式
      apiKey: service.apiKey,
      model: service.model,
      enabled: service.weight > 0,
      priority: index + 1,
      maxTokens: service.maxTokens,
      baseURL: service.baseURL
    }));

  // 按weight排序（weight越大优先级越高）
  const sortedServices = external.services.filter(s => s.weight > 0 && s.apiKey);
  sortedServices.sort((a, b) => b.weight - a.weight);

  const sortedProviders = sortedServices.map((service, index) => ({
    name: service.id,
    type: 'openai' as const,
    apiKey: service.apiKey,
    model: service.model,
    enabled: true,
    priority: index + 1,
    maxTokens: service.maxTokens,
    baseURL: service.baseURL
  }));

  const defaultProvider = sortedProviders.length > 0 ? sortedProviders[0].name : '';

  return {
    providers: sortedProviders,
    defaultProvider
  };
}

/**
 * 保存LLM配置
 */
export function saveLLMConfig(config: LLMConfig): void {
  const configPath = getConfigPath();
  ensureConfigDir();

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save LLM config:', error);
  }
}

/**
 * 确保配置目录存在
 */
function ensureConfigDir(): void {
  const configDir = dirname(getConfigPath());
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
}

/**
 * 验证并合并配置
 * 确保必要字段存在
 */
function validateAndMergeConfig(config: Partial<LLMConfig>): LLMConfig {
  const merged: LLMConfig = {
    providers: config.providers || DEFAULT_CONFIG.providers,
    defaultProvider: config.defaultProvider || DEFAULT_CONFIG.defaultProvider
  };

  // 验证每个提供商配置
  merged.providers = merged.providers.map((provider, index) => ({
    name: provider.name || `provider-${index}`,
    type: provider.type || 'anthropic',
    apiKey: provider.apiKey || '',
    model: provider.model || (provider.type === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o'),
    enabled: provider.enabled ?? true,
    priority: provider.priority ?? index + 1,
    temperature: provider.temperature,
    maxTokens: provider.maxTokens
  }));

  // 按优先级排序
  merged.providers.sort((a, b) => a.priority - b.priority);

  // 验证默认提供商是否存在
  const defaultExists = merged.providers.some(p => p.name === merged.defaultProvider);
  if (!defaultExists && merged.providers.length > 0) {
    merged.defaultProvider = merged.providers[0].name;
  }

  return merged;
}

/**
 * 获取启用的提供商配置
 */
export function getEnabledProviders(config: LLMConfig): LLMProviderConfig[] {
  return config.providers.filter(p => p.enabled && p.apiKey);
}

/**
 * 获取默认提供商配置
 */
export function getDefaultProvider(config: LLMConfig): LLMProviderConfig | undefined {
  return config.providers.find(p => p.name === config.defaultProvider);
}

/**
 * 从环境变量覆盖配置
 */
export function overrideConfigFromEnv(config: LLMConfig): LLMConfig {
  const newConfig = { ...config, providers: [...config.providers] };

  // 支持的环境变量映射
  const envMappings: Record<string, string> = {
    'ANTHROPIC_API_KEY': 'anthropic',
    'OPENAI_API_KEY': 'openai'
  };

  for (const [envVar, providerName] of Object.entries(envMappings)) {
    const envValue = process.env[envVar];
    if (envValue) {
      const providerIndex = newConfig.providers.findIndex(p => p.name === providerName);
      if (providerIndex >= 0) {
        newConfig.providers[providerIndex] = {
          ...newConfig.providers[providerIndex],
          apiKey: envValue,
          enabled: true
        };
      }
    }
  }

  return newConfig;
}
