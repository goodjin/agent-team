export type TaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

export type TaskKind = 'epic' | 'module' | 'atomic';

export type DecompositionStatus = 'not_decomposed' | 'decomposing' | 'decomposed';

/** 系统已统一为主控编排 */
export type OrchestrationMode = 'v10-master';

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
  /** 分层编排：任务粒度（顶层/模块/原子） */
  taskKind?: TaskKind;
  /** 分层编排：节点深度，根任务为 0 */
  depth?: number;
  parentId?: string;
  /** 分层编排：直接监督者（上一级主控/模块负责人） */
  supervisorAgentId?: string;
  /** 分层编排：当前拆分状态 */
  decompositionStatus?: DecompositionStatus;
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
  taskKind?: TaskKind;
  depth?: number;
  parentId?: string;
  supervisorAgentId?: string;
  decompositionStatus?: DecompositionStatus;
  dependencies?: string[];
  orchestrationMode?: OrchestrationMode;
}

export type TaskStats = {
  totalTokens: number;
  toolCalls: number;
  duration: number;
};
