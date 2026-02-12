import {
  mkdirSync,
  writeFileSync,
  renameSync,
  readdirSync,
  unlinkSync,
  existsSync,
  readFileSync,
} from 'fs';
import { join } from 'path';
import { createHash, randomUUID } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import { getLogger } from './logger.js';
import type {
  WorkflowCheckpointData,
  WorkflowStatus,
  WorkflowSummary,
} from './types.js';

export type { WorkflowStatus, WorkflowSummary, WorkflowCheckpointData };

const logger = getLogger('checkpoint');
const MAX_CHECKPOINTS = 10;

export class WorkflowCheckpointer {
  private static instance: WorkflowCheckpointer | undefined;
  private readonly checkpointsDir: string;

  constructor(checkpointsDir = 'workspace/checkpoints') {
    this.checkpointsDir = checkpointsDir;
    mkdirSync(checkpointsDir, { recursive: true });
  }

  static getInstance(): WorkflowCheckpointer {
    if (!WorkflowCheckpointer.instance) {
      WorkflowCheckpointer.instance = new WorkflowCheckpointer();
    }
    return WorkflowCheckpointer.instance;
  }

  /** Reset singleton (for testing) */
  static resetInstance(): void {
    WorkflowCheckpointer.instance = undefined;
  }

  /**
   * Create a new workflow, writing the initial pending checkpoint.
   * Returns the generated workflowId.
   */
  createWorkflow(taskInput: Record<string, unknown>): string {
    const workflowId = `wf-${randomUUID()}`;
    const workflowDir = join(this.checkpointsDir, workflowId);
    mkdirSync(workflowDir, { recursive: true });

    const initial: WorkflowCheckpointData = {
      workflowId,
      checkpointSeq: 0,
      createdAt: new Date().toISOString(),
      status: 'pending',
      checksum: '',
      taskInput,
      completedSteps: [],
      pendingSteps: [],
      metadata: {
        totalSteps: 0,
        completedCount: 0,
        traceId: '',
        lastActiveAt: new Date().toISOString(),
      },
    };
    initial.checksum = this.calcChecksum(initial);
    this.writeAtomically(workflowId, initial);
    return workflowId;
  }

  /**
   * Save a new checkpoint for an existing workflow (increments seq).
   */
  async saveCheckpoint(
    workflowId: string,
    state: Partial<WorkflowCheckpointData>
  ): Promise<void> {
    const latest = await this.loadLatestCheckpoint(workflowId);
    const nextSeq = (latest?.checkpointSeq ?? -1) + 1;

    const defaults: WorkflowCheckpointData = {
      workflowId,
      checkpointSeq: 0,
      createdAt: new Date().toISOString(),
      status: 'running',
      checksum: '',
      taskInput: {},
      completedSteps: [],
      pendingSteps: [],
      metadata: {
        totalSteps: 0,
        completedCount: 0,
        traceId: '',
        lastActiveAt: new Date().toISOString(),
      },
    };

    const checkpoint: WorkflowCheckpointData = Object.assign(
      {},
      defaults,
      latest ?? {},
      state,
      {
        workflowId,
        checkpointSeq: nextSeq,
        createdAt: new Date().toISOString(),
        checksum: '',
      }
    );

    checkpoint.checksum = this.calcChecksum(checkpoint);
    this.writeAtomically(workflowId, checkpoint);
    this.pruneOldCheckpoints(workflowId);

    logger.info('checkpoint', 'checkpoint.saved', {
      data: { workflowId, seq: nextSeq },
    });
  }

  /**
   * Load the most recent checkpoint for a workflow.
   */
  async loadLatestCheckpoint(
    workflowId: string
  ): Promise<WorkflowCheckpointData | null> {
    const dir = join(this.checkpointsDir, workflowId);
    if (!existsSync(dir)) return null;

    const files = this.getCheckpointFiles(workflowId);
    if (files.length === 0) return null;

    // Files are sorted ascending; take the last one.
    const latest = files[files.length - 1];
    return this.readCheckpoint(join(dir, latest));
  }

  /**
   * List all incomplete workflows (status not completed/failed).
   */
  async listIncompleteWorkflows(): Promise<WorkflowSummary[]> {
    const summaries: WorkflowSummary[] = [];

    if (!existsSync(this.checkpointsDir)) return summaries;

    const workflowIds = readdirSync(this.checkpointsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const wfId of workflowIds) {
      const latest = await this.loadLatestCheckpoint(wfId);
      if (
        latest &&
        latest.status !== 'completed' &&
        latest.status !== 'failed'
      ) {
        summaries.push({
          workflowId: wfId,
          status: latest.status,
          lastCheckpointSeq: latest.checkpointSeq,
          completedCount: latest.metadata.completedCount,
          totalSteps: latest.metadata.totalSteps,
          lastActiveAt: latest.metadata.lastActiveAt,
        });
      }
    }

    return summaries;
  }

  async markCompleted(workflowId: string): Promise<void> {
    await this.saveCheckpoint(workflowId, {
      status: 'completed',
    });
  }

  async markFailed(workflowId: string, _reason?: string): Promise<void> {
    await this.saveCheckpoint(workflowId, {
      status: 'failed',
    });
  }

  /**
   * Validate the checksum of a loaded checkpoint.
   */
  validateCheckpoint(checkpoint: WorkflowCheckpointData): boolean {
    const expected = this.calcChecksum({ ...checkpoint, checksum: '' });
    return checkpoint.checksum === expected;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private writeAtomically(workflowId: string, data: WorkflowCheckpointData): void {
    const dir = join(this.checkpointsDir, workflowId);
    const filename = `checkpoint-${String(data.checkpointSeq).padStart(4, '0')}.json.gz`;
    const finalPath = join(dir, filename);
    const tmpPath = `${finalPath}.tmp`;

    const json = JSON.stringify(data);
    const compressed = gzipSync(Buffer.from(json, 'utf-8'));

    writeFileSync(tmpPath, compressed);
    renameSync(tmpPath, finalPath);
  }

  private readCheckpoint(filePath: string): WorkflowCheckpointData | null {
    try {
      const compressed = readFileSync(filePath);
      const json = gunzipSync(compressed).toString('utf-8');
      const data = JSON.parse(json) as WorkflowCheckpointData;

      if (!this.validateCheckpoint(data)) {
        logger.warn('checkpoint', 'checkpoint.integrity_failed', {
          data: { filePath },
        });
        return null;
      }

      return data;
    } catch (err) {
      logger.error('checkpoint', 'checkpoint.read_failed', {
        error: {
          name: (err as Error).name,
          message: (err as Error).message,
        },
        data: { filePath },
      });
      return null;
    }
  }

  private calcChecksum(data: WorkflowCheckpointData): string {
    const copy = { ...data, checksum: '' };
    return createHash('sha256').update(JSON.stringify(copy)).digest('hex');
  }

  private getCheckpointFiles(workflowId: string): string[] {
    const dir = join(this.checkpointsDir, workflowId);
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json.gz') && !f.endsWith('.tmp'))
      .sort(); // lexicographic order = seq ascending
  }

  private pruneOldCheckpoints(workflowId: string): void {
    const files = this.getCheckpointFiles(workflowId);
    if (files.length <= MAX_CHECKPOINTS) return;

    const toDelete = files.slice(0, files.length - MAX_CHECKPOINTS);
    const dir = join(this.checkpointsDir, workflowId);
    toDelete.forEach((f) => {
      try {
        unlinkSync(join(dir, f));
      } catch {
        // ignore cleanup errors
      }
    });
  }
}
