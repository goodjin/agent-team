/**
 * 规则管理器
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import type { RuleConfigFile, RuleDefinition, RuleValidationResult } from './types.js';
import { loadRules, loadRule, loadBuiltInRules, findCustomRulesDir } from './rule-loader.js';
import { validateRuleConfig } from './rule-validator.js';
import { resolvePriority, getRulePriority, type PriorityConfig } from './rule-priority.js';

export { RuleConfigFile, RuleDefinition, RuleValidationResult };

/**
 * 规则管理器类
 */
export class RuleManager {
  private rules: Map<string, RuleConfigFile> = new Map();
  private customRulesDir: string | null = null;
  private priorityConfig: PriorityConfig;

  constructor(priorityConfig?: PriorityConfig) {
    this.priorityConfig = priorityConfig || {
      security: 100,
      coding: 80,
      'best-practices': 60,
      project: 40,
      custom: 20,
    };
    this.initialize();
  }

  /**
   * 初始化规则管理器
   */
  private async initialize(): Promise<void> {
    this.customRulesDir = await findCustomRulesDir();
    await this.reload();
  }

  /**
   * 重新加载所有规则
   */
  async reload(): Promise<{ loaded: number; errors: string[] }> {
    const { rules, loaded, errors } = await loadRules({
      includeBuiltIn: true,
      includeCustom: true,
      enabledOnly: false,
    });

    this.rules = rules;
    return { loaded: loaded.length, errors };
  }

  /**
   * 获取所有规则
   */
  getAllRules(): RuleConfigFile[] {
    return Array.from(this.rules.values());
  }

  /**
   * 根据 ID 获取规则
   */
  getRuleById(id: string): RuleConfigFile | undefined {
    return this.rules.get(id);
  }

  /**
   * 获取启用的规则
   */
  getEnabledRules(): RuleConfigFile[] {
    return Array.from(this.rules.values()).filter((r) => r.enabled);
  }

  /**
   * 获取按优先级排序的规则
   */
  getRulesByPriority(): RuleConfigFile[] {
    return Array.from(this.rules.values())
      .filter((r) => r.enabled)
      .sort((a, b) => {
        const priorityA = resolvePriority(a.category, this.priorityConfig);
        const priorityB = resolvePriority(b.category, this.priorityConfig);
        return priorityB - priorityA;
      });
  }

  /**
   * 获取适用于特定角色的规则
   */
  getRulesForRole(roleId: string): RuleConfigFile[] {
    return this.getEnabledRules().filter(
      (r) => r.appliesTo.includes('all') || r.appliesTo.includes(roleId)
    );
  }

  /**
   * 创建自定义规则
   */
  async createRule(
    rule: Omit<RuleConfigFile, 'id' | 'version' | 'lastUpdated'>
  ): Promise<{
    success: boolean;
    newRule?: RuleConfigFile;
    errors: string[];
  }> {
    const newRule: RuleConfigFile = {
      ...rule,
      id: `custom-${uuidv4().slice(0, 8)}`,
      version: '1.0.0',
    };

    // 验证规则
    const validation = validateRuleConfig(newRule);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    // 确保自定义规则目录存在
    if (!this.customRulesDir) {
      this.customRulesDir = path.join(os.homedir(), '.agent-team', 'rules');
    }

    await fs.mkdir(this.customRulesDir, { recursive: true });

    // 保存规则文件
    const filePath = path.join(this.customRulesDir, `${newRule.id}.yaml`);
    await fs.writeFile(filePath, this.ruleToYaml(newRule), 'utf-8');

    // 添加到内存
    this.rules.set(newRule.id, newRule);

    return { success: true, newRule, errors: [] };
  }

  /**
   * 更新规则
   */
  async updateRule(
    ruleId: string,
    updates: Partial<RuleConfigFile>
  ): Promise<{
    success: boolean;
    errors: string[];
  }> {
    const rule = this.rules.get(ruleId);

    if (!rule) {
      return { success: false, errors: [`规则 ${ruleId} 不存在`] };
    }

    // 内置规则不能修改
    if (!rule.id.startsWith('custom-')) {
      return { success: false, errors: ['无法修改内置规则'] };
    }

    // 合并更新
    const updatedRule: RuleConfigFile = {
      ...rule,
      ...updates,
      id: rule.id,
      version: rule.version,
    };

    // 验证
    const validation = validateRuleConfig(updatedRule);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    // 保存
    if (this.customRulesDir) {
      const filePath = path.join(this.customRulesDir, `${ruleId}.yaml`);
      await fs.writeFile(filePath, this.ruleToYaml(updatedRule), 'utf-8');
    }

    // 更新内存
    this.rules.set(ruleId, updatedRule);

    return { success: true, errors: [] };
  }

  /**
   * 删除规则
   */
  async deleteRule(
    ruleId: string
  ): Promise<{
    success: boolean;
    errors: string[];
  }> {
    const rule = this.rules.get(ruleId);

    if (!rule) {
      return { success: false, errors: [`规则 ${ruleId} 不存在`] };
    }

    if (!rule.id.startsWith('custom-')) {
      return { success: false, errors: ['无法删除内置规则'] };
    }

    // 删除文件
    if (this.customRulesDir) {
      const filePath = path.join(this.customRulesDir, `${ruleId}.yaml`);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        return { success: false, errors: [`删除规则文件失败: ${error}`] };
      }
    }

    // 从内存移除
    this.rules.delete(ruleId);

    return { success: true, errors: [] };
  }

  /**
   * 启用规则
   */
  async enableRule(ruleId: string): Promise<{ success: boolean; errors: string[] }> {
    return this.updateRule(ruleId, { enabled: true });
  }

  /**
   * 禁用规则
   */
  async disableRule(ruleId: string): Promise<{ success: boolean; errors: string[] }> {
    return this.updateRule(ruleId, { enabled: false });
  }

  /**
   * 验证规则配置
   */
  validateRuleConfig(rule: RuleConfigFile): RuleValidationResult {
    return validateRuleConfig(rule);
  }

  /**
   * 规则转 YAML
   */
  private ruleToYaml(rule: RuleConfigFile): string {
    const lines: string[] = [];

    lines.push(`# ${rule.name}`);
    lines.push('');
    lines.push(`id: ${rule.id}`);
    lines.push(`name: ${rule.name}`);
    lines.push(`description: ${rule.description}`);
    lines.push(`version: "${rule.version}"`);
    lines.push(`enabled: ${rule.enabled}`);
    lines.push('');
    lines.push(`category: ${rule.category}`);
    lines.push(`priority: ${rule.priority}`);
    lines.push('');
    lines.push('# 适用范围');
    lines.push('appliesTo:');
    for (const role of rule.appliesTo) {
      lines.push(`  - ${role}`);
    }
    lines.push('');
    lines.push('# 规则列表');
    lines.push('rules:');
    for (const r of rule.rules) {
      lines.push(`  - id: ${r.id}`);
      lines.push(`    name: ${r.name}`);
      lines.push(`    description: ${r.description}`);
      lines.push(`    severity: ${r.severity}`);
      lines.push(`    pattern: |`);
      for (const patternLine of r.pattern.split('\n')) {
        lines.push(`      ${patternLine}`);
      }
      if (r.suggestion) {
        lines.push(`    suggestion: ${r.suggestion}`);
      }
      if (r.example) {
        lines.push(`    example: |`);
        for (const exampleLine of r.example.split('\n')) {
          lines.push(`      ${exampleLine}`);
        }
      }
    }

    if (rule.exceptions && rule.exceptions.length > 0) {
      lines.push('');
      lines.push('# 规则例外');
      lines.push('exceptions:');
      for (const exception of rule.exceptions) {
        lines.push(`  - id: ${exception.id}`);
        lines.push(`    description: ${exception.description}`);
        lines.push(`    pattern: "${exception.pattern}"`);
        lines.push('    rules:');
        for (const ruleId of exception.rules) {
          lines.push(`      - ${ruleId}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    enabled: number;
    disabled: number;
    byCategory: { [key: string]: number };
  } {
    const allRules = Array.from(this.rules.values());
    const enabledRules = allRules.filter((r) => r.enabled);
    const byCategory: { [key: string]: number } = {};

    for (const rule of allRules) {
      byCategory[rule.category] = (byCategory[rule.category] || 0) + 1;
    }

    return {
      total: allRules.length,
      enabled: enabledRules.length,
      disabled: allRules.length - enabledRules.length,
      byCategory,
    };
  }
}

/**
 * 规则管理器单例
 */
let ruleManagerInstance: RuleManager | null = null;

export function getRuleManager(): RuleManager {
  if (!ruleManagerInstance) {
    ruleManagerInstance = new RuleManager();
  }
  return ruleManagerInstance;
}

export function resetRuleManager(): void {
  ruleManagerInstance = null;
}
