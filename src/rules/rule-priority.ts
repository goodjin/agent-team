/**
 * 规则优先级管理
 */

import type { RuleType } from './types.js';

/**
 * 默认优先级配置
 */
export const DEFAULT_PRIORITY_CONFIG: { [key in RuleType]: number } = {
  security: 100,      // 安全规则最高优先级
  coding: 80,         // 编码规范
  'best-practices': 60, // 最佳实践
  project: 40,        // 项目特定规则
  custom: 20,         // 自定义规则
};

/**
 * 规则优先级配置
 */
export interface PriorityConfig {
  security: number;
  coding: number;
  'best-practices': number;
  project: number;
  custom: number;
}

/**
 * 解析类别优先级
 */
export function resolvePriority(
  category: RuleType,
  config?: PriorityConfig
): number {
  const priorityConfig = config || DEFAULT_PRIORITY_CONFIG;
  return priorityConfig[category] || 0;
}

/**
 * 获取规则优先级
 */
export function getRulePriority(
  category: RuleType,
  explicitPriority?: number
): number {
  if (explicitPriority !== undefined) {
    return explicitPriority;
  }
  return resolvePriority(category);
}

/**
 * 比较两个规则的优先级
 */
export function comparePriority(
  categoryA: RuleType,
  priorityA: number | undefined,
  categoryB: RuleType,
  priorityB: number | undefined
): number {
  const priority1 = getRulePriority(categoryA, priorityA);
  const priority2 = getRulePriority(categoryB, priorityB);
  return priority2 - priority1; // 降序排列
}

/**
 * 创建自定义优先级配置
 */
export function createPriorityConfig(
  overrides: Partial<PriorityConfig>
): PriorityConfig {
  return {
    security: overrides.security ?? DEFAULT_PRIORITY_CONFIG.security,
    coding: overrides.coding ?? DEFAULT_PRIORITY_CONFIG.coding,
    'best-practices': overrides['best-practices'] ?? DEFAULT_PRIORITY_CONFIG['best-practices'],
    project: overrides.project ?? DEFAULT_PRIORITY_CONFIG.project,
    custom: overrides.custom ?? DEFAULT_PRIORITY_CONFIG.custom,
  };
}

/**
 * 验证优先级配置
 */
export function validatePriorityConfig(
  config: PriorityConfig
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const priorities = Object.values(config);

  // 检查优先级是否在有效范围内
  for (const [category, priority] of Object.entries(config)) {
    if (typeof priority !== 'number' || priority < 0 || priority > 100) {
      errors.push(`${category} 的优先级必须在 0-100 之间`);
    }
  }

  // 检查是否有重复的优先级
  const seen = new Set<number>();
  for (const priority of priorities) {
    if (seen.has(priority)) {
      errors.push('优先级值不能重复');
      break;
    }
    seen.add(priority);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 排序规则列表
 */
export function sortByPriority<T extends { category: RuleType; priority?: number }>(
  rules: T[],
  config?: PriorityConfig
): T[] {
  return [...rules].sort((a, b) =>
    comparePriority(a.category, a.priority, b.category, b.priority)
  );
}

/**
 * 获取优先级描述
 */
export function getPriorityDescription(priority: number): string {
  if (priority >= 100) return 'critical - 关键安全规则';
  if (priority >= 80) return 'high - 重要编码规范';
  if (priority >= 60) return 'medium - 推荐最佳实践';
  if (priority >= 40) return 'low - 项目特定规则';
  return 'custom - 自定义规则';
}

/**
 * 优先级配置管理器
 */
export class PriorityManager {
  private config: PriorityConfig;

  constructor(config?: Partial<PriorityConfig>) {
    this.config = createPriorityConfig(config || {});
  }

  /**
   * 设置类别优先级
   */
  setPriority(category: RuleType, priority: number): void {
    if (priority < 0 || priority > 100) {
      throw new Error('优先级必须在 0-100 之间');
    }
    this.config[category] = priority;
  }

  /**
   * 获取类别优先级
   */
  getPriority(category: RuleType): number {
    return resolvePriority(category, this.config);
  }

  /**
   * 获取完整配置
   */
  getConfig(): PriorityConfig {
    return { ...this.config };
  }

  /**
   * 重置为默认配置
   */
  reset(): void {
    this.config = createPriorityConfig({});
  }

  /**
   * 导出配置
   */
  export(): string {
    return `# 规则优先级配置
# 此文件定义了各类别规则的优先级
# 优先级数值越大，规则越重要

security: ${this.config.security}      # 安全规则 - 最高优先级
coding: ${this.config.coding}         # 编码规范
best-practices: ${this.config['best-practices']}       # 最佳实践
project: ${this.config.project}        # 项目特定规则
custom: ${this.config.custom}          # 自定义规则
`;
  }
}

/**
 * 优先级管理器单例
 */
let priorityManagerInstance: PriorityManager | null = null;

export function getPriorityManager(): PriorityManager {
  if (!priorityManagerInstance) {
    priorityManagerInstance = new PriorityManager();
  }
  return priorityManagerInstance;
}

export function resetPriorityManager(): void {
  priorityManagerInstance = null;
}
