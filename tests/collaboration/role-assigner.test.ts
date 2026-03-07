// 角色分配器测试
// Phase 2: 协作能力增强

import { describe, it, expect, beforeEach } from 'vitest';
import { RoleAssigner } from '../../src/collaboration/role-assigner/role-assigner';
import { Task } from '../../src/collaboration/types';

describe('RoleAssigner', () => {
  let assigner: RoleAssigner;

  beforeEach(() => {
    assigner = new RoleAssigner();
    
    // 注册测试角色
    assigner.registerRole({
      id: 'developer',
      name: '开发者',
      capabilities: ['coding', 'debugging'],
      maxConcurrentTasks: 3,
      currentLoad: 0
    });
    
    assigner.registerRole({
      id: 'tester',
      name: '测试工程师',
      capabilities: ['testing', 'qa'],
      maxConcurrentTasks: 2,
      currentLoad: 0
    });
  });

  it('should register roles', () => {
    const roles = assigner.getRoles();
    expect(roles).toHaveLength(2);
  });

  it('should analyze task and find matching roles', () => {
    const task: Task = {
      id: 'task-001',
      type: 'dev',
      description: 'Implement feature',
      priority: 'high',
      requiredCapabilities: ['coding']
    };

    const candidates = assigner.analyzeTask(task);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].capabilities).toContain('coding');
  });

  it('should assign task to role', () => {
    const task: Task = {
      id: 'task-001',
      type: 'dev',
      description: 'Implement feature',
      priority: 'medium',
      requiredCapabilities: ['coding']
    };

    const role = assigner.getRoles()[0];
    const assignment = assigner.assign(task, role);

    expect(assignment).toBeDefined();
    expect(assignment?.taskId).toBe('task-001');
    expect(assignment?.assignedRole.id).toBe('developer');
  });

  it('should not assign when role is at max load', () => {
    const role = assigner.getRoles()[0];
    role.currentLoad = role.maxConcurrentTasks; // 达到上限

    const task: Task = {
      id: 'task-001',
      type: 'dev',
      description: 'Implement feature',
      priority: 'low',
      requiredCapabilities: ['coding']
    };

    const assignment = assigner.assign(task, role);
    expect(assignment).toBeNull();
  });

  it('should auto assign task to best role', () => {
    const task: Task = {
      id: 'task-001',
      type: 'dev',
      description: 'Implement feature',
      priority: 'high',
      requiredCapabilities: ['coding']
    };

    const assignment = assigner.autoAssign(task);
    expect(assignment).toBeDefined();
  });

  it('should release task and reduce load', () => {
    const task: Task = {
      id: 'task-001',
      type: 'dev',
      description: 'Implement feature',
      priority: 'medium',
      requiredCapabilities: ['coding']
    };

    const role = assigner.getRoles()[0];
    assigner.assign(task, role);
    
    expect(role.currentLoad).toBe(1);
    
    assigner.release('task-001');
    
    expect(role.currentLoad).toBe(0);
  });

  it('should get assignment info', () => {
    const task: Task = {
      id: 'task-001',
      type: 'dev',
      description: 'Implement feature',
      priority: 'medium',
      requiredCapabilities: ['coding']
    };

    const role = assigner.getRoles()[0];
    assigner.assign(task, role);

    const assignment = assigner.getAssignment('task-001');
    expect(assignment).toBeDefined();
  });
});
