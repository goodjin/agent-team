import { WorkflowCheckpointer } from '../observability/checkpoint.js';
import { getLogger } from '../observability/logger.js';
import type {
  WorkflowSummary,
  WorkflowCheckpointData,
  CompletedStep,
  PendingStep,
} from '../observability/types.js';

export type { WorkflowSummary, WorkflowCheckpointData, CompletedStep, PendingStep };

const logger = getLogger('recovery');

export interface RecoveryResult {
  workflowId: string;
  checkpoint: WorkflowCheckpointData;
  recoveredFrom: number;
  completedStepsSkipped: number;
  pendingSteps: PendingStep[];
}

export class WorkflowRecoveryManager {
  private static instance: WorkflowRecoveryManager | undefined;
  private checkpointer: WorkflowCheckpointer;

  // In-memory cache: workflowId -> set of completed stepIds
  private completedStepSets = new Map<string, Set<string>>();

  constructor(checkpointer?: WorkflowCheckpointer) {
    this.checkpointer = checkpointer ?? WorkflowCheckpointer.getInstance();
  }

  static getInstance(): WorkflowRecoveryManager {
    if (!WorkflowRecoveryManager.instance) {
      WorkflowRecoveryManager.instance = new WorkflowRecoveryManager();
    }
    return WorkflowRecoveryManager.instance;
  }

  /** Reset singleton (for testing). */
  static resetInstance(): void {
    WorkflowRecoveryManager.instance = undefined;
  }

  /**
   * Scan all persisted workflows and return those that are not completed/failed.
   */
  async scanIncomplete(): Promise<WorkflowSummary[]> {
    const incomplete = await this.checkpointer.listIncompleteWorkflows();
    if (incomplete.length > 0) {
      logger.info('recovery', 'recovery.scan_incomplete', {
        data: { count: incomplete.length, workflows: incomplete.map((w) => w.workflowId) },
      });
    }
    return incomplete;
  }

  /**
   * Recover a workflow from its latest checkpoint.
   * Marks the checkpoint status as 'recovering' and returns recovery info.
   */
  async recover(workflowId: string): Promise<RecoveryResult> {
    const checkpoint = await this.checkpointer.loadLatestCheckpoint(workflowId);
    if (!checkpoint) {
      throw new Error(`No checkpoint found for workflow: ${workflowId}`);
    }

    // Mark workflow as recovering
    await this.checkpointer.saveCheckpoint(workflowId, {
      status: 'recovering',
      metadata: {
        ...checkpoint.metadata,
        lastActiveAt: new Date().toISOString(),
      },
    });

    // Re-load after status update to get the new checkpoint
    const updatedCheckpoint = await this.checkpointer.loadLatestCheckpoint(workflowId);
    const activeCheckpoint = updatedCheckpoint ?? checkpoint;

    // Restore completed step cache from the checkpoint
    const completedSet = new Set(checkpoint.completedSteps.map((s) => s.stepId));
    this.completedStepSets.set(workflowId, completedSet);

    const result: RecoveryResult = {
      workflowId,
      checkpoint: activeCheckpoint,
      recoveredFrom: checkpoint.checkpointSeq,
      completedStepsSkipped: checkpoint.completedSteps.length,
      pendingSteps: checkpoint.pendingSteps,
    };

    logger.info('recovery', 'workflow.recovering', {
      data: {
        workflowId,
        seq: checkpoint.checkpointSeq,
        skipped: result.completedStepsSkipped,
        pending: result.pendingSteps.length,
      },
    });

    console.log(
      `\n[Recovery] Restoring workflow: ${workflowId}\n` +
        `  From checkpoint #${checkpoint.checkpointSeq}\n` +
        `  Skipping ${result.completedStepsSkipped} completed step(s)\n` +
        `  Resuming ${result.pendingSteps.length} pending step(s)\n`
    );

    return result;
  }

  /**
   * Record a step as completed; saves a new checkpoint.
   */
  async completeStep(workflowId: string, step: CompletedStep): Promise<void> {
    // Update in-memory cache
    let set = this.completedStepSets.get(workflowId);
    if (!set) {
      set = new Set();
      this.completedStepSets.set(workflowId, set);
    }
    set.add(step.stepId);

    // Load current checkpoint and append the completed step
    const latest = await this.checkpointer.loadLatestCheckpoint(workflowId);
    if (!latest) return;

    const completedSteps = [...latest.completedSteps, step];
    const pendingSteps = latest.pendingSteps.filter((s) => s.stepId !== step.stepId);

    await this.checkpointer.saveCheckpoint(workflowId, {
      status: 'running',
      completedSteps,
      pendingSteps,
      metadata: {
        ...latest.metadata,
        completedCount: completedSteps.length,
        lastActiveAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Check whether a step has already been completed (useful for skipping during recovery).
   */
  async isStepCompleted(workflowId: string, stepId: string): Promise<boolean> {
    // Check in-memory cache first
    const set = this.completedStepSets.get(workflowId);
    if (set) return set.has(stepId);

    // Cache miss: load from file
    const checkpoint = await this.checkpointer.loadLatestCheckpoint(workflowId);
    if (!checkpoint) return false;

    const completedSet = new Set(checkpoint.completedSteps.map((s) => s.stepId));
    this.completedStepSets.set(workflowId, completedSet);
    return completedSet.has(stepId);
  }
}
