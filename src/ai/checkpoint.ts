/**
 * Checkpoint Manager
 * Manages task execution checkpoints for recovery after interruption
 */

import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage } from '../types/index.js';

export type CheckpointType = 'step-complete' | 'tool-before' | 'tool-after' | 'context-snapshot';

export interface CheckpointData {
  contextSnapshot?: {
    messages: ChatMessage[];
    loadedContextIds: string[];
  };
  toolCall?: {
    toolName: string;
    parameters: Record<string, any>;
    result?: any;
  };
  progress?: {
    completedSteps: string[];
    remainingSteps: string[];
    percentComplete: number;
  };
  [key: string]: any;
}

export interface Checkpoint {
  id: string;
  taskId: string;
  agentId: string;
  projectId: string;
  checkpointType: CheckpointType;
  data: CheckpointData;
  metadata: {
    createdAt: Date;
    stepIndex: number;
    stepName: string;
  };
}

export interface SaveCheckpointParams {
  taskId: string;
  agentId: string;
  projectId: string;
  type: CheckpointType;
  data: CheckpointData;
  stepIndex: number;
  stepName: string;
}

export class CheckpointManager {
  private checkpoints: Map<string, Checkpoint> = new Map();
  private projectId: string;
  private readonly MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  /**
   * Save a checkpoint
   */
  async saveCheckpoint(params: SaveCheckpointParams): Promise<string> {
    const checkpoint: Checkpoint = {
      id: uuidv4(),
      taskId: params.taskId,
      agentId: params.agentId,
      projectId: params.projectId || this.projectId,
      checkpointType: params.type,
      data: params.data,
      metadata: {
        createdAt: new Date(),
        stepIndex: params.stepIndex,
        stepName: params.stepName,
      },
    };

    this.checkpoints.set(checkpoint.id, checkpoint);
    return checkpoint.id;
  }

  /**
   * Load the latest checkpoint for a task
   */
  async loadLatestCheckpoint(taskId: string): Promise<Checkpoint | null> {
    const taskCheckpoints = this.getCheckpointsByTaskSync(taskId);
    
    if (taskCheckpoints.length === 0) {
      return null;
    }

    return taskCheckpoints[0];
  }

  /**
   * Load a specific checkpoint by ID
   */
  async loadCheckpoint(id: string): Promise<Checkpoint | null> {
    return this.checkpoints.get(id) || null;
  }

  /**
   * Delete a checkpoint
   */
  async deleteCheckpoint(id: string): Promise<void> {
    this.checkpoints.delete(id);
  }

  /**
   * Delete all checkpoints for a task
   */
  async deleteCheckpointsByTask(taskId: string): Promise<void> {
    const taskCheckpoints = this.getCheckpointsByTaskSync(taskId);
    for (const cp of taskCheckpoints) {
      this.checkpoints.delete(cp.id);
    }
  }

  /**
   * Get all checkpoints for a task
   */
  async getCheckpointsByTask(taskId: string): Promise<Checkpoint[]> {
    return this.getCheckpointsByTaskSync(taskId);
  }

  /**
   * Get all checkpoints for an agent
   */
  async getCheckpointsByAgent(agentId: string): Promise<Checkpoint[]> {
    return Array.from(this.checkpoints.values()).filter(cp => cp.agentId === agentId);
  }

  /**
   * Cleanup expired checkpoints
   */
  async cleanupExpiredCheckpoints(maxAge?: number): Promise<number> {
    const ageLimit = maxAge || this.MAX_AGE_MS;
    const now = Date.now();
    let deletedCount = 0;

    for (const [id, cp] of this.checkpoints.entries()) {
      const age = now - cp.metadata.createdAt.getTime();
      if (age > ageLimit) {
        this.checkpoints.delete(id);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Get checkpoint count for a task
   */
  getCheckpointCount(taskId: string): number {
    return this.getCheckpointsByTaskSync(taskId).length;
  }

  /**
   * Check if a task has any checkpoints
   */
  hasCheckpoints(taskId: string): boolean {
    return this.getCheckpointCount(taskId) > 0;
  }

  private getCheckpointsByTaskSync(taskId: string): Checkpoint[] {
    return Array.from(this.checkpoints.values())
      .filter(cp => cp.taskId === taskId)
      .sort((a, b) => {
        const timeDiff = b.metadata.createdAt.getTime() - a.metadata.createdAt.getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.metadata.stepIndex - a.metadata.stepIndex;
      });
  }
}
