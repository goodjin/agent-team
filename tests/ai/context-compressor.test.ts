import { describe, it, expect, beforeEach } from 'vitest';
import { ContextCompressor } from '../../src/ai/context-compressor.js';
import { TokenManager } from '../../src/ai/token-manager.js';
import type { Message } from '../../src/ai/context-compressor.js';

describe('ContextCompressor', () => {
  let tokenManager: TokenManager;
  let compressor: ContextCompressor;

  beforeEach(() => {
    tokenManager = new TokenManager(50000);
    compressor = new ContextCompressor(tokenManager, {
      threshold: 100, // 降低阈值，使测试更容易触发压缩
      keepRecent: 10,
      strategy: 'sliding-window',
    });
  });

  const createMessages = (count: number): Message[] => {
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
    ];

    for (let i = 0; i < count; i++) {
      messages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i + 1}`,
      });
    }

    return messages;
  };

  describe('needsCompression', () => {
    it('should return false when below threshold', () => {
      const messages = createMessages(5);
      expect(compressor.needsCompression(messages)).toBe(false);
    });

    it('should return true when above threshold', () => {
      const messages = createMessages(200);
      expect(compressor.needsCompression(messages)).toBe(true);
    });
  });

  describe('compress - sliding window', () => {
    it('should preserve system messages', async () => {
      const messages = createMessages(50);
      const compressed = await compressor.compress(messages);

      const systemMessages = compressed.filter((m) => m.role === 'system');
      expect(systemMessages.length).toBe(1);
    });

    it('should keep recent N messages', async () => {
      const messages = createMessages(50);
      const compressed = await compressor.compress(messages);

      // 系统消息 + 最近 10 条
      expect(compressed.length).toBeLessThanOrEqual(11);

      // 验证最后一条消息被保留
      expect(compressed[compressed.length - 1].content).toContain('Message 50');
    });

    it('should not compress when below threshold', async () => {
      const messages = createMessages(5);
      const compressed = await compressor.compress(messages);

      expect(compressed.length).toBe(messages.length);
    });
  });

  describe('compress - summarization', () => {
    it('should create summary when LLM service provided', async () => {
      // Mock LLM service
      const mockLLM = {
        provider: 'test',
        modelName: 'test-model',
        chat: async () => ({
          id: '1',
          model: 'test',
          content: 'Summary of previous messages',
          stopReason: 'stop' as const,
          usage: {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
          },
        }),
      };

      const summarizer = new ContextCompressor(tokenManager, {
        threshold: 100, // 降低阈值
        keepRecent: 5,
        strategy: 'summarization',
        llmService: mockLLM,
      });

      const messages = createMessages(30);
      const compressed = await summarizer.compress(messages);

      // 应该包含：系统消息 + 总结 + 最近 5 条
      expect(compressed.length).toBeLessThanOrEqual(7);

      // 验证总结存在
      const hasSummary = compressed.some((m) =>
        m.content.includes('[Previous conversation summary]')
      );
      expect(hasSummary).toBe(true);
    });

    it('should fallback to sliding window when no LLM service', async () => {
      const summarizer = new ContextCompressor(tokenManager, {
        threshold: 100, // 降低阈值
        keepRecent: 10,
        strategy: 'summarization',
        // 没有提供 llmService
      });

      const messages = createMessages(50);
      const compressed = await summarizer.compress(messages);

      // 应该回退到滑动窗口策略
      expect(compressed.length).toBeLessThanOrEqual(11);
    });
  });

  describe('estimateCompressedTokens', () => {
    it('should estimate tokens correctly', () => {
      const messages = createMessages(50);
      const estimated = compressor.estimateCompressedTokens(messages);

      expect(estimated).toBeGreaterThan(0);
      expect(estimated).toBeLessThan(
        TokenManager.estimateMessagesTokens(messages)
      );
    });

    it('should add summary overhead for summarization strategy', () => {
      const summarizer = new ContextCompressor(tokenManager, {
        threshold: 100, // 降低阈值
        keepRecent: 10,
        strategy: 'summarization',
      });

      const messages = createMessages(50);
      const estimated = summarizer.estimateCompressedTokens(messages);

      // 应该包含总结的 token 数
      expect(estimated).toBeGreaterThan(750);
    });
  });
});
