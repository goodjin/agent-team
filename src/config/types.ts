/**
 * Project Agent 配置文件类型定义
 */

/**
 * 配置版本
 */
export const CONFIG_VERSION = '1.0.0';

/**
 * LLM 提供商类型
 */
export type LLMProvider = 'anthropic' | 'openai' | 'ollama' | 'custom';

/**
 * 模型配置
 */
export interface ModelConfig {
  model: string;
  maxTokens?: number;
  temperature?: number;
  description?: string;
}

/**
 * LLM 提供商配置
 */
export interface ProviderConfig {
  name: string;
  provider: LLMProvider;
  apiKey: string;
  baseURL?: string;
  enabled: boolean;
  models: {
    [key: string]: ModelConfig;
  };
}

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
 * 角色提供商映射项
 */
export interface RoleProviderMappingItem {
  providerName: string;
  modelName?: string;
}

/**
 * 角色提供商映射（支持多个候选模型）
 */
export type RoleProviderMapping = RoleProviderMappingItem | RoleProviderMappingItem[];

/**
 * 规则配置
 */
export interface RulesConfig {
  enabled: string[];
  disabled: string[];
}

/**
 * 项目配置
 */
export interface ProjectConfig {
  name: string;
  path: string;
  autoAnalyze: boolean;
}

/**
 * Agent 配置
 */
export interface AgentConfig {
  maxIterations: number;
  maxHistory: number;
  autoConfirm: boolean;
  showThoughts: boolean;
}

/**
 * 文件工具配置
 */
export interface FileToolsConfig {
  allowDelete: boolean;
  allowOverwrite: boolean;
}

/**
 * Git 工具配置
 */
export interface GitToolsConfig {
  autoCommit: boolean;
  confirmPush: boolean;
}

/**
 * 代码工具配置
 */
export interface CodeToolsConfig {
  enabled: boolean;
}

/**
 * 日志配置
 */
export interface LoggingConfig {
  enabled: boolean;
  level: 'debug' | 'info' | 'warn' | 'error';
  logDir?: string;
  logToFile: boolean;
  logToConsole: boolean;
  maxFileSize?: number; // 最大文件大小（字节），默认 10MB
  maxFiles?: number; // 保留的最大文件数，默认 30
}

/**
 * 工具配置
 */
export interface ToolsConfig {
  file: FileToolsConfig;
  git: GitToolsConfig;
  code: CodeToolsConfig;
}

/**
 * LLM 配置部分
 */
export interface LLMConfigSection {
  defaultProvider: string;
  providers: {
    [key: string]: ProviderConfig;
  };
  roleMapping: {
    [role in RoleType]?: RoleProviderMapping;
  };
  fallbackOrder: string[];
}

/**
 * 主配置文件结构
 */
export interface AgentConfigFile {
  version: string;
  llm: LLMConfigSection;
  project: ProjectConfig;
  agent: AgentConfig;
  tools: ToolsConfig;
  rules: RulesConfig;
  logging?: LoggingConfig;
}

/**
 * 配置验证结果
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  providers: {
    name: string;
    enabled: boolean;
    hasValidKey: boolean;
  }[];
}

/**
 * 配置加载选项
 */
export interface ConfigLoadOptions {
  configPath?: string;
  environmentOverrides?: boolean;
  validate?: boolean;
}

/**
 * 配置保存选项
 */
export interface ConfigSaveOptions {
  backupExisting?: boolean;
  prettyPrint?: boolean;
}
