/**
 * Project Agent - 多角色 AI 项目管理系统
 *
 * 一个基于角色的多智能体项目管理系统，通过定义不同的专家角色
 * 来完成项目分析、需求设计、架构设计、开发执行、测试和文档等任务。
 */

// 核心导出
export { ProjectAgent } from './core/index.js';
export { TaskManager } from './core/index.js';
export { OnboardingManager, createOnboardingManager } from './core/onboarding.js';

// 类型导出
export type {
  // 基础类型
  LLMProvider,
  LLMConfig,
  RoleType,
  TaskType,
  TaskStatus,
  Priority,
  ToolResult,

  // 角色和任务
  RoleDefinition,
  Task,
  TaskConstraints,

  // 项目配置
  ProjectConfig,
  ToolConfig,
  ProjectConstraints,

  // 工具
  ToolDefinition,

  // 工作流
  Workflow,
  WorkflowStep,
  WorkflowTrigger,
  RetryPolicy,

  // 执行
  ExecutionContext,
  AgentEvent,
  AgentEventData,
  EventListener,

  // 消息和响应
  Message,
  LLMResponse,

  // 分析和设计结果
  ProjectAnalysis,
  RequirementAnalysis,
  ArchitectureDesign,
} from './types/index.js';

// 角色导出
export {
  BaseRole,
  RoleFactory,
  ProductManager,
  Architect,
  Developer,
  Tester,
  DocWriter,
} from './roles/index.js';

// 如果角色类不存在，提供占位符
// export { ProductManager } from './roles/product-manager.js';
// export { Architect } from './roles/architect.js';
// export { Developer } from './roles/developer.js';
// export { Tester } from './roles/tester.js';
// export { DocWriter } from './roles/doc-writer.js';

// 工具导出
export {
  BaseTool,
  ToolRegistry,
  ReadFileTool,
  WriteFileTool,
  SearchFilesTool,
  DeleteFileTool,
  ListDirectoryTool,
  GitStatusTool,
  GitCommitTool,
  GitBranchTool,
  GitPullTool,
  GitPushTool,
} from './tools/index.js';

// 服务导出
export {
  LLMService,
  AnthropicService,
  OpenAIService,
  LLMServiceFactory,
} from './services/index.js';

// CLI 导出
export {
  InteractiveCLI,
  ProgressDisplay,
  InteractiveExecutor,
  HybridModeManager,
  createHybridModeManager,
  ExecutionMode,
} from './cli/index.js';
export type { HybridModeOptions } from './cli/index.js';

// AI Agent 导出
export {
  IntelligentAgent,
  createIntelligentAgent,
  AIAgentSession,
  startAIAgentSession,
} from './ai/index.js';
export type { AIAgentConfig, ChatMessage, ToolCall, AIAgentSessionConfig } from './ai/index.js';

// 默认导出
export { ProjectAgent as default } from './core/index.js';
