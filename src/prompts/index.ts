/**
 * 提示词管理模块
 */

// 类型导出
export type {
  PromptTemplate,
  TaskPromptConfig,
  ContextConfig,
  OutputFormatConfig,
  PromptDefinition,
  PromptConfigFile,
  PromptVariable,
  PromptValidationResult,
  PromptLoadOptions,
  PromptSnapshot,
  VariableSource,
} from './types.js';

// 提示词加载器
export {
  loadPrompts,
  loadBuiltInPrompts,
  loadCustomPrompts,
  loadPrompt,
  findCustomPromptsDir,
  getAllPromptRoleIds,
  promptExists,
  getPromptPath,
} from './prompt-loader.js';

// 提示词变量系统
export {
  SYSTEM_VARIABLES,
  VariableParser,
  replaceVariables,
  extractTemplateVariables,
  checkTemplateVariables,
} from './prompt-variables.js';

// 提示词模板系统
export {
  TemplateRenderer,
  createTemplateRenderer,
  renderPrompt,
  formatTemplate,
  validateTemplateSyntax,
} from './prompt-templates.js';

// 提示词版本管理
export {
  PromptVersionManager,
  getVersionManager,
  resetVersionManager,
  shouldUpdateVersion,
  generateNextVersion,
} from './prompt-version.js';

// 内置模板名称
export const BUILT_IN_TASK_TEMPLATES = [
  'featureDevelopment',
  'bugFix',
  'codeReview',
  'requirementAnalysis',
  'architectureDesign',
  'testing',
  'documentation',
] as const;

export type BuiltInTaskTemplate = typeof BUILT_IN_TASK_TEMPLATES[number];
