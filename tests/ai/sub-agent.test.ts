import { describe, it, expect, beforeEach, vi } from 'vitest';
import EventEmitter3 from 'eventemitter3';
import { SubAgent } from '../../src/ai/sub-agent.js';
import { AgentCommunicator } from '../../src/ai/agent-communicator.js';
import { ToolExecutor } from '../../src/tools/tool-executor.js';

describe('SubAgent', () => {
  let mockLLM: any;
  let toolExecutor: ToolExecutor;
  let eventBus: EventEmitter3;
  let communicator: AgentCommunicator;
  let subAgent: SubAgent;

  beforeEach(() => {
    mockLLM = {
      provider: 'test',
      modelName: 'test-model',
      chat: vi.fn(),
    };

    toolExecutor = new ToolExecutor({ confirmDangerous: false });
    eventBus = new EventEmitter3();
    communicator = new AgentCommunicator('sub-1', eventBus);

    subAgent = new SubAgent({
      id: 'sub-1',
      role: 'worker',
      llmService: mockLLM,
      toolExecutor,
      communicator,
    });
  });

  describe('executeTask', () => {
    it('should execute task successfully', async () => {
      mockLLM.chat.mockResolvedValueOnce({
        id: '1',
        model: 'test',
        content: 'Task completed',
        stopReason: 'stop',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      });

      const result = await subAgent.executeTask(
        {
          id: 'task-1',
          title: 'Test Task',
          description: 'A test task',
        },
        {
          workspaceDir: '/tmp/test',
          taskId: 'task-1',
        }
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('Task completed');
    });

    it('should report progress during execution', async () => {
      const progressReports: any[] = [];

      subAgent.on('progress', (report) => {
        progressReports.push(report);
      });

      mockLLM.chat.mockResolvedValueOnce({
        id: '1',
        model: 'test',
        content: 'Done',
        stopReason: 'stop',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      });

      await subAgent.executeTask(
        {
          id: 'task-1',
          title: 'Progress Test',
          description: 'Test progress reporting',
        },
        {
          workspaceDir: '/tmp/test',
          taskId: 'task-1',
        }
      );

      // 应该至少有开始和完成两个进度报告
      expect(progressReports.length).toBeGreaterThanOrEqual(2);
      expect(progressReports[0].status).toBe('working');
      expect(progressReports[progressReports.length - 1].status).toBe('completed');
    });

    it('should handle task failure', async () => {
      mockLLM.chat.mockRejectedValueOnce(new Error('LLM error'));

      const result = await subAgent.executeTask(
        {
          id: 'task-1',
          title: 'Failing Task',
          description: 'This will fail',
        },
        {
          workspaceDir: '/tmp/test',
          taskId: 'task-1',
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM error');
    });
  });

  describe('communication', () => {
    it('should respond to status requests', async () => {
      const masterComm = new AgentCommunicator('master', eventBus);

      const status = await masterComm.request('sub-1', {
        action: 'get-status',
      });

      expect(status.id).toBe('sub-1');
      expect(status.role).toBe('worker');
      expect(status.status).toBe('idle');
    });

    it('should respond to progress requests', async () => {
      const masterComm = new AgentCommunicator('master', eventBus);

      const progress = await masterComm.request('sub-1', {
        action: 'get-progress',
      });

      expect(progress.agentId).toBe('sub-1');
      expect(progress.progress).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      const status = subAgent.getStatus();

      expect(status.id).toBe('sub-1');
      expect(status.role).toBe('worker');
      expect(status.status).toBe('idle');
      expect(status.currentTask).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset agent state', async () => {
      mockLLM.chat.mockResolvedValueOnce({
        id: '1',
        model: 'test',
        content: 'Done',
        stopReason: 'stop',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      });

      await subAgent.executeTask(
        {
          id: 'task-1',
          title: 'Test',
          description: 'Test',
        },
        {
          workspaceDir: '/tmp/test',
          taskId: 'task-1',
        }
      );

      subAgent.reset();

      const status = subAgent.getStatus();
      expect(status.status).toBe('idle');
      expect(status.currentTask).toBeNull();
    });
  });
});
