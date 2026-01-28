/**
 * 环境变量处理模块
 */

import { ENVIRONMENT_VARIABLE_MAPPING } from './defaults.js';
import type { AgentConfigFile } from './types.js';

/**
 * 展开环境变量
 * 支持 ${VAR_NAME} 格式的环境变量展开
 */
export function expandEnvironmentVariables(value: string): string {
  if (!value || typeof value !== 'string') {
    return value;
  }

  // 匹配 ${VAR_NAME} 格式
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    const envValue = process.env[varName];
    return envValue !== undefined ? envValue : value;
  });
}

/**
 * 展开对象中的所有环境变量
 */
export function expandEnvironmentVariablesInObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return expandEnvironmentVariables(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => expandEnvironmentVariablesInObject(item));
  }

  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandEnvironmentVariablesInObject(value);
    }
    return result;
  }

  return obj;
}

/**
 * 应用环境变量覆盖
 * 根据环境变量映射表覆盖配置值
 */
export function applyEnvironmentOverrides(config: AgentConfigFile): AgentConfigFile {
  const result = { ...config };

  // 应用简单环境变量映射
  for (const [envVar, configPath] of Object.entries(ENVIRONMENT_VARIABLE_MAPPING)) {
    const envValue = process.env[envVar];
    if (envValue !== undefined) {
      setNestedValue(result, configPath, parseEnvValue(envValue));
    }
  }

  // 特殊处理：LLM API Keys
  const llmProviders = result.llm?.providers;
  if (llmProviders) {
    for (const [name, provider] of Object.entries(llmProviders) as [string, any]) {
      if (provider.apiKey) {
        provider.apiKey = expandEnvironmentVariables(provider.apiKey);
      }
      if (provider.baseURL) {
        provider.baseURL = expandEnvironmentVariables(provider.baseURL);
      }
    }
  }

  return result;
}

/**
 * 设置嵌套对象的值
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * 解析环境变量值
 * 尝试将字符串转换为适当的类型
 */
export function parseEnvValue(value: string): any {
  // 布尔值
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;

  // 数字
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return parseFloat(value);
  }

  // 字符串
  return value;
}

/**
 * 检查环境变量是否存在
 */
export function hasEnvironmentVariable(name: string): boolean {
  return process.env[name] !== undefined;
}

/**
 * 获取环境变量值
 */
export function getEnvironmentVariable(name: string, defaultValue?: string): string | undefined {
  return process.env[name] ?? defaultValue;
}

/**
 * 获取所有相关环境变量
 */
export function getRelevantEnvironmentVariables(): { [key: string]: string | undefined } {
  const result: { [key: string]: string | undefined } = {};

  // LLM 提供商相关
  const llmKeys = [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_BACKUP_API_KEY',
    'OPENAI_API_KEY',
    'AZURE_OPENAI_API_KEY',
    'DASHSCOPE_API_KEY',
    'ZHIPU_API_KEY',
    'MINIMAX_API_KEY',
    'MOONSHOT_API_KEY',
    'DEEPSEEK_API_KEY',
    'INVADA_API_KEY',
  ];

  for (const key of llmKeys) {
    result[key] = process.env[key];
  }

  // 系统配置相关
  for (const envVar of Object.keys(ENVIRONMENT_VARIABLE_MAPPING)) {
    result[envVar] = process.env[envVar];
  }

  return result;
}

/**
 * 验证环境变量配置
 * 返回有效的 API key 提供商列表
 */
export function validateEnvironmentVariables(): {
  valid: string[];
  invalid: string[];
  missing: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  const missing: string[] = [];

  const providerEnvVars: { [key: string]: string } = {
    'anthropic-primary': 'ANTHROPIC_API_KEY',
    'anthropic-secondary': 'ANTHROPIC_BACKUP_API_KEY',
    'openai-primary': 'OPENAI_API_KEY',
    'zhipu-primary': 'ZHIPU_API_KEY',
    'qwen-primary': 'DASHSCOPE_API_KEY',
    'deepseek-primary': 'DEEPSEEK_API_KEY',
  };

  for (const [provider, envVar] of Object.entries(providerEnvVars)) {
    const value = process.env[envVar];

    if (value === undefined) {
      missing.push(provider);
    } else if (isValidApiKey(value)) {
      valid.push(provider);
    } else {
      invalid.push(provider);
    }
  }

  return { valid, invalid, missing };
}

/**
 * 验证 API Key 是否有效
 */
export function isValidApiKey(key: string): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }

  const trimmed = key.trim();

  // 检查是否为空
  if (trimmed === '') {
    return false;
  }

  // 检查是否是占位符
  if (trimmed.startsWith('your_') || trimmed === 'sk-xxxxx') {
    return false;
  }

  return true;
}
