// 角色分配器
// Phase 2: 协作能力增强

import { Task, Role, TaskAssignment, TaskPriority } from '../types';
import { capabilityRegistry } from '../capability-registry/capability-registry';

export class RoleAssigner {
  private roles: Map<string, Role> = new Map();
  private assignments: Map<string, TaskAssignment> = new Map();

  /**
   * 注册角色
   */
  registerRole(role: Role): void {
    this.roles.set(role.id, role);
  }

  /**
   * 获取所有角色
   */
  getRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  /**
   * 分析任务并返回最佳角色列表（按匹配度排序）
   */
  analyzeTask(task: Task): Role[] {
    const matchingRoles: Array<{ role: Role; score: number }> = [];
    
    for (const role of this.roles.values()) {
      // 检查角色是否具备任务所需能力
      const hasCapabilities = task.requiredCapabilities.every((required: string) =>
        role.capabilities.includes(required)
      );
      
      if (!hasCapabilities) continue;
      
      // 计算负载分数（负载越低分数越高）
      const loadScore = 1 - (role.currentLoad / role.maxConcurrentTasks);
      
      // 计算能力匹配分数
      const matchScore = this.calculateCapabilityMatch(task.requiredCapabilities, role.capabilities);
      
      // 综合分数
      const totalScore = loadScore * 0.4 + matchScore * 0.6;
      
      matchingRoles.push({ role, score: totalScore });
    }
    
    // 按分数降序排序
    return matchingRoles
      .sort((a, b) => b.score - a.score)
      .map(item => item.role);
  }

  /**
   * 计算能力匹配度
   */
  private calculateCapabilityMatch(required: string[], available: string[]): number {
    if (required.length === 0) return 1;
    
    const matched = required.filter(r => available.includes(r)).length;
    return matched / required.length;
  }

  /**
   * 分配任务到角色
   */
  assign(task: Task, role: Role): TaskAssignment | null {
    // 检查角色负载
    if (role.currentLoad >= role.maxConcurrentTasks) {
      return null;
    }
    
    const assignment: TaskAssignment = {
      taskId: task.id,
      assignedRole: role,
      priority: task.priority,
      estimatedDuration: task.estimatedDuration || this.estimateDuration(task),
      assignedAt: new Date()
    };
    
    // 更新角色负载
    role.currentLoad++;
    
    // 记录分配
    this.assignments.set(task.id, assignment);
    
    return assignment;
  }

  /**
   * 估算任务时长
   */
  private estimateDuration(task: Task): number {
    // 基础时长（分钟）
    const baseDuration = 30;
    
    // 根据优先级调整
    const priorityMultiplier: Record<TaskPriority, number> = {
      low: 1.5,
      medium: 1.0,
      high: 0.7,
      urgent: 0.5
    };
    
    return baseDuration * priorityMultiplier[task.priority];
  }

  /**
   * 重新平衡负载
   */
  rebalance(): void {
    const roles = this.getRoles();
    
    // 找出负载最重和最轻的角色
    let maxLoad = 0;
    let minLoad = Infinity;
    let maxLoadRole: Role | null = null;
    let minLoadRole: Role | null = null;
    
    for (const role of roles) {
      if (role.currentLoad > maxLoad) {
        maxLoad = role.currentLoad;
        maxLoadRole = role;
      }
      if (role.currentLoad < minLoad) {
        minLoad = role.currentLoad;
        minLoadRole = role;
      }
    }
    
    // 如果负载差异超过阈值，尝试重新分配
    if (maxLoadRole && minLoadRole && maxLoad - minLoad > 2) {
      // 简单策略：将任务从高负载角色转移到低负载角色
      // 实际实现需要更复杂的逻辑
    }
  }

  /**
   * 释放任务（任务完成后调用）
   */
  release(taskId: string): void {
    const assignment = this.assignments.get(taskId);
    if (assignment) {
      assignment.assignedRole.currentLoad--;
      this.assignments.delete(taskId);
    }
  }

  /**
   * 获取任务的分配信息
   */
  getAssignment(taskId: string): TaskAssignment | undefined {
    return this.assignments.get(taskId);
  }

  /**
   * 自动分配任务（根据分析结果自动选择最佳角色）
   */
  autoAssign(task: Task): TaskAssignment | null {
    const candidates = this.analyzeTask(task);
    
    for (const role of candidates) {
      const assignment = this.assign(task, role);
      if (assignment) {
        return assignment;
      }
    }
    
    return null;
  }
}

// 导出单例
export const roleAssigner = new RoleAssigner();

// 初始化默认角色
roleAssigner.registerRole({
  id: 'architect',
  name: '架构师',
  capabilities: ['architecture', 'design', 'review'],
  maxConcurrentTasks: 3,
  currentLoad: 0
});

roleAssigner.registerRole({
  id: 'developer',
  name: '开发者',
  capabilities: ['coding', 'debugging', 'refactoring'],
  maxConcurrentTasks: 5,
  currentLoad: 0
});

roleAssigner.registerRole({
  id: 'tester',
  name: '测试工程师',
  capabilities: ['testing', 'qa', 'automation'],
  maxConcurrentTasks: 4,
  currentLoad: 0
});

roleAssigner.registerRole({
  id: 'pm',
  name: '产品经理',
  capabilities: ['planning', 'analysis', 'communication'],
  maxConcurrentTasks: 3,
  currentLoad: 0
});

roleAssigner.registerRole({
  id: 'techwriter',
  name: '技术作家',
  capabilities: ['writing', 'documentation', 'review'],
  maxConcurrentTasks: 4,
  currentLoad: 0
});
