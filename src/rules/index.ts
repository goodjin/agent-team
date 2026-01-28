/**
 * 规则管理模块
 */

// 类型导出
export type {
  RuleType,
  RuleSeverity,
  RulePattern,
  RuleDefinition,
  RuleConfigFile,
  RuleException,
  RulePriorityConfig,
  RuleValidationResult,
  RuleLoadOptions,
  RuleApplyResult,
  RuleMatch,
  RuleSet,
} from './types.js';

// 规则加载器
export {
  loadRules,
  loadBuiltInRules,
  loadCustomRules,
  loadRule,
  findCustomRulesDir,
  getAllRuleIds,
  ruleExists,
  getEnabledRules,
  getRulesByCategory,
} from './rule-loader.js';

// 规则管理器
export {
  RuleManager,
  getRuleManager,
  resetRuleManager,
} from './rule-manager.js';

// 规则优先级
export {
  DEFAULT_PRIORITY_CONFIG,
  resolvePriority,
  getRulePriority,
  comparePriority,
  createPriorityConfig,
  validatePriorityConfig,
  sortByPriority,
  getPriorityDescription,
  PriorityManager,
  getPriorityManager,
  resetPriorityManager,
} from './rule-priority.js';

// 规则注入器
export {
  RuleInjector,
  createRuleInjector,
  getRuleInjector,
  resetRuleInjector,
} from './rule-injector.js';

// 规则验证器
export {
  validateRuleConfig,
  validateSubRule,
  validateRuleConfigQuick,
  validateRuleConfigs,
  validateRulePattern,
  validateAppliesTo,
} from './rule-validator.js';

// 规则类别
export const RULE_CATEGORIES = [
  { id: 'security', name: '安全规则', priority: 100 },
  { id: 'coding', name: '编码规范', priority: 80 },
  { id: 'best-practices', name: '最佳实践', priority: 60 },
  { id: 'project', name: '项目规则', priority: 40 },
  { id: 'custom', name: '自定义规则', priority: 20 },
] as const;

// 规则严重级别
export const RULE_SEVERITIES = [
  { id: 'critical', name: '严重', color: 'red' },
  { id: 'error', name: '错误', color: 'orange' },
  { id: 'warning', name: '警告', color: 'yellow' },
  { id: 'info', name: '信息', color: 'blue' },
] as const;
