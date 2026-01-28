/**
 * 规则加载器
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { RuleConfigFile, RuleLoadOptions } from './types.js';

const BUILT_IN_RULES_DIR = 'built-in';
const CUSTOM_RULES_DIR = 'custom';

const DEFAULT_RULES_PATHS = [
  '~/.agent-team/rules',
  './.agent-team/rules',
  './rules',
];

/**
 * 加载所有规则
 */
export async function loadRules(
  options: RuleLoadOptions = {}
): Promise<{
  rules: Map<string, RuleConfigFile>;
  loaded: string[];
  errors: string[];
}> {
  const {
    includeBuiltIn = true,
    includeCustom = true,
    enabledOnly = false,
    category,
  } = options;

  const rules = new Map<string, RuleConfigFile>();
  const loaded: string[] = [];
  const errors: string[] = [];

  // 加载内置规则
  if (includeBuiltIn) {
    try {
      const builtInRules = await loadBuiltInRules();
      for (const [id, rule] of builtInRules) {
        if (enabledOnly && !rule.enabled) continue;
        if (category && rule.category !== category) continue;
        rules.set(id, rule);
        loaded.push(id);
      }
    } catch (error) {
      errors.push(`加载内置规则失败: ${error}`);
    }
  }

  // 加载自定义规则
  if (includeCustom) {
    try {
      const customRules = await loadCustomRules();
      for (const [id, rule] of customRules) {
        if (enabledOnly && !rule.enabled) continue;
        if (category && rule.category !== category) continue;
        rules.set(id, rule);
        loaded.push(id);
      }
    } catch (error) {
      errors.push(`加载自定义规则失败: ${error}`);
    }
  }

  return { rules, loaded, errors };
}

/**
 * 加载内置规则
 */
export async function loadBuiltInRules(): Promise<Map<string, RuleConfigFile>> {
  const rules = new Map<string, RuleConfigFile>();

  const builtInDir = path.join(process.cwd(), 'src', 'rules', BUILT_IN_RULES_DIR);

  try {
    const files = await fs.readdir(builtInDir);
    const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of yamlFiles) {
      try {
        const filePath = path.join(builtInDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const rule = parseRuleYaml(content);

        if (rule) {
          rules.set(rule.id, rule);
        }
      } catch (error) {
        console.warn(`加载规则文件 ${file} 失败: ${error}`);
      }
    }
  } catch (error) {
    console.warn(`内置规则目录不存在: ${builtInDir}`);
  }

  return rules;
}

/**
 * 加载自定义规则
 */
export async function loadCustomRules(): Promise<Map<string, RuleConfigFile>> {
  const rules = new Map<string, RuleConfigFile>();

  const customDir = await findCustomRulesDir();

  if (!customDir) {
    return rules;
  }

  try {
    const files = await fs.readdir(customDir);
    const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of yamlFiles) {
      try {
        const filePath = path.join(customDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const rule = parseRuleYaml(content);

        if (rule && rule.id.startsWith('custom-')) {
          rules.set(rule.id, rule);
        }
      } catch (error) {
        console.warn(`加载自定义规则文件 ${file} 失败: ${error}`);
      }
    }
  } catch (error) {
    console.warn(`自定义规则目录不存在: ${customDir}`);
  }

  return rules;
}

/**
 * 查找自定义规则目录
 */
export async function findCustomRulesDir(): Promise<string | null> {
  for (const defaultPath of DEFAULT_RULES_PATHS) {
    const expanded = expandPath(defaultPath);
    try {
      await fs.access(expanded);
      return expanded;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * 加载单个规则
 */
export async function loadRule(ruleId: string): Promise<RuleConfigFile | null> {
  const builtInRules = await loadBuiltInRules();
  if (builtInRules.has(ruleId)) {
    return builtInRules.get(ruleId)!;
  }

  const customRules = await loadCustomRules();
  if (customRules.has(ruleId)) {
    return customRules.get(ruleId)!;
  }

  return null;
}

/**
 * 解析规则 YAML
 */
function parseRuleYaml(content: string): RuleConfigFile | null {
  const lines = content.split('\n');
  const rule: any = {
    rules: [],
    appliesTo: [],
    exceptions: [],
  };

  let currentSection: string | null = null;
  let currentRule: any = null;
  let currentException: any = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过注释和空行
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // 检测节
    if (trimmed.endsWith(':') && !trimmed.startsWith('- ')) {
      const sectionName = trimmed.slice(0, -1).trim();

      // 保存之前的规则或例外
      if (currentRule && currentSection === 'rules') {
        rule.rules.push(currentRule);
        currentRule = null;
      }
      if (currentException && currentSection === 'exceptions') {
        rule.exceptions.push(currentException);
        currentException = null;
      }

      currentSection = sectionName;
      continue;
    }

    // 处理列表项
    if (trimmed.startsWith('- ')) {
      const item = trimmed.slice(2).trim();
      if (item) {
        if (currentSection === 'appliesTo') {
          rule.appliesTo.push(item);
        } else if (currentSection === 'rules') {
          currentRule = { id: item };
        } else if (currentSection === 'exceptions') {
          currentException = { id: item, rules: [] };
        }
      }
      continue;
    }

    // 处理键值对
    if (trimmed.includes(':') && !trimmed.startsWith('- ')) {
      const [key, value] = trimmed.split(':').map((s) => s.trim());

      // 保存之前的规则或例外
      if (currentRule && currentSection === 'rules') {
        rule.rules.push(currentRule);
        currentRule = null;
      }
      if (currentException && currentSection === 'exceptions') {
        rule.exceptions.push(currentException);
        currentException = null;
      }

      // 处理规则字段
      if (currentSection === 'rules' && currentRule) {
        if (key === 'id') {
          // 新规则开始
        } else if (['name', 'description', 'severity', 'pattern', 'suggestion', 'example'].includes(key)) {
          currentRule[key] = value;
        }
        continue;
      }

      // 处理例外字段
      if (currentSection === 'exceptions' && currentException) {
        if (['description', 'pattern'].includes(key)) {
          currentException[key] = value;
        }
        continue;
      }

      // 处理简单字段
      if (['id', 'name', 'description', 'version', 'category', 'priority'].includes(key)) {
        rule[key] = value;
      } else if (key === 'enabled') {
        rule[key] = value === 'true';
      }
    }
  }

  // 保存最后的规则或例外
  if (currentRule && currentSection === 'rules') {
    rule.rules.push(currentRule);
  }
  if (currentException && currentSection === 'exceptions') {
    rule.exceptions.push(currentException);
  }

  // 验证必需字段
  if (!rule.id || !rule.name || !rule.category) {
    return null;
  }

  return rule as RuleConfigFile;
}

/**
 * 展开路径
 */
function expandPath(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  if (!path.isAbsolute(filePath)) {
    return path.resolve(filePath);
  }
  return filePath;
}

/**
 * 获取所有规则 ID
 */
export async function getAllRuleIds(): Promise<string[]> {
  const { rules } = await loadRules();
  return Array.from(rules.keys());
}

/**
 * 检查规则是否存在
 */
export async function ruleExists(ruleId: string): Promise<boolean> {
  const rule = await loadRule(ruleId);
  return rule !== null;
}

/**
 * 获取启用的规则
 */
export async function getEnabledRules(): Promise<RuleConfigFile[]> {
  const { rules } = await loadRules({ enabledOnly: true });
  return Array.from(rules.values());
}

/**
 * 按类别获取规则
 */
export async function getRulesByCategory(category: string): Promise<RuleConfigFile[]> {
  const { rules } = await loadRules({ category: category as any });
  return Array.from(rules.values());
}
