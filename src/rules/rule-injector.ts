/**
 * 规则注入器
 */

import type { RuleConfigFile, RuleDefinition } from './types.js';
import type { RoleType } from '../roles/types.js';
import { getRuleManager, type RuleManager } from './rule-manager.js';
import { getPriorityManager, type PriorityManager } from './rule-priority.js';

/**
 * 规则注入结果
 */
export interface RuleInjectionResult {
  success: boolean;
  injectedRules: string[];
  systemPrompt: string;
  warnings: string[];
}

/**
 * 规则注入器
 */
export class RuleInjector {
  private ruleManager: RuleManager;
  private priorityManager: PriorityManager;

  constructor(ruleManager?: RuleManager, priorityManager?: PriorityManager) {
    this.ruleManager = ruleManager || getRuleManager();
    this.priorityManager = priorityManager || getPriorityManager();
  }

  /**
   * 将规则注入到系统提示词
   */
  injectIntoSystemPrompt(
    roleId: RoleType,
    basePrompt: string
  ): RuleInjectionResult {
    const injectedRules: string[] = [];
    const warnings: string[] = [];

    // 获取适用于该角色的规则
    const rules = this.ruleManager.getRulesForRole(roleId);

    // 按优先级排序
    const priorityConfig = this.priorityManager.getConfig();
    rules.sort((a, b) => {
      const priorityA = priorityConfig[a.category] || 0;
      const priorityB = priorityConfig[b.category] || 0;
      return priorityB - priorityA;
    });

    // 构建规则注入文本
    if (rules.length > 0) {
      const rulesSection = this.buildRulesSection(rules);
      basePrompt += '\n\n## 规则约束\n' + rulesSection;
      injectedRules.push(...rules.map((r) => r.id));
    }

    return {
      success: true,
      injectedRules,
      systemPrompt: basePrompt,
      warnings,
    };
  }

  /**
   * 构建规则部分文本
   */
  private buildRulesSection(rules: RuleConfigFile[]): string {
    const lines: string[] = [];
    let currentCategory: string | null = null;

    for (const rule of rules) {
      // 添加类别标题
      if (rule.category !== currentCategory) {
        currentCategory = rule.category;
        lines.push('');
        lines.push(`### ${this.getCategoryTitle(rule.category)}`);
        lines.push('');
      }

      // 添加规则
      lines.push(`#### ${rule.name} (${rule.id})`);
      lines.push('');
      lines.push(`${rule.description}`);
      lines.push('');
      lines.push(`**严重级别**: ${this.formatSeverity(rule.rules[0]?.severity || 'warning')}`);
      lines.push('');

      // 添加子规则
      for (const subRule of rule.rules) {
        lines.push(`- **${subRule.name}**: ${subRule.description}`);
        if (subRule.suggestion) {
          lines.push(`  - 建议: ${subRule.suggestion}`);
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 获取类别标题
   */
  private getCategoryTitle(category: string): string {
    const titles: { [key: string]: string } = {
      security: '安全规则',
      coding: '编码规范',
      'best-practices': '最佳实践',
      project: '项目规则',
      custom: '自定义规则',
    };
    return titles[category] || category;
  }

  /**
   * 格式化严重级别
   */
  private formatSeverity(severity: string): string {
    const labels: { [key: string]: string } = {
      critical: '严重',
      error: '错误',
      warning: '警告',
      info: '信息',
    };
    return labels[severity] || severity;
  }

  /**
   * 注入单个规则
   */
  injectRule(
    ruleId: string,
    basePrompt: string
  ): RuleInjectionResult {
    const rule = this.ruleManager.getRuleById(ruleId);

    if (!rule) {
      return {
        success: false,
        injectedRules: [],
        systemPrompt: basePrompt,
        warnings: [`规则 ${ruleId} 不存在`],
      };
    }

    if (!rule.enabled) {
      return {
        success: false,
        injectedRules: [],
        systemPrompt: basePrompt,
        warnings: [`规则 ${ruleId} 已禁用`],
      };
    }

    const rulesSection = this.buildRulesSection([rule]);

    return {
      success: true,
      injectedRules: [ruleId],
      systemPrompt: basePrompt + '\n\n## 规则约束\n' + rulesSection,
      warnings: [],
    };
  }

  /**
   * 获取规则建议
   */
  getRuleSuggestions(
    roleId: RoleType,
    context: { code?: string; file?: string }
  ): string[] {
    const suggestions: string[] = [];
    const rules = this.ruleManager.getRulesForRole(roleId);

    for (const rule of rules) {
      for (const subRule of rule.rules) {
        if (context.code && this.matchesRule(context.code, subRule)) {
          if (subRule.suggestion) {
            suggestions.push(`[${rule.name}] ${subRule.suggestion}`);
          }
        }
      }
    }

    return suggestions;
  }

  /**
   * 检查代码是否匹配规则
   */
  private matchesRule(code: string, rule: RuleDefinition): boolean {
    try {
      const regex = new RegExp(rule.pattern, 'm');
      return regex.test(code);
    } catch {
      // 正则表达式无效，尝试简单匹配
      return code.includes(rule.pattern);
    }
  }

  /**
   * 批量注入规则
   */
  injectMultiple(
    roleId: RoleType,
    basePrompt: string,
    ruleIds?: string[]
  ): RuleInjectionResult {
    const allRules = this.ruleManager.getRulesForRole(roleId);
    const rulesToInject = ruleIds
      ? allRules.filter((r) => ruleIds.includes(r.id))
      : allRules;

    return this.injectIntoSystemPrompt(roleId, basePrompt);
  }
}

/**
 * 创建规则注入器
 */
export function createRuleInjector(
  ruleManager?: RuleManager,
  priorityManager?: PriorityManager
): RuleInjector {
  return new RuleInjector(ruleManager, priorityManager);
}

/**
 * 默认规则注入器
 */
let defaultInjector: RuleInjector | null = null;

export function getRuleInjector(): RuleInjector {
  if (!defaultInjector) {
    defaultInjector = createRuleInjector();
  }
  return defaultInjector;
}

export function resetRuleInjector(): void {
  defaultInjector = null;
}
