export type TaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

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
}

export interface CreateTaskParams {
  title: string;
  description: string;
  role?: string;
  parentId?: string;
  dependencies?: string[];
}

export type TaskStats = {
  totalTokens: number;
  toolCalls: number;
  duration: number;
};
