import type { LLMProvider, LLMConfig } from '../types/index.js';
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

/**
 * 替换环境变量
 */
function expandEnvVars(value: string): string {
  if (!value) return value;

  // 匹配 ${VAR_NAME} 格式
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] || value;
  });
}

/**
 * LLM 服务商配置
 */
export interface LLMProviderConfig {
  name: string;
  provider: LLMProvider;
  apiKey: string;
  baseURL?: string;
  weight: number;
  models: {
    [key: string]: {
      model: string;
      maxTokens?: number;
      temperature?: number;
      description?: string;
    };
  };
  enabled?: boolean;
  timeout?: number;
  maxRetries?: number;
}

/**
 * 角色专属配置
 */
export interface RoleProviderMappingItem {
  providerName: string;
  modelName?: string;
}

export interface RoleProviderMapping {
  [roleType: string]: RoleProviderMappingItem | RoleProviderMappingItem[];
}

/**
 * LLM 配置文件结构
 */
export interface LLMSettingsFile {
  version: string;
  defaultProvider: string;
  providers: {
    [key: string]: LLMProviderConfig;
  };
  roleMapping?: RoleProviderMapping;
  fallbackOrder?: string[];
}

/**
 * 配置验证结果
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    totalProviders: number;
    enabledProviders: number;
    readyToUse: number;
  };
  providers: Array<{
    name: string;
    enabled: boolean;
    hasApiKey: boolean;
    weight: number;
    readyToUse: boolean;
  }>;
  recommendations: string[];
}

/**
 * LLM 配置管理器
 * 支持多服务商、角色专属配置、故障转移
 */
export class LLMConfigManager {
  private settings: LLMSettingsFile | null = null;
  private settingsPath: string | null = null;

  /**
   * 从配置文件加载设置（支持 JSON 和 YAML）
   */
  async loadFromFile(filePath: string): Promise<LLMSettingsFile> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();
      
      // 根据文件扩展名选择解析方式
      if (ext === '.yaml' || ext === '.yml') {
        // YAML 格式（统一配置文件）
        const yamlConfig = yaml.load(content) as any;

        // 转换为 LLMSettingsFile 格式
        if (yamlConfig.llm) {
          this.settings = {
            version: yamlConfig.version || '1.0.0',
            defaultProvider: yamlConfig.llm.defaultProvider || 'zhipu-primary',
            providers: {},
            roleMapping: yamlConfig.llm.roleMapping || {},
            fallbackOrder: yamlConfig.llm.fallbackOrder || [],
          };

          // 转换提供商配置
          for (const [name, provider] of Object.entries(yamlConfig.llm.providers || {})) {
            const p = provider as any;
            const models: any = {};

            // 转换模型配置
            for (const [modelKey, model] of Object.entries(p.models || {})) {
              const m = model as any;
              models[modelKey] = {
                model: m.model || modelKey,
                maxTokens: m.maxTokens,
                temperature: m.temperature,
                description: m.description,
              };
            }

            this.settings.providers[name] = {
              name: p.name || name,
              provider: p.provider || 'openai',
              apiKey: p.apiKey || '',
              baseURL: p.baseURL,
              weight: p.weight || 0,
              models,
              enabled: p.enabled !== false, // 默认启用
              timeout: p.timeout,
              maxRetries: p.maxRetries,
            };
          }
        } else {
          // 如果不是统一配置格式，尝试直接解析
          this.settings = yamlConfig as LLMSettingsFile;

          // 转换 roleMapping 格式（provider -> providerName, model -> modelName）
          if (this.settings.roleMapping) {
            const convertedMapping: RoleProviderMapping = {};
            for (const [role, mapping] of Object.entries(this.settings.roleMapping)) {
              const m = mapping as any;
              if (m.provider) {
                convertedMapping[role] = {
                  providerName: m.provider,
                  modelName: m.model,
                };
              } else {
                convertedMapping[role] = mapping;
              }
            }
            this.settings.roleMapping = convertedMapping;
          }
        }
      } else {
        // JSON 格式（旧格式）
        this.settings = JSON.parse(content);
      }
      
      this.settingsPath = filePath;

      // 展开环境变量
      this.expandEnvVars();

      // 验证配置
      this.validateSettings(this.settings!);

      return this.settings!;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load LLM config from ${filePath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 展开所有环境变量
   */
  private expandEnvVars(): void {
    if (!this.settings) return;

    for (const provider of Object.values(this.settings.providers)) {
      provider.apiKey = expandEnvVars(provider.apiKey);
      if (provider.baseURL) {
        provider.baseURL = expandEnvVars(provider.baseURL);
      }
    }
  }

  /**
   * 从对象加载设置
   */
  loadFromObject(settings: LLMSettingsFile): void {
    this.validateSettings(settings);
    this.settings = settings;
  }

  /**
   * 验证配置
   */
  private validateSettings(settings: LLMSettingsFile): void {
    if (!settings.providers || Object.keys(settings.providers).length === 0) {
      throw new Error('LLM settings must have at least one provider');
    }

    if (!settings.defaultProvider || !settings.providers[settings.defaultProvider]) {
      throw new Error('LLM settings must have a valid defaultProvider');
    }

    // 验证每个服务商配置（不强制要求 apiKey，允许为空或占位符）
    for (const [name, provider] of Object.entries(settings.providers)) {
      if (!provider.provider) {
        throw new Error(`Provider "${name}" must have a provider type`);
      }
      if (!provider.models || Object.keys(provider.models).length === 0) {
        throw new Error(`Provider "${name}" must have at least one model`);
      }
    }

    // 验证角色映射
    if (settings.roleMapping) {
      for (const [role, mapping] of Object.entries(settings.roleMapping)) {
        const mappings = Array.isArray(mapping) ? mapping : [mapping];
        for (const item of mappings) {
          if (!settings.providers[item.providerName]) {
            throw new Error(`Role "${role}" maps to unknown provider "${item.providerName}"`);
          }
        }
      }
    }
  }

  /**
   * 检查服务商是否可用（已启用且有有效的 API key）
   */
  hasValidApiKey(providerName: string): boolean {
    const provider = this.getProvider(providerName);
    if (!provider) return false;

    // 首先检查是否启用
    if (provider.enabled === false) {
      return false;
    }

    const key = provider.apiKey;
    // 检查是否为空或占位符
    if (!key || key.trim() === '' || key.startsWith('your_') || key === 'sk-xxxxx') {
      return false;
    }

    return true;
  }

  /**
   * 检查服务商是否启用（不考虑 API key）
   */
  isEnabled(providerName: string): boolean {
    const provider = this.getProvider(providerName);
    if (!provider) return false;

    // enabled 字段不存在时默认为 true（向后兼容）
    return provider.enabled !== false;
  }

  /**
   * 获取第一个有有效 API key 的服务商
   * 优先使用 defaultProvider，然后按照 fallbackOrder 查找
   * 只考虑启用的服务商（enabled !== false）
   */
  getFirstAvailableProvider(): string | null {
    // 1. 先尝试默认服务商
    const defaultName = this.settings?.defaultProvider;
    if (defaultName && this.hasValidApiKey(defaultName)) {
      return defaultName;
    }

    // 2. 按照 fallbackOrder 查找
    const fallbackOrder = this.getFallbackOrder();
    for (const providerName of fallbackOrder) {
      // 跳过已经检查过的默认服务商
      if (providerName === defaultName) continue;

      const provider = this.getProvider(providerName);
      if (!provider) continue;

      // 检查是否启用
      if (provider.enabled === false) {
        // 静默跳过未启用的服务商
        continue;
      }

      if (this.hasValidApiKey(providerName)) {
        return providerName;
      }
    }

    return null;
  }

  /**
   * 获取默认服务商配置
   */
  getDefaultProvider(): LLMProviderConfig | null {
    if (!this.settings) return null;

    const defaultName = this.settings.defaultProvider;
    return this.settings.providers[defaultName] || null;
  }

  /**
   * 获取指定服务商配置
   */
  getProvider(name: string): LLMProviderConfig | null {
    if (!this.settings) return null;
    return this.settings.providers[name] || null;
  }

  /**
   * 获取角色专属配置
   */
  private normalizeRoleMappings(roleType: string): RoleProviderMappingItem[] {
    const mapping = this.settings?.roleMapping?.[roleType];
    if (!mapping) {
      return [];
    }
    return Array.isArray(mapping) ? mapping : [mapping];
  }

  /**
   * 获取角色专属配置
   */
  getRoleProvider(roleType: string): LLMProviderConfig | null {
    if (!this.settings) {
      return null;
    }

    const mappings = this.normalizeRoleMappings(roleType);
    for (const mapping of mappings) {
      if (!this.isEnabled(mapping.providerName)) {
        continue;
      }
      if (!this.hasValidApiKey(mapping.providerName)) {
        continue;
      }
      const provider = this.getProvider(mapping.providerName);
      if (provider) {
        return provider;
      }
    }

    return this.getDefaultProvider();
  }

  /**
   * 获取角色的 LLM 配置
   * 自动选择有有效 API key 的服务商
   */
  getRoleLLMConfig(roleType: string): LLMConfig | null {
    const mappings = this.normalizeRoleMappings(roleType);
    let selectedMapping: RoleProviderMappingItem | null = null;
    let provider: LLMProviderConfig | null = null;
    let providerName: string | undefined;

    for (const mapping of mappings) {
      if (!this.isEnabled(mapping.providerName)) {
        continue;
      }
      if (!this.hasValidApiKey(mapping.providerName)) {
        continue;
      }
      const candidate = this.getProvider(mapping.providerName);
      if (candidate) {
        provider = candidate;
        providerName = mapping.providerName;
        selectedMapping = mapping;
        break;
      }
    }

    // 如果没有找到合适的角色映射，尝试默认服务商
    if (!provider) {
      provider = this.getDefaultProvider();
      providerName = this.settings?.defaultProvider;
      selectedMapping = null;
    }

    // 如果当前 provider 没有有效的 API key，寻找第一个可用的
    if (provider && providerName && !this.hasValidApiKey(providerName)) {
      const firstAvailable = this.getFirstAvailableProvider();
      if (firstAvailable) {
        console.warn(`⚠️  当前服务商 ${providerName} 没有有效的 API key，使用 ${firstAvailable}`);
        provider = this.getProvider(firstAvailable);
        providerName = firstAvailable;
        selectedMapping = null;
      } else {
        console.warn(`⚠️  没有找到任何有有效 API key 的服务商`);
        return null;
      }
    }

    if (!provider) return null;

    // 获取模型配置
    const preferredModelName = selectedMapping?.modelName;
    let modelConfig: any;

    if (preferredModelName) {
      modelConfig = provider.models[preferredModelName];
    }

    if (!modelConfig) {
      modelConfig = Object.values(provider.models)[0];
    }

    if (!modelConfig) {
      return null;
    }

    return {
      provider: provider.provider,
      apiKey: provider.apiKey,
      model: modelConfig.model,
      baseURL: provider.baseURL,
      maxTokens: modelConfig.maxTokens,
      temperature: modelConfig.temperature,
    };
  }

  /**
   * 获取所有启用的服务商
   */
  getEnabledProviders(): LLMProviderConfig[] {
    if (!this.settings) return [];

    return Object.values(this.settings.providers)
      .filter(p => p.enabled !== false);
  }

  /**
   * 获取可用的服务商列表
   * 过滤掉 weight=0 或 apiKey 为空的服务商
   */
  getAvailableProviders(): LLMProviderConfig[] {
    if (!this.settings) {
      throw new Error('Config not loaded');
    }

    return Object.values(this.settings.providers).filter(
      (provider) =>
        provider.enabled !== false &&
        provider.weight > 0 &&
        provider.apiKey !== '' &&
        !provider.apiKey.startsWith('${')
    );
  }

  /**
   * 按权重随机选择服务商
   */
  selectProvider(): LLMProviderConfig {
    const available = this.getAvailableProviders();

    if (available.length === 0) {
      throw new Error('No available providers');
    }

    // 计算总权重
    const totalWeight = available.reduce((sum, p) => sum + p.weight, 0);

    // 随机选择
    let random = Math.random() * totalWeight;

    for (const provider of available) {
      random -= provider.weight;
      if (random <= 0) {
        return provider;
      }
    }

    // 兜底返回第一个
    return available[0];
  }

  /**
   * 获取角色专属服务商
   * 如果角色配置的服务商不可用，返回 null
   */
  getProviderForRole(role: string): LLMProviderConfig | null {
    if (!this.settings) {
      throw new Error('Config not loaded');
    }

    const mapping = this.settings.roleMapping?.[role];
    if (!mapping) {
      return null;
    }

    const mappingItem = Array.isArray(mapping) ? mapping[0] : mapping;
    const provider = this.getProvider(mappingItem.providerName);

    if (!provider) {
      return null;
    }

    // 检查是否可用
    if (!provider.enabled || provider.weight === 0 || provider.apiKey === '' || provider.apiKey.startsWith('${')) {
      return null;
    }

    return provider;
  }

  /**
   * 获取故障转移顺序
   */
  getFallbackOrder(): string[] {
    if (!this.settings) return [];
    return this.settings.fallbackOrder || Object.keys(this.settings.providers);
  }

  /**
   * 切换默认服务商
   */
  switchDefaultProvider(providerName: string): boolean {
    if (!this.settings || !this.settings.providers[providerName]) {
      return false;
    }

    this.settings.defaultProvider = providerName;
    return true;
  }

  /**
   * 为角色设置专属服务商
   */
  setRoleProvider(roleType: string, providerName: string, modelName?: string): boolean {
    if (!this.settings || !this.settings.providers[providerName]) {
      return false;
    }

    if (!this.settings.roleMapping) {
      this.settings.roleMapping = {};
    }

    this.settings.roleMapping[roleType] = {
      providerName,
      modelName,
    };

    return true;
  }

  /**
   * 移除角色专属配置
   */
  removeRoleProvider(roleType: string): boolean {
    if (!this.settings?.roleMapping) return false;

    delete this.settings.roleMapping[roleType];
    return true;
  }

  /**
   * 保存配置到文件
   */
  async saveToFile(filePath?: string): Promise<void> {
    if (!this.settings) {
      throw new Error('No settings to save');
    }

    const targetPath = filePath || this.settingsPath;
    if (!targetPath) {
      throw new Error('No file path specified');
    }

    // 隐藏 API key（仅保存后 4 位）
    const sanitized = JSON.stringify(this.settings, null, 2);
    await fs.writeFile(targetPath, sanitized, 'utf-8');

    this.settingsPath = targetPath;
  }

  /**
   * 验证配置并返回详细结果
   */
  async validateConfig(): Promise<ConfigValidationResult> {
    if (!this.settings) {
      return {
        valid: false,
        errors: ['Config not loaded'],
        warnings: [],
        summary: {
          totalProviders: 0,
          enabledProviders: 0,
          readyToUse: 0,
        },
        providers: [],
        recommendations: ['Please load config file first'],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    const providerDetails: Array<any> = [];

    let totalProviders = 0;
    let enabledProviders = 0;
    let readyToUse = 0;

    for (const [key, provider] of Object.entries(this.settings.providers)) {
      totalProviders++;

      const hasApiKey = provider.apiKey !== '' && !provider.apiKey.startsWith('${');
      const isEnabled = provider.enabled !== false;
      const hasWeight = provider.weight > 0;
      const isReady = isEnabled && hasApiKey && hasWeight;

      if (isEnabled) {
        enabledProviders++;
      }

      if (isReady) {
        readyToUse++;
      }

      providerDetails.push({
        name: provider.name,
        enabled: isEnabled,
        hasApiKey,
        weight: provider.weight,
        readyToUse: isReady,
      });

      // 检查错误
      if (isEnabled && !hasApiKey) {
        warnings.push(`${provider.name}: enabled but missing API key`);
      }

      if (isEnabled && provider.weight === 0) {
        warnings.push(`${provider.name}: enabled but weight is 0`);
      }

      // 检查模型配置
      if (Object.keys(provider.models).length === 0) {
        errors.push(`${provider.name}: no models configured`);
      }
    }

    // 建议
    if (readyToUse === 0) {
      recommendations.push('No providers ready to use. Please configure at least one provider with API key.');
    } else if (readyToUse === 1) {
      recommendations.push('Only one provider available. Consider configuring backup providers.');
    }

    if (readyToUse < totalProviders / 2) {
      recommendations.push('More than half of providers are disabled. Consider enabling more providers for redundancy.');
    }

    return {
      valid: errors.length === 0 && readyToUse > 0,
      errors,
      warnings,
      summary: {
        totalProviders,
        enabledProviders,
        readyToUse,
      },
      providers: providerDetails,
      recommendations,
    };
  }

  /**
   * 获取当前配置
   */
  getSettings(): LLMSettingsFile | null {
    return this.settings;
  }

  /**
   * 清除配置
   */
  clear(): void {
    this.settings = null;
    this.settingsPath = null;
  }
}

/**
 * 单例实例
 */
let globalConfigManager: LLMConfigManager | null = null;

export function getLLMConfigManager(): LLMConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new LLMConfigManager();
  }
  return globalConfigManager;
}

export function setLLMConfigManager(manager: LLMConfigManager): void {
  globalConfigManager = manager;
}
