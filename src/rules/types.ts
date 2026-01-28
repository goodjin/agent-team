/**
 * 规则类型定义
 */

import type { RoleType } from '../roles/types.js';

/**
 * 规则类型
 */
export type RuleType = 'coding' | 'security' | 'best-practices' | 'project' | 'custom';

/**
 * 规则严重级别
 */
export type RuleSeverity = 'error' | 'warning' | 'info';

/**
 * 规则模式
 */
export interface RulePattern {
  type: 'regex' | 'string' | 'ast';
  pattern: string;
  flags?: string;
}

/**
 * 规则定义
 */
export interface RuleDefinition {
  id: string;
  name: string;
  description: string;
  severity: RuleSeverity;
  pattern: string;
  suggestion?: string;
  example?: string;
}

/**
 * 规则文件结构
 */
export interface RuleConfigFile {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  category: RuleType;
  priority: number;
  appliesTo: string[];
  rules: RuleDefinition[];
  exceptions?: RuleException[];
}

/**
 * 规则例外
 */
export interface RuleException {
  id: string;
  description: string;
  pattern: string;
  rules: string[];
}

/**
 * 规则优先级配置
 */
export interface RulePriorityConfig {
  security: number;
  coding: number;
  'best-practices': number;
  project: number;
  custom: number;
}

/**
 * 规则验证结果
 */
export interface RuleValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 规则加载选项
 */
export interface RuleLoadOptions {
  includeBuiltIn?: boolean;
  includeCustom?: boolean;
  enabledOnly?: boolean;
  category?: RuleType;
  tags?: string[];
}

/**
 * 规则应用结果
 */
export interface RuleApplyResult {
  ruleId: string;
  matched: boolean;
  matches: RuleMatch[];
  suggestions: string[];
}

/**
 * 规则匹配
 */
export interface RuleMatch {
  file: string;
  line: number;
  column: number;
  match: string;
  rule: RuleDefinition;
}

/**
 * 规则集
 */
export interface RuleSet {
  id: string;
  name: string;
  description: string;
  rules: Map<string, RuleDefinition>;
  priority: number;
  category: RuleType;
}
