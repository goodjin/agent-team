/**
 * 任务模式识别 (Task Pattern Recognition)
 * 识别任务特征，匹配历史最佳处理方式
 */

import type { Task, TaskType, RoleType, Priority } from '../types/index.js';

export interface PatternFeatures {
  // 任务特征
  taskType?: TaskType;
  keywords: string[];
  complexity?: 'low' | 'medium' | 'high';
  hasDependencies: boolean;
  estimatedDuration?: number;

  // 上下文特征
  projectType?: string;
  language?: string;
  framework?: string;
}

export interface RecognizedPattern {
  id: string;
  name: string;
  features: PatternFeatures;
  confidence: number;
  suggestedRole: RoleType;
  suggestedPriority: Priority;
  subtaskHints?: string[];
  estimatedDuration?: number;
}

export interface PatternMatchResult {
  pattern: RecognizedPattern | null;
  confidence: number;
  reasoning: string;
}

export interface PatternDatabase {
  patterns: RecognizedPattern[];
  lastUpdated: Date;
}

/**
 * 任务模式识别器
 * 基于自然语言和任务特征识别任务模式
 */
export class TaskPatternRecognizer {
  private patterns: RecognizedPattern[] = [];
  private learningEnabled: boolean = true;

  constructor() {
    this.initializeDefaultPatterns();
  }

  /**
   * 初始化默认模式
   */
  private initializeDefaultPatterns(): void {
    this.patterns = [
      {
        id: 'pattern_bug_fix',
        name: 'Bug修复',
        features: {
          keywords: ['bug', 'error', 'fix', '修复', '错误', '崩溃', 'crash', 'exception', '问题'],
          complexity: 'low',
          hasDependencies: false,
        },
        confidence: 0.8,
        suggestedRole: 'developer',
        suggestedPriority: 'high',
        estimatedDuration: 1800000, // 30分钟
      },
      {
        id: 'pattern_new_feature',
        name: '新功能开发',
        features: {
          keywords: ['新增', '实现', '添加', '功能', 'feature', 'implement', 'add', 'create'],
          complexity: 'medium',
          hasDependencies: true,
        },
        confidence: 0.85,
        suggestedRole: 'developer',
        suggestedPriority: 'medium',
        estimatedDuration: 7200000, // 2小时
      },
      {
        id: 'pattern_refactor',
        name: '代码重构',
        features: {
          keywords: ['重构', 'refactor', '优化', 'optimize', '改进', 'improve', '整理'],
          complexity: 'medium',
          hasDependencies: false,
        },
        confidence: 0.75,
        suggestedRole: 'developer',
        suggestedPriority: 'low',
        estimatedDuration: 3600000, // 1小时
      },
      {
        id: 'pattern_requirement',
        name: '需求分析',
        features: {
          keywords: ['需求', '分析', 'requirement', 'analyze', 'spec', '规格', '设计'],
          complexity: 'high',
          hasDependencies: false,
        },
        confidence: 0.9,
        suggestedRole: 'product-manager',
        suggestedPriority: 'high',
        estimatedDuration: 3600000, // 1小时
      },
      {
        id: 'pattern_architecture',
        name: '架构设计',
        features: {
          keywords: ['架构', '设计', 'architecture', 'design', '方案', '架构师'],
          complexity: 'high',
          hasDependencies: true,
        },
        confidence: 0.85,
        suggestedRole: 'architect',
        suggestedPriority: 'high',
        estimatedDuration: 5400000, // 1.5小时
      },
      {
        id: 'pattern_testing',
        name: '测试相关',
        features: {
          keywords: ['测试', 'test', '测试用例', 'test case', '覆盖率', 'coverage', '验证'],
          complexity: 'low',
          hasDependencies: false,
        },
        confidence: 0.8,
        suggestedRole: 'tester',
        suggestedPriority: 'medium',
        estimatedDuration: 2700000, // 45分钟
      },
      {
        id: 'pattern_documentation',
        name: '文档编写',
        features: {
          keywords: ['文档', 'doc', 'readme', '说明', '注释', 'comment', 'write'],
          complexity: 'low',
          hasDependencies: false,
        },
        confidence: 0.7,
        suggestedRole: 'doc-writer',
        suggestedPriority: 'low',
        estimatedDuration: 1800000, // 30分钟
      },
      {
        id: 'pattern_code_review',
        name: '代码审查',
        features: {
          keywords: ['审查', 'review', 'review', '评审', '检查', 'review code'],
          complexity: 'medium',
          hasDependencies: false,
        },
        confidence: 0.75,
        suggestedRole: 'code-reviewer',
        suggestedPriority: 'medium',
        estimatedDuration: 2700000, // 45分钟
      },
      {
        id: 'pattern_performance',
        name: '性能优化',
        features: {
          keywords: ['性能', '优化', 'performance', 'optimize', 'slow', '优化', '高效'],
          complexity: 'high',
          hasDependencies: false,
        },
        confidence: 0.8,
        suggestedRole: 'developer',
        suggestedPriority: 'high',
        estimatedDuration: 5400000, // 1.5小时
      },
      {
        id: 'pattern_security',
        name: '安全相关',
        features: {
          keywords: ['安全', 'security', 'vulnerability', '漏洞', '权限', 'permission', 'auth'],
          complexity: 'high',
          hasDependencies: false,
        },
        confidence: 0.85,
        suggestedRole: 'developer',
        suggestedPriority: 'critical',
        estimatedDuration: 3600000, // 1小时
      },
    ];
  }

  /**
   * 识别任务模式
   */
  recognize(task: Task | string): PatternMatchResult {
    const features = this.extractFeatures(task);
    return this.matchPattern(features);
  }

  /**
   * 提取任务特征
   */
  extractFeatures(task: Task | string): PatternFeatures {
    const text = typeof task === 'string' ? task : task.description;
    const taskType = typeof task === 'string' ? undefined : task.type;
    const hasDependencies = typeof task === 'string' ? false : (task.dependencies?.length ?? 0) > 0;

    return {
      taskType,
      keywords: this.extractKeywords(text),
      complexity: this.estimateComplexity(text),
      hasDependencies,
      estimatedDuration: typeof task === 'string' ? undefined :
        (task.completedAt && task.startedAt ?
          task.completedAt.getTime() - task.startedAt.getTime() : undefined),
    };
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

    return [...new Set(words)];
  }

  /**
   * 估计复杂度
   */
  private estimateComplexity(text: string): 'low' | 'medium' | 'high' {
    const complexKeywords = ['架构', '系统', '设计', '重构', '优化', 'security', 'architecture', 'system'];
    const simpleKeywords = ['bug', 'fix', '修复', '文档', 'doc', '注释', 'comment'];

    const lowerText = text.toLowerCase();

    if (complexKeywords.some(k => lowerText.includes(k))) {
      return 'high';
    }
    if (simpleKeywords.some(k => lowerText.includes(k))) {
      return 'low';
    }
    return 'medium';
  }

  /**
   * 匹配模式
   */
  private matchPattern(features: PatternFeatures): PatternMatchResult {
    let bestMatch: RecognizedPattern | null = null;
    let bestScore = 0;

    for (const pattern of this.patterns) {
      const score = this.calculateMatchScore(pattern.features, features);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = pattern;
      }
    }

    const confidence = bestScore;
    const reasoning = bestMatch
      ? `匹配到模式 "${bestMatch.name}"，置信度 ${(confidence * 100).toFixed(1)}%`
      : '未识别到明确模式，使用默认配置';

    return {
      pattern: bestMatch,
      confidence,
      reasoning,
    };
  }

  /**
   * 计算匹配分数
   */
  private calculateMatchScore(pattern: PatternFeatures, features: PatternFeatures): number {
    let score = 0;
    let weight = 0;

    // 任务类型权重
    if (pattern.taskType && features.taskType) {
      weight += 0.3;
      if (pattern.taskType === features.taskType) {
        score += 0.3;
      }
    }

    // 关键词权重
    weight += 0.4;
    const keywordMatch = this.keywordMatchScore(pattern.keywords, features.keywords);
    score += keywordMatch * 0.4;

    // 复杂度权重
    weight += 0.15;
    if (pattern.complexity && features.complexity) {
      if (pattern.complexity === features.complexity) {
        score += 0.15;
      } else if (
        (pattern.complexity === 'high' && features.complexity === 'medium') ||
        (pattern.complexity === 'medium' && features.complexity === 'low')
      ) {
        score += 0.1;
      }
    }

    // 依赖权重
    weight += 0.15;
    if (pattern.hasDependencies === features.hasDependencies) {
      score += 0.15;
    }

    return weight > 0 ? score / weight : 0;
  }

  /**
   * 关键词匹配分数
   */
  private keywordMatchScore(patternKeywords: string[], featureKeywords: string[]): number {
    if (patternKeywords.length === 0) return 0;

    const patternSet = new Set(patternKeywords);
    const featureSet = new Set(featureKeywords);

    const intersection = [...patternSet].filter(x => featureSet.has(x));
    return intersection.length / patternSet.size;
  }

  /**
   * 添加自定义模式
   */
  addPattern(pattern: RecognizedPattern): void {
    // 避免重复
    const existing = this.patterns.find(p => p.id === pattern.id);
    if (!existing) {
      this.patterns.push(pattern);
    }
  }

  /**
   * 删除模式
   */
  removePattern(patternId: string): boolean {
    const index = this.patterns.findIndex(p => p.id === patternId);
    if (index !== -1) {
      this.patterns.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 从成功任务中学习
   */
  learnFromSuccess(task: Task): void {
    if (!this.learningEnabled) return;

    const features = this.extractFeatures(task);
    const role = task.assignedRole || 'developer';
    const priority = task.priority || 'medium';

    // 检查是否需要创建新模式
    const matchResult = this.recognize(task);
    if (matchResult.confidence < 0.5 && features.keywords.length >= 3) {
      // 创建新模式
      const newPattern: RecognizedPattern = {
        id: `learned_${Date.now()}`,
        name: `学习到的模式`,
        features,
        confidence: 0.6,
        suggestedRole: role,
        suggestedPriority: priority,
      };
      this.addPattern(newPattern);
    }
  }

  /**
   * 启用/禁用学习
   */
  setLearningEnabled(enabled: boolean): void {
    this.learningEnabled = enabled;
  }

  /**
   * 获取所有模式
   */
  getPatterns(): RecognizedPattern[] {
    return this.patterns;
  }

  /**
   * 导出模式库
   */
  exportPatterns(): string {
    return JSON.stringify({
      patterns: this.patterns,
      lastUpdated: new Date(),
    }, null, 2);
  }

  /**
   * 导入模式库
   */
  importPatterns(data: string): void {
    try {
      const parsed = JSON.parse(data);
      if (parsed.patterns) {
        this.patterns = parsed.patterns;
      }
    } catch (error) {
      console.error('Failed to import patterns:', error);
    }
  }
}

// 导出工厂函数
export function createTaskPatternRecognizer(): TaskPatternRecognizer {
  return new TaskPatternRecognizer();
}
