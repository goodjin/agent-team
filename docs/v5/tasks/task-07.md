# Task 7: 实现 LLM 循环引擎

**优先级**: P0
**预计工时**: 10 小时
**依赖**: 任务 2, 任务 3, 任务 4, 任务 5
**状态**: 待执行

---

## 目标

1. 实现 AgentLoop 类
2. 实现 LLM 迭代循环
3. 集成 TokenManager
4. 集成 ContextCompressor
5. 集成 ToolExecutor
6. 实现循环检测

---

## 输入

- TokenManager: `src/ai/token-manager.ts`
- ContextCompressor: `src/ai/context-compressor.ts`
- ToolExecutor: `src/tools/tool-executor.ts`
- LLMService: `src/services/llm/types.ts`
- 架构设计：`docs/v5/02-architecture.md`

---

## 输出

- `src/ai/agent-loop.ts`
- 单元测试：`tests/ai/agent-loop.test.ts`
- 集成测试：`tests/integration/agent-loop.test.ts`

---

## 实现步骤

### 步骤 1: 实现 AgentLoop 类

创建 `src/ai/agent-loop.ts`：

```typescript
import { EventEmitter } from 'events';
import { TokenManager } from './token-manager.js';
import { ContextCompressor } from './context-compressor.js';
import { ToolExecutor } from '../tools/tool-executor.js';
import type { LLMService } from '../services/llm/types.js';
import type { Message } from './context-compressor.js';

export interface Task {
  id: string;
  title: string;
  description: string;
  context?: Record<string, any>;
}

export interface ExecutionContext {
  workspaceDir: string;
  taskId: string;
  [key: string]: any;
}

export interface LoopResult {
  success: boolean;
  result?: string;
  error?: string;
  iterations: number;
  tokensUsed: number;
  toolCalls: number;
}

export interface AgentLoopOptions {
  maxIterations?: number;
  tokenBudget?: number;
  compressionThreshold?: number;
  keepRecentMessages?: number;
  systemPrompt?: string;
}

export class AgentLoop extends EventEmitter {
  private tokenManager: TokenManager;
  private contextCompressor: ContextCompressor;
  private toolExecutor: ToolExecutor;
  private llmService: LLMService;
  private options: Required<AgentLoopOptions>;
  private loopDetector: Map<string, number> = new Map();

  constructor(
    llmService: LLMService,
    toolExecutor: ToolExecutor,
    options: AgentLoopOptions = {}
  ) {
    super();

    this.llmService = llmService;
    this.toolExecutor = toolExecutor;

    this.options = {
      maxIterations: options.maxIterations ?? 10,
      tokenBudget: options.tokenBudget ?? 50000,
      compressionThreshold: options.compressionThreshold ?? 30000,
      keepRecentMessages: options.keepRecentMessages ?? 10,
      systemPrompt: options.systemPrompt ?? 'You are a helpful AI assistant.',
    };

    // 初始化组件
    this.tokenManager = new TokenManager(this.options.tokenBudget);
    this.contextCompressor = new ContextCompressor(this.tokenManager, {
      threshold: this.options.compressionThreshold,
      keepRecent: this.options.keepRecentMessages,
      strategy: 'sliding-window',
      llmService: this.llmService,
    });

    // 监听预算告警
    this.tokenManager.on('budget:warning', (event) => {
      this.emit('budget:warning', event);
    });

    this.tokenManager.on('budget:critical', (event) => {
      this.emit('budget:critical', event);
    });
  }

  /**
   * 执行任务
   */
  async execute(task: Task, context: ExecutionContext): Promise<LoopResult> {
    let iteration = 0;
    let toolCallCount = 0;
    const messages: Message[] = this.buildInitialMessages(task, context);

    this.emit('loop:started', {
      taskId: task.id,
      maxIterations: this.options.maxIterations,
    });

    try {
      while (iteration < this.options.maxIterations) {
        iteration++;

        this.emit('loop:iteration', {
          iteration,
          maxIterations: this.options.maxIterations,
          tokensUsed: this.tokenManager.getStats().used,
        });

        // 检查是否需要压缩上下文
        if (this.contextCompressor.needsCompression(messages)) {
          this.emit('context:compressing', {
            messageCount: messages.length,
            estimatedTokens: TokenManager.estimateMessagesTokens(messages),
          });

          const compressed = await this.contextCompressor.compress(messages);
          messages.length = 0;
          messages.push(...compressed);

          this.emit('context:compressed', {
            messageCount: messages.length,
            estimatedTokens: TokenManager.estimateMessagesTokens(messages),
          });
        }

        // 估算 Token 使用
        const estimatedTokens = TokenManager.estimateMessagesTokens(messages);

        // 检查预算
        if (!this.tokenManager.checkBudget(estimatedTokens + 2000)) {
          throw new Error('Token budget exceeded');
        }

        // 调用 LLM
        this.emit('llm:calling', {
          iteration,
          estimatedTokens,
        });

        const response = await this.llmService.chat({
          model: this.llmService.modelName,
          messages,
          temperature: 0.7,
          maxTokens: 4096,
          tools: this.toolExecutor.getToolDefinitions(),
          toolChoice: 'auto',
        });

        // 记录 Token 使用
        this.tokenManager.recordUsage(response.usage);

        this.emit('llm:response', {
          iteration,
          stopReason: response.stopReason,
          contentLength: response.content.length,
          toolCalls: response.toolCalls?.length || 0,
          tokensUsed: response.usage.totalTokens,
        });

        // 添加 Assistant 响应到消息列表
        messages.push({
          role: 'assistant',
          content: response.content,
        });

        // 检查是否完成
        if (response.stopReason === 'end_turn' || response.stopReason === 'stop') {
          if (!response.toolCalls || response.toolCalls.length === 0) {
            this.emit('loop:completed', {
              iterations: iteration,
              tokensUsed: this.tokenManager.getStats().used,
              toolCalls: toolCallCount,
            });

            return {
              success: true,
              result: response.content,
              iterations: iteration,
              tokensUsed: this.tokenManager.getStats().used,
              toolCalls: toolCallCount,
            };
          }
        }

        // 执行工具调用
        if (response.toolCalls && response.toolCalls.length > 0) {
          // 检测循环
          if (this.detectLoop(response.toolCalls)) {
            throw new Error('Tool call loop detected');
          }

          this.emit('tools:executing', {
            iteration,
            toolCount: response.toolCalls.length,
          });

          const toolResults = await this.toolExecutor.executeBatch(
            response.toolCalls
          );

          toolCallCount += toolResults.length;

          this.emit('tools:executed', {
            iteration,
            results: toolResults.map((r) => ({
              name: r.name,
              success: r.success,
              duration: r.duration,
            })),
          });

          // 添加工具结果到消息列表
          const toolResultsText = toolResults
            .map(
              (r) =>
                `Tool: ${r.name}\nSuccess: ${r.success}\nResult: ${
                  r.success ? r.result : r.error
                }`
            )
            .join('\n\n');

          messages.push({
            role: 'user',
            content: `Tool execution results:\n\n${toolResultsText}`,
          });
        }
      }

      // 达到最大迭代次数
      throw new Error(`Max iterations (${this.options.maxIterations}) reached`);
    } catch (error: any) {
      this.emit('loop:error', {
        iterations: iteration,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
        iterations: iteration,
        tokensUsed: this.tokenManager.getStats().used,
        toolCalls: toolCallCount,
      };
    } finally {
      this.loopDetector.clear();
    }
  }

  /**
   * 构建初始消息
   */
  private buildInitialMessages(task: Task, context: ExecutionContext): Message[] {
    const messages: Message[] = [
      {
        role: 'system',
        content: this.options.systemPrompt,
      },
    ];

    // 添加任务描述
    let taskPrompt = `Task: ${task.title}\n\nDescription: ${task.description}`;

    // 添加上下文
    if (task.context) {
      taskPrompt += `\n\nContext:\n${JSON.stringify(task.context, null, 2)}`;
    }

    // 添加执行上下文
    taskPrompt += `\n\nExecution Context:\n`;
    taskPrompt += `- Workspace: ${context.workspaceDir}\n`;
    taskPrompt += `- Task ID: ${context.taskId}\n`;

    for (const [key, value] of Object.entries(context)) {
      if (key !== 'workspaceDir' && key !== 'taskId') {
        taskPrompt += `- ${key}: ${value}\n`;
      }
    }

    messages.push({
      role: 'user',
      content: taskPrompt,
    });

    return messages;
  }

  /**
   * 检测工具调用循环
   */
  private detectLoop(toolCalls: Array<{ name: string; arguments: string }>): boolean {
    for (const toolCall of toolCalls) {
      const key = `${toolCall.name}:${toolCall.arguments}`;
      const count = this.loopDetector.get(key) || 0;

      if (count >= 3) {
        // 同样的工具调用重复 3 次，认为是循环
        return true;
      }

      this.loopDetector.set(key, count + 1);
    }

    return false;
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.tokenManager.reset(this.options.tokenBudget);
    this.loopDetector.clear();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return this.tokenManager.getStats();
  }
}
```

### 步骤 2: 创建单元测试

创建 `tests/ai/agent-loop.test.ts`：

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentLoop } from '../../src/ai/agent-loop.js';
import { ToolExecutor } from '../../src/tools/tool-executor.js';
import { z } from 'zod';

describe('AgentLoop', () => {
  let mockLLM: any;
  let toolExecutor: ToolExecutor;
  let agentLoop: AgentLoop;

  beforeEach(() => {
    // Mock LLM
    mockLLM = {
      provider: 'test',
      modelName: 'test-model',
      chat: vi.fn(),
    };

    // 创建 ToolExecutor
    toolExecutor = new ToolExecutor({
      confirmDangerous: false,
    });

    // 注册测试工具
    toolExecutor.register({
      name: 'test_tool',
      description: 'A test tool',
      parameters: [
        {
          name: 'input',
          type: 'string',
          description: 'Input string',
          required: true,
        },
      ],
      schema: z.object({ input: z.string() }),
      handler: async (params) => `Processed: ${params.input}`,
    });

    // 创建 AgentLoop
    agentLoop = new AgentLoop(mockLLM, toolExecutor, {
      maxIterations: 5,
      tokenBudget: 10000,
    });
  });

  describe('execute', () => {
    it('should complete task without tool calls', async () => {
      mockLLM.chat.mockResolvedValueOnce({
        id: '1',
        model: 'test',
        content: 'Task completed successfully',
        stopReason: 'stop',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      });

      const result = await agentLoop.execute(
        {
          id: 'task-1',
          title: 'Test Task',
          description: 'A simple test task',
        },
        {
          workspaceDir: '/tmp/test',
          taskId: 'task-1',
        }
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('Task completed successfully');
      expect(result.iterations).toBe(1);
    });

    it('should execute tool calls and continue', async () => {
      // 第一次调用：返回工具调用
      mockLLM.chat.mockResolvedValueOnce({
        id: '1',
        model: 'test',
        content: 'Using tool...',
        stopReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'test_tool',
              arguments: JSON.stringify({ input: 'hello' }),
            },
          },
        ],
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      });

      // 第二次调用：完成任务
      mockLLM.chat.mockResolvedValueOnce({
        id: '2',
        model: 'test',
        content: 'Task completed after using tool',
        stopReason: 'stop',
        usage: {
          promptTokens: 150,
          completionTokens: 60,
          totalTokens: 210,
        },
      });

      const result = await agentLoop.execute(
        {
          id: 'task-1',
          title: 'Test Task with Tools',
          description: 'A task requiring tools',
        },
        {
          workspaceDir: '/tmp/test',
          taskId: 'task-1',
        }
      );

      expect(result.success).toBe(true);
      expect(result.iterations).toBe(2);
      expect(result.toolCalls).toBe(1);
    });

    it('should detect tool call loops', async () => {
      // 模拟重复的工具调用
      mockLLM.chat.mockResolvedValue({
        id: '1',
        model: 'test',
        content: 'Calling tool again...',
        stopReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'test_tool',
              arguments: JSON.stringify({ input: 'same input' }),
            },
          },
        ],
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      });

      const result = await agentLoop.execute(
        {
          id: 'task-1',
          title: 'Looping Task',
          description: 'A task that loops',
        },
        {
          workspaceDir: '/tmp/test',
          taskId: 'task-1',
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('loop detected');
    });

    it('should respect max iterations limit', async () => {
      // 每次都返回工具调用（不同参数，避免循环检测）
      let callCount = 0;
      mockLLM.chat.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          id: `${callCount}`,
          model: 'test',
          content: 'Calling tool...',
          stopReason: 'tool_calls',
          toolCalls: [
            {
              id: `call-${callCount}`,
              type: 'function',
              function: {
                name: 'test_tool',
                arguments: JSON.stringify({ input: `input-${callCount}` }),
              },
            },
          ],
          usage: {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
          },
        });
      });

      const result = await agentLoop.execute(
        {
          id: 'task-1',
          title: 'Never-ending Task',
          description: 'A task that never completes',
        },
        {
          workspaceDir: '/tmp/test',
          taskId: 'task-1',
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Max iterations');
      expect(result.iterations).toBe(5);
    });
  });
});
```

### 步骤 3: 创建集成测试

创建 `tests/integration/agent-loop.test.ts`：

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { AgentLoop } from '../../src/ai/agent-loop.js';
import { ToolExecutor } from '../../src/tools/tool-executor.js';
import { LLMServiceFactory } from '../../src/services/llm/factory.js';
import { LLMConfigManager } from '../../src/services/llm-config.js';
import { z } from 'zod';

describe('AgentLoop Integration', () => {
  let llmService: any;
  let toolExecutor: ToolExecutor;
  let agentLoop: AgentLoop;

  beforeAll(async () => {
    // 加载配置
    const configManager = new LLMConfigManager();
    await configManager.loadFromFile('config/llm.yaml');

    // 创建 LLM 服务
    const factory = new LLMServiceFactory(configManager);
    llmService = factory.create();

    // 创建 ToolExecutor
    toolExecutor = new ToolExecutor();

    // 注册工具
    toolExecutor.register({
      name: 'calculate',
      description: 'Perform basic arithmetic calculations',
      parameters: [
        {
          name: 'expression',
          type: 'string',
          description: 'Math expression (e.g., "2 + 2")',
          required: true,
        },
      ],
      schema: z.object({ expression: z.string() }),
      handler: async (params) => {
        // 简单的计算器（仅支持加减乘除）
        try {
          const result = eval(params.expression);
          return `Result: ${result}`;
        } catch (error) {
          return `Error: Invalid expression`;
        }
      },
    });

    // 创建 AgentLoop
    agentLoop = new AgentLoop(llmService, toolExecutor, {
      maxIterations: 10,
      tokenBudget: 50000,
    });
  });

  it('should complete a simple math task', async () => {
    const result = await agentLoop.execute(
      {
        id: 'math-1',
        title: 'Math Problem',
        description: 'Calculate the result of 123 + 456',
      },
      {
        workspaceDir: '/tmp/test',
        taskId: 'math-1',
      }
    );

    expect(result.success).toBe(true);
    expect(result.result).toContain('579');
  }, 30000);
});
```

---

## 验收标准

- ✅ 最大迭代次数限制（10 次）
- ✅ Token 预算检查正常
- ✅ 超出预算时自动压缩上下文
- ✅ 工具调用正确执行
- ✅ 循环检测正常（避免重复调用）
- ✅ 单元测试覆盖率 > 80%
- ✅ 集成测试通过

---

## 相关文档

- 任务 2: `docs/v5/tasks/task-02.md`
- 任务 3: `docs/v5/tasks/task-03.md`
- 任务 4: `docs/v5/tasks/task-04.md`
- 任务 5: `docs/v5/tasks/task-05.md`
- 架构设计：`docs/v5/02-architecture.md`

---

**任务完成标志**：

- [ ] AgentLoop 类实现完成
- [ ] Token 管理集成完成
- [ ] 上下文压缩集成完成
- [ ] 工具执行集成完成
- [ ] 循环检测实现完成
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 测试覆盖率 > 80%
