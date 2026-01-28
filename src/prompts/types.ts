/**
 * 提示词类型定义
 */

import type { RoleType } from '../roles/types.js';

/**
 * 提示词模板
 */
export interface PromptTemplate {
  template: string;
  variables?: string[];
  description?: string;
}

/**
 * 任务提示词配置
 */
export interface TaskPromptConfig {
  featureDevelopment: PromptTemplate;
  bugFix: PromptTemplate;
  codeReview: PromptTemplate;
  requirementAnalysis: PromptTemplate;
  architectureDesign: PromptTemplate;
  testing: PromptTemplate;
  documentation: PromptTemplate;
  [key: string]: PromptTemplate;
}

/**
 * 上下文配置
 */
export interface ContextConfig {
  description: string;
  filePattern: string;
}

/**
 * 输出格式配置
 */
export interface OutputFormatConfig {
  code: {
    language: string;
    style: string;
  };
  tests: {
    framework: string;
    coverage: boolean;
  };
  documentation: {
    style: string;
  };
}

/**
 * 提示词配置
 */
export interface PromptDefinition {
  // 角色 ID（与角色定义对应）
  roleId: string;

  // 版本信息
  version: string;
  lastUpdated: string;

  // 系统提示词
  systemPrompt: string;

  // 任务提示词模板
  taskTemplates: TaskPromptConfig;

  // 上下文配置
  contexts: {
    [key: string]: ContextConfig;
  };

  // 输出格式
  outputFormat: OutputFormatConfig;

  // 元数据
  author?: string;
  tags?: string[];
}

/**
 * 提示词配置文件结构
 */
export interface PromptConfigFile {
  version: string;
  prompts: PromptDefinition[];
}

/**
 * 提示词变量
 */
export interface PromptVariable {
  name: string;
  description?: string;
  required: boolean;
  defaultValue?: any;
}

/**
 * 变量来源
 */
export type VariableSource = 'system' | 'task' | 'context';

/**
 * 提示词验证结果
 */
export interface PromptValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 提示词加载选项
 */
export interface PromptLoadOptions {
  roleId?: string;
  includeBuiltIn?: boolean;
  includeCustom?: boolean;
}

/**
 * 提示词版本快照
 */
export interface PromptSnapshot {
  id: string;
  roleId: string;
  version: string;
  content: string;
  createdAt: string;
  description?: string;
}
