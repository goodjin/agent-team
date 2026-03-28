export type TaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

/** 未设置视为 v9 一键执行路径 */
export type OrchestrationMode = 'v9-legacy' | 'v10-master';

export type OrchestrationState =
  | 'draft'
  | 'intake'
  | 'planning'
  | 'executing_workers'
  | 'awaiting_user'
  | 'replanning';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  role: string;
  parentId?: string;
  dependencies: string[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  artifactIds: string[];
  logIds: string[];
  subtaskIds: string[];
  /** 任务进度 0-100 */
  progress?: number;
  /** v10：主控编排；缺省/undefined 为 v9 */
  orchestrationMode?: OrchestrationMode;
  /** v10：主 Agent 实体 id */
  masterAgentId?: string;
  orchestrationState?: OrchestrationState;
  planVersion?: number;
}

export interface CreateTaskParams {
  /** 缺省为「新对话」 */
  title?: string;
  description?: string;
  role?: string;
  parentId?: string;
  dependencies?: string[];
  orchestrationMode?: OrchestrationMode;
}

export type TaskStats = {
  totalTokens: number;
  toolCalls: number;
  duration: number;
};
