/**
 * ConfigManager
 * 统一配置管理类，提供配置加载、验证和环境变量覆盖功能
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import {
  AgentConfigFile,
  LLMConfigSection,
  ProviderConfig,
  ConfigValidationResult,
} from './types.js';
import {
  loadConfig,
  configExists,
  getConfigPath,
  expandPath,
} from './config-loader.js';
import { validateSync } from './config-validator.js';
import { applyEnvironmentOverrides, isValidApiKey } from './environment.js';
import { getDefaultConfig, ENVIRONMENT_VARIABLE_MAPPING } from './defaults.js';

export interface ConfigCheckResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const PROVIDER_API_KEY_ENV_VARS: { [key: string]: string } = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  ollama: 'OLLAMA_API_KEY',
};

function getAPIKeyFromEnv(providerName: string): string | null {
  const envVar = PROVIDER_API_KEY_ENV_VARS[providerName];
  if (envVar) {
    const apiKey = process.env[envVar];
    if (apiKey && isValidApiKey(apiKey)) {
      return apiKey;
    }
  }
  return null;
}

export class ConfigManager {
  private config: AgentConfigFile | null = null;
  private configPath: string;
  private loaded: boolean = false;

  constructor(configPath?: string) {
    if (configPath) {
      this.configPath = expandPath(configPath);
    } else {
      const detectedPath = getConfigPath();
      this.configPath = detectedPath || path.join(os.homedir(), '.agent-team', 'config.yaml');
    }
  }

  async loadConfig(options?: { validate?: boolean; environmentOverrides?: boolean }): Promise<void> {
    const doValidate = options?.validate ?? true;
    const useEnvOverrides = options?.environmentOverrides ?? true;

    try {
      const result = await loadConfig({
        configPath: this.configPath,
        validate: doValidate,
        environmentOverrides: useEnvOverrides,
      });
      this.config = result.config;
      this.loaded = true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('validation')) {
        throw error;
      }
      throw new Error(`Failed to load config from ${this.configPath}: ${error}`);
    }
  }

  getConfig(): AgentConfigFile {
    if (!this.config) {
      throw new Error('Config not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  getLLMConfig(): LLMConfigSection {
    return this.getConfig().llm;
  }

  getServerConfig(): { port: number; host: string } {
    const server = (this.getConfig() as any).server;
    return {
      port: server?.port ?? 3000,
      host: server?.host ?? 'localhost',
    };
  }

  getProviderConfig(providerName: string): ProviderConfig | null {
    const llmConfig = this.getLLMConfig();
    return llmConfig.providers[providerName] || null;
  }

  getAPIKey(providerName: string): string | null {
    const envKey = getAPIKeyFromEnv(providerName);
    if (envKey) {
      return envKey;
    }

    const provider = this.getProviderConfig(providerName);
    return provider?.apiKey || null;
  }

  getDefaultProvider(): string {
    return this.getLLMConfig().defaultProvider;
  }

  getFallbackOrder(): string[] {
    return this.getLLMConfig().fallbackOrder || [];
  }

  checkConfig(): ConfigCheckResult {
    const result: ConfigCheckResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    if (!this.config) {
      result.valid = false;
      result.errors.push('Config not loaded');
      return result;
    }

    const llmConfig = this.getLLMConfig();

    if (!llmConfig.defaultProvider) {
      result.valid = false;
      result.errors.push('Default provider not configured');
    } else {
      const defaultProvider = this.getProviderConfig(llmConfig.defaultProvider);
      if (!defaultProvider) {
        result.valid = false;
        result.errors.push(`Default provider "${llmConfig.defaultProvider}" not configured`);
      } else if (!defaultProvider.enabled) {
        result.valid = false;
        result.errors.push(`Default provider "${llmConfig.defaultProvider}" is disabled`);
      }
    }

    for (const [name, provider] of Object.entries(llmConfig.providers)) {
      if (provider.enabled && !provider.apiKey) {
        result.warnings.push(`Provider "${name}" is enabled but has no API key`);
      }
    }

    return result;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getConfigPath(): string {
    return this.configPath;
  }

  async reloadConfig(): Promise<void> {
    this.loaded = false;
    this.config = null;
    await this.loadConfig();
  }

  setConfig(config: AgentConfigFile): void {
    this.config = config;
    this.loaded = true;
  }
}

let globalConfigManager: ConfigManager | null = null;

export function getConfigManager(configPath?: string): ConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new ConfigManager(configPath);
  }
  return globalConfigManager;
}

export function setConfigManager(manager: ConfigManager): void {
  globalConfigManager = manager;
}

export function resetConfigManager(): void {
  globalConfigManager = null;
}
