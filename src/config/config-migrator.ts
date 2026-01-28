/**
 * 配置迁移器
 * 支持从旧配置文件迁移到新格式
 */

import { promises as fs } from 'fs';
import path from 'path';
import { loadConfigFromFile, expandPath } from './config-loader.js';
import { getDefaultConfig } from './defaults.js';
import type { AgentConfigFile } from './types.js';

/**
 * 旧版 LLM 配置结构
 */
interface LegacyLLMConfig {
  version: string;
  defaultProvider: string;
  providers: {
    [key: string]: {
      name: string;
      provider: string;
      apiKey: string;
      baseURL?: string;
      enabled: boolean;
      models: {
        [key: string]: {
          model: string;
          maxTokens?: number;
          temperature?: number;
          description?: string;
        };
      };
    };
  };
  roleMapping?: {
    [role: string]: {
      providerName: string;
      modelName?: string;
    };
  };
  fallbackOrder?: string[];
}

/**
 * 迁移结果
 */
export interface MigrationResult {
  success: boolean;
  migrated: boolean;
  warnings: string[];
  errors: string[];
  config?: AgentConfigFile;
}

/**
 * 迁移旧配置文件
 */
export async function migrateLegacyConfig(
  legacyPath: string,
  outputPath?: string
): Promise<MigrationResult> {
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    // 读取旧配置
    const legacyConfig = await loadLegacyConfig(legacyPath);

    // 转换为新格式
    const newConfig = convertToNewFormat(legacyConfig, warnings);

    // 验证转换后的配置
    if (!newConfig) {
      return {
        success: false,
        migrated: false,
        warnings,
        errors: ['配置转换失败'],
      };
    }

    // 保存新配置
    if (outputPath) {
      const expandedPath = expandPath(outputPath);
      await saveConfig(newConfig, expandedPath);
    }

    return {
      success: true,
      migrated: true,
      warnings,
      errors,
      config: newConfig,
    };
  } catch (error) {
    return {
      success: false,
      migrated: false,
      warnings,
      errors: [`迁移失败: ${error}`],
    };
  }
}

/**
 * 加载旧配置文件
 */
async function loadLegacyConfig(filePath: string): Promise<LegacyLLMConfig> {
  const expandedPath = expandPath(filePath);
  const content = await fs.readFile(expandedPath, 'utf-8');

  // 简单解析 JSON
  try {
    return JSON.parse(content) as LegacyLLMConfig;
  } catch (error) {
    throw new Error(`无法解析旧配置文件: ${error}`);
  }
}

/**
 * 将旧配置转换为新格式
 */
function convertToNewFormat(
  legacy: LegacyLLMConfig,
  warnings: string[]
): AgentConfigFile | null {
  const newConfig = getDefaultConfig();

  // 复制版本
  newConfig.version = legacy.version || '1.0.0';

  // 复制 LLM 配置
  if (legacy.defaultProvider) {
    newConfig.llm.defaultProvider = legacy.defaultProvider;
  }

  if (legacy.providers) {
    newConfig.llm.providers = {};
    for (const [name, provider] of Object.entries(legacy.providers)) {
      newConfig.llm.providers[name] = {
        name: provider.name,
        provider: provider.provider as any,
        apiKey: provider.apiKey,
        baseURL: provider.baseURL,
        enabled: provider.enabled,
        models: {},
      };

      // 复制模型配置
      if (provider.models) {
        for (const [modelName, model] of Object.entries(provider.models)) {
          newConfig.llm.providers[name].models[modelName] = {
            model: model.model,
            maxTokens: model.maxTokens,
            temperature: model.temperature,
            description: model.description,
          };
        }
      }
    }
  }

  // 复制角色映射
  if (legacy.roleMapping) {
    newConfig.llm.roleMapping = {};
    for (const [role, mapping] of Object.entries(legacy.roleMapping)) {
      const m = mapping as any;
      if (m && m.providerName) {
        newConfig.llm.roleMapping[role as any] = {
          providerName: m.providerName,
          modelName: m.modelName,
        };
      }
    }
  }

  // 复制故障转移顺序
  if (legacy.fallbackOrder) {
    newConfig.llm.fallbackOrder = legacy.fallbackOrder;
  }

  return newConfig;
}

/**
 * 保存配置到文件
 */
async function saveConfig(config: AgentConfigFile, filePath: string): Promise<void> {
  const expandedPath = expandPath(filePath);

  // 确保目录存在
  const dir = path.dirname(expandedPath);
  await fs.mkdir(dir, { recursive: true });

  // 生成 YAML 内容
  const content = generateYaml(config);

  // 保存文件
  await fs.writeFile(expandedPath, content, 'utf-8');
}

/**
 * 生成 YAML 内容
 */
function generateYaml(config: AgentConfigFile): string {
  const lines: string[] = [];

  lines.push(`version: "${config.version}"`);
  lines.push('');
  lines.push('llm:');
  lines.push(`  defaultProvider: "${config.llm.defaultProvider}"`);
  lines.push('');

  // 提供商
  lines.push('  providers:');
  for (const [name, provider] of Object.entries(config.llm.providers)) {
    lines.push(`    ${name}:`);
    lines.push(`      name: "${provider.name}"`);
    lines.push(`      provider: "${provider.provider}"`);
    lines.push(`      apiKey: "${provider.apiKey}"`);
    if (provider.baseURL) {
      lines.push(`      baseURL: "${provider.baseURL}"`);
    }
    lines.push(`      enabled: ${provider.enabled}`);
    lines.push('      models:');
    for (const [modelName, model] of Object.entries(provider.models)) {
      lines.push(`        ${modelName}:`);
      lines.push(`          model: "${model.model}"`);
      if (model.maxTokens) {
        lines.push(`          maxTokens: ${model.maxTokens}`);
      }
      if (model.temperature !== undefined) {
        lines.push(`          temperature: ${model.temperature}`);
      }
      if (model.description) {
        lines.push(`          description: "${model.description}"`);
      }
    }
  }

  // 角色映射
  lines.push('');
  lines.push('  roleMapping:');
  for (const [role, mapping] of Object.entries(config.llm.roleMapping || {})) {
    const mappings = Array.isArray(mapping) ? mapping : [mapping];
    const validMappings = mappings.filter((m: any) => m?.providerName);
    if (validMappings.length === 0) continue;
    lines.push(`    ${role}:`);
    if (Array.isArray(mapping)) {
      for (const m of validMappings) {
        if (m && m.providerName) {
          lines.push(`      - providerName: "${m.providerName}"`);
          if (m.modelName) {
            lines.push(`        modelName: "${m.modelName}"`);
          }
        }
      }
    } else {
      const m = validMappings[0];
      if (m && m.providerName) {
        lines.push(`      providerName: "${m.providerName}"`);
        if (m.modelName) {
          lines.push(`      modelName: "${m.modelName}"`);
        }
      }
    }
  }

  // 故障转移顺序
  lines.push('');
  lines.push('  fallbackOrder:');
  for (const provider of config.llm.fallbackOrder) {
    lines.push(`    - ${provider}`);
  }

  // 项目配置
  lines.push('');
  lines.push('project:');
  lines.push(`  name: "${config.project.name}"`);
  lines.push(`  path: "${config.project.path}"`);
  lines.push(`  autoAnalyze: ${config.project.autoAnalyze}`);

  // Agent 配置
  lines.push('');
  lines.push('agent:');
  lines.push(`  maxIterations: ${config.agent.maxIterations}`);
  lines.push(`  maxHistory: ${config.agent.maxHistory}`);
  lines.push(`  autoConfirm: ${config.agent.autoConfirm}`);
  lines.push(`  showThoughts: ${config.agent.showThoughts}`);

  // 工具配置
  lines.push('');
  lines.push('tools:');
  lines.push('  file:');
  lines.push(`    allowDelete: ${config.tools.file.allowDelete}`);
  lines.push(`    allowOverwrite: ${config.tools.file.allowOverwrite}`);
  lines.push('  git:');
  lines.push(`    autoCommit: ${config.tools.git.autoCommit}`);
  lines.push(`    confirmPush: ${config.tools.git.confirmPush}`);
  lines.push('  code:');
  lines.push(`    enabled: ${config.tools.code.enabled}`);

  // 规则配置
  lines.push('');
  lines.push('rules:');
  lines.push('  enabled:');
  for (const rule of config.rules.enabled) {
    lines.push(`    - ${rule}`);
  }
  lines.push('  disabled:');
  for (const rule of config.rules.disabled) {
    lines.push(`    - ${rule}`);
  }

  return lines.join('\n');
}

/**
 * 批量迁移
 */
export async function migrateAll(
  legacyPaths: string[],
  outputDir: string
): Promise<{
  success: number;
  failed: number;
  results: { path: string; result: MigrationResult }[];
}> {
  const results: { path: string; result: MigrationResult }[] = [];
  let success = 0;
  let failed = 0;

  for (const legacyPath of legacyPaths) {
    const outputPath = path.join(
      outputDir,
      path.basename(legacyPath).replace('.json', '.yaml')
    );

    const result = await migrateLegacyConfig(legacyPath, outputPath);
    results.push({ path: legacyPath, result });

    if (result.success) {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed, results };
}

/**
 * 检查是否需要迁移
 */
export async function checkMigrationNeeded(
  legacyPath: string
): Promise<{
  needed: boolean;
  reason?: string;
}> {
  try {
    const expandedPath = expandPath(legacyPath);
    const content = await fs.readFile(expandedPath, 'utf-8');

    // 检查是否是 JSON 格式（旧配置）
    if (content.trim().startsWith('{')) {
      return { needed: true, reason: '旧版 JSON 格式配置' };
    }

    // 检查版本
    try {
      const config = JSON.parse(content) as LegacyLLMConfig;
      if (config.version && config.version !== '1.0.0') {
        return { needed: true, reason: `版本 ${config.version} 需要升级` };
      }
    } catch {
      // 非 JSON 格式，可能不需要迁移
    }

    return { needed: false };
  } catch {
    return { needed: false, reason: '配置文件不存在' };
  }
}
