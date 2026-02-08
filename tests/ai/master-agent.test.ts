import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MasterAgent } from '../../src/ai/master-agent.js';
import { ToolExecutor } from '../../src/tools/tool-executor.js';

describe('MasterAgent', () => {
  let mockLLM: any;
  let toolExecutor: ToolExecutor;
  let masterAgent: MasterAgent;

  beforeEach(() => {
    mockLLM = {
      provider: 'test',
      modelName: 'test-model',
      chat: vi.fn(),
    };

    toolExecutor = new ToolExecutor({ confirmDangerous: false });

    masterAgent = new MasterAgent({
      id: 'master-1',
      llmService: mockLLM,
      toolExecutor,
      maxConcurrentSubAgents: 2,
      workspaceDir: '/tmp/test',
    });
  });

  describe('executeTask', () => {
    it('should analyze and execute task', async () => {
      // Mock 任务分析响应
      mockLLM.chat
        .mockResolvedValueOnce({
          id: '1',
          model: 'test',
          content: JSON.stringify({
            analysis: 'Simple task',
            subtasks: [
              {
                id: 'subtask-1',
                title: 'Subtask 1',
                description: 'First subtask',
                dependencies: [],
              },
            ],
          }),
          stopReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        })
        // Mock 子任务执行响应
        .mockResolvedValueOnce({
          id: '2',
          model: 'test',
          content: 'Subtask 1 completed',
          stopReason: 'stop',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        });

      const result = await masterAgent.executeTask({
        id: 'task-1',
        title: 'Test Task',
        description: 'A test task to execute',
      });

      expect(result.success).toBe(true);
      expect(result.subtasks.length).toBe(1);
      expect(result.results.length).toBe(1);
    });

    it('should handle multiple subtasks', async () => {
      // Mock 任务分析响应
      mockLLM.chat
        .mockResolvedValueOnce({
          id: '1',
          model: 'test',
          content: JSON.stringify({
            analysis: 'Complex task',
            subtasks: [
              {
                id: 'subtask-1',
                title: 'Subtask 1',
                description: 'First',
                dependencies: [],
              },
              {
                id: 'subtask-2',
                title: 'Subtask 2',
                description: 'Second',
                dependencies: [],
              },
            ],
          }),
          stopReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        })
        // Mock 子任务执行响应
        .mockResolvedValue({
          id: '2',
          model: 'test',
          content: 'Completed',
          stopReason: 'stop',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        });

      const result = await masterAgent.executeTask({
        id: 'task-1',
        title: 'Complex Task',
        description: 'A complex task with multiple subtasks',
      });

      expect(result.success).toBe(true);
      expect(result.subtasks.length).toBe(2);
      expect(result.results.length).toBe(2);
    });

    it('should respect concurrency limit', async () => {
      // Use a master agent with maxConcurrent of 2
      const concurrencyStatus = masterAgent.getConcurrencyStatus();
      expect(concurrencyStatus.maxConcurrent).toBe(2);

      // Mock 任务分析
      mockLLM.chat
        .mockResolvedValueOnce({
          id: '1',
          model: 'test',
          content: JSON.stringify({
            analysis: 'Many subtasks',
            subtasks: Array.from({ length: 4 }, (_, i) => ({
              id: `subtask-${i + 1}`,
              title: `Subtask ${i + 1}`,
              description: `Subtask ${i + 1}`,
              dependencies: [],
            })),
          }),
          stopReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        })
        // Mock 子任务执行响应 (4 subtasks)
        .mockResolvedValue({
          id: '2',
          model: 'test',
          content: 'Done',
          stopReason: 'stop',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        });

      const result = await masterAgent.executeTask({
        id: 'task-1',
        title: 'Many Subtasks',
        description: 'Task with many subtasks',
      });

      expect(result.success).toBe(true);
      expect(result.subtasks.length).toBe(4);
      // Verify concurrency controller was used (maxConcurrent is 2)
      expect(concurrencyStatus.maxConcurrent).toBe(2);
    });

    it('should handle task analysis failure', async () => {
      mockLLM.chat.mockResolvedValueOnce({
        id: '1',
        model: 'test',
        content: 'Not valid JSON at all',
        stopReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      // Second call for the fallback subtask execution
      mockLLM.chat.mockResolvedValueOnce({
        id: '2',
        model: 'test',
        content: 'Fallback completed',
        stopReason: 'stop',
        usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
      });

      const result = await masterAgent.executeTask({
        id: 'task-1',
        title: 'Failing Task',
        description: 'A task that will fail JSON parsing',
      });

      // Falls back to single subtask
      expect(result.subtasks.length).toBe(1);
      expect(result.subtasks[0].id).toBe('subtask-1');
    });

    it('should emit events during task execution', async () => {
      const events: string[] = [];

      masterAgent.on('task:started', () => events.push('task:started'));
      masterAgent.on('task:analyzing', () => events.push('task:analyzing'));
      masterAgent.on('task:analyzed', () => events.push('task:analyzed'));
      masterAgent.on('task:completed', () => events.push('task:completed'));

      mockLLM.chat
        .mockResolvedValueOnce({
          id: '1',
          model: 'test',
          content: JSON.stringify({
            analysis: 'Simple',
            subtasks: [{ id: 'subtask-1', title: 'T1', description: 'D1', dependencies: [] }],
          }),
          stopReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        })
        .mockResolvedValueOnce({
          id: '2',
          model: 'test',
          content: 'Done',
          stopReason: 'stop',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        });

      await masterAgent.executeTask({
        id: 'task-1',
        title: 'Event Test',
        description: 'Testing events',
      });

      expect(events).toContain('task:started');
      expect(events).toContain('task:analyzing');
      expect(events).toContain('task:analyzed');
      expect(events).toContain('task:completed');
    });
  });

  describe('getSubAgentsStatus', () => {
    it('should return empty array when no sub-agents', () => {
      const status = masterAgent.getSubAgentsStatus();
      expect(status).toEqual([]);
    });
  });

  describe('getConcurrencyStatus', () => {
    it('should return concurrency status', () => {
      const status = masterAgent.getConcurrencyStatus();
      expect(status).toHaveProperty('running');
      expect(status).toHaveProperty('queued');
      expect(status).toHaveProperty('maxConcurrent');
      expect(status.maxConcurrent).toBe(2);
    });
  });

  describe('setMaxConcurrent', () => {
    it('should update the max concurrent limit', () => {
      masterAgent.setMaxConcurrent(5);
      const status = masterAgent.getConcurrencyStatus();
      expect(status.maxConcurrent).toBe(5);
    });
  });

  describe('cleanup', () => {
    it('should cleanup all sub-agents', async () => {
      mockLLM.chat
        .mockResolvedValueOnce({
          id: '1',
          model: 'test',
          content: JSON.stringify({
            analysis: 'Test',
            subtasks: [
              { id: 'subtask-1', title: 'Test', description: 'Test', dependencies: [] },
            ],
          }),
          stopReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        })
        .mockResolvedValue({
          id: '2',
          model: 'test',
          content: 'Done',
          stopReason: 'stop',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        });

      await masterAgent.executeTask({
        id: 'task-1',
        title: 'Test',
        description: 'Test',
      });

      masterAgent.cleanup();

      const status = masterAgent.getSubAgentsStatus();
      expect(status).toEqual([]);
    });

    it('should cleanup without error when no sub-agents exist', () => {
      expect(() => masterAgent.cleanup()).not.toThrow();
    });
  });
});
