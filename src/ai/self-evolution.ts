/**
 * 自进化引擎 (Self-Evolution Engine)
 * 负责从历史任务中学习，自动优化系统行为
 */

import type { Task, TaskExecutionRecord, RoleType, TaskType } from '../types/index.js';

export interface EvolutionMetrics {
  rolePerformance: Map<RoleType, RolePerformance>;
  taskPatterns: TaskPattern[];
  successFactors: SuccessFactor[];
  failurePatterns: FailurePattern[];
}

export interface RolePerformance {
  role: RoleType;
  successCount: number;
  failureCount: number;
  avgDuration: number;
  avgTokens: number;
  successRate: number;
}

export interface TaskPattern {
  id: string;
  taskType: TaskType;
  keywords: string[];
  frequency: number;
  avgDuration: number;
  successRate: number;
  recommendedRole: RoleType;
}

export interface SuccessFactor {
  factor: string;
  occurrences: number;
  successRate: number;
}

export interface FailurePattern {
  pattern: string;
  errorType: string;
  occurrences: number;
  recoveryStrategy?: string;
}

export interface EvolutionConfig {
  minSamplesForLearning: number;
  learningIntervalMs: number;
  maxPatternsStored: number;
  enableAutoOptimization: boolean;
}

/**
 * 自进化引擎
 * 从任务执行历史中学习，持续优化系统性能
 */
export class SelfEvolutionEngine {
  private metrics: EvolutionMetrics;
  private config: EvolutionConfig;
  private taskHistory: Task[] = [];

  constructor(config?: Partial<EvolutionConfig>) {
    this.config = {
      minSamplesForLearning: 5,
      learningIntervalMs: 60000,
      maxPatternsStored: 100,
      enableAutoOptimization: false,
      ...config,
    };

    this.metrics = {
      rolePerformance: new Map(),
      taskPatterns: [],
      successFactors: [],
      failurePatterns: [],
    };
  }

  /**
   * 记录任务完成
   */
  recordTaskCompletion(task: Task): void {
    this.taskHistory.push(task);
    this.analyzeTask(task);
    this.pruneHistory();
  }

  /**
   * 分析任务执行结果
   */
  private analyzeTask(task: Task): void {
    if (!task.assignedRole || !task.executionRecords) return;

    const isSuccess = task.status === 'completed';
    const role = task.assignedRole;

    // 更新角色性能统计
    let rolePerf = this.metrics.rolePerformance.get(role);
    if (!rolePerf) {
      rolePerf = {
        role,
        successCount: 0,
        failureCount: 0,
        avgDuration: 0,
        avgTokens: 0,
        successRate: 0,
      };
      this.metrics.rolePerformance.set(role, rolePerf);
    }

    // 计算执行时长和 token 消耗
    let totalDuration = 0;
    let totalTokens = 0;
    let recordCount = 0;

    for (const record of task.executionRecords) {
      if (record.duration) totalDuration += record.duration;
      if (record.tokensUsed?.totalTokens) totalTokens += record.tokensUsed.totalTokens;
      recordCount++;
    }

    const avgDuration = recordCount > 0 ? totalDuration / recordCount : 0;
    const avgTokens = recordCount > 0 ? totalTokens / recordCount : 0;

    // 更新统计
    if (isSuccess) {
      rolePerf.successCount++;
    } else {
      rolePerf.failureCount++;
    }

    const total = rolePerf.successCount + rolePerf.failureCount;
    rolePerf.successRate = total > 0 ? rolePerf.successCount / total : 0;
    rolePerf.avgDuration = (rolePerf.avgDuration * (total - 1) + avgDuration) / total;
    rolePerf.avgTokens = (rolePerf.avgTokens * (total - 1) + avgTokens) / total;

    // 提取任务模式
    this.extractTaskPattern(task);
  }

  /**
   * 提取任务模式
   */
  private extractTaskPattern(task: Task): void {
    const keywords = this.extractKeywords(task.description);

    // 查找现有模式
    const existingPattern = this.metrics.taskPatterns.find(p =>
      p.taskType === task.type && this.keywordsMatch(keywords, p.keywords)
    );

    if (existingPattern) {
      existingPattern.frequency++;
      if (task.status === 'completed') {
        existingPattern.successRate = (
          existingPattern.successRate * (existingPattern.frequency - 1) + 1
        ) / existingPattern.frequency;
      }
    } else if (this.metrics.taskPatterns.length < this.config.maxPatternsStored) {
      // 创建新模式
      this.metrics.taskPatterns.push({
        id: `pattern_${Date.now()}`,
        taskType: task.type || 'custom',
        keywords,
        frequency: 1,
        avgDuration: task.completedAt && task.startedAt
          ? task.completedAt.getTime() - task.startedAt.getTime()
          : 0,
        successRate: task.status === 'completed' ? 1 : 0,
        recommendedRole: task.assignedRole || 'developer',
      });
    }
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);

    // 去重并返回前10个
    return [...new Set(words)].slice(0, 10);
  }

  /**
   * 关键词匹配
   */
  private keywordsMatch(keywords1: string[], keywords2: string[]): boolean {
    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);
    const intersection = [...set1].filter(x => set2.has(x));
    return intersection.length >= Math.min(3, set1.size, set2.size);
  }

  /**
   * 修剪历史记录
   */
  private pruneHistory(): void {
    if (this.taskHistory.length > this.config.maxPatternsStored * 2) {
      this.taskHistory = this.taskHistory.slice(-this.config.maxPatternsStored);
    }
  }

  /**
   * 获取最佳角色推荐
   */
  getRecommendedRole(taskDescription: string, taskType?: TaskType): RoleType {
    const keywords = this.extractKeywords(taskDescription);

    // 查找匹配的任务模式
    const matchedPattern = this.metrics.taskPatterns.find(p =>
      taskType === p.taskType || this.keywordsMatch(keywords, p.keywords)
    );

    if (matchedPattern && matchedPattern.successRate > 0.7) {
      return matchedPattern.recommendedRole;
    }

    // 回退到基于角色性能的推荐
    let bestRole: RoleType = 'developer';
    let bestRate = 0;

    for (const [, perf] of this.metrics.rolePerformance) {
      if (perf.successRate > bestRate && perf.successCount >= this.config.minSamplesForLearning) {
        bestRate = perf.successRate;
        bestRole = perf.role;
      }
    }

    return bestRole;
  }

  /**
   * 获取角色性能统计
   */
  getRolePerformance(role: RoleType): RolePerformance | undefined {
    return this.metrics.rolePerformance.get(role);
  }

  /**
   * 获取所有角色性能
   */
  getAllRolePerformance(): RolePerformance[] {
    return Array.from(this.metrics.rolePerformance.values());
  }

  /**
   * 获取任务模式
   */
  getTaskPatterns(): TaskPattern[] {
    return this.metrics.taskPatterns;
  }

  /**
   * 获取进化指标
   */
  getMetrics(): EvolutionMetrics {
    return this.metrics;
  }

  /**
   * 检查是否可以学习
   */
  canLearn(): boolean {
    return this.taskHistory.length >= this.config.minSamplesForLearning;
  }

  /**
   * 导出学习数据
   */
  exportLearningData(): string {
    return JSON.stringify({
      rolePerformance: Array.from(this.metrics.rolePerformance.entries()),
      taskPatterns: this.metrics.taskPatterns,
      sampleCount: this.taskHistory.length,
    }, null, 2);
  }

  /**
   * 导入学习数据
   */
  importLearningData(data: string): void {
    try {
      const parsed = JSON.parse(data);

      if (parsed.rolePerformance) {
        this.metrics.rolePerformance = new Map(parsed.rolePerformance);
      }

      if (parsed.taskPatterns) {
        this.metrics.taskPatterns = parsed.taskPatterns;
      }
    } catch (error) {
      console.error('Failed to import learning data:', error);
    }
  }
}

// 导出工厂函数
export function createSelfEvolutionEngine(config?: Partial<EvolutionConfig>): SelfEvolutionEngine {
  return new SelfEvolutionEngine(config);
}
