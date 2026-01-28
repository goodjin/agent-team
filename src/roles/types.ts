/**
 * 角色类型定义
 */

import type { LLMProvider, ModelConfig } from '../config/types.js';

/**
 * 角色类型
 */
export type RoleType =
  | 'product-manager'
  | 'architect'
  | 'developer'
  | 'tester'
  | 'doc-writer'
  | string;

/**
 * 角色属性配置
 */
export interface RoleProperties {
  canDelete: boolean;
  canDisable: boolean;
  hidden: boolean;
}

/**
 * 角色能力
 */
export interface RoleCapability {
  name: string;
  description?: string;
}

/**
 * 角色约束
 */
export interface RoleConstraint {
  rule: string;
  description?: string;
}

/**
 * 角色 LLM 配置
 */
export interface RoleLLMConfig {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * 角色定义
 */
export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  type: 'built-in' | 'custom' | 'extends';
  extends?: string;

  // 角色属性
  properties: RoleProperties;

  // 角色内容
  capabilities: string[];
  responsibilities: string[];
  constraints: string[];

  // LLM 配置
  llm: RoleLLMConfig;

  // 提示词路径
  promptFile?: string;

  // 标签
  tags: string[];

  // 元数据
  version?: string;
  lastUpdated?: string;
  author?: string;
}

/**
 * 角色配置文件结构
 */
export interface RoleConfigFile {
  version: string;
  lastUpdated: string;
  roles: RoleDefinition[];
}

/**
 * 角色继承配置
 */
export interface RoleInheritanceConfig {
  baseRole: string;
  additionalCapabilities: string[];
  additionalConstraints: string[];
  overriddenConstraints: { [key: string]: string };
  promptEnhancement: string;
}

/**
 * 角色验证结果
 */
export interface RoleValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 角色加载选项
 */
export interface RoleLoadOptions {
  includeBuiltIn?: boolean;
  includeCustom?: boolean;
  includeDisabled?: boolean;
  tags?: string[];
}

/**
 * 角色查找选项
 */
export interface RoleFindOptions {
  byId?: string;
  byName?: string;
  byTag?: string;
  byType?: 'built-in' | 'custom' | 'extends';
}
