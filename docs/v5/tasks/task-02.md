# Task 2: 实现 LLM 服务商适配器

**优先级**: P0
**预计工时**: 8 小时
**依赖**: 任务 1
**状态**: 待执行

---

## 目标

1. 实现 OpenAI SDK 适配器（支持 OpenAI、DeepSeek、Qwen、MiniMax）
2. 实现 Anthropic SDK 适配器
3. 实现 BigModel HTTP 适配器
4. 实现 LLMServiceFactory

---

## 输入

- 配置文件：`config/llm.yaml`
- 配置管理器：`src/services/llm-config.ts`
- 架构设计：`docs/v5/02-architecture.md`

---

## 输出

- `src/services/llm/adapters/openai.ts`
- `src/services/llm/adapters/anthropic.ts`
- `src/services/llm/adapters/bigmodel.ts`
- `src/services/llm/factory.ts`
- `src/services/llm/types.ts`

---

## 实现步骤

### 步骤 1: 定义接口

创建 `src/services/llm/types.ts`：

```typescript
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  tools?: any[];
  toolChoice?: 'auto' | 'required' | 'none';
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResponse {
  id: string;
  model: string;
  content: string;
  toolCalls?: ToolCall[];
  stopReason: 'stop' | 'length' | 'tool_calls' | 'end_turn';
  usage: TokenUsage;
}

export interface LLMService {
  chat(request: ChatRequest): Promise<ChatResponse>;
  readonly provider: string;
  readonly modelName: string;
}
```

### 步骤 2: 实现 OpenAI 适配器

创建 `src/services/llm/adapters/openai.ts`：

```typescript
import OpenAI from 'openai';
import type { ProviderConfig } from '../../llm-config.js';
import type { ChatRequest, ChatResponse, LLMService } from '../types.js';

export class OpenAIAdapter implements LLMService {
  private client: OpenAI;
  public readonly provider: string;
  public readonly modelName: string;

  constructor(private config: ProviderConfig, model?: string) {
    this.provider = config.name;
    this.modelName = model || Object.keys(config.models)[0];

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || undefined,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model || this.modelName,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      tools: request.tools,
      tool_choice: request.toolChoice,
    });

    const choice = response.choices[0];

    return {
      id: response.id,
      model: response.model,
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
      stopReason: this.mapStopReason(choice.finish_reason),
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  }

  private mapStopReason(reason: string): ChatResponse['stopReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }
}
```

### 步骤 3: 实现 Anthropic 适配器

创建 `src/services/llm/adapters/anthropic.ts`：

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { ProviderConfig } from '../../llm-config.js';
import type { ChatRequest, ChatResponse, LLMService, Message } from '../types.js';

export class AnthropicAdapter implements LLMService {
  private client: Anthropic;
  public readonly provider: string;
  public readonly modelName: string;

  constructor(private config: ProviderConfig, model?: string) {
    this.provider = config.name;
    this.modelName = model || Object.keys(config.models)[0];

    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // 分离系统消息
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const messages = request.messages.filter((m) => m.role !== 'system');

    const response = await this.client.messages.create({
      model: request.model || this.modelName,
      max_tokens: request.maxTokens || 4096,
      system: systemMessage?.content,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      temperature: request.temperature ?? 0.7,
      tools: request.tools,
      tool_choice: request.toolChoice ? { type: request.toolChoice } : undefined,
    });

    // 提取文本内容
    const textContent = response.content
      .filter((c) => c.type === 'text')
      .map((c: any) => c.text)
      .join('');

    // 提取工具调用
    const toolCalls = response.content
      .filter((c) => c.type === 'tool_use')
      .map((c: any) => ({
        id: c.id,
        type: 'function' as const,
        function: {
          name: c.name,
          arguments: JSON.stringify(c.input),
        },
      }));

    return {
      id: response.id,
      model: response.model,
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: this.mapStopReason(response.stop_reason),
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  private mapStopReason(reason: string | null): ChatResponse['stopReason'] {
    switch (reason) {
      case 'end_turn':
        return 'end_turn';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'stop';
    }
  }
}
```

### 步骤 4: 实现 BigModel 适配器

创建 `src/services/llm/adapters/bigmodel.ts`：

```typescript
import fetch from 'node-fetch';
import type { ProviderConfig } from '../../llm-config.js';
import type { ChatRequest, ChatResponse, LLMService } from '../types.js';

export class BigModelAdapter implements LLMService {
  public readonly provider: string;
  public readonly modelName: string;
  private baseURL: string;
  private apiKey: string;
  private timeout: number;

  constructor(private config: ProviderConfig, model?: string) {
    this.provider = config.name;
    this.modelName = model || Object.keys(config.models)[0];
    this.baseURL = config.baseURL || 'https://open.bigmodel.cn/api/paas/v4';
    this.apiKey = config.apiKey;
    this.timeout = config.timeout;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model || this.modelName,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens,
          tools: request.tools,
          tool_choice: request.toolChoice,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`BigModel API error: ${response.status} ${error}`);
      }

      const data: any = await response.json();
      const choice = data.choices[0];

      return {
        id: data.id,
        model: data.model,
        content: choice.message.content || '',
        toolCalls: choice.message.tool_calls?.map((tc: any) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
        stopReason: this.mapStopReason(choice.finish_reason),
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private mapStopReason(reason: string): ChatResponse['stopReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }
}
```

### 步骤 5: 实现 LLMServiceFactory

创建 `src/services/llm/factory.ts`：

```typescript
import { LLMConfigManager, ProviderConfig } from '../llm-config.js';
import { OpenAIAdapter } from './adapters/openai.js';
import { AnthropicAdapter } from './adapters/anthropic.js';
import { BigModelAdapter } from './adapters/bigmodel.js';
import type { LLMService } from './types.js';

export class LLMServiceFactory {
  constructor(private configManager: LLMConfigManager) {}

  /**
   * 创建 LLM 服务实例
   */
  create(providerName?: string, model?: string): LLMService {
    let providerConfig: ProviderConfig;

    if (providerName) {
      const config = this.configManager.getProvider(providerName);
      if (!config) {
        throw new Error(`Provider "${providerName}" not available`);
      }
      providerConfig = config;
    } else {
      // 按权重选择
      providerConfig = this.configManager.selectProvider();
    }

    return this.createAdapter(providerConfig, model);
  }

  /**
   * 为角色创建 LLM 服务
   */
  createForRole(role: string): LLMService {
    const providerConfig = this.configManager.getProviderForRole(role);

    if (!providerConfig) {
      throw new Error(`No provider configured for role "${role}"`);
    }

    return this.createAdapter(providerConfig);
  }

  /**
   * 创建适配器（带 Fallback）
   */
  createWithFallback(
    preferredProvider?: string,
    model?: string
  ): LLMService {
    // 尝试首选服务商
    if (preferredProvider) {
      try {
        return this.create(preferredProvider, model);
      } catch (error) {
        console.warn(`Failed to create ${preferredProvider}, trying fallback...`);
      }
    }

    // 按权重从高到低尝试
    const available = this.configManager.getAvailableProviders();
    available.sort((a, b) => b.weight - a.weight);

    for (const provider of available) {
      try {
        return this.createAdapter(provider, model);
      } catch (error) {
        console.warn(`Failed to create ${provider.name}, trying next...`);
      }
    }

    throw new Error('All providers failed');
  }

  /**
   * 根据配置创建适配器
   */
  private createAdapter(config: ProviderConfig, model?: string): LLMService {
    switch (config.provider) {
      case 'openai':
        return new OpenAIAdapter(config, model);
      case 'anthropic':
        return new AnthropicAdapter(config, model);
      case 'bigmodel':
        return new BigModelAdapter(config, model);
      default:
        throw new Error(`Unknown provider type: ${config.provider}`);
    }
  }
}
```

---

## 验收标准

- ✅ 所有适配器实现 `LLMService` 接口
- ✅ OpenAI 适配器支持自定义 baseURL
- ✅ Anthropic 适配器正常工作
- ✅ BigModel 适配器通过 HTTP 调用
- ✅ LLMServiceFactory 按权重选择服务商
- ✅ Fallback 机制正常工作

---

## 测试用例

### 测试 1: OpenAI 适配器

```typescript
import { LLMConfigManager } from '../llm-config.js';
import { OpenAIAdapter } from './adapters/openai.js';

const manager = new LLMConfigManager();
await manager.loadFromFile('config/llm.yaml');

const config = manager.getProvider('openai');
const adapter = new OpenAIAdapter(config!);

const response = await adapter.chat({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'user', content: 'Say hello!' },
  ],
});

console.log(response.content); // 预期: "Hello! How can I assist you today?"
console.assert(response.usage.totalTokens > 0);
```

### 测试 2: Anthropic 适配器

```typescript
const config = manager.getProvider('claude');
const adapter = new AnthropicAdapter(config!);

const response = await adapter.chat({
  model: 'claude-3-5-haiku-20241022',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is 2+2?' },
  ],
});

console.log(response.content); // 预期: "2+2 equals 4."
```

### 测试 3: BigModel 适配器

```typescript
const config = manager.getProvider('bigmodel');
const adapter = new BigModelAdapter(config!);

const response = await adapter.chat({
  model: 'glm-4-flash',
  messages: [
    { role: 'user', content: '你好' },
  ],
});

console.log(response.content); // 预期: 中文回复
```

### 测试 4: LLMServiceFactory

```typescript
import { LLMServiceFactory } from './factory.js';

const factory = new LLMServiceFactory(manager);

// 测试按权重选择
const service1 = factory.create();
console.log(service1.provider); // 可能是 OpenAI, Claude, DeepSeek 之一

// 测试指定服务商
const service2 = factory.create('claude');
console.log(service2.provider); // 必定是 Claude

// 测试 Fallback
const service3 = factory.createWithFallback('invalid-provider');
console.log(service3.provider); // 应该回退到可用服务商
```

### 测试 5: 角色专属服务商

```typescript
const masterAgent = factory.createForRole('master-agent');
console.log(masterAgent.provider); // 预期: "Anthropic Claude"
console.log(masterAgent.modelName); // 预期: "claude-3-5-sonnet-20241022"

const tester = factory.createForRole('tester');
console.log(tester.provider); // 预期: "DeepSeek"
```

---

## 依赖安装

```bash
# OpenAI SDK
npm install openai

# Anthropic SDK
npm install @anthropic-ai/sdk

# HTTP 请求
npm install node-fetch
```

---

## 相关文档

- 任务 1: `docs/v5/tasks/task-01.md`
- LLM 配置说明：`docs/v5/03-llm-providers.md`
- 架构设计：`docs/v5/02-architecture.md`

---

## 注意事项

1. **兼容性**：OpenAI 适配器通过 `baseURL` 参数支持 DeepSeek、Qwen、MiniMax
2. **错误处理**：所有适配器都应该正确处理网络错误、超时、API 限流等情况
3. **Token 统计**：确保所有适配器都正确返回 Token 使用量
4. **工具调用**：确保工具调用格式统一，方便后续处理

---

**任务完成标志**：

- [ ] 所有适配器实现完成
- [ ] LLMServiceFactory 实现完成
- [ ] 所有测试用例通过
- [ ] TypeScript 编译无错误
