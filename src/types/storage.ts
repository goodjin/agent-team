import type { PersistedTask } from './persistence.js';

export interface TaskStorage {
  version: string;
  lastSavedAt: Date;
  tasks: Map<string, PersistedTask>;
  taskOrder: string[];
  metadata: StorageMetadata;
}

export interface StorageMetadata {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalExecutions: number;
  lastRecoveryAt?: Date;
}
