export interface ProgressCheckpoint {
  id: string;
  taskId: string;
  step: string;
  message: string;
  percentage: number;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface ProgressTrackerConfig {
  maxCheckpoints: number;
  autoCheckpoint: boolean;
}

export class ProgressTracker {
  private checkpoints: Map<string, ProgressCheckpoint[]> = new Map();
  private config: ProgressTrackerConfig;

  constructor(config?: Partial<ProgressTrackerConfig>) {
    this.config = {
      maxCheckpoints: 100,
      autoCheckpoint: true,
      ...config,
    };
  }

  async checkpoint(
    taskId: string,
    step: string,
    message: string,
    percentage: number,
    metadata?: Record<string, unknown>
  ): Promise<ProgressCheckpoint> {
    const checkpoint: ProgressCheckpoint = {
      id: `cp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      step,
      message,
      percentage: Math.min(100, Math.max(0, percentage)),
      createdAt: new Date(),
      metadata,
    };

    const taskCheckpoints = this.checkpoints.get(taskId) || [];
    taskCheckpoints.push(checkpoint);

    if (taskCheckpoints.length > this.config.maxCheckpoints) {
      taskCheckpoints.shift();
    }

    this.checkpoints.set(taskId, taskCheckpoints);
    return checkpoint;
  }

  async getCheckpoints(taskId: string): Promise<ProgressCheckpoint[]> {
    return this.checkpoints.get(taskId) || [];
  }

  async getLatestCheckpoint(taskId: string): Promise<ProgressCheckpoint | null> {
    const checkpoints = this.checkpoints.get(taskId);
    if (!checkpoints || checkpoints.length === 0) {
      return null;
    }
    return checkpoints[checkpoints.length - 1];
  }

  async clearCheckpoints(taskId: string): Promise<void> {
    this.checkpoints.delete(taskId);
  }

  calculatePercentage(taskId: string): number {
    const checkpoints = this.checkpoints.get(taskId);
    if (!checkpoints || checkpoints.length === 0) {
      return 0;
    }

    const latest = checkpoints[checkpoints.length - 1];
    return latest.percentage;
  }

  getProgressSummary(taskId: string): {
    currentStep: string;
    percentage: number;
    totalCheckpoints: number;
    startedAt: Date;
    lastUpdatedAt: Date;
  } | null {
    const checkpoints = this.checkpoints.get(taskId);
    if (!checkpoints || checkpoints.length === 0) {
      return null;
    }

    const latest = checkpoints[checkpoints.length - 1];
    return {
      currentStep: latest.step,
      percentage: latest.percentage,
      totalCheckpoints: checkpoints.length,
      startedAt: checkpoints[0].createdAt,
      lastUpdatedAt: latest.createdAt,
    };
  }
}
