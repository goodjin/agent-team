import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressTracker, ProgressCheckpoint } from '../../src/core/progress-tracker.js';

describe('ProgressTracker', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker();
  });

  describe('checkpoint', () => {
    it('should create a checkpoint with correct properties', async () => {
      const checkpoint = await tracker.checkpoint(
        'task-1',
        'step-1',
        'Processing started',
        10
      );

      expect(checkpoint.id).toMatch(/^cp-\d+-[a-z0-9]+$/);
      expect(checkpoint.taskId).toBe('task-1');
      expect(checkpoint.step).toBe('step-1');
      expect(checkpoint.message).toBe('Processing started');
      expect(checkpoint.percentage).toBe(10);
      expect(checkpoint.createdAt).toBeInstanceOf(Date);
    });

    it('should clamp percentage to 0-100 range', async () => {
      const cp1 = await tracker.checkpoint('task-1', 'step', 'msg', -10);
      expect(cp1.percentage).toBe(0);

      const cp2 = await tracker.checkpoint('task-1', 'step', 'msg', 150);
      expect(cp2.percentage).toBe(100);
    });

    it('should store metadata if provided', async () => {
      const metadata = { fileCount: 5, currentFile: 'test.ts' };
      const checkpoint = await tracker.checkpoint(
        'task-1',
        'step',
        'Processing',
        50,
        metadata
      );

      expect(checkpoint.metadata).toEqual(metadata);
    });

    it('should limit checkpoints to maxCheckpoints', async () => {
      const smallTracker = new ProgressTracker({ maxCheckpoints: 3 });

      await smallTracker.checkpoint('task-1', 's1', 'm1', 10);
      await smallTracker.checkpoint('task-1', 's2', 'm2', 20);
      await smallTracker.checkpoint('task-1', 's3', 'm3', 30);
      await smallTracker.checkpoint('task-1', 's4', 'm4', 40);

      const checkpoints = await smallTracker.getCheckpoints('task-1');
      expect(checkpoints.length).toBe(3);
      expect(checkpoints[0].step).toBe('s2');
      expect(checkpoints[2].step).toBe('s4');
    });
  });

  describe('getCheckpoints', () => {
    it('should return empty array for unknown task', async () => {
      const checkpoints = await tracker.getCheckpoints('unknown-task');
      expect(checkpoints).toEqual([]);
    });

    it('should return all checkpoints for a task', async () => {
      await tracker.checkpoint('task-1', 's1', 'm1', 10);
      await tracker.checkpoint('task-1', 's2', 'm2', 50);
      await tracker.checkpoint('task-1', 's3', 'm3', 100);

      const checkpoints = await tracker.getCheckpoints('task-1');
      expect(checkpoints.length).toBe(3);
    });
  });

  describe('getLatestCheckpoint', () => {
    it('should return null for unknown task', async () => {
      const latest = await tracker.getLatestCheckpoint('unknown-task');
      expect(latest).toBeNull();
    });

    it('should return the most recent checkpoint', async () => {
      await tracker.checkpoint('task-1', 's1', 'm1', 10);
      await tracker.checkpoint('task-1', 's2', 'm2', 50);
      const latest = await tracker.getLatestCheckpoint('task-1');

      expect(latest?.step).toBe('s2');
      expect(latest?.percentage).toBe(50);
    });
  });

  describe('clearCheckpoints', () => {
    it('should remove all checkpoints for a task', async () => {
      await tracker.checkpoint('task-1', 's1', 'm1', 10);
      await tracker.checkpoint('task-1', 's2', 'm2', 50);

      await tracker.clearCheckpoints('task-1');

      const checkpoints = await tracker.getCheckpoints('task-1');
      expect(checkpoints).toEqual([]);
    });

    it('should not affect other tasks', async () => {
      await tracker.checkpoint('task-1', 's1', 'm1', 10);
      await tracker.checkpoint('task-2', 's2', 'm2', 50);

      await tracker.clearCheckpoints('task-1');

      const t1Checkpoints = await tracker.getCheckpoints('task-1');
      const t2Checkpoints = await tracker.getCheckpoints('task-2');

      expect(t1Checkpoints).toEqual([]);
      expect(t2Checkpoints.length).toBe(1);
    });
  });

  describe('calculatePercentage', () => {
    it('should return 0 for unknown task', () => {
      const percentage = tracker.calculatePercentage('unknown-task');
      expect(percentage).toBe(0);
    });

    it('should return latest percentage', async () => {
      await tracker.checkpoint('task-1', 'step', 'message', 42);
      const percentage = tracker.calculatePercentage('task-1');
      expect(percentage).toBe(42);
    });
  });

  describe('getProgressSummary', () => {
    it('should return null for unknown task', () => {
      const summary = tracker.getProgressSummary('unknown-task');
      expect(summary).toBeNull();
    });

    it('should return complete progress summary', async () => {
      await tracker.checkpoint('task-1', 'step-1', 'Started', 10);
      await tracker.checkpoint('task-1', 'step-2', 'Processing', 50);
      await tracker.checkpoint('task-1', 'step-3', 'Completed', 100);

      const summary = tracker.getProgressSummary('task-1');

      expect(summary).toEqual({
        currentStep: 'step-3',
        percentage: 100,
        totalCheckpoints: 3,
        startedAt: expect.any(Date),
        lastUpdatedAt: expect.any(Date),
      });
    });
  });
});
