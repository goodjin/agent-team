import { z } from 'zod';
import type { RoleType, TaskType, ToolResult } from './index.js';

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
  steps: WorkflowStepConfig[];
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
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
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
