/**
 * 核心类型定义
 */

import { z } from 'zod';

// 重新导出错误类型
export * from './errors.js';

// LLM 提供商类型
export type LLMProvider = 'anthropic' | 'openai' | 'ollama' | 'custom';

// LLM 配置
export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  baseURL?: string;
}

// 角色类型
export type RoleType =
  | 'product-manager'
  | 'architect'
  | 'developer'
  | 'tester'
  | 'doc-writer'
  | 'code-reviewer'
  | 'custom';

// 任务类型
export type TaskType =
  | 'requirement-analysis'
  | 'architecture-design'
  | 'development'
  | 'testing'
  | 'documentation'
  | 'code-review'
  | 'refactoring'
  | 'bug-fix'
  | 'custom';

// 任务状态
export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'blocked';

// 优先级
export type Priority = 'low' | 'medium' | 'high' | 'critical';

// 工具执行结果（前置声明）
export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, any>;
}

// 角色定义
export interface RoleDefinition {
  id: string;
  name: string;
  type: RoleType;
  description: string;
  responsibilities: string[];
  capabilities: string[];
  constraints: string[];
  outputFormat: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

// 对话消息
export interface TaskMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// 执行记录
export interface TaskExecutionRecord {
  id: string;
  role: RoleType;
  action: string; // 执行的动作描述
  startTime: Date;
  endTime?: Date;
  duration?: number; // 执行时长（毫秒）
  tokensUsed?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string; // 使用的模型
  provider?: string; // 使用的服务商
  result?: ToolResult;
  error?: string;
}

// 任务定义
export interface Task {
  id: string;
  type: TaskType;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dependencies?: string[]; // 依赖的任务 ID
  assignedRole?: RoleType; // 负责的角色（项目经理或执行角色）
  ownerRole?: RoleType; // 任务所有者（项目经理，负责拆分和验收）
  input?: any;
  output?: any;
  constraints?: TaskConstraints;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  subtasks?: Task[]; // 子任务
  result?: ToolResult;
  // 新增字段
  messages?: TaskMessage[]; // 对话历史
  executionRecords?: TaskExecutionRecord[]; // 执行记录
  summary?: string; // 任务总结
}

// 任务约束
export interface TaskConstraints {
  maxDuration?: number; // 最大执行时间（毫秒）
  codeStyle?: string; // 代码风格
  testCoverage?: number; // 测试覆盖率要求
  allowedTools?: string[]; // 允许使用的工具
  forbiddenTools?: string[]; // 禁止使用的工具
  maxTokens?: number; // 最大 token 数
  customRules?: string[]; // 自定义规则
}

// 项目配置
export interface ProjectConfig {
  projectName: string;
  projectPath: string;
  llmConfig?: LLMConfig; // 可选：如果不提供，将从配置文件加载
  tools?: ToolConfig;
  constraints?: ProjectConstraints;
  roles?: RoleDefinition[]; // 自定义角色
}

// 工具配置
export interface ToolConfig {
  enableGit?: boolean;
  enableTest?: boolean;
  enableBuild?: boolean;
  enableDeploy?: boolean;
  customTools?: string[];
}

// 项目约束
export interface ProjectConstraints {
  codeStyle?: 'prettier' | 'eslint' | 'custom';
  testFramework?: 'jest' | 'vitest' | 'mocha' | 'custom';
  testCoverage?: number;
  maxFileSize?: number;
  forbiddenPatterns?: string[];
  requiredPatterns?: string[];
  customStandards?: string[];
}

// 工具定义
export interface ToolDefinition {
  name: string;
  description: string;
  category: 'file' | 'git' | 'code' | 'test' | 'deploy' | 'custom';
  execute: (params: any) => Promise<ToolResult>;
  schema?: z.ZodType; // 参数验证 schema
  requiresAuth?: boolean;
  dangerous?: boolean; // 是否是危险操作
}

// 工作流定义
export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  triggers?: WorkflowTrigger[];
}

// 工作流步骤
export interface WorkflowStep {
  id: string;
  name: string;
  role: RoleType;
  taskType: TaskType;
  dependencies?: string[]; // 依赖的步骤 ID
  constraints?: TaskConstraints;
  retryPolicy?: RetryPolicy;
}

// 重试策略
export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  retryableErrors: string[];
}

// 工作流触发器
export interface WorkflowTrigger {
  type: 'manual' | 'event' | 'schedule';
  config?: any;
}

// 执行上下文
export interface ExecutionContext {
  project: ProjectConfig;
  currentTask: Task;
  history: ToolResult[];
  variables: Map<string, any>;
  tools: Map<string, ToolDefinition>;
}

// Agent 事件
export type AgentEvent =
  | 'task:created'
  | 'task:started'
  | 'task:completed'
  | 'task:failed'
  | 'task:blocked'
  | 'task:deleted'
  | 'task:message:added'
  | 'task:execution:recorded'
  | 'workflow:started'
  | 'workflow:completed'
  | 'workflow:failed'
  | 'tool:executed'
  | 'tool:before-execute'
  | 'tool:after-execute'
  | 'tool:error'
  | 'tool:registered'
  | 'tool:unregistered'
  | 'project:analysis:started'
  | 'project:analysis:completed'
  | 'error';

// 事件监听器
export type EventListener = (event: AgentEventData) => void | Promise<void>;

// 事件数据
export interface AgentEventData {
  event: AgentEvent;
  timestamp: Date;
  data: any;
}

// 消息类型
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  metadata?: Record<string, any>;
}

/**
 * 角色输出元数据
 */
export interface RoleOutputMetadata {
  role: string;
  taskType: string;
  model: string;
  tokensUsed: number;
  duration: number;
}

/**
 * 文件操作
 */
export interface FileOperation {
  path: string;
  content?: string;
  action: 'create' | 'update' | 'delete';
}

/**
 * 问题/警告
 */
export interface Issue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  location?: string;
}

/**
 * 角色输出数据
 */
export interface RoleOutputData {
  files?: FileOperation[];
  summary?: string;
  suggestions?: string[];
  issues?: Issue[];
}

/**
 * 角色输出标准格式
 */
export interface RoleOutput {
  // 核心内容
  content: string;

  // 元数据
  metadata: RoleOutputMetadata;

  // 结构化数据（可选）
  data?: RoleOutputData;
}

/**
 * 输出验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// LLM 响应
export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

// 项目分析结果
export interface ProjectAnalysis {
  structure: FileNode;
  techStack: string[];
  dependencies: Record<string, string>;
  patterns: string[];
  issues: Issue[];
  metrics: ProjectMetrics;
}

// 文件节点
export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  size?: number;
  language?: string;
}

// 问题
export interface Issue {
  type: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

// 项目指标
export interface ProjectMetrics {
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>;
  complexity: number;
  testCoverage?: number;
}

// 需求分析结果
export interface RequirementAnalysis {
  summary: string;
  features: Feature[];
  userStories: UserStory[];
  acceptanceCriteria: string[];
  risks: Risk[];
  estimates: Estimate;
}

// 功能
export interface Feature {
  id: string;
  name: string;
  description: string;
  priority: Priority;
  complexity: 'low' | 'medium' | 'high';
  dependencies?: string[];
}

// 用户故事
export interface UserStory {
  id: string;
  as: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria: string[];
  priority: Priority;
  storyPoints?: number;
}

// 风险
export interface Risk {
  id: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  likelihood: 'low' | 'medium' | 'high';
  mitigation: string;
}

// 估算
export interface Estimate {
  hours: number;
  storyPoints: number;
  confidence: 'low' | 'medium' | 'high';
  breakdown: Record<string, number>;
}

// 架构设计结果
export interface ArchitectureDesign {
  overview: string;
  components: Component[];
  dataFlow: DataFlow[];
  techStack: TechStack;
  patterns: Pattern[];
  tradeoffs: Tradeoff[];
}

// 组件
export interface Component {
  name: string;
  type: string;
  responsibility: string;
  interfaces: string[];
  dependencies: string[];
}

// 数据流
export interface DataFlow {
  from: string;
  to: string;
  data: string;
  protocol?: string;
}

// 技术栈
export interface TechStack {
  frontend: string[];
  backend: string[];
  database: string[];
  devops: string[];
  testing: string[];
}

// 设计模式
export interface Pattern {
  name: string;
  description: string;
  justification: string;
}

// 权衡
export interface Tradeoff {
  decision: string;
  pros: string[];
  cons: string[];
  rationale: string;
}
