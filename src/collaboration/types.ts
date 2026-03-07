// 协作模块类型定义
// Phase 2: 协作能力增强

// ============ 角色分配相关类型 ============

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  id: string;
  type: string;
  description: string;
  priority: TaskPriority;
  requiredCapabilities: string[];
  estimatedDuration?: number;
  assignedAgent?: string;
}

export interface Role {
  id: string;
  name: string;
  capabilities: string[];
  maxConcurrentTasks: number;
  currentLoad: number;
}

export interface TaskAssignment {
  taskId: string;
  assignedRole: Role;
  priority: TaskPriority;
  estimatedDuration: number;
  assignedAt: Date;
}

// ============ 能力注册表相关类型 ============

export interface Capability {
  name: string;
  description: string;
  tags: string[];
  version: string;
  deprecated: boolean;
}

export interface AgentCapability {
  agentId: string;
  capabilities: Capability[];
  registeredAt: Date;
  lastUpdated: Date;
}

// ============ 冲突解决相关类型 ============

export type ConflictType = 'resource' | 'dependency' | 'state';
export type ConflictStrategy = 'priority' | 'round-robin' | 'first-come' | 'custom';

export interface Conflict {
  id: string;
  type: ConflictType;
  involvedAgents: string[];
  involvedTasks: string[];
  resource?: string;
  timestamp: Date;
  description: string;
}

export interface Resolution {
  conflictId: string;
  strategy: ConflictStrategy;
  winner?: string;
  losers: string[];
  action: 'retry' | 'abort' | 'redirect' | 'wait';
  message: string;
}

export type ConflictHandler = (conflict: Conflict) => Resolution;

// ============ 进度聚合相关类型 ============

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

export interface TaskProgress {
  taskId: string;
  agentId: string;
  status: TaskStatus;
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface AggregatedProgress {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  averageProgress: number;
  byAgent: Map<string, TaskProgress[]>;
  lastUpdated: Date;
}

// ============ 事件类型 ============

export interface CollaborationEvent {
  type: 'task_assigned' | 'conflict_detected' | 'conflict_resolved' | 'progress_updated' | 'capability_registered';
  timestamp: Date;
  data: unknown;
}
