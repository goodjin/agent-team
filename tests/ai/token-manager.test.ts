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

    it('should emit warning event at 80%', () => {
      return new Promise<void>((resolve) => {
        manager.on('budget:warning', (event) => {
          expect(event.percentage).toBeGreaterThanOrEqual(80);
          expect(event.percentage).toBeLessThan(90);
          resolve();
        });

        manager.recordUsage({
          promptTokens: 4000,
          completionTokens: 4000,
          totalTokens: 8000,
        });
      });
    });

    it('should emit critical event at 90%', () => {
      return new Promise<void>((resolve) => {
        manager.on('budget:critical', (event) => {
          expect(event.percentage).toBeGreaterThanOrEqual(90);
          resolve();
        });

        manager.recordUsage({
          promptTokens: 4500,
          completionTokens: 4500,
          totalTokens: 9000,
        });
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
