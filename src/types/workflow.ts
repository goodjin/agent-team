import { z } from 'zod';
import type { RoleType, TaskType, ToolResult } from './index.js';

// ============ Stage 配置（阶段/步骤）============
export interface WorkflowStageConfig {
  id: string;
  name: string;
  description?: string;
  // 分配的角色（支持多个角色）
  roles: RoleType[];
  // 入口条件：什么必须完成才能进入此阶段
  entryCriteria?: string[];
  // 出口条件：什么定义了此阶段的完成
  exitCriteria?: string[];
  // 任务配置
  taskConfig?: {
    type: TaskType;
    input?: Record<string, any>;
  };
  // 步骤配置
  steps?: WorkflowStepConfig[];
  // 超时时间（毫秒）
  timeout?: number;
  // 重试策略
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
    retryableErrors?: string[];
  };
  // 下一阶段配置
  nextStages?: NextStageConfig[];
  // 是否并行执行
  parallel?: boolean;
  // 条件分支配置
  conditionals?: ConditionalBranch[];
  // 排序
  order: number;
  // 元数据
  metadata?: {
    tags?: string[];
    color?: string;
    icon?: string;
  };
}

// 下一阶段配置
export interface NextStageConfig {
  stageId: string;
  condition?: string; // 条件表达式
  label?: string;
}

// 条件分支
export interface ConditionalBranch {
  id: string;
  name: string;
  condition: string; // 条件表达式，如 "variables.result === 'success'"
  targetStageId: string;
  description?: string;
}

// 阶段执行状态
export type StageExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting';

// 阶段执行结果
export interface StageExecutionResult {
  stageId: string;
  status: StageExecutionStatus;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  result?: any;
  error?: string;
  stepResults?: StepExecutionResult[];
  outputs: Map<string, any>;
}

// ============ 工作流步骤配置 ============
export interface WorkflowStepConfig {
  id: string;
  name: string;
  type: 'task' | 'parallel' | 'condition' | 'script' | 'role';
  role: RoleType;
  taskType?: string;
  description?: string;
  dependencies?: string[];
  parallel?: boolean;
  condition?: string;
  script?: string;
  timeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
    retryableErrors?: string[];
  };
  config?: Record<string, any>;
}

export interface WorkflowSettings {
  timeout?: number;
  continueOnFailure?: boolean;
  parallelByDefault?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  version?: string;
  // 传统步骤配置（向后兼容）
  steps: WorkflowStepConfig[];
  // 新增：阶段配置（Stage-based workflow）
  stages?: WorkflowStageConfig[];
  // 关联的项目ID
  projectId?: string;
  variables?: Record<string, any>;
  settings?: WorkflowSettings;
}

export interface WorkflowExecutionContext {
  workflow: Workflow;
  variables: Map<string, any>;
  stepResults: Map<string, StepExecutionResult>;
  currentStep: WorkflowStepConfig | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface StepExecutionResult {
  step: WorkflowStepConfig;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting';
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  result?: any;
  error?: string;
  retryCount: number;
  outputs: Map<string, any>;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  context: WorkflowExecutionContext;
  results: StepExecutionResult[];
  startedAt: Date;
  completedAt?: Date;
  totalDuration?: number;
}

export type WorkflowEventType =
  | 'workflow:started'
  | 'workflow:completed'
  | 'workflow:failed'
  | 'workflow:cancelled'
  | 'step:started'
  | 'step:completed'
  | 'step:failed'
  | 'step:retried'
  | 'step:skipped';

export interface WorkflowEvent {
  type: WorkflowEventType;
  timestamp: Date;
  executionId: string;
  stepId?: string;
  data?: any;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  workflow: Omit<Workflow, 'id'>;
}
