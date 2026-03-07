// 冲突解决器
// Phase 2: 协作能力增强

import {
  Conflict,
  ConflictType,
  ConflictStrategy,
  Resolution,
  ConflictHandler,
  Task
} from '../types';

export class ConflictResolver {
  private handlers: Map<ConflictType, ConflictHandler> = new Map();
  private conflictHistory: Conflict[] = [];
  private resolutionHistory: Resolution[] = [];

  constructor() {
    // 注册默认处理器
    this.registerDefaultHandlers();
  }

  /**
   * 注册默认冲突处理器
   */
  private registerDefaultHandlers(): void {
    // 资源冲突 - 按优先级解决
    this.registerHandler('resource', (conflict: Conflict) => this.resolveByPriority(conflict));

    // 依赖冲突 - 按先后来解决
    this.registerHandler('dependency', (conflict: Conflict) => this.resolveByFirstCome(conflict));

    // 状态冲突 - 简单的失败处理
    this.registerHandler('state', (conflict: Conflict) => this.resolveByPriority(conflict));
  }

  /**
   * 注册自定义冲突处理器
   */
  registerHandler(type: ConflictType, handler: ConflictHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * 检测两个任务之间是否存在冲突
   */
  detect(task1: Task, task2: Task): Conflict | null {
    // 检查资源冲突
    if (this.hasResourceConflict(task1, task2)) {
      return this.createConflict('resource', [task1.id, task2.id], 
        `资源冲突: ${task1.id} 和 ${task2.id} 竞争同一资源`);
    }
    
    // 检查依赖冲突（循环依赖）
    if (this.hasCircularDependency(task1, task2)) {
      return this.createConflict('dependency', [task1.id, task2.id],
        `循环依赖: ${task1.id} 和 ${task2.id} 存在循环依赖`);
    }
    
    // 检查状态冲突
    if (this.hasStateConflict(task1, task2)) {
      return this.createConflict('state', [task1.id, task2.id],
        `状态冲突: ${task1.id} 和 ${task2.id} 修改同一状态`);
    }
    
    return null;
  }

  /**
   * 检查资源冲突
   */
  private hasResourceConflict(task1: Task, task2: Task): boolean {
    // 简单实现：假设同一类型的任务会竞争资源
    return task1.type === task2.type && task1.id !== task2.id;
  }

  /**
   * 检查循环依赖
   */
  private hasCircularDependency(task1: Task, task2: Task): boolean {
    // 简化实现：实际需要维护任务依赖图
    // 这里只是示例逻辑
    return false;
  }

  /**
   * 检查状态冲突
   */
  private hasStateConflict(task1: Task, task2: Task): boolean {
    // 简化实现：检查是否有重叠的能力需求
    const common = task1.requiredCapabilities.filter((c: string) =>
      task2.requiredCapabilities.includes(c)
    );
    return common.length > 0 && task1.assignedAgent !== task2.assignedAgent;
  }

  /**
   * 创建冲突对象
   */
  private createConflict(type: ConflictType, taskIds: string[], description: string): Conflict {
    return {
      id: `conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      involvedTasks: taskIds,
      involvedAgents: [], // 稍后填充
      timestamp: new Date(),
      description
    };
  }

  /**
   * 解决冲突
   */
  resolve(conflict: Conflict, strategy: ConflictStrategy = 'priority'): Resolution {
    const handler = this.handlers.get(conflict.type);
    
    let resolution: Resolution;
    
    if (handler) {
      resolution = handler(conflict);
    } else {
      resolution = {
        conflictId: conflict.id,
        strategy: 'first-come',
        losers: conflict.involvedTasks,
        action: 'abort',
        message: '无处理器，使用默认中止'
      };
    }
    
    // 记录历史
    this.conflictHistory.push(conflict);
    this.resolutionHistory.push(resolution);
    
    return resolution;
  }

  /**
   * 按优先级解决冲突
   */
  private resolveByPriority(conflict: Conflict): Resolution {
    // 简化实现：随机选择一个winner
    const winnerIndex = Math.floor(Math.random() * conflict.involvedTasks.length);
    const winner = conflict.involvedTasks[winnerIndex];
    const losers = conflict.involvedTasks.filter((_: string, i: number) => i !== winnerIndex);
    
    return {
      conflictId: conflict.id,
      strategy: 'priority',
      winner,
      losers,
      action: 'retry',
      message: `优先级解决: ${winner} 获胜`
    };
  }

  /**
   * 按先来后到解决冲突
   */
  private resolveByFirstCome(conflict: Conflict): Resolution {
    const winner = conflict.involvedTasks[0];
    const losers = conflict.involvedTasks.slice(1);
    
    return {
      conflictId: conflict.id,
      strategy: 'first-come',
      winner,
      losers,
      action: 'retry',
      message: `先来先服务: ${winner} 获胜`
    };
  }

  /**
   * 轮询解决冲突
   */
  private resolveByRoundRobin(conflict: Conflict): Resolution {
    // 简化实现
    return this.resolveByFirstCome(conflict);
  }

  /**
   * 获取冲突历史
   */
  getConflictHistory(): Conflict[] {
    return [...this.conflictHistory];
  }

  /**
   * 获取解决历史
   */
  getResolutionHistory(): Resolution[] {
    return [...this.resolutionHistory];
  }

  /**
   * 获取统计信息
   */
  getStats(): { 
    totalConflicts: number; 
    byType: Record<ConflictType, number>;
    byStrategy: Record<ConflictStrategy, number>;
  } {
    const byType: Record<ConflictType, number> = {
      resource: 0,
      dependency: 0,
      state: 0
    };
    
    const byStrategy: Record<ConflictStrategy, number> = {
      priority: 0,
      'round-robin': 0,
      'first-come': 0,
      custom: 0
    };
    
    for (const conflict of this.conflictHistory) {
      byType[conflict.type]++;
    }
    
    for (const resolution of this.resolutionHistory) {
      byStrategy[resolution.strategy]++;
    }
    
    return {
      totalConflicts: this.conflictHistory.length,
      byType,
      byStrategy
    };
  }

  /**
   * 清空历史记录
   */
  clearHistory(): void {
    this.conflictHistory = [];
    this.resolutionHistory = [];
  }
}

// 导出单例
export const conflictResolver = new ConflictResolver();
