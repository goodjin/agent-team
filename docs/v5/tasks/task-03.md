# Task 3: 实现 Token 管理器

**优先级**: P0
**预计工时**: 4 小时
**依赖**: 任务 2
**状态**: 待执行

---

## 目标

1. 实现 TokenManager 类
2. 实现预算检查和记录
3. 实现预算告警（80%、90%）
4. 实现使用统计

---

## 输入

- 架构设计：`docs/v5/02-architecture.md`

---

## 输出

- `src/ai/token-manager.ts`
- 单元测试：`tests/ai/token-manager.test.ts`

---

## 实现步骤

### 步骤 1: 实现 TokenManager 类

创建 `src/ai/token-manager.ts`：

```typescript
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
```

### 步骤 2: 创建单元测试

创建 `tests/ai/token-manager.test.ts`：

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TokenManager } from '../../src/ai/token-manager.js';

describe('TokenManager', () => {
  let manager: TokenManager;

  beforeEach(() => {
    manager = new TokenManager(10000);
  });

  describe('checkBudget', () => {
    it('should return true when budget is sufficient', () => {
      expect(manager.checkBudget(5000)).toBe(true);
    });

    it('should return false when budget is insufficient', () => {
      manager.recordUsage({
        promptTokens: 5000,
        completionTokens: 4000,
        totalTokens: 9000,
      });

      expect(manager.checkBudget(2000)).toBe(false);
    });
  });

  describe('recordUsage', () => {
    it('should record usage correctly', () => {
      manager.recordUsage({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });

      const stats = manager.getStats();
      expect(stats.used).toBe(150);
      expect(stats.callCount).toBe(1);
    });

    it('should emit warning event at 80%', (done) => {
      manager.on('budget:warning', (event) => {
        expect(event.percentage).toBeGreaterThanOrEqual(80);
        expect(event.percentage).toBeLessThan(90);
        done();
      });

      manager.recordUsage({
        promptTokens: 4000,
        completionTokens: 4000,
        totalTokens: 8000,
      });
    });

    it('should emit critical event at 90%', (done) => {
      manager.on('budget:critical', (event) => {
        expect(event.percentage).toBeGreaterThanOrEqual(90);
        done();
      });

      manager.recordUsage({
        promptTokens: 4500,
        completionTokens: 4500,
        totalTokens: 9000,
      });
    });
  });

  describe('getRemainingBudget', () => {
    it('should return correct remaining budget', () => {
      manager.recordUsage({
        promptTokens: 1500,
        completionTokens: 500,
        totalTokens: 2000,
      });

      expect(manager.getRemainingBudget()).toBe(8000);
    });

    it('should return 0 when budget exceeded', () => {
      manager.recordUsage({
        promptTokens: 6000,
        completionTokens: 6000,
        totalTokens: 12000,
      });

      expect(manager.getRemainingBudget()).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset usage to 0', () => {
      manager.recordUsage({
        promptTokens: 1000,
        completionTokens: 1000,
        totalTokens: 2000,
      });

      manager.reset();

      const stats = manager.getStats();
      expect(stats.used).toBe(0);
      expect(stats.callCount).toBe(0);
    });

    it('should update budget when provided', () => {
      manager.reset(20000);

      const stats = manager.getStats();
      expect(stats.budget).toBe(20000);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate English text correctly', () => {
      const text = 'Hello world';
      const tokens = TokenManager.estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(text.length);
    });

    it('should estimate Chinese text correctly', () => {
      const text = '你好世界';
      const tokens = TokenManager.estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate mixed text correctly', () => {
      const text = 'Hello 你好 World 世界';
      const tokens = TokenManager.estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('estimateMessagesTokens', () => {
    it('should estimate messages correctly', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
        { role: 'assistant', content: 'Hi! How can I help you?' },
      ];

      const tokens = TokenManager.estimateMessagesTokens(messages);

      expect(tokens).toBeGreaterThan(0);
      // 应该包含消息内容 + 消息格式开销
      expect(tokens).toBeGreaterThan(messages.length * 4);
    });
  });
});
```

---

## 验收标准

- ✅ 预算检查正确
- ✅ 使用记录准确
- ✅ 80% 和 90% 告警正常触发
- ✅ 可以重置预算
- ✅ 单元测试覆盖率 > 80%

---

## 测试命令

```bash
# 运行测试
npm test -- token-manager.test.ts

# 查看覆盖率
npm test -- --coverage token-manager.test.ts
```

---

## 使用示例

```typescript
import { TokenManager } from './ai/token-manager.js';

// 创建 TokenManager，预算 50,000 tokens
const manager = new TokenManager(50000);

// 监听预算告警
manager.on('budget:warning', (event) => {
  console.warn(`⚠️  Token usage at ${event.percentage.toFixed(1)}%`);
  console.warn(`   Used: ${event.used} / ${event.budget}`);
});

manager.on('budget:critical', (event) => {
  console.error(`❌ Token usage critical at ${event.percentage.toFixed(1)}%`);
  console.error(`   Used: ${event.used} / ${event.budget}`);
});

// 记录使用
manager.recordUsage({
  promptTokens: 5000,
  completionTokens: 3000,
  totalTokens: 8000,
});

// 检查预算
if (!manager.checkBudget(10000)) {
  console.log('Insufficient budget, compressing context...');
}

// 获取统计
const stats = manager.getStats();
console.log(`Budget usage: ${stats.percentage.toFixed(1)}%`);
console.log(`Average tokens per call: ${stats.averageTokensPerCall.toFixed(0)}`);
```

---

## 相关文档

- 架构设计：`docs/v5/02-architecture.md`
- 任务拆分：`docs/v5/04-task-breakdown.md`

---

**任务完成标志**：

- [ ] TokenManager 类实现完成
- [ ] 单元测试通过
- [ ] 测试覆盖率 > 80%
- [ ] TypeScript 编译无错误
