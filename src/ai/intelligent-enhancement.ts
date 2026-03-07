/**
 * 智能增强引擎 - 统一入口
 * 整合自进化、模式识别、智能重试、性能预测
 */

import { SelfEvolutionEngine, type EvolutionConfig } from './self-evolution.js';
import { TaskPatternRecognizer } from './task-pattern.js';
import { SmartRetryStrategy, type RetryConfig } from './retry-strategy.js';
import { PerformancePredictor, type PredictionModel } from './performance-prediction.js';

import type { Task, RoleType, TaskType, Priority } from '../types/index.js';

export interface IntelligentEnhancementConfig {
  evolution?: Partial<EvolutionConfig>;
  retry?: Partial<RetryConfig>;
  prediction?: Partial<PredictionModel>;
}

export interface TaskRecommendation {
  role: RoleType;
  priority: Priority;
  estimatedDuration: number;
  successProbability: number;
  riskFactors: string[];
  recommendations: string[];
}

/**
 * 智能增强引擎
 * 整合所有智能增强能力
 */
export class IntelligentEnhancementEngine {
  private evolution: SelfEvolutionEngine;
  private recognizer: TaskPatternRecognizer;
  private retry: SmartRetryStrategy;
  private predictor: PerformancePredictor;

  constructor(config?: IntelligentEnhancementConfig) {
    this.evolution = new SelfEvolutionEngine(config?.evolution);
    this.recognizer = new TaskPatternRecognizer();
    this.retry = new SmartRetryStrategy(config?.retry);
    this.predictor = new PerformancePredictor(config?.prediction);
  }

  /**
   * 分析任务并提供推荐
   */
  analyzeTask(task: Task | string): TaskRecommendation {
    // 1. 模式识别 - 支持 string 和 Task
    const patternResult = this.recognizer.recognize(task);

    // 2. 性能预测 - 需要完整 Task 对象
    let prediction;
    if (typeof task === 'string') {
      const fakeTask: Task = {
        id: 'temp',
        title: task.substring(0, 50),
        description: task,
        type: 'custom',
        status: 'pending',
        priority: 'medium',
        assignedRole: 'developer',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prediction = this.predictor.predict(fakeTask);
    } else {
      prediction = this.predictor.predict(task);
    }

    // 3. 角色推荐（结合模式识别和自进化）
    let recommendedRole = patternResult.pattern?.suggestedRole || 'developer';
    if (this.evolution.canLearn()) {
      const evolvedRole = this.evolution.getRecommendedRole(
        typeof task === 'string' ? task : task.description,
        typeof task === 'string' ? 'custom' : task.type
      );
      // 综合两种推荐
      if (evolvedRole !== recommendedRole) {
        recommendedRole = evolvedRole;
      }
    }

    // 4. 优先级
    const priority = patternResult.pattern?.suggestedPriority ||
      (typeof task === 'string' ? 'medium' : task.priority) || 'medium';

    return {
      role: recommendedRole,
      priority,
      estimatedDuration: prediction.estimatedDuration,
      successProbability: prediction.successProbability,
      riskFactors: prediction.riskFactors.map(r => r.factor),
      recommendations: prediction.recommendations,
    };
  }

  /**
   * 执行任务（带智能重试）
   */
  async executeWithRetry<T>(
    operationId: string,
    operation: () => Promise<T>,
    onRetry?: (attempt: number, error: Error) => void
  ): Promise<T> {
    return this.retry.executeWithRetry(operationId, operation, onRetry);
  }

  /**
   * 记录任务完成（用于学习）
   */
  recordTaskCompletion(task: Task): void {
    // 1. 记录到自进化引擎
    this.evolution.recordTaskCompletion(task);

    // 2. 让模式识别器学习
    if (task.status === 'completed') {
      this.recognizer.learnFromSuccess(task);
    }

    // 3. 记录到性能预测器
    if (task.executionRecords && task.startedAt && task.completedAt) {
      let totalTokens = 0;
      for (const record of task.executionRecords) {
        if (record.tokensUsed?.totalTokens) {
          totalTokens += record.tokensUsed.totalTokens;
        }
      }
      const duration = task.completedAt.getTime() - task.startedAt.getTime();

      this.predictor.recordActualPerformance(
        task,
        duration,
        totalTokens,
        task.status === 'completed'
      );
    }
  }

  /**
   * 获取角色性能
   */
  getRolePerformance(role: RoleType) {
    return this.evolution.getRolePerformance(role);
  }

  /**
   * 获取所有角色性能
   */
  getAllRolePerformance() {
    return this.evolution.getAllRolePerformance();
  }

  /**
   * 获取任务模式
   */
  getTaskPatterns() {
    return this.recognizer.getPatterns();
  }

  /**
   * 获取性能预测模型
   */
  getPredictionModel() {
    return this.predictor.getModel();
  }

  /**
   * 获取重试配置
   */
  getRetryConfig() {
    return this.retry.getConfig();
  }

  /**
   * 更新重试配置
   */
  updateRetryConfig(config: Partial<RetryConfig>) {
    this.retry.updateConfig(config);
  }

  /**
   * 导出所有学习数据
   */
  exportAllData(): string {
    return JSON.stringify({
      evolution: this.evolution.exportLearningData(),
      patterns: this.recognizer.exportPatterns(),
      prediction: this.predictor.exportData(),
    }, null, 2);
  }

  /**
   * 导入学习数据
   */
  importAllData(data: string) {
    try {
      const parsed = JSON.parse(data);
      if (parsed.evolution) {
        this.evolution.importLearningData(parsed.evolution);
      }
      if (parsed.patterns) {
        this.recognizer.importPatterns(parsed.patterns);
      }
      if (parsed.prediction) {
        this.predictor.importData(parsed.prediction);
      }
    } catch (error) {
      console.error('Failed to import data:', error);
    }
  }
}

// 导出工厂函数
export function createIntelligentEnhancementEngine(
  config?: IntelligentEnhancementConfig
): IntelligentEnhancementEngine {
  return new IntelligentEnhancementEngine(config);
}

// 导出所有组件
export {
  SelfEvolutionEngine,
  createSelfEvolutionEngine,
  type EvolutionConfig,
  type EvolutionMetrics,
  type RolePerformance,
  type TaskPattern,
} from './self-evolution.js';

export {
  TaskPatternRecognizer,
  createTaskPatternRecognizer,
  type PatternFeatures,
  type RecognizedPattern,
  type PatternMatchResult,
} from './task-pattern.js';

export {
  SmartRetryStrategy,
  createSmartRetryStrategy,
  type RetryConfig,
  type RetryDecision,
  type RetryState,
  type ErrorClassifier,
} from './retry-strategy.js';

export {
  PerformancePredictor,
  createPerformancePredictor,
  type PerformancePrediction,
  type RiskFactor,
  type HistoricalMetrics,
  type PredictionModel,
} from './performance-prediction.js';
