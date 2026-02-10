# Task 4: 实现上下文压缩器

**优先级**: P0
**预计工时**: 6 小时
**依赖**: 任务 2, 任务 3
**状态**: 待执行

---

## 目标

1. 实现 ContextCompressor 类
2. 实现滑动窗口策略
3. 实现智能总结策略
4. 实现 Token 估算

---

## 输入

- TokenManager: `src/ai/token-manager.ts`
- LLMService: `src/services/llm/types.ts`
- 架构设计：`docs/v5/02-architecture.md`

---

## 输出

- `src/ai/context-compressor.ts`
- 单元测试：`tests/ai/context-compressor.test.ts`

---

## 实现步骤

### 步骤 1: 实现 ContextCompressor 类

创建 `src/ai/context-compressor.ts`：

```typescript
import { TokenManager } from './token-manager.js';
import type { LLMService } from '../services/llm/types.js';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompressionOptions {
  /**
   * Token 阈值，超过此值触发压缩
   */
  threshold: number;

  /**
   * 保留最近 N 条消息
   */
  keepRecent: number;

  /**
   * 压缩策略
   */
  strategy: 'sliding-window' | 'summarization';

  /**
   * 总结用的 LLM 服务（仅在 summarization 策略下使用）
   */
  llmService?: LLMService;
}

export class ContextCompressor {
  constructor(
    private tokenManager: TokenManager,
    private options: CompressionOptions
  ) {}

  /**
   * 检查是否需要压缩
   */
  needsCompression(messages: Message[]): boolean {
    const estimatedTokens = TokenManager.estimateMessagesTokens(messages);
    return estimatedTokens > this.options.threshold;
  }

  /**
   * 压缩上下文
   */
  async compress(messages: Message[]): Promise<Message[]> {
    if (!this.needsCompression(messages)) {
      return messages;
    }

    switch (this.options.strategy) {
      case 'sliding-window':
        return this.compressSlidingWindow(messages);
      case 'summarization':
        return await this.compressSummarization(messages);
      default:
        return messages;
    }
  }

  /**
   * 滑动窗口策略
   */
  private compressSlidingWindow(messages: Message[]): Message[] {
    // 分离系统消息和对话消息
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // 保留最近的 N 条消息
    const recentMessages = conversationMessages.slice(-this.options.keepRecent);

    // 组合：系统消息 + 最近消息
    return [...systemMessages, ...recentMessages];
  }

  /**
   * 智能总结策略
   */
  private async compressSummarization(messages: Message[]): Promise<Message[]> {
    if (!this.options.llmService) {
      // 如果没有 LLM 服务，回退到滑动窗口
      return this.compressSlidingWindow(messages);
    }

    // 分离系统消息和对话消息
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // 保留最近的消息
    const recentMessages = conversationMessages.slice(-this.options.keepRecent);

    // 需要总结的消息
    const toSummarize = conversationMessages.slice(
      0,
      -this.options.keepRecent
    );

    if (toSummarize.length === 0) {
      return messages;
    }

    // 生成总结
    const summary = await this.summarizeMessages(toSummarize);

    // 组合：系统消息 + 总结 + 最近消息
    return [
      ...systemMessages,
      {
        role: 'assistant' as const,
        content: `[Previous conversation summary]\n${summary}`,
      },
      ...recentMessages,
    ];
  }

  /**
   * 总结消息
   */
  private async summarizeMessages(messages: Message[]): Promise<string> {
    if (!this.options.llmService) {
      throw new Error('LLM service required for summarization');
    }

    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n\n');

    const response = await this.options.llmService.chat({
      model: this.options.llmService.modelName,
      messages: [
        {
          role: 'system',
          content:
            'Summarize the following conversation concisely, preserving key information and decisions. Focus on facts, not opinions.',
        },
        {
          role: 'user',
          content: conversationText,
        },
      ],
      temperature: 0.3,
      maxTokens: 1000,
    });

    return response.content;
  }

  /**
   * 估算压缩后的 Token 数量
   */
  estimateCompressedTokens(messages: Message[]): number {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    let estimated = 0;

    // 系统消息
    estimated += TokenManager.estimateMessagesTokens(systemMessages);

    // 最近消息
    const recentMessages = conversationMessages.slice(-this.options.keepRecent);
    estimated += TokenManager.estimateMessagesTokens(recentMessages);

    if (this.options.strategy === 'summarization') {
      // 总结大约 500-1000 tokens
      estimated += 750;
    }

    return estimated;
  }
}
```

### 步骤 2: 创建单元测试

创建 `tests/ai/context-compressor.test.ts`：

```typescript
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
      threshold: 2000,
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
        threshold: 2000,
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
        threshold: 2000,
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
        threshold: 2000,
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
```

---

## 验收标准

- ✅ 滑动窗口正确（保留系统提示词 + 最近 10 条）
- ✅ 超出阈值时自动压缩
- ✅ 智能总结功能正常
- ✅ Token 估算准确（误差 < 10%）
- ✅ 单元测试覆盖率 > 80%

---

## 使用示例

```typescript
import { ContextCompressor } from './ai/context-compressor.js';
import { TokenManager } from './ai/token-manager.js';

// 创建 TokenManager
const tokenManager = new TokenManager(50000);

// 创建 ContextCompressor (滑动窗口策略)
const compressor = new ContextCompressor(tokenManager, {
  threshold: 30000, // 超过 30,000 tokens 时压缩
  keepRecent: 10, // 保留最近 10 条消息
  strategy: 'sliding-window',
});

// 使用
let messages = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hello!' },
  { role: 'assistant', content: 'Hi! How can I help?' },
  // ... 更多消息
];

// 检查是否需要压缩
if (compressor.needsCompression(messages)) {
  console.log('Compressing context...');
  messages = await compressor.compress(messages);
  console.log(`Compressed to ${messages.length} messages`);
}
```

使用总结策略：

```typescript
import { LLMServiceFactory } from './services/llm/factory.js';

// 创建 LLM 服务
const llmService = factory.create('openai', 'gpt-4o-mini');

// 创建 ContextCompressor (智能总结策略)
const compressor = new ContextCompressor(tokenManager, {
  threshold: 30000,
  keepRecent: 10,
  strategy: 'summarization',
  llmService, // 提供 LLM 服务用于总结
});

// 压缩时会自动生成总结
const compressed = await compressor.compress(messages);
```

---

## 相关文档

- 任务 2: `docs/v5/tasks/task-02.md`
- 任务 3: `docs/v5/tasks/task-03.md`
- 架构设计：`docs/v5/02-architecture.md`

---

**任务完成标志**：

- [ ] ContextCompressor 类实现完成
- [ ] 滑动窗口策略实现完成
- [ ] 智能总结策略实现完成
- [ ] 单元测试通过
- [ ] 测试覆盖率 > 80%
