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

    it('should complete task with end_turn stop reason', async () => {
      mockLLM.chat.mockResolvedValueOnce({
        id: '1',
        model: 'test',
        content: 'Task completed via end_turn',
        stopReason: 'end_turn',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      });

      const result = await agentLoop.execute(
        {
          id: 'task-2',
          title: 'Test Task End Turn',
          description: 'A task completing with end_turn',
        },
        {
          workspaceDir: '/tmp/test',
          taskId: 'task-2',
        }
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('Task completed via end_turn');
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

    it('should emit events during execution', async () => {
      mockLLM.chat.mockResolvedValueOnce({
        id: '1',
        model: 'test',
        content: 'Done',
        stopReason: 'stop',
        usage: {
          promptTokens: 50,
          completionTokens: 10,
          totalTokens: 60,
        },
      });

      const events: string[] = [];
      agentLoop.on('loop:started', () => events.push('loop:started'));
      agentLoop.on('loop:iteration', () => events.push('loop:iteration'));
      agentLoop.on('llm:calling', () => events.push('llm:calling'));
      agentLoop.on('llm:response', () => events.push('llm:response'));
      agentLoop.on('loop:completed', () => events.push('loop:completed'));

      await agentLoop.execute(
        { id: 'task-1', title: 'Event Test', description: 'Test events' },
        { workspaceDir: '/tmp', taskId: 'task-1' }
      );

      expect(events).toContain('loop:started');
      expect(events).toContain('loop:iteration');
      expect(events).toContain('llm:calling');
      expect(events).toContain('llm:response');
      expect(events).toContain('loop:completed');
    });

    it('should fail when token budget is exceeded', async () => {
      // Create AgentLoop with very small budget
      const tinyBudgetLoop = new AgentLoop(mockLLM, toolExecutor, {
        maxIterations: 5,
        tokenBudget: 100,
        compressionThreshold: 50,
      });

      // First LLM response records enough tokens to exhaust the budget
      mockLLM.chat.mockResolvedValueOnce({
        id: '1',
        model: 'test',
        content: 'Response after budget exceeded',
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
          promptTokens: 60,
          completionTokens: 40,
          totalTokens: 100,
        },
      });

      // Second call should fail budget check
      mockLLM.chat.mockResolvedValueOnce({
        id: '2',
        model: 'test',
        content: 'Should not reach here',
        stopReason: 'stop',
        usage: {
          promptTokens: 60,
          completionTokens: 40,
          totalTokens: 100,
        },
      });

      const result = await tinyBudgetLoop.execute(
        { id: 'task-1', title: 'Budget Test', description: 'Tests budget' },
        { workspaceDir: '/tmp', taskId: 'task-1' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('budget exceeded');
    });

    it('should include task context in initial messages', async () => {
      mockLLM.chat.mockResolvedValueOnce({
        id: '1',
        model: 'test',
        content: 'Done',
        stopReason: 'stop',
        usage: {
          promptTokens: 50,
          completionTokens: 10,
          totalTokens: 60,
        },
      });

      await agentLoop.execute(
        {
          id: 'task-1',
          title: 'Context Task',
          description: 'Task with context',
          context: { key: 'value', num: 42 },
        },
        {
          workspaceDir: '/workspace',
          taskId: 'task-1',
          extraProp: 'extra',
        }
      );

      const chatArgs = mockLLM.chat.mock.calls[0][0];
      const userMessage = chatArgs.messages.find((m: any) => m.role === 'user');

      expect(userMessage.content).toContain('Context Task');
      expect(userMessage.content).toContain('key');
      expect(userMessage.content).toContain('value');
      expect(userMessage.content).toContain('/workspace');
    });
  });

  describe('reset', () => {
    it('should reset token manager and loop detector', async () => {
      // Record some usage
      mockLLM.chat.mockResolvedValueOnce({
        id: '1',
        model: 'test',
        content: 'Done',
        stopReason: 'stop',
        usage: {
          promptTokens: 500,
          completionTokens: 500,
          totalTokens: 1000,
        },
      });

      await agentLoop.execute(
        { id: 'task-1', title: 'Task', description: 'Test' },
        { workspaceDir: '/tmp', taskId: 'task-1' }
      );

      expect(agentLoop.getStats().used).toBe(1000);

      agentLoop.reset();

      expect(agentLoop.getStats().used).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return token statistics', () => {
      const stats = agentLoop.getStats();

      expect(stats).toHaveProperty('budget');
      expect(stats).toHaveProperty('used');
      expect(stats).toHaveProperty('remaining');
      expect(stats).toHaveProperty('percentage');
      expect(stats.budget).toBe(10000);
      expect(stats.used).toBe(0);
    });
  });
});
