// 进度聚合器
// Phase 2: 协作能力增强

import { TaskProgress, AggregatedProgress, TaskStatus } from './types';

type ProgressCallback = (progress: AggregatedProgress) => void;

export class ProgressAggregator {
  private progressMap: Map<string, TaskProgress> = new Map();
  private subscribers: Set<ProgressCallback> = new Set();

  /**
   * 更新单个任务进度
   */
  updateProgress(progress: TaskProgress): void {
    this.progressMap.set(progress.taskId, progress);
    this.notifySubscribers();
  }

  /**
   * 获取单个任务进度
   */
  getProgress(taskId: string): TaskProgress | undefined {
    return this.progressMap.get(taskId);
  }

  /**
   * 获取所有任务进度
   */
  getAllProgress(): TaskProgress[] {
    return Array.from(this.progressMap.values());
  }

  /**
   * 获取聚合进度
   */
  getAggregatedProgress(): AggregatedProgress {
    const all = this.getAllProgress();
    
    const totalTasks = all.length;
    const completedTasks = all.filter(p => p.status === 'completed').length;
    const failedTasks = all.filter(p => p.status === 'failed').length;
    const inProgressTasks = all.filter(p => p.status === 'in-progress').length;
    const pendingTasks = all.filter(p => p.status === 'pending').length;
    
    // 计算平均进度（只计算已完成和进行中的）
    const activeTasks = all.filter(p => p.status !== 'pending' && p.status !== 'failed');
    const averageProgress = activeTasks.length > 0
      ? activeTasks.reduce((sum, p) => sum + p.progress, 0) / activeTasks.length
      : 0;
    
    // 按 Agent 分组
    const byAgent = new Map<string, TaskProgress[]>();
    for (const progress of all) {
      const existing = byAgent.get(progress.agentId) || [];
      existing.push(progress);
      byAgent.set(progress.agentId, existing);
    }
    
    return {
      totalTasks,
      completedTasks,
      failedTasks,
      inProgressTasks,
      pendingTasks,
      averageProgress: Math.round(averageProgress * 100) / 100,
      byAgent,
      lastUpdated: new Date()
    };
  }

  /**
   * 订阅进度变化
   */
  subscribe(callback: ProgressCallback): () => void {
    this.subscribers.add(callback);
    
    // 返回取消订阅函数
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * 通知所有订阅者
   */
  private notifySubscribers(): void {
    const aggregated = this.getAggregatedProgress();
    for (const callback of this.subscribers) {
      try {
        callback(aggregated);
      } catch (error) {
        console.error('Progress callback error:', error);
      }
    }
  }

  /**
   * 标记任务开始
   */
  markStarted(taskId: string, agentId: string): void {
    const existing = this.progressMap.get(taskId);
    
    this.progressMap.set(taskId, {
      taskId,
      agentId,
      status: 'in-progress',
      progress: 0,
      startedAt: new Date()
    });
    
    this.notifySubscribers();
  }

  /**
   * 更新任务进度百分比
   */
  updateProgressPercent(taskId: string, progress: number): void {
    const existing = this.progressMap.get(taskId);
    if (!existing) return;
    
    this.progressMap.set(taskId, {
      ...existing,
      progress: Math.min(100, Math.max(0, progress))
    });
    
    this.notifySubscribers();
  }

  /**
   * 标记任务完成
   */
  markCompleted(taskId: string): void {
    const existing = this.progressMap.get(taskId);
    if (!existing) return;
    
    this.progressMap.set(taskId, {
      ...existing,
      status: 'completed',
      progress: 100,
      completedAt: new Date()
    });
    
    this.notifySubscribers();
  }

  /**
   * 标记任务失败
   */
  markFailed(taskId: string, error: string): void {
    const existing = this.progressMap.get(taskId);
    if (!existing) return;
    
    this.progressMap.set(taskId, {
      ...existing,
      status: 'failed',
      error,
      completedAt: new Date()
    });
    
    this.notifySubscribers();
  }

  /**
   * 删除任务进度记录
   */
  remove(taskId: string): void {
    this.progressMap.delete(taskId);
    this.notifySubscribers();
  }

  /**
   * 清空所有进度记录
   */
  clear(): void {
    this.progressMap.clear();
    this.notifySubscribers();
  }

  /**
   * 获取特定状态的任务
   */
  getByStatus(status: TaskStatus): TaskProgress[] {
    return this.getAllProgress().filter(p => p.status === status);
  }

  /**
   * 获取特定 Agent 的任务进度
   */
  getByAgent(agentId: string): TaskProgress[] {
    return this.getAllProgress().filter(p => p.agentId === agentId);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    inProgressTasks: number;
    pendingTasks: number;
    averageProgress: number;
  } {
    const aggregated = this.getAggregatedProgress();
    return {
      totalTasks: aggregated.totalTasks,
      completedTasks: aggregated.completedTasks,
      failedTasks: aggregated.failedTasks,
      inProgressTasks: aggregated.inProgressTasks,
      pendingTasks: aggregated.pendingTasks,
      averageProgress: aggregated.averageProgress
    };
  }
}

// 导出单例
export const progressAggregator = new ProgressAggregator();
