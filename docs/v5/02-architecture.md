# Agent Team v5.0 - 架构设计文档

**版本**: 5.0.0
**日期**: 2025-02-07
**状态**: 设计中

---

## 一、整体架构

### 1.1 系统架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                        Agent Team v5.0                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────┐                                             │
│  │   Web UI        │  ← 用户界面                                 │
│  │  (React + API)  │                                             │
│  └────────┬────────┘                                             │
│           │                                                       │
│           ▼                                                       │
│  ┌─────────────────┐                                             │
│  │  Task Manager   │  ← 任务管理                                 │
│  └────────┬────────┘                                             │
│           │                                                       │
│           ▼                                                       │
│  ┌─────────────────────────────────────────────────────┐         │
│  │            Agent 执行层                              │         │
│  │  ┌──────────────┐         ┌──────────────┐          │         │
│  │  │ Master Agent │────────▶│  Sub Agent   │          │         │
│  │  │  (协调者)    │         │  (执行者)    │          │         │
│  │  └──────┬───────┘         └──────┬───────┘          │         │
│  │         │                        │                  │         │
│  │         └────────┬───────────────┘                  │         │
│  │                  │                                   │         │
│  └──────────────────┼───────────────────────────────────┘         │
│                     │                                             │
│         ┌───────────┼───────────┐                                │
│         │           │           │                                │
│         ▼           ▼           ▼                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                         │
│  │LLM Loop  │ │Tool Chain│ │Event Bus │  ← 核心组件             │
│  └──────────┘ └──────────┘ └──────────┘                         │
│         │           │           │                                │
│         └───────────┼───────────┘                                │
│                     │                                             │
│                     ▼                                             │
│         ┌─────────────────────────┐                              │
│         │     LLM Services        │  ← LLM 服务层                │
│         │  (多服务商支持)         │                              │
│         └─────────────────────────┘                              │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 分层架构

| 层级 | 组件 | 职责 |
|------|------|------|
| **用户接口层** | Web UI, API Server | 用户交互、任务创建 |
| **应用层** | Task Manager, Workspace Manager | 任务管理、工作空间管理 |
| **领域层** | Master Agent, Sub Agent | Agent 协作、任务执行 |
| **核心组件层** | LLM Loop, Tool Chain, Event Bus | LLM 循环、工具调用、事件通信 |
| **基础设施层** | LLM Services, Storage, File System | LLM 调用、数据存储、文件操作 |

---

## 二、核心模块设计

### 2.1 LLM 循环（AgentLoop）

**职责**：管理 Agent 与 LLM 的迭代对话循环

**核心流程**：

```typescript
class AgentLoop {
  async execute(task: Task, context: ExecutionContext): Promise<ToolResult> {
    let iteration = 0;
    const maxIterations = 10;
    const messages: Message[] = this.buildInitialMessages(task, context);

    while (iteration < maxIterations) {
      // 1. 调用 LLM
      const response = await this.llmService.chat({
        model: context.model,
        messages,
        tools: context.tools,
        temperature: 0.7,
      });

      // 2. 检查是否完成
      if (response.stopReason === 'end_turn' || !response.toolCalls) {
        return { success: true, data: response.content };
      }

      // 3. 执行工具调用
      const toolResults = await this.executeTools(response.toolCalls);
      messages.push(...toolResults);

      // 4. Token 检查
      if (this.tokenManager.exceedsBudget()) {
        await this.compressContext(messages);
      }

      iteration++;
    }

    throw new Error('Max iterations reached');
  }
}
```

**关键特性**：
- ✅ 最大迭代次数限制（防无限循环）
- ✅ Token 预算检查
- ✅ 自动上下文压缩
- ✅ 工具调用循环检测

### 2.2 Token 管理器（TokenManager）

**职责**：管理 Token 使用和预算

```typescript
class TokenManager {
  private budget: number;
  private used: number = 0;
  private history: TokenUsageRecord[] = [];

  // 检查预算
  checkBudget(estimatedTokens: number): boolean {
    return this.used + estimatedTokens <= this.budget;
  }

  // 记录使用
  recordUsage(usage: TokenUsage): void {
    this.used += usage.totalTokens;
    this.history.push({
      timestamp: new Date(),
      usage,
      remaining: this.budget - this.used,
    });

    // 预算告警
    const percentage = (this.used / this.budget) * 100;
    if (percentage >= 90) {
      this.emit('budget:critical', { percentage, remaining: this.budget - this.used });
    } else if (percentage >= 80) {
      this.emit('budget:warning', { percentage, remaining: this.budget - this.used });
    }
  }

  // 获取剩余预算
  getRemaining(): number {
    return this.budget - this.used;
  }

  // 重置预算
  reset(newBudget?: number): void {
    if (newBudget) this.budget = newBudget;
    this.used = 0;
    this.history = [];
  }
}
```

### 2.3 上下文压缩器（ContextCompressor）

**职责**：自动压缩对话历史

```typescript
class ContextCompressor {
  private maxTokens: number;

  async compress(messages: Message[]): Promise<Message[]> {
    const currentTokens = this.estimateTokens(messages);

    if (currentTokens <= this.maxTokens) {
      return messages;
    }

    // 策略 1: 滑动窗口（保留系统提示词 + 最近 N 条）
    const systemMessages = messages.filter(m => m.role === 'system');
    const recentMessages = messages.slice(-10);

    let compressed = [...systemMessages, ...recentMessages];

    // 策略 2: 如果还是太长，总结早期对话
    if (this.estimateTokens(compressed) > this.maxTokens) {
      const earlyMessages = messages.slice(
        systemMessages.length,
        -10
      );
      const summary = await this.summarize(earlyMessages);

      compressed = [
        ...systemMessages,
        { role: 'system', content: `历史对话总结:\n${summary}` },
        ...recentMessages
      ];
    }

    return compressed;
  }

  private async summarize(messages: Message[]): Promise<string> {
    // 调用 LLM 总结
    const response = await this.llmService.chat({
      model: 'gpt-4o-mini', // 使用小模型总结
      messages: [
        { role: 'system', content: '请总结以下对话的关键信息。' },
        { role: 'user', content: JSON.stringify(messages) }
      ],
      temperature: 0.3,
    });

    return response.content;
  }
}
```

### 2.4 工具执行器（ToolExecutor）

**职责**：执行工具调用并处理错误

```typescript
class ToolExecutor {
  private registry: ToolRegistry;
  private maxRetries: number = 3;

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    // 1. 验证工具存在
    if (!this.registry.has(toolCall.name)) {
      return { success: false, error: `Tool not found: ${toolCall.name}` };
    }

    // 2. 验证参数
    const validation = this.validateParams(toolCall);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }

    // 3. 权限检查
    const toolDef = this.registry.get(toolCall.name);
    if (toolDef.dangerous && !await this.confirmDangerous(toolCall)) {
      return { success: false, error: 'User denied dangerous operation' };
    }

    // 4. 执行（带重试）
    return await this.executeWithRetry(toolCall);
  }

  private async executeWithRetry(toolCall: ToolCall): Promise<ToolResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const result = await this.registry.execute(toolCall.name, toolCall.parameters);

        // 后处理：脱敏、截断
        return this.postProcess(result);
      } catch (error) {
        lastError = error as Error;

        // 判断是否可重试
        if (!this.isRetryable(error)) {
          break;
        }

        // 指数退避
        const delay = Math.pow(2, attempt) * 1000;
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: `Tool execution failed after ${this.maxRetries} attempts: ${lastError?.message}`,
    };
  }

  private isRetryable(error: any): boolean {
    // 网络错误、超时等可重试
    return error.code === 'ETIMEDOUT' ||
           error.code === 'ECONNRESET' ||
           error.statusCode === 429 ||
           error.statusCode === 503;
  }
}
```

### 2.5 并发控制器（ConcurrencyController）

**职责**：控制并发执行数量

```typescript
class ConcurrencyController {
  private running: number = 0;
  private maxConcurrent: number;
  private queue: Array<{
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];

  async run<T>(fn: () => Promise<T>): Promise<T> {
    // 如果未达到并发限制，直接执行
    if (this.running < this.maxConcurrent) {
      return this.execute(fn);
    }

    // 否则加入队列
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
    });
  }

  private async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.running++;

    try {
      const result = await fn();
      return result;
    } finally {
      this.running--;

      // 处理队列中的下一个
      const next = this.queue.shift();
      if (next) {
        this.execute(next.fn)
          .then(next.resolve)
          .catch(next.reject);
      }
    }
  }

  // 获取当前状态
  getStatus(): { running: number; queued: number } {
    return {
      running: this.running,
      queued: this.queue.length,
    };
  }
}
```

### 2.6 Agent 通信器（AgentCommunicator）

**职责**：Agent 间通信

```typescript
class AgentCommunicator {
  private eventBus: EventEmitter;
  private agentId: string;

  // 广播消息
  broadcast(type: AgentEventType, data: any): void {
    this.eventBus.emit(type, {
      from: this.agentId,
      type,
      data,
      timestamp: new Date(),
    });
  }

  // 点对点发送
  sendTo(targetAgentId: string, type: AgentEventType, data: any): void {
    this.eventBus.emit(`${type}:${targetAgentId}`, {
      from: this.agentId,
      to: targetAgentId,
      type,
      data,
      timestamp: new Date(),
    });
  }

  // 监听消息
  on(type: AgentEventType, handler: (message: AgentMessage) => void): void {
    // 监听广播
    this.eventBus.on(type, handler);

    // 监听发给自己的消息
    this.eventBus.on(`${type}:${this.agentId}`, handler);
  }

  // 请求-响应模式
  async request(
    targetAgentId: string,
    type: AgentEventType,
    data: any,
    timeout: number = 30000
  ): Promise<any> {
    const correlationId = uuidv4();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, timeout);

      const responseHandler = (message: AgentMessage) => {
        if (message.correlationId === correlationId) {
          clearTimeout(timer);
          this.eventBus.off(`response:${this.agentId}`, responseHandler);
          resolve(message.data);
        }
      };

      this.eventBus.on(`response:${this.agentId}`, responseHandler);

      this.sendTo(targetAgentId, type, { ...data, correlationId });
    });
  }
}
```

---

## 三、LLM 服务层设计

### 3.1 LLM 服务工厂（LLMServiceFactory）

```typescript
class LLMServiceFactory {
  private static configs: Map<string, LLMProviderConfig> = new Map();

  // 加载配置
  static loadConfig(config: LLMConfig): void {
    for (const [name, providerConfig] of Object.entries(config.providers)) {
      this.configs.set(name, providerConfig);
    }
  }

  // 创建服务
  static create(providerName?: string): LLMService {
    // 如果指定了服务商，直接创建
    if (providerName) {
      const config = this.configs.get(providerName);
      if (!config) {
        throw new Error(`Provider not found: ${providerName}`);
      }
      return this.createService(providerName, config);
    }

    // 否则按权重选择
    return this.createByWeight();
  }

  // 按权重选择服务商
  private static createByWeight(): LLMService {
    // 过滤可用的服务商
    const available = Array.from(this.configs.entries())
      .filter(([_, config]) =>
        config.enabled &&
        config.weight > 0 &&
        config.apiKey
      );

    if (available.length === 0) {
      throw new Error('No available LLM providers');
    }

    // 计算总权重
    const totalWeight = available.reduce((sum, [_, config]) => sum + config.weight, 0);

    // 随机选择
    let random = Math.random() * totalWeight;
    for (const [name, config] of available) {
      random -= config.weight;
      if (random <= 0) {
        return this.createService(name, config);
      }
    }

    // 默认返回第一个
    return this.createService(available[0][0], available[0][1]);
  }

  // 创建具体服务
  private static createService(name: string, config: LLMProviderConfig): LLMService {
    switch (name) {
      case 'openai':
      case 'deepseek':
      case 'qwen':
      case 'minimax':
        return new OpenAISDKAdapter(config);

      case 'claude':
      case 'anthropic':
        return new AnthropicSDKAdapter(config);

      case 'bigmodel':
      case 'glm':
        return new BigModelAdapter(config);

      default:
        throw new Error(`Unknown provider: ${name}`);
    }
  }
}
```

### 3.2 服务商适配器

#### 3.2.1 OpenAI SDK 适配器

```typescript
import OpenAI from 'openai';

class OpenAISDKAdapter implements LLMService {
  private client: OpenAI;

  constructor(config: LLMProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeout || 60000,
      maxRetries: config.maxRetries || 3,
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      tools: request.tools,
    });

    return this.convertResponse(response);
  }

  async chatStream(request: ChatRequest): AsyncIterator<ChatResponse> {
    const stream = await this.client.chat.completions.create({
      ...request,
      stream: true,
    });

    for await (const chunk of stream) {
      yield this.convertChunk(chunk);
    }
  }
}
```

#### 3.2.2 Anthropic SDK 适配器

```typescript
import Anthropic from '@anthropic-ai/sdk';

class AnthropicSDKAdapter implements LLMService {
  private client: Anthropic;

  constructor(config: LLMProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens || 4096,
      messages: request.messages,
      temperature: request.temperature,
      tools: request.tools,
    });

    return this.convertResponse(response);
  }
}
```

#### 3.2.3 BigModel 适配器（自行实现）

```typescript
class BigModelAdapter implements LLMService {
  private apiKey: string;
  private baseURL: string = 'https://open.bigmodel.cn/api/paas/v4';

  constructor(config: LLMProviderConfig) {
    this.apiKey = config.apiKey;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model || 'glm-4',
        messages: request.messages,
        temperature: request.temperature,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`BigModel API error: ${response.statusText}`);
    }

    const data = await response.json();
    return this.convertResponse(data);
  }
}
```

---

## 四、提示词系统设计

### 4.1 提示词加载器

```typescript
import matter from 'gray-matter';
import Handlebars from 'handlebars';

class PromptLoader {
  private cache: Map<string, CompiledPrompt> = new Map();
  private promptsDir: string;

  async load(category: string, name: string): Promise<CompiledPrompt> {
    const cacheKey = `${category}/${name}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const filePath = path.join(this.promptsDir, category, `${name}.md`);
    const content = await fs.readFile(filePath, 'utf-8');

    const { data: metadata, content: template } = matter(content);
    const compiled = Handlebars.compile(template);

    const result = {
      metadata,
      template,
      compiled,
      render: (vars) => compiled(vars),
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  async render(category: string, name: string, variables: Record<string, any>): Promise<string> {
    const prompt = await this.load(category, name);
    return prompt.render(variables);
  }
}
```

---

## 五、数据流设计

### 5.1 任务执行流程

```
用户创建任务
    │
    ▼
TaskManager.createTask()
    │
    ├─ 创建工作空间
    ├─ 初始化 Token 预算
    └─ 创建主 Agent
    │
    ▼
MasterAgent.execute()
    │
    ├─ 分析任务
    ├─ 判断是否需要拆分
    │
    ├─ 需要拆分 ────────────┐
    │                      │
    │                      ▼
    │              创建子 Agent
    │                      │
    │                      ▼
    │              并发执行子任务
    │                      │
    │                      ▼
    │              汇总结果
    │                      │
    └──────────────────────┘
    │
    ▼
返回结果
```

### 5.2 LLM 循环流程

```
AgentLoop.execute()
    │
    ▼
构建初始消息
    │
    ▼
┌───────────────────────┐
│  循环 (max 10 次)     │
│                       │
│  调用 LLM             │
│    │                  │
│    ▼                  │
│  检查停止原因         │
│    │                  │
│    ├─ end_turn ──────────► 返回结果
│    │                  │
│    ▼                  │
│  执行工具调用         │
│    │                  │
│    ▼                  │
│  检查 Token 预算      │
│    │                  │
│    ├─ 超出 ──────────────► 压缩上下文
│    │                  │
│    ▼                  │
│  添加结果到消息       │
│    │                  │
│    └──────────────────┘
```

---

## 六、文件结构

```
src/
├── ai/                         # AI 核心
│   ├── agent-loop.ts          # LLM 循环
│   ├── token-manager.ts       # Token 管理
│   ├── context-compressor.ts  # 上下文压缩
│   ├── master-agent.ts        # 主 Agent
│   ├── sub-agent.ts           # 子 Agent
│   └── agent-communicator.ts  # Agent 通信
│
├── services/                   # 服务层
│   └── llm/                   # LLM 服务
│       ├── factory.ts         # 服务工厂
│       ├── adapter.ts         # 适配器基类
│       └── adapters/          # 各服务商适配器
│           ├── openai.ts
│           ├── anthropic.ts
│           └── bigmodel.ts
│
├── tools/                      # 工具系统
│   ├── tool-executor.ts       # 工具执行器
│   ├── tool-registry.ts       # 工具注册表
│   └── builtin/               # 内置工具
│
├── prompts/                    # 提示词系统
│   ├── loader.ts              # 提示词加载器
│   └── templates/             # 提示词模板
│       ├── system/
│       ├── roles/
│       └── tasks/
│
├── core/                       # 核心模块
│   ├── task-manager.ts        # 任务管理
│   ├── workspace-manager.ts   # 工作空间管理
│   ├── concurrency.ts         # 并发控制
│   └── events.ts              # 事件系统
│
├── server/                     # Web 服务器
│   └── routes/
│       ├── tasks.ts           # 任务 API
│       ├── agents.ts          # Agent API
│       └── prompts.ts         # 提示词 API
│
└── ui/                         # 前端 UI
    ├── pages/
    └── components/
```

---

**文档结束**
