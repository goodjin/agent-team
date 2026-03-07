// 进度聚合器测试
// Phase 2: 协作能力增强

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProgressAggregator } from '../../src/collaboration/progress-aggregator/progress-aggregator';

describe('ProgressAggregator', () => {
  let aggregator: ProgressAggregator;

  beforeEach(() => {
    aggregator = new ProgressAggregator();
  });

  it('should update progress', () => {
    aggregator.updateProgress({
      taskId: 'task-001',
      agentId: 'agent-001',
      status: 'in-progress',
      progress: 50
    });

    const progress = aggregator.getProgress('task-001');
    expect(progress).toBeDefined();
    expect(progress?.progress).toBe(50);
  });

  it('should get aggregated progress', () => {
    aggregator.updateProgress({
      taskId: 'task-001',
      agentId: 'agent-001',
      status: 'completed',
      progress: 100
    });

    aggregator.updateProgress({
      taskId: 'task-002',
      agentId: 'agent-001',
      status: 'in-progress',
      progress: 50
    });

    aggregator.updateProgress({
      taskId: 'task-003',
      agentId: 'agent-002',
      status: 'pending',
      progress: 0
    });

    const aggregated = aggregator.getAggregatedProgress();

    expect(aggregated.totalTasks).toBe(3);
    expect(aggregated.completedTasks).toBe(1);
    expect(aggregated.inProgressTasks).toBe(1);
    expect(aggregated.pendingTasks).toBe(1);
  });

  it('should calculate average progress correctly', () => {
    aggregator.updateProgress({
      taskId: 'task-001',
      agentId: 'agent-001',
      status: 'in-progress',
      progress: 40
    });

    aggregator.updateProgress({
      taskId: 'task-002',
      agentId: 'agent-001',
      status: 'in-progress',
      progress: 60
    });

    const aggregated = aggregator.getAggregatedProgress();
    expect(aggregated.averageProgress).toBe(50);
  });

  it('should subscribe and receive updates', () => {
    const callback = vi.fn();
    aggregator.subscribe(callback);

    aggregator.updateProgress({
      taskId: 'task-001',
      agentId: 'agent-001',
      status: 'in-progress',
      progress: 50
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should unsubscribe correctly', () => {
    const callback = vi.fn();
    const unsubscribe = aggregator.subscribe(callback);

    aggregator.updateProgress({
      taskId: 'task-001',
      agentId: 'agent-001',
      status: 'in-progress',
      progress: 50
    });

    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();

    aggregator.updateProgress({
      taskId: 'task-002',
      agentId: 'agent-001',
      status: 'in-progress',
      progress: 100
    });

    expect(callback).toHaveBeenCalledTimes(1); // 不应再被调用
  });

  it('should mark task as started', () => {
    aggregator.markStarted('task-001', 'agent-001');

    const progress = aggregator.getProgress('task-001');
    expect(progress?.status).toBe('in-progress');
    expect(progress?.startedAt).toBeDefined();
  });

  it('should mark task as completed', () => {
    aggregator.updateProgress({
      taskId: 'task-001',
      agentId: 'agent-001',
      status: 'in-progress',
      progress: 50
    });

    aggregator.markCompleted('task-001');

    const progress = aggregator.getProgress('task-001');
    expect(progress?.status).toBe('completed');
    expect(progress?.progress).toBe(100);
    expect(progress?.completedAt).toBeDefined();
  });

  it('should mark task as failed', () => {
    aggregator.updateProgress({
      taskId: 'task-001',
      agentId: 'agent-001',
      status: 'in-progress',
      progress: 50
    });

    aggregator.markFailed('task-001', 'Test error');

    const progress = aggregator.getProgress('task-001');
    expect(progress?.status).toBe('failed');
    expect(progress?.error).toBe('Test error');
  });

  it('should get progress by status', () => {
    aggregator.updateProgress({ taskId: 'task-001', agentId: 'a1', status: 'completed', progress: 100 });
    aggregator.updateProgress({ taskId: 'task-002', agentId: 'a1', status: 'completed', progress: 100 });
    aggregator.updateProgress({ taskId: 'task-003', agentId: 'a1', status: 'in-progress', progress: 50 });

    const completed = aggregator.getByStatus('completed');
    expect(completed).toHaveLength(2);
  });

  it('should get progress by agent', () => {
    aggregator.updateProgress({ taskId: 'task-001', agentId: 'agent-001', status: 'in-progress', progress: 50 });
    aggregator.updateProgress({ taskId: 'task-002', agentId: 'agent-001', status: 'pending', progress: 0 });
    aggregator.updateProgress({ taskId: 'task-003', agentId: 'agent-002', status: 'completed', progress: 100 });

    const agentProgress = aggregator.getByAgent('agent-001');
    expect(agentProgress).toHaveLength(2);
  });

  it('should get statistics', () => {
    aggregator.updateProgress({ taskId: 'task-001', agentId: 'a1', status: 'completed', progress: 100 });
    aggregator.updateProgress({ taskId: 'task-002', agentId: 'a1', status: 'in-progress', progress: 50 });
    aggregator.updateProgress({ taskId: 'task-003', agentId: 'a2', status: 'failed', progress: 0 });

    const stats = aggregator.getStats();
    expect(stats.totalTasks).toBe(3);
    expect(stats.completedTasks).toBe(1);
    expect(stats.inProgressTasks).toBe(1);
    expect(stats.failedTasks).toBe(1);
  });
});
