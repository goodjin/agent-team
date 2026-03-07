// 冲突解决器测试
// Phase 2: 协作能力增强

import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictResolver } from '../../src/collaboration/conflict-resolver/conflict-resolver';
import { Task } from '../../src/collaboration/types';

describe('ConflictResolver', () => {
  let resolver: ConflictResolver;

  beforeEach(() => {
    resolver = new ConflictResolver();
    resolver.clearHistory();
  });

  it('should detect resource conflict', () => {
    const task1: Task = {
      id: 'task-001',
      type: 'build',
      description: 'Build project',
      priority: 'high',
      requiredCapabilities: ['coding']
    };

    const task2: Task = {
      id: 'task-002',
      type: 'build', // 同一类型
      description: 'Build again',
      priority: 'medium',
      requiredCapabilities: ['testing']
    };

    const conflict = resolver.detect(task1, task2);
    expect(conflict).not.toBeNull();
    expect(conflict?.type).toBe('resource');
  });

  it('should not detect conflict for different task types', () => {
    const task1: Task = {
      id: 'task-001',
      type: 'build',
      description: 'Build project',
      priority: 'high',
      requiredCapabilities: ['coding']
    };

    const task2: Task = {
      id: 'task-002',
      type: 'test', // 不同类型
      description: 'Test project',
      priority: 'medium',
      requiredCapabilities: ['testing']
    };

    const conflict = resolver.detect(task1, task2);
    expect(conflict).toBeNull();
  });

  it('should resolve conflict with priority strategy', () => {
    const conflict = {
      id: 'conflict-001',
      type: 'resource' as const,
      involvedTasks: ['task-001', 'task-002'],
      involvedAgents: [],
      timestamp: new Date(),
      description: 'Resource conflict'
    };

    const resolution = resolver.resolve(conflict, 'priority');

    expect(resolution).toBeDefined();
    expect(resolution.conflictId).toBe('conflict-001');
    expect(resolution.strategy).toBe('priority');
    expect(resolution.winner).toBeDefined();
    expect(resolution.losers).toHaveLength(1);
  });

  it('should resolve conflict with first-come strategy', () => {
    const conflict = {
      id: 'conflict-001',
      type: 'dependency' as const,
      involvedTasks: ['task-001', 'task-002'],
      involvedAgents: [],
      timestamp: new Date(),
      description: 'Dependency conflict'
    };

    const resolution = resolver.resolve(conflict, 'first-come');

    expect(resolution.strategy).toBe('first-come');
    expect(resolution.winner).toBe('task-001');
  });

  it('should track conflict history', () => {
    const conflict = {
      id: 'conflict-001',
      type: 'resource' as const,
      involvedTasks: ['task-001', 'task-002'],
      involvedAgents: [],
      timestamp: new Date(),
      description: 'Resource conflict'
    };

    resolver.resolve(conflict);

    const history = resolver.getConflictHistory();
    expect(history).toHaveLength(1);
  });

  it('should get statistics', () => {
    const conflict1 = {
      id: 'conflict-001',
      type: 'resource' as const,
      involvedTasks: ['task-001', 'task-002'],
      involvedAgents: [],
      timestamp: new Date(),
      description: 'Resource conflict'
    };

    const conflict2 = {
      id: 'conflict-002',
      type: 'state' as const,
      involvedTasks: ['task-003', 'task-004'],
      involvedAgents: [],
      timestamp: new Date(),
      description: 'State conflict'
    };

    resolver.resolve(conflict1);
    resolver.resolve(conflict2);

    const stats = resolver.getStats();
    expect(stats.totalConflicts).toBe(2);
    expect(stats.byType.resource).toBe(1);
    expect(stats.byType.state).toBe(1);
  });

  it('should register custom conflict handler', () => {
    const customHandler = (conflict: any) => ({
      conflictId: conflict.id,
      strategy: 'custom' as const,
      losers: conflict.involvedTasks,
      action: 'abort' as const,
      message: 'Custom handler'
    });

    resolver.registerHandler('resource', customHandler);

    const conflict = {
      id: 'conflict-001',
      type: 'resource' as const,
      involvedTasks: ['task-001', 'task-002'],
      involvedAgents: [],
      timestamp: new Date(),
      description: 'Resource conflict'
    };

    const resolution = resolver.resolve(conflict);
    expect(resolution.message).toBe('Custom handler');
  });
});
