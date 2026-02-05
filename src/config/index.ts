/**
 * Project Agent 配置模块
 * 统一配置管理系统
 */

// 类型导出
export type {
  AgentConfigFile,
  ConfigValidationResult,
  ConfigLoadOptions,
  ConfigSaveOptions,
  LLMProvider,
  ModelConfig,
  ProviderConfig,
  RoleType,
  RoleProviderMapping,
  ProjectConfig,
  AgentConfig,
  ToolsConfig,
  FileToolsConfig,
  GitToolsConfig,
  CodeToolsConfig,
  RulesConfig,
} from './types.js';

// 默认配置
export { getDefaultConfig, getMinimalConfig, DEFAULT_CONFIG_PATHS, LEGACY_CONFIG_PATHS } from './defaults.js';

// 环境变量处理
export {
  expandEnvironmentVariables,
  expandEnvironmentVariablesInObject,
  applyEnvironmentOverrides,
  parseEnvValue,
  hasEnvironmentVariable,
  getEnvironmentVariable,
  getRelevantEnvironmentVariables,
  validateEnvironmentVariables,
  isValidApiKey,
} from './environment.js';

// 配置加载
export {
  loadConfig,
  configExists,
  getConfigPath,
  hasLegacyConfig,
  expandPath,
} from './config-loader.js';

// 配置验证
export { validateSync, validateConfigDetailed, validateConfigQuick } from './config-validator.js';

// 配置迁移
export { migrateLegacyConfig, migrateAll, checkMigrationNeeded, type MigrationResult } from './config-migrator.js';

// 守护进程管理
export { Daemon, createDaemon, type DaemonConfig, type DaemonStatus, type DaemonEvents } from './daemon.js';
