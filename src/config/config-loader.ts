/**
 * 配置加载器
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import {
  getDefaultConfig,
  DEFAULT_CONFIG_PATHS,
  LEGACY_CONFIG_PATHS,
} from './defaults.js';
import { expandEnvironmentVariablesInObject, applyEnvironmentOverrides } from './environment.js';
import type { AgentConfigFile } from './types.js';
import { validateSync } from './config-validator.js';

export { AgentConfigFile };

/**
 * 加载配置文件
 */
export async function loadConfig(
  options: {
    configPath?: string;
    environmentOverrides?: boolean;
    validate?: boolean;
  } = {}
): Promise<{
  config: AgentConfigFile;
  configPath: string;
  source: 'file' | 'default';
}> {
  const {
    configPath: customPath,
    environmentOverrides = true,
    validate = true,
  } = options;

  // 1. 尝试加载自定义配置
  if (customPath) {
    try {
      const expandedPath = expandPath(customPath);
      const config = await loadConfigFromFile(expandedPath);
      const finalConfig = environmentOverrides
        ? applyEnvironmentOverrides(config)
        : config;

      if (validate) {
        const validation = validateSync(finalConfig);
        if (!validation.isValid && validation.errors.length > 0) {
          console.warn('配置验证警告:', validation.errors);
        }
      }

      return {
        config: finalConfig,
        configPath: expandedPath,
        source: 'file',
      };
    } catch (error) {
      throw new Error(`无法加载配置文件 ${customPath}: ${error}`);
    }
  }

  // 2. 尝试加载默认配置路径
  for (const defaultPath of DEFAULT_CONFIG_PATHS) {
    try {
      const expandedPath = expandPath(defaultPath);
      const config = await loadConfigFromFile(expandedPath);
      const finalConfig = environmentOverrides
        ? applyEnvironmentOverrides(config)
        : config;

      if (validate) {
        const validation = validateSync(finalConfig);
        if (!validation.isValid && validation.errors.length > 0) {
          console.warn('配置验证警告:', validation.errors);
        }
      }

      return {
        config: finalConfig,
        configPath: expandedPath,
        source: 'file',
      };
    } catch {
      // 继续尝试下一个路径
      continue;
    }
  }

  // 3. 使用默认配置
  const defaultConfig = getDefaultConfig();
  const defaultPath = expandPath(DEFAULT_CONFIG_PATHS[0]);

  if (validate) {
    const validation = validateSync(defaultConfig);
    if (!validation.isValid && validation.errors.length > 0) {
      console.warn('默认配置验证警告:', validation.errors);
    }
  }

  return {
    config: defaultConfig,
    configPath: defaultPath,
    source: 'default',
  };
}

/**
 * 从文件加载配置
 */
export async function loadConfigFromFile(filePath: string): Promise<AgentConfigFile> {
  const expandedPath = expandPath(filePath);

  // 检查文件是否存在
  try {
    await fs.access(expandedPath);
  } catch {
    throw new Error(`配置文件不存在: ${expandedPath}`);
  }

  // 读取文件
  const content = await fs.readFile(expandedPath, 'utf-8');

  // 解析 YAML（使用 js-yaml 库）
  try {
    const config = yaml.load(content) as AgentConfigFile;
    return config;
  } catch (error) {
    // 如果 js-yaml 解析失败，尝试使用简单的解析器
    try {
      const config = parseYaml(content);
      return config as AgentConfigFile;
    } catch (fallbackError) {
      throw new Error(`配置文件解析失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * 展开路径（支持 ~ 和环境变量）
 */
export function expandPath(filePath: string): string {
  // 展开环境变量
  let expanded = expandEnvironmentVariablesInObject(filePath) as string;

  // 展开 ~
  if (expanded.startsWith('~')) {
    expanded = path.join(os.homedir(), expanded.slice(1));
  }

  // 转换为绝对路径（如果是相对路径）
  if (!path.isAbsolute(expanded)) {
    expanded = path.resolve(expanded);
  }

  return expanded;
}

/**
 * 简单的 YAML 解析器（仅支持基本结构）
 * 实际项目中建议使用 js-yaml 库
 */
function parseYaml(content: string): any {
  const result: any = {};
  const lines = content.split('\n');
  let currentSection: any = result;
  const sectionStack: any[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    // 跳过注释和空行
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // 计算缩进（空行返回 -1，需要特殊处理）
    const indent = line.search(/\S/);
    if (indent === -1) {
      continue; // 空行
    }

    // 处理列表项
    if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2).trim();
      if (!Array.isArray(currentSection)) {
        currentSection = [];
        if (sectionStack.length > 0) {
          const lastKey = sectionStack[sectionStack.length - 1].key;
          sectionStack[sectionStack.length - 1].parent[lastKey] = currentSection;
        }
      }
      currentSection.push(parseValue(value));
      continue;
    }

    // 处理键值对
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim();
      let value = trimmed.slice(colonIndex + 1).trim();

      // 弹出栈中层级（如果当前缩进小于等于栈顶）
      // 注意：当缩进相同时，也应该弹出，表示回到同级（例如 providers 下的多个提供商）
      while (sectionStack.length > 0) {
        const topIndent = sectionStack[sectionStack.length - 1].indent;
        if (indent <= topIndent) {
          sectionStack.pop();
          currentSection = sectionStack.length > 0
            ? sectionStack[sectionStack.length - 1].parent
            : result;
        } else {
          break;
        }
      }

      // 处理值
      if (value === '' || value === '|' || value === '>') {
        // 多行值或空值
        currentSection[key] = {};
        sectionStack.push({
          key,
          parent: currentSection,
          indent,
        });
        currentSection = currentSection[key];
      } else {
        // 单行值
        currentSection[key] = parseValue(value);
      }
    }
  }

  return result;
}

/**
 * 解析值
 */
function parseValue(value: string): any {
  // 字符串（引号包围）
  if ((value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // 布尔值
  if (value === 'true') return true;
  if (value === 'false') return false;

  // 空值
  if (value === 'null' || value === '~') return null;

  // 数字
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return parseFloat(value);
  }

  // 环境变量引用
  if (value.includes('${')) {
    return value; // 延迟展开
  }

  return value;
}

/**
 * 展开环境变量（用于字符串）
 */
function expandEnvironmentVariables(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] || value;
  });
}

/**
 * 检查配置文件是否存在
 */
export async function configExists(configPath?: string): Promise<boolean> {
  // 检查自定义路径
  if (configPath) {
    try {
      await fs.access(expandPath(configPath));
      return true;
    } catch {
      return false;
    }
  }

  // 检查默认路径
  for (const defaultPath of DEFAULT_CONFIG_PATHS) {
    try {
      await fs.access(expandPath(defaultPath));
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

/**
 * 获取配置路径
 */
export function getConfigPath(customPath?: string): string | null {
  if (customPath) {
    return expandPath(customPath);
  }

  for (const defaultPath of DEFAULT_CONFIG_PATHS) {
    const expanded = expandPath(defaultPath);
    try {
      require('fs').promises.access(expanded);
      return expanded;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * 检查是否存在旧配置文件（用于迁移）
 */
export async function hasLegacyConfig(): Promise<{
  hasLegacy: boolean;
  legacyPaths: string[];
}> {
  const legacyPaths: string[] = [];

  for (const legacyPath of LEGACY_CONFIG_PATHS) {
    try {
      const expanded = expandPath(legacyPath);
      await fs.access(expanded);
      legacyPaths.push(expanded);
    } catch {
      continue;
    }
  }

  return {
    hasLegacy: legacyPaths.length > 0,
    legacyPaths,
  };
}
