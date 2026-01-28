/**
 * 规则验证器
 */

import type { RuleConfigFile, RuleDefinition, RuleValidationResult } from './types.js';

/**
 * 验证规则配置
 */
export function validateRuleConfig(rule: RuleConfigFile): RuleValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 验证必需字段
  if (!rule.id) {
    errors.push('缺少规则 ID (id)');
  } else if (!/^[a-z][a-z0-9-]*$/.test(rule.id)) {
    errors.push('规则 ID 必须以小写字母开头，只能包含小写字母、数字和短横线');
  }

  if (!rule.name) {
    errors.push('缺少规则名称 (name)');
  }

  if (!rule.description) {
    errors.push('缺少规则描述 (description)');
  }

  if (!rule.category) {
    errors.push('缺少规则类别 (category)');
  } else if (!['coding', 'security', 'best-practices', 'project', 'custom'].includes(rule.category)) {
    errors.push(`无效的规则类别: ${rule.category}`);
  }

  // 验证优先级
  if (rule.priority !== undefined) {
    if (typeof rule.priority !== 'number' || rule.priority < 0 || rule.priority > 100) {
      errors.push('优先级必须在 0-100 之间');
    }
  }

  // 验证适用范围
  if (!rule.appliesTo || rule.appliesTo.length === 0) {
    warnings.push('缺少适用范围 (appliesTo)');
  }

  // 验证规则列表
  if (!rule.rules || rule.rules.length === 0) {
    errors.push('缺少规则列表 (rules)');
  } else {
    for (let i = 0; i < rule.rules.length; i++) {
      const subRule = rule.rules[i];
      const subRuleResult = validateSubRule(subRule);
      if (!subRuleResult.isValid) {
        errors.push(...subRuleResult.errors.map((e) => `规则 ${i + 1}: ${e}`));
      }
      if (subRuleResult.warnings.length > 0) {
        warnings.push(...subRuleResult.warnings.map((w) => `规则 ${i + 1}: ${w}`));
      }
    }
  }

  // 验证例外
  if (rule.exceptions) {
    for (let i = 0; i < rule.exceptions.length; i++) {
      const exception = rule.exceptions[i];
      if (!exception.id) {
        errors.push(`例外 ${i + 1}: 缺少 ID`);
      }
      if (!exception.description) {
        errors.push(`例外 ${i + 1}: 缺少描述`);
      }
      if (!exception.pattern) {
        errors.push(`例外 ${i + 1}: 缺少匹配模式`);
      }
      if (!exception.rules || exception.rules.length === 0) {
        warnings.push(`例外 ${i + 1}: 没有指定豁免的规则`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证子规则
 */
export function validateSubRule(rule: RuleDefinition): RuleValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rule.id) {
    errors.push('缺少规则 ID');
  } else if (!/^[a-z][a-z0-9-]*$/.test(rule.id)) {
    errors.push('规则 ID 格式无效');
  }

  if (!rule.name) {
    errors.push('缺少规则名称');
  }

  if (!rule.description) {
    errors.push('缺少规则描述');
  }

  if (!rule.severity) {
    warnings.push('缺少严重级别，将使用默认值 warning');
  } else if (!['critical', 'error', 'warning', 'info'].includes(rule.severity)) {
    errors.push(`无效的严重级别: ${rule.severity}`);
  }

  if (!rule.pattern) {
    errors.push('缺少匹配模式');
  } else {
    // 验证正则表达式格式
    try {
      new RegExp(rule.pattern);
    } catch {
      warnings.push('正则表达式格式可能有误');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 快速验证
 */
export function validateRuleConfigQuick(rule: RuleConfigFile): boolean {
  return !!(
    rule.id &&
    rule.name &&
    rule.description &&
    rule.category &&
    rule.rules &&
    rule.rules.length > 0
  );
}

/**
 * 批量验证规则
 */
export function validateRuleConfigs(
  rules: RuleConfigFile[]
): {
  valid: RuleConfigFile[];
  invalid: { rule: RuleConfigFile; errors: string[] }[];
} {
  const valid: RuleConfigFile[] = [];
  const invalid: { rule: RuleConfigFile; errors: string[] }[] = [];

  for (const rule of rules) {
    const result = validateRuleConfig(rule);
    if (result.isValid) {
      valid.push(rule);
    } else {
      invalid.push({ rule, errors: result.errors });
    }
  }

  return { valid, invalid };
}

/**
 * 验证规则模式
 */
export function validateRulePattern(pattern: string): {
  valid: boolean;
  error?: string;
} {
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: `无效的正则表达式: ${error}` };
  }
}

/**
 * 验证适用范围
 */
export function validateAppliesTo(appliesTo: string[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const validRoles = [
    'all',
    'product-manager',
    'architect',
    'developer',
    'tester',
    'doc-writer',
  ];

  for (const role of appliesTo) {
    if (role !== 'all' && !validRoles.includes(role)) {
      errors.push(`未知的角色: ${role}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
