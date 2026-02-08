import { EventEmitter } from 'events';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TokenBudgetEvent {
  used: number;
  budget: number;
  percentage: number;
  timestamp: Date;
}

export class TokenManager extends EventEmitter {
  private budget: number;
  private used: number = 0;
  private history: Array<{ timestamp: Date; usage: TokenUsage }> = [];

  constructor(budget: number) {
    super();
    this.budget = budget;
  }

  /**
   * 检查预算是否足够
   */
  checkBudget(estimatedTokens: number): boolean {
    return this.used + estimatedTokens <= this.budget;
  }

  /**
   * 记录 Token 使用
   */
  recordUsage(usage: TokenUsage): void {
    this.used += usage.totalTokens;
    this.history.push({
      timestamp: new Date(),
      usage,
    });

    const percentage = (this.used / this.budget) * 100;

    // 触发事件
    if (percentage >= 90) {
      this.emit('budget:critical', {
        used: this.used,
        budget: this.budget,
        percentage,
        timestamp: new Date(),
      } as TokenBudgetEvent);
    } else if (percentage >= 80) {
      this.emit('budget:warning', {
        used: this.used,
        budget: this.budget,
        percentage,
        timestamp: new Date(),
      } as TokenBudgetEvent);
    }

    this.emit('usage:recorded', usage);
  }

  /**
   * 检查是否超出预算
   */
  exceedsBudget(): boolean {
    return this.used >= this.budget;
  }

  /**
   * 获取剩余预算
   */
  getRemainingBudget(): number {
    return Math.max(0, this.budget - this.used);
  }

  /**
   * 获取使用百分比
   */
  getUsagePercentage(): number {
    return (this.used / this.budget) * 100;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    budget: number;
    used: number;
    remaining: number;
    percentage: number;
    callCount: number;
    averageTokensPerCall: number;
  } {
    const callCount = this.history.length;
    const averageTokensPerCall = callCount > 0 ? this.used / callCount : 0;

    return {
      budget: this.budget,
      used: this.used,
      remaining: this.getRemainingBudget(),
      percentage: this.getUsagePercentage(),
      callCount,
      averageTokensPerCall,
    };
  }

  /**
   * 获取历史记录
   */
  getHistory(): Array<{ timestamp: Date; usage: TokenUsage }> {
    return [...this.history];
  }

  /**
   * 重置预算
   */
  reset(newBudget?: number): void {
    this.used = 0;
    this.history = [];

    if (newBudget !== undefined) {
      this.budget = newBudget;
    }

    this.emit('budget:reset', { budget: this.budget });
  }

  /**
   * 调整预算
   */
  adjustBudget(newBudget: number): void {
    const oldBudget = this.budget;
    this.budget = newBudget;

    this.emit('budget:adjusted', {
      oldBudget,
      newBudget,
      used: this.used,
    });
  }

  /**
   * 估算 Token 数量（简单实现，基于字符数）
   */
  static estimateTokens(text: string): number {
    // 粗略估算：英文 ~4 字符/token，中文 ~1.5 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;

    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 批量估算消息的 Token 数量
   */
  static estimateMessagesTokens(messages: Array<{ role: string; content: string }>): number {
    let total = 0;

    for (const message of messages) {
      // 每条消息有固定开销（约 4 tokens）
      total += 4;
      total += this.estimateTokens(message.content);
      total += this.estimateTokens(message.role);
    }

    // 额外的对话格式开销
    total += 3;

    return total;
  }
}
