/**
 * 性能预测 (Performance Prediction)
 * 预测任务执行时间、资源消耗和成功率
 */

import type { Task, RoleType, TaskType } from '../types/index.js';

export interface PerformancePrediction {
  estimatedDuration: number;
  estimatedTokens: number;
  estimatedCost: number;
  successProbability: number;
  riskFactors: RiskFactor[];
  recommendations: string[];
}

export interface RiskFactor {
  factor: string;
  probability: number;
  impact: 'low' | 'medium' | 'high';
  mitigation?: string;
}

export interface HistoricalMetrics {
  taskType: TaskType;
  role: RoleType;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  avgTokens: number;
  successRate: number;
  sampleCount: number;
}

export interface PredictionModel {
  type: 'simple' | 'weighted' | 'adaptive';
  weights: {
    taskType: number;
    role: number;
    complexity: number;
    history: number;
  };
}

const DEFAULT_MODEL: PredictionModel = {
  type: 'weighted',
  weights: {
    taskType: 0.3,
    role: 0.2,
    complexity: 0.2,
    history: 0.3,
  },
};

const TASK_TYPE_BASELINE: Record<TaskType, { duration: number; tokens: number }> = {
  'requirement-analysis': { duration: 3600000, tokens: 50000 },
  'architecture-design': { duration: 5400000, tokens: 80000 },
  'development': { duration: 7200000, tokens: 100000 },
  'testing': { duration: 2700000, tokens: 40000 },
  'documentation': { duration: 1800000, tokens: 25000 },
  'code-review': { duration: 2700000, tokens: 35000 },
  'refactoring': { duration: 3600000, tokens: 50000 },
  'bug-fix': { duration: 1800000, tokens: 30000 },
  'custom': { duration: 3600000, tokens: 50000 },
};

const ROLE_BASELINE: Record<RoleType, { speedFactor: number; tokenEfficiency: number }> = {
  'product-manager': { speedFactor: 1.0, tokenEfficiency: 0.8 },
  'architect': { speedFactor: 0.9, tokenEfficiency: 0.85 },
  'developer': { speedFactor: 1.0, tokenEfficiency: 1.0 },
  'tester': { speedFactor: 1.1, tokenEfficiency: 0.9 },
  'doc-writer': { speedFactor: 1.2, tokenEfficiency: 0.95 },
  'code-reviewer': { speedFactor: 1.0, tokenEfficiency: 0.85 },
  'custom': { speedFactor: 1.0, tokenEfficiency: 1.0 },
};

/**
 * 性能预测器
 */
export class PerformancePredictor {
  private model: PredictionModel;
  private historicalMetrics: Map<string, HistoricalMetrics> = new Map();
  private recentPredictions: { actual: number; predicted: number; timestamp: number }[] = [];
  private adaptationEnabled: boolean = true;

  constructor(model?: Partial<PredictionModel>) {
    this.model = { ...DEFAULT_MODEL, ...model };
  }

  /**
   * 预测任务性能
   */
  predict(task: Task): PerformancePrediction {
    const taskType = task.type || 'custom';
    const role = task.assignedRole || 'developer';

    // 获取基准值
    const taskBaseline = TASK_TYPE_BASELINE[taskType] || TASK_TYPE_BASELINE['custom'];
    const roleBaseline = ROLE_BASELINE[role] || ROLE_BASELINE['developer'];

    // 从历史数据中学习
    const historyMetrics = this.getHistoricalMetrics(taskType, role);

    // 计算预估时长
    const estimatedDuration = this.calculateDuration(
      taskBaseline.duration,
      roleBaseline.speedFactor,
      historyMetrics
    );

    // 计算预估 token 消耗
    const estimatedTokens = this.calculateTokens(
      taskBaseline.tokens,
      roleBaseline.tokenEfficiency,
      historyMetrics
    );

    // 估算成本（假设 $3/1M tokens）
    const estimatedCost = (estimatedTokens / 1000000) * 3;

    // 计算成功率
    const successProbability = this.calculateSuccessProbability(task, historyMetrics);

    // 识别风险因素
    const riskFactors = this.identifyRiskFactors(task, historyMetrics);

    // 生成建议
    const recommendations = this.generateRecommendations(
      task,
      estimatedDuration,
      successProbability,
      riskFactors
    );

    return {
      estimatedDuration,
      estimatedTokens,
      estimatedCost,
      successProbability,
      riskFactors,
      recommendations,
    };
  }

  /**
   * 计算预估时长
   */
  private calculateDuration(
    baseline: number,
    speedFactor: number,
    history?: HistoricalMetrics
  ): number {
    const taskTypeWeight = this.model.weights.taskType;
    const roleWeight = this.model.weights.role;
    const historyWeight = this.model.weights.history;

    // 基于任务类型和角色的计算
    let duration = baseline * speedFactor;

    // 如果有历史数据，加入历史权重
    if (history && history.sampleCount >= 3) {
      const historyWeightApplied = duration * (1 - historyWeight) + history.avgDuration * historyWeight;
      duration = duration * (1 - historyWeight) + historyWeightApplied * historyWeight;
    }

    return Math.round(duration);
  }

  /**
   * 计算预估 token
   */
  private calculateTokens(
    baseline: number,
    tokenEfficiency: number,
    history?: HistoricalMetrics
  ): number {
    let tokens = baseline / tokenEfficiency;

    if (history && history.sampleCount >= 3) {
      const historyWeight = this.model.weights.history;
      tokens = tokens * (1 - historyWeight) + history.avgTokens * historyWeight;
    }

    return Math.round(tokens);
  }

  /**
   * 计算成功率
   */
  private calculateSuccessProbability(task: Task, history?: HistoricalMetrics): number {
    let baseProbability = 0.8; // 默认基础成功率

    // 考虑历史成功率
    if (history && history.sampleCount >= 3) {
      baseProbability = history.successRate;
    }

    // 根据任务复杂度调整
    const complexity = task.metadata?.complexity as string | undefined;
    if (complexity === 'high') {
      baseProbability *= 0.85;
    } else if (complexity === 'low') {
      baseProbability = Math.min(0.95, baseProbability * 1.1);
    }

    // 根据优先级调整
    if (task.priority === 'critical') {
      baseProbability *= 0.9; // 关键任务压力可能导致成功率下降
    }

    // 根据依赖调整
    if (task.dependencies && task.dependencies.length > 3) {
      baseProbability *= 0.9;
    }

    return Math.max(0.1, Math.min(0.99, baseProbability));
  }

  /**
   * 识别风险因素
   */
  private identifyRiskFactors(task: Task, history?: HistoricalMetrics): RiskFactor[] {
    const risks: RiskFactor[] = [];

    // 复杂度风险
    const complexity = task.metadata?.complexity as string | undefined;
    if (complexity === 'high') {
      risks.push({
        factor: '高复杂度任务',
        probability: 0.6,
        impact: 'high',
        mitigation: '考虑拆分为多个子任务',
      });
    }

    // 依赖风险
    if (task.dependencies && task.dependencies.length > 3) {
      risks.push({
        factor: '多任务依赖',
        probability: 0.5,
        impact: 'medium',
        mitigation: '优化任务依赖关系，减少阻塞',
      });
    }

    // 历史失败风险
    if (history && history.successRate < 0.7) {
      risks.push({
        factor: '历史成功率较低',
        probability: 1 - history.successRate,
        impact: 'high',
        mitigation: '考虑更换执行角色或优化任务描述',
      });
    }

    // 关键任务风险
    if (task.priority === 'critical') {
      risks.push({
        factor: '关键任务',
        probability: 0.3,
        impact: 'high',
        mitigation: '增加验证和检查步骤',
      });
    }

    // 新任务类型风险
    if (!history || history.sampleCount < 3) {
      risks.push({
        factor: '缺少历史数据',
        probability: 0.4,
        impact: 'medium',
        mitigation: '首次执行需要更多验证',
      });
    }

    return risks;
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    task: Task,
    estimatedDuration: number,
    successProbability: number,
    riskFactors: RiskFactor[]
  ): string[] {
    const recommendations: string[] = [];

    // 时长建议
    if (estimatedDuration > 3600000) {
      recommendations.push('任务预计耗时较长，建议拆分为子任务');
    }

    // 成功率建议
    if (successProbability < 0.7) {
      recommendations.push('成功率预测较低，建议：1) 优化任务描述 2) 提供更多上下文');
    }

    // 风险建议
    for (const risk of riskFactors) {
      if (risk.mitigation && risk.probability > 0.5) {
        recommendations.push(`风险 "${risk.factor}"：${risk.mitigation}`);
      }
    }

    // 优先级建议
    if (task.priority === 'high' || task.priority === 'critical') {
      recommendations.push('建议设置检查点，定期验证进度');
    }

    if (recommendations.length === 0) {
      recommendations.push('任务预测正常，按计划执行');
    }

    return recommendations;
  }

  /**
   * 记录实际执行结果
   */
  recordActualPerformance(
    task: Task,
    actualDuration: number,
    actualTokens: number,
    success: boolean
  ): void {
    const taskType = task.type || 'custom';
    const role = task.assignedRole || 'developer';
    const key = `${taskType}:${role}`;

    let metrics = this.historicalMetrics.get(key);
    if (!metrics) {
      metrics = {
        taskType,
        role,
        avgDuration: actualDuration,
        minDuration: actualDuration,
        maxDuration: actualDuration,
        avgTokens: actualTokens,
        successRate: success ? 1 : 0,
        sampleCount: 1,
      };
      this.historicalMetrics.set(key, metrics);
    } else {
      // 更新统计
      const n = metrics.sampleCount;
      metrics.avgDuration = (metrics.avgDuration * n + actualDuration) / (n + 1);
      metrics.minDuration = Math.min(metrics.minDuration, actualDuration);
      metrics.maxDuration = Math.max(metrics.maxDuration, actualDuration);
      metrics.avgTokens = (metrics.avgTokens * n + actualTokens) / (n + 1);
      metrics.successRate = ((metrics.successRate * n) + (success ? 1 : 0)) / (n + 1);
      metrics.sampleCount++;
    }

    // 记录预测误差用于自适应学习
    if (this.adaptationEnabled && this.recentPredictions.length > 0) {
      const lastPrediction = this.recentPredictions[this.recentPredictions.length - 1];
      this.recentPredictions.push({
        actual: actualDuration,
        predicted: lastPrediction.predicted,
        timestamp: Date.now(),
      });

      // 只保留最近100条记录
      if (this.recentPredictions.length > 100) {
        this.recentPredictions = this.recentPredictions.slice(-100);
      }

      // 自适应调整权重
      this.adaptModel();
    }
  }

  /**
   * 获取历史指标
   */
  private getHistoricalMetrics(taskType: TaskType, role: RoleType): HistoricalMetrics | undefined {
    const key = `${taskType}:${role}`;
    return this.historicalMetrics.get(key);
  }

  /**
   * 自适应模型调整
   */
  private adaptModel(): void {
    if (this.recentPredictions.length < 10) return;

    // 计算历史预测误差
    const recent = this.recentPredictions.slice(-10);
    let totalError = 0;

    for (const p of recent) {
      if (p.predicted > 0) {
        totalError += Math.abs(p.actual - p.predicted) / p.predicted;
      }
    }

    const avgError = totalError / recent.length;

    // 如果误差超过20%，调整权重
    if (avgError > 0.2) {
      // 增加历史权重，减少其他权重
      const adjustment = Math.min(0.1, avgError - 0.2);
      this.model.weights.history = Math.min(0.5, this.model.weights.history + adjustment);
      this.model.weights.taskType = Math.max(0.1, this.model.weights.taskType - adjustment / 3);
      this.model.weights.role = Math.max(0.1, this.model.weights.role - adjustment / 3);
      this.model.weights.complexity = Math.max(0.1, this.model.weights.complexity - adjustment / 3);
    }
  }

  /**
   * 获取所有历史指标
   */
  getAllMetrics(): HistoricalMetrics[] {
    return Array.from(this.historicalMetrics.values());
  }

  /**
   * 获取预测模型
   */
  getModel(): PredictionModel {
    return { ...this.model };
  }

  /**
   * 设置预测模型
   */
  setModel(model: Partial<PredictionModel>): void {
    this.model = { ...this.model, ...model };
  }

  /**
   * 启用/禁用自适应
   */
  setAdaptationEnabled(enabled: boolean): void {
    this.adaptationEnabled = enabled;
  }

  /**
   * 导出预测数据
   */
  exportData(): string {
    return JSON.stringify({
      model: this.model,
      historicalMetrics: Array.from(this.historicalMetrics.entries()),
      recentPredictions: this.recentPredictions,
    }, null, 2);
  }

  /**
   * 导入预测数据
   */
  importData(data: string): void {
    try {
      const parsed = JSON.parse(data);
      if (parsed.model) this.model = parsed.model;
      if (parsed.historicalMetrics) {
        this.historicalMetrics = new Map(parsed.historicalMetrics);
      }
      if (parsed.recentPredictions) {
        this.recentPredictions = parsed.recentPredictions;
      }
    } catch (error) {
      console.error('Failed to import prediction data:', error);
    }
  }

  /**
   * 格式化时长
   */
  static formatDuration(ms: number): string {
    if (ms < 60000) {
      return `${Math.round(ms / 1000)}秒`;
    }
    if (ms < 3600000) {
      const minutes = Math.round(ms / 60000);
      return `${minutes}分钟`;
    }
    const hours = Math.round(ms / 3600000 * 10) / 10;
    return `${hours}小时`;
  }
}

// 导出工厂函数
export function createPerformancePredictor(model?: Partial<PredictionModel>): PerformancePredictor {
  return new PerformancePredictor(model);
}
