import type { TaskStatus, Priority, TaskInput, TaskOutput, TaskConstraints, ToolResult, TokenUsage } from './index.js';

export interface PersistedTask {
  id: string;
  type: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignedRole?: string;
  ownerRole?: string;
  dependencies: string[];
  input: TaskInput;
  output?: TaskOutput;
  constraints?: TaskConstraints;
  metadata: TaskMetadata;
  progress: TaskProgress;
  executionRecords: ExecutionRecord[];
  retryHistory: RetryRecord[];
}

export interface TaskMetadata {
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt?: Date;
  completedAt?: Date;
  restartCount: number;
  isRecovered: boolean;
  recoveredFrom?: string;
}

export interface TaskProgress {
  currentStep?: string;
  completedSteps: string[];
  percentage: number;
  message?: string;
  lastCheckpointAt?: Date;
}

export interface RetryRecord {
  attemptNumber: number;
  failedAt: Date;
  error: string;
  errorStack?: string;
  delayMs: number;
  retriedAt?: Date;
  retriedBy?: string;
}

export interface ExecutionRecord {
  id: string;
  role: string;
  action: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  result?: ToolResult;
  tokensUsed?: TokenUsage;
  model?: string;
  provider?: string;
}
