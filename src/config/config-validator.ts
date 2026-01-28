/**
 * 配置验证器
 */

import type { AgentConfigFile, ConfigValidationResult, ProviderConfig } from './types.js';
import { validateEnvironmentVariables, isValidApiKey } from './environment.js';

const SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'ollama', 'custom'];
const SUPPORTED_ROLES = [
  'product-manager',
  'architect',
  'developer',
  'tester',
  'doc-writer',
];

/**
 * 验证配置
 */
export function validateSync(config: AgentConfigFile): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const providers: ConfigValidationResult['providers'] = [];

  // 验证版本
  if (!config.version) {
    errors.push('缺少版本号 (version)');
  } else if (config.version !== '1.0.0') {
    warnings.push(`版本号 ${config.version} 可能不兼容`);
  }

  // 验证 LLM 配置
  if (!config.llm) {
    errors.push('缺少 LLM 配置 (llm)');
  } else {
    // 验证默认提供商
    if (!config.llm.defaultProvider) {
      errors.push('缺少默认提供商 (llm.defaultProvider)');
    } else if (!config.llm.providers?.[config.llm.defaultProvider]) {
      errors.push(`默认提供商 "${config.llm.defaultProvider}" 未配置`);
    }

    // 验证提供商
    if (!config.llm.providers || Object.keys(config.llm.providers).length === 0) {
      errors.push('至少需要配置一个 LLM 提供商');
    } else {
      for (const [name, provider] of Object.entries(config.llm.providers)) {
        const providerResult = validateProvider(name, provider);
        providers.push({
          name,
          enabled: provider.enabled,
          hasValidKey: providerResult.hasValidKey,
        });

        if (providerResult.errors.length > 0) {
          errors.push(...providerResult.errors);
        }
        if (providerResult.warnings.length > 0) {
          warnings.push(...providerResult.warnings);
        }
      }
    }

    // 验证角色映射
    if (config.llm.roleMapping) {
      for (const [role, mapping] of Object.entries(config.llm.roleMapping)) {
        const mappings = Array.isArray(mapping) ? mapping : [mapping];
        if (!SUPPORTED_ROLES.includes(role) && !role.startsWith('custom-')) {
          warnings.push(`未知的角色类型: ${role}`);
        }

        mappings.forEach((m: any, index: number) => {
          if (!m) return;
          const suffix = mappings.length > 1 ? ` (序号 ${index + 1})` : '';

          if (!config.llm.providers?.[m.providerName]) {
            errors.push(`角色 "${role}"${suffix} 映射到未知的提供商 "${m.providerName}"`);
          }

          if (m.modelName && !config.llm.providers?.[m.providerName]?.models?.[m.modelName]) {
            warnings.push(`角色 "${role}"${suffix} 指定的模型 "${m.modelName}" 在提供商中不存在`);
          }
        });
      }
    }

    // 验证故障转移顺序
    if (config.llm.fallbackOrder && Array.isArray(config.llm.fallbackOrder)) {
      for (const providerName of config.llm.fallbackOrder) {
        if (!config.llm.providers?.[providerName]) {
          errors.push(`故障转移列表中包含未知的提供商 "${providerName}"`);
        }
      }
    }
  }

  // 验证项目配置
  if (!config.project) {
    warnings.push('缺少项目配置 (project)，将使用默认值');
  } else {
    if (!config.project.name) {
      warnings.push('缺少项目名称 (project.name)，将使用默认值');
    }
    if (!config.project.path) {
      warnings.push('缺少项目路径 (project.path)，将使用默认值');
    }
  }

  // 验证 Agent 配置
  if (!config.agent) {
    warnings.push('缺少 Agent 配置 (agent)，将使用默认值');
  } else {
    if (typeof config.agent.maxIterations !== 'number' || config.agent.maxIterations < 1) {
      errors.push('agent.maxIterations 必须是大于 0 的数字');
    }
    if (typeof config.agent.maxHistory !== 'number' || config.agent.maxHistory < 1) {
      errors.push('agent.maxHistory 必须是大于 0 的数字');
    }
  }

  // 验证工具配置
  if (!config.tools) {
    warnings.push('缺少工具配置 (tools)，将使用默认值');
  } else {
    if (!config.tools.file) {
      warnings.push('缺少文件工具配置 (tools.file)，将使用默认值');
    }
    if (!config.tools.git) {
      warnings.push('缺少 Git 工具配置 (tools.git)，将使用默认值');
    }
    if (!config.tools.code) {
      warnings.push('缺少代码工具配置 (tools.code)，将使用默认值');
    }
  }

  // 验证规则配置
  if (!config.rules) {
    warnings.push('缺少规则配置 (rules)，将使用默认值');
  }

  // 验证环境变量
  const envValidation = validateEnvironmentVariables();
  if (envValidation.invalid.length > 0) {
    warnings.push(
      `以下提供商的 API Key 可能无效: ${envValidation.invalid.join(', ')}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    providers,
  };
}

/**
 * 验证单个提供商配置
 */
function validateProvider(
  name: string,
  provider: ProviderConfig
): {
  errors: string[];
  warnings: string[];
  hasValidKey: boolean;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  let hasValidKey = false;

  // 验证提供商类型
  if (!provider.provider) {
    errors.push(`提供商 "${name}" 缺少 provider 类型`);
  } else if (!SUPPORTED_PROVIDERS.includes(provider.provider)) {
    errors.push(`提供商 "${name}" 的 provider 类型 "${provider.provider}" 不支持`);
  }

  // 验证名称
  if (!provider.name) {
    errors.push(`提供商 "${name}" 缺少名称`);
  }

  // 验证模型配置
  if (!provider.models || Object.keys(provider.models).length === 0) {
    errors.push(`提供商 "${name}" 至少需要配置一个模型`);
  } else {
    for (const [modelName, model] of Object.entries(provider.models)) {
      if (!model.model) {
        errors.push(`提供商 "${name}" 的模型 "${modelName}" 缺少 model 字段`);
      }
      if (model.maxTokens !== undefined && (typeof model.maxTokens !== 'number' || model.maxTokens < 1)) {
        errors.push(`提供商 "${name}" 的模型 "${modelName}" 的 maxTokens 无效`);
      }
      if (model.temperature !== undefined && (typeof model.temperature !== 'number' || model.temperature < 0 || model.temperature > 1)) {
        errors.push(`提供商 "${name}" 的模型 "${modelName}" 的 temperature 必须在 0-1 之间`);
      }
    }
  }

  // 验证 API Key
  if (provider.enabled) {
    if (!provider.apiKey) {
      warnings.push(`提供商 "${name}" 已启用但缺少 API Key`);
      hasValidKey = false;
    } else if (!isValidApiKey(provider.apiKey)) {
      warnings.push(`提供商 "${name}" 的 API Key 无效（可能是占位符）`);
      hasValidKey = false;
    } else {
      hasValidKey = true;
    }
  } else {
    hasValidKey = false;
  }

  return { errors, warnings, hasValidKey };
}

/**
 * 验证配置并返回详细报告
 */
export function validateConfigDetailed(config: AgentConfigFile): {
  valid: boolean;
  summary: string;
  details: {
    providers: { name: string; status: string }[];
    roles: { name: string; status: string }[];
    issues: { type: 'error' | 'warning'; message: string }[];
  };
} {
  const result = validateSync(config);

  const providers = result.providers.map((p) => ({
    name: p.name,
    status: p.enabled
      ? p.hasValidKey
        ? '就绪'
        : '需要配置 API Key'
      : '已禁用',
  }));

  const roles = config.llm?.roleMapping
    ? Object.entries(config.llm.roleMapping).map(([name, mapping]) => {
        const mappings = Array.isArray(mapping) ? mapping : [mapping];
        const formatted = mappings
          .filter(Boolean)
          .map((m: any) => `${m.providerName}/${m.modelName || '默认'}`)
          .join(' -> ');
        const hasEnabled = mappings.some((m: any) => config.llm?.providers?.[m?.providerName]?.enabled);
        return {
          name,
          status: hasEnabled ? (formatted || '未配置') : '提供商未启用',
        };
      })
    : [];

  const issues = [
    ...result.errors.map((e) => ({ type: 'error' as const, message: e })),
    ...result.warnings.map((w) => ({ type: 'warning' as const, message: w })),
  ];

  const summary = `
配置验证结果: ${result.isValid ? '通过' : '失败'}
提供商数量: ${result.providers.length}
就绪提供商: ${result.providers.filter((p) => p.enabled && p.hasValidKey).length}
错误数量: ${result.errors.length}
警告数量: ${result.warnings.length}
`.trim();

  return {
    valid: result.isValid,
    summary,
    details: {
      providers,
      roles,
      issues,
    },
  };
}

/**
 * 快速验证（仅检查必要字段）
 */
export function validateConfigQuick(config: AgentConfigFile): boolean {
  return !!(
    config.version &&
    config.llm?.defaultProvider &&
    config.llm?.providers &&
    Object.keys(config.llm.providers).length > 0
  );
}
