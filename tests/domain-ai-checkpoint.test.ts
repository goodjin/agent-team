import { describe, it, expect, beforeEach } from 'vitest';
import { CheckpointManager, type CheckpointType, type CheckpointData } from '../src/ai/checkpoint.js';

describe('CheckpointManager', () => {
  let checkpointManager: CheckpointManager;

  beforeEach(() => {
    checkpointManager = new CheckpointManager('project-123');
  });

  describe('saveCheckpoint', () => {
    it('should save a checkpoint and return id', async () => {
      const checkpointId = await checkpointManager.saveCheckpoint({
        taskId: 'task-123',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: { contextSnapshot: { messages: [], loadedContextIds: [] } },
        stepIndex: 0,
        stepName: 'initial-step',
      });
      
      expect(checkpointId).toBeDefined();
      expect(typeof checkpointId).toBe('string');
    });

    it('should store checkpoint data correctly', async () => {
      const checkpointId = await checkpointManager.saveCheckpoint({
        taskId: 'task-123',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: { test: 'data' },
        stepIndex: 0,
        stepName: 'initial-step',
      });

      const loaded = await checkpointManager.loadCheckpoint(checkpointId);
      expect(loaded?.data).toEqual({ test: 'data' });
    });
  });

  describe('loadLatestCheckpoint', () => {
    it('should return null for task with no checkpoints', async () => {
      const result = await checkpointManager.loadLatestCheckpoint('non-existent-task');
      
      expect(result).toBeNull();
    });

    it('should return the latest checkpoint by step index', async () => {
      await checkpointManager.saveCheckpoint({
        taskId: 'task-123',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: { step: 1 },
        stepIndex: 0,
        stepName: 'step1',
      });

      await checkpointManager.saveCheckpoint({
        taskId: 'task-123',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: { step: 2 },
        stepIndex: 1,
        stepName: 'step2',
      });

      const latest = await checkpointManager.loadLatestCheckpoint('task-123');
      
      expect(latest?.metadata.stepName).toBe('step2');
      expect(latest?.data).toEqual({ step: 2 });
    }, 10000);
  });

  describe('loadCheckpoint', () => {
    it('should return null for non-existent checkpoint', async () => {
      const result = await checkpointManager.loadCheckpoint('non-existent-id');
      
      expect(result).toBeNull();
    });
  });

  describe('deleteCheckpoint', () => {
    it('should delete a checkpoint', async () => {
      const checkpointId = await checkpointManager.saveCheckpoint({
        taskId: 'task-123',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: {},
        stepIndex: 0,
        stepName: 'step1',
      });

      await checkpointManager.deleteCheckpoint(checkpointId);
      
      const loaded = await checkpointManager.loadCheckpoint(checkpointId);
      expect(loaded).toBeNull();
    });
  });

  describe('deleteCheckpointsByTask', () => {
    it('should delete all checkpoints for a task', async () => {
      await checkpointManager.saveCheckpoint({
        taskId: 'task-123',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: {},
        stepIndex: 0,
        stepName: 'step1',
      });

      await checkpointManager.saveCheckpoint({
        taskId: 'task-123',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: {},
        stepIndex: 1,
        stepName: 'step2',
      });

      await checkpointManager.deleteCheckpointsByTask('task-123');
      
      expect(checkpointManager.hasCheckpoints('task-123')).toBe(false);
    });

    it('should not affect checkpoints for other tasks', async () => {
      await checkpointManager.saveCheckpoint({
        taskId: 'task-123',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: {},
        stepIndex: 0,
        stepName: 'step1',
      });

      const checkpointId2 = await checkpointManager.saveCheckpoint({
        taskId: 'task-456',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: {},
        stepIndex: 0,
        stepName: 'other-step',
      });

      await checkpointManager.deleteCheckpointsByTask('task-123');
      
      const loaded = await checkpointManager.loadCheckpoint(checkpointId2);
      expect(loaded).not.toBeNull();
    });
  });

  describe('getCheckpointsByTask', () => {
    it('should return all checkpoints for a task', async () => {
      await checkpointManager.saveCheckpoint({
        taskId: 'task-123',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: {},
        stepIndex: 0,
        stepName: 'step1',
      });

      await checkpointManager.saveCheckpoint({
        taskId: 'task-123',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: {},
        stepIndex: 1,
        stepName: 'step2',
      });

      const checkpoints = await checkpointManager.getCheckpointsByTask('task-123');
      
      expect(checkpoints).toHaveLength(2);
    });

    it('should return empty array for task with no checkpoints', async () => {
      const checkpoints = await checkpointManager.getCheckpointsByTask('non-existent');
      
      expect(checkpoints).toHaveLength(0);
    });
  });

  describe('getCheckpointsByAgent', () => {
    it('should return all checkpoints for an agent', async () => {
      await checkpointManager.saveCheckpoint({
        taskId: 'task-123',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: {},
        stepIndex: 0,
        stepName: 'step1',
      });

      await checkpointManager.saveCheckpoint({
        taskId: 'task-789',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: {},
        stepIndex: 0,
        stepName: 'other-step',
      });

      const checkpoints = await checkpointManager.getCheckpointsByAgent('agent-456');
      
      expect(checkpoints).toHaveLength(2);
    });
  });

  describe('hasCheckpoints', () => {
    it('should return true when task has checkpoints', async () => {
      await checkpointManager.saveCheckpoint({
        taskId: 'task-123',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: {},
        stepIndex: 0,
        stepName: 'step1',
      });

      expect(checkpointManager.hasCheckpoints('task-123')).toBe(true);
    });

    it('should return false when task has no checkpoints', () => {
      expect(checkpointManager.hasCheckpoints('non-existent')).toBe(false);
    });
  });

  describe('getCheckpointCount', () => {
    it('should return correct count', async () => {
      await checkpointManager.saveCheckpoint({
        taskId: 'task-123',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: {},
        stepIndex: 0,
        stepName: 'step1',
      });

      await checkpointManager.saveCheckpoint({
        taskId: 'task-123',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: {},
        stepIndex: 1,
        stepName: 'step2',
      });

      expect(checkpointManager.getCheckpointCount('task-123')).toBe(2);
    });
  });

  describe('cleanupExpiredCheckpoints', () => {
    it('should not delete recent checkpoints', async () => {
      const manager = new CheckpointManager('project-123');
      
      await manager.saveCheckpoint({
        taskId: 'task-123',
        agentId: 'agent-456',
        projectId: 'project-123',
        type: 'step-complete' as CheckpointType,
        data: {},
        stepIndex: 0,
        stepName: 'recent',
      });

      const deletedCount = await manager.cleanupExpiredCheckpoints(24 * 60 * 60 * 1000); // 1 day
      
      // Recent checkpoint should not be deleted
      expect(deletedCount).toBe(0);
    });
  });
});
