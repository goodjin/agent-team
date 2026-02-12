import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { gunzipSync } from 'zlib';
import { WorkflowCheckpointer } from '../../src/observability/checkpoint.js';
import type { WorkflowCheckpointData } from '../../src/observability/types.js';

describe('WorkflowCheckpointer', () => {
  let tmpDir: string;
  let checkpointer: WorkflowCheckpointer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ckpt-test-'));
    checkpointer = new WorkflowCheckpointer(tmpDir);
    WorkflowCheckpointer.resetInstance();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    WorkflowCheckpointer.resetInstance();
  });

  // ─── createWorkflow ────────────────────────────────────────────────────

  it('createWorkflow returns a workflowId with wf- prefix', () => {
    const id = checkpointer.createWorkflow({ task: 'test' });
    expect(id).toMatch(/^wf-[0-9a-f-]{36}$/);
  });

  it('createWorkflow creates the directory', () => {
    const id = checkpointer.createWorkflow({ task: 'test' });
    const wfDir = path.join(tmpDir, id);
    expect(fs.existsSync(wfDir)).toBe(true);
  });

  it('createWorkflow writes a gzip-compressed checkpoint file', () => {
    const id = checkpointer.createWorkflow({ task: 'test' });
    const wfDir = path.join(tmpDir, id);
    const files = fs.readdirSync(wfDir).filter((f) => f.endsWith('.json.gz'));
    expect(files.length).toBe(1);

    // The file must be valid gzip
    const compressed = fs.readFileSync(path.join(wfDir, files[0]));
    const json = gunzipSync(compressed).toString('utf-8');
    const data = JSON.parse(json) as WorkflowCheckpointData;
    expect(data.status).toBe('pending');
    expect(data.workflowId).toBe(id);
  });

  // ─── saveCheckpoint ────────────────────────────────────────────────────

  it('saveCheckpoint increments checkpointSeq', async () => {
    const id = checkpointer.createWorkflow({ task: 'test' });
    await checkpointer.saveCheckpoint(id, { status: 'running' });
    const latest = await checkpointer.loadLatestCheckpoint(id);
    expect(latest?.checkpointSeq).toBe(1);
    expect(latest?.status).toBe('running');
  });

  it('saveCheckpoint preserves previous fields when partial state provided', async () => {
    const id = checkpointer.createWorkflow({ x: 42 });
    await checkpointer.saveCheckpoint(id, { status: 'running' });
    const latest = await checkpointer.loadLatestCheckpoint(id);
    expect(latest?.taskInput).toEqual({ x: 42 });
  });

  // ─── loadLatestCheckpoint ─────────────────────────────────────────────

  it('loadLatestCheckpoint returns null for unknown workflowId', async () => {
    const result = await checkpointer.loadLatestCheckpoint('nonexistent-wf');
    expect(result).toBeNull();
  });

  it('loadLatestCheckpoint returns the initial checkpoint', async () => {
    const id = checkpointer.createWorkflow({ task: 'hello' });
    const ckpt = await checkpointer.loadLatestCheckpoint(id);
    expect(ckpt).not.toBeNull();
    expect(ckpt?.status).toBe('pending');
    expect(ckpt?.taskInput).toEqual({ task: 'hello' });
  });

  it('loadLatestCheckpoint returns the most recent checkpoint after multiple saves', async () => {
    const id = checkpointer.createWorkflow({});
    await checkpointer.saveCheckpoint(id, { status: 'running' });
    await checkpointer.saveCheckpoint(id, { status: 'paused' });
    const latest = await checkpointer.loadLatestCheckpoint(id);
    expect(latest?.status).toBe('paused');
    expect(latest?.checkpointSeq).toBe(2);
  });

  // ─── checksum integrity ────────────────────────────────────────────────

  it('SHA-256 checksum is stored in the checkpoint', async () => {
    const id = checkpointer.createWorkflow({});
    const ckpt = await checkpointer.loadLatestCheckpoint(id);
    expect(ckpt?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('validateCheckpoint returns true for an unmodified checkpoint', async () => {
    const id = checkpointer.createWorkflow({});
    const ckpt = await checkpointer.loadLatestCheckpoint(id);
    expect(checkpointer.validateCheckpoint(ckpt!)).toBe(true);
  });

  it('validateCheckpoint returns false when checksum is tampered', async () => {
    const id = checkpointer.createWorkflow({});
    const ckpt = await checkpointer.loadLatestCheckpoint(id);
    const tampered = { ...ckpt!, checksum: 'deadbeef' };
    expect(checkpointer.validateCheckpoint(tampered)).toBe(false);
  });

  it('loadLatestCheckpoint returns null when file is corrupted', async () => {
    const id = checkpointer.createWorkflow({});
    const wfDir = path.join(tmpDir, id);
    const files = fs.readdirSync(wfDir).filter((f) => f.endsWith('.json.gz'));
    // Overwrite with corrupt data
    fs.writeFileSync(path.join(wfDir, files[0]), Buffer.from('not-gzip-data'));
    const result = await checkpointer.loadLatestCheckpoint(id);
    expect(result).toBeNull();
  });

  // ─── pruning ──────────────────────────────────────────────────────────

  it('pruneOldCheckpoints keeps at most 10 checkpoints', async () => {
    const id = checkpointer.createWorkflow({});
    // seq 0 already created; add 11 more to reach seq 12 (13 total)
    for (let i = 0; i < 12; i++) {
      await checkpointer.saveCheckpoint(id, { status: 'running' });
    }
    const wfDir = path.join(tmpDir, id);
    const remaining = fs
      .readdirSync(wfDir)
      .filter((f) => f.endsWith('.json.gz') && !f.endsWith('.tmp'));
    expect(remaining.length).toBe(10);
  });

  it('loadLatestCheckpoint after pruning returns the most recent', async () => {
    const id = checkpointer.createWorkflow({});
    for (let i = 0; i < 12; i++) {
      await checkpointer.saveCheckpoint(id, { status: 'running' });
    }
    const latest = await checkpointer.loadLatestCheckpoint(id);
    expect(latest?.checkpointSeq).toBe(12);
  });

  // ─── listIncompleteWorkflows ──────────────────────────────────────────

  it('listIncompleteWorkflows returns running/pending workflows', async () => {
    const id1 = checkpointer.createWorkflow({});
    const id2 = checkpointer.createWorkflow({});
    await checkpointer.saveCheckpoint(id1, { status: 'running' });
    // id2 stays 'pending'

    const incomplete = await checkpointer.listIncompleteWorkflows();
    const ids = incomplete.map((w) => w.workflowId);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
  });

  it('listIncompleteWorkflows excludes completed workflows', async () => {
    const id = checkpointer.createWorkflow({});
    await checkpointer.markCompleted(id);

    const incomplete = await checkpointer.listIncompleteWorkflows();
    const ids = incomplete.map((w) => w.workflowId);
    expect(ids).not.toContain(id);
  });

  it('listIncompleteWorkflows excludes failed workflows', async () => {
    const id = checkpointer.createWorkflow({});
    await checkpointer.markFailed(id, 'error occurred');

    const incomplete = await checkpointer.listIncompleteWorkflows();
    const ids = incomplete.map((w) => w.workflowId);
    expect(ids).not.toContain(id);
  });

  it('listIncompleteWorkflows returns empty when checkpointDir does not exist', async () => {
    const nonExistentDir = path.join(os.tmpdir(), 'no-such-ckpt-dir-xyz');
    const cp = new WorkflowCheckpointer(nonExistentDir);
    // Remove the dir that was auto-created
    fs.rmSync(nonExistentDir, { recursive: true, force: true });
    const result = await cp.listIncompleteWorkflows();
    expect(result).toEqual([]);
  });

  // ─── atomic write ────────────────────────────────────────────────────

  it('no .tmp files remain after saveCheckpoint', async () => {
    const id = checkpointer.createWorkflow({});
    await checkpointer.saveCheckpoint(id, { status: 'running' });
    const wfDir = path.join(tmpDir, id);
    const tmpFiles = fs.readdirSync(wfDir).filter((f) => f.endsWith('.tmp'));
    expect(tmpFiles.length).toBe(0);
  });

  // ─── markCompleted / markFailed ──────────────────────────────────────

  it('markCompleted sets status to completed', async () => {
    const id = checkpointer.createWorkflow({});
    await checkpointer.markCompleted(id);
    const ckpt = await checkpointer.loadLatestCheckpoint(id);
    expect(ckpt?.status).toBe('completed');
  });

  it('markFailed sets status to failed', async () => {
    const id = checkpointer.createWorkflow({});
    await checkpointer.markFailed(id, 'something went wrong');
    const ckpt = await checkpointer.loadLatestCheckpoint(id);
    expect(ckpt?.status).toBe('failed');
  });
});
