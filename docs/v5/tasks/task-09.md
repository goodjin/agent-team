# Task 9: 实现子 Agent

**优先级**: P1
**预计工时**: 8 小时
**依赖**: 任务 7, 任务 8
**状态**: 待执行

---

## 目标

1. 实现 SubAgent 类
2. 集成 AgentLoop
3. 集成 AgentCommunicator
4. 实现进度上报

---

## 输入

- AgentLoop: `src/ai/agent-loop.ts`
- AgentCommunicator: `src/ai/agent-communicator.ts`
- 架构设计：`docs/v5/02-architecture.md`

---

## 输出

- `src/ai/sub-agent.ts`
- 单元测试：`tests/ai/sub-agent.test.ts`

---

## 实现步骤

### 步骤 1: 实现 SubAgent 类

创建 `src/ai/sub-agent.ts`：

```typescript
import { EventEmitter } from 'events';
import { AgentLoop, Task, ExecutionContext, LoopResult } from './agent-loop.js';
import { AgentCommunicator } from './agent-communicator.js';
import type { LLMService } from '../services/llm/types.js';
import { ToolExecutor } from '../tools/tool-executor.js';

export interface SubAgentConfig {
  id: string;
  role: string;
  llmService: LLMService;
  toolExecutor: ToolExecutor;
  communicator: AgentCommunicator;
  systemPrompt?: string;
}

export type SubAgentStatus = 'idle' | 'working' | 'completed' | 'failed';

export interface SubAgentProgress {
  agentId: string;
  status: SubAgentStatus;
  currentTask?: string;
  progress: number; // 0-100
  message?: string;
  timestamp: Date;
}

export class SubAgent extends EventEmitter {
  private id: string;
  private role: string;
  private status: SubAgentStatus = 'idle';
  private agentLoop: AgentLoop;
  private communicator: AgentCommunicator;
  private currentTask: Task | null = null;
  private progress: number = 0;

  constructor(config: SubAgentConfig) {
    super();

    this.id = config.id;
    this.role = config.role;
    this.communicator = config.communicator;

    // 创建 AgentLoop
    this.agentLoop = new AgentLoop(
      config.llmService,
      config.toolExecutor,
      {
        systemPrompt: config.systemPrompt,
      }
    );

    // 监听 AgentLoop 事件
    this.setupLoopListeners();

    // 监听通信消息
    this.setupCommunicationListeners();
  }

  /**
   * 执行任务
   */
  async executeTask(
    task: Task,
    context: ExecutionContext
  ): Promise<LoopResult> {
    this.currentTask = task;
    this.status = 'working';
    this.progress = 0;

    this.reportProgress({
      status: this.status,
      currentTask: task.title,
      progress: this.progress,
      message: 'Task started',
    });

    try {
      const result = await this.agentLoop.execute(task, context);

      if (result.success) {
        this.status = 'completed';
        this.progress = 100;

        this.reportProgress({
          status: this.status,
          currentTask: task.title,
          progress: this.progress,
          message: 'Task completed successfully',
        });
      } else {
        this.status = 'failed';

        this.reportProgress({
          status: this.status,
          currentTask: task.title,
          progress: this.progress,
          message: `Task failed: ${result.error}`,
        });
      }

      return result;
    } catch (error: any) {
      this.status = 'failed';

      this.reportProgress({
        status: this.status,
        currentTask: task.title,
        progress: this.progress,
        message: `Task error: ${error.message}`,
      });

      return {
        success: false,
        error: error.message,
        iterations: 0,
        tokensUsed: 0,
        toolCalls: 0,
      };
    } finally {
      this.currentTask = null;
    }
  }

  /**
   * 上报进度
   */
  private reportProgress(update: Partial<SubAgentProgress>): void {
    const progressReport: SubAgentProgress = {
      agentId: this.id,
      status: update.status || this.status,
      currentTask: update.currentTask,
      progress: update.progress ?? this.progress,
      message: update.message,
      timestamp: new Date(),
    };

    // 触发本地事件
    this.emit('progress', progressReport);

    // 广播给其他 Agent
    this.communicator.broadcast({
      type: 'progress-update',
      agent: this.id,
      progress: progressReport,
    });
  }

  /**
   * 设置 AgentLoop 监听器
   */
  private setupLoopListeners(): void {
    this.agentLoop.on('loop:iteration', (event) => {
      // 根据迭代次数更新进度
      const maxIterations = event.maxIterations || 10;
      this.progress = Math.min(
        90,
        (event.iteration / maxIterations) * 100
      );

      this.reportProgress({
        progress: this.progress,
        message: `Iteration ${event.iteration}/${maxIterations}`,
      });
    });

    this.agentLoop.on('tools:executing', (event) => {
      this.reportProgress({
        message: `Executing ${event.toolCount} tool(s)`,
      });
    });

    this.agentLoop.on('context:compressing', () => {
      this.reportProgress({
        message: 'Compressing context...',
      });
    });

    this.agentLoop.on('budget:warning', (event) => {
      this.emit('budget:warning', {
        agentId: this.id,
        ...event,
      });
    });

    this.agentLoop.on('budget:critical', (event) => {
      this.emit('budget:critical', {
        agentId: this.id,
        ...event,
      });
    });
  }

  /**
   * 设置通信监听器
   */
  private setupCommunicationListeners(): void {
    // 处理请求
    this.communicator.onMessageType('request', async (message) => {
      const { action, params } = message.payload;

      let response: any;

      try {
        switch (action) {
          case 'get-status':
            response = this.getStatus();
            break;

          case 'get-progress':
            response = this.getProgress();
            break;

          case 'pause':
            // TODO: 实现暂停功能
            response = { success: false, error: 'Not implemented' };
            break;

          case 'resume':
            // TODO: 实现恢复功能
            response = { success: false, error: 'Not implemented' };
            break;

          default:
            response = { success: false, error: 'Unknown action' };
        }
      } catch (error: any) {
        response = { success: false, error: error.message };
      }

      this.communicator.respond(message.requestId!, message.from, response);
    });
  }

  /**
   * 获取状态
   */
  getStatus(): {
    id: string;
    role: string;
    status: SubAgentStatus;
    currentTask: string | null;
  } {
    return {
      id: this.id,
      role: this.role,
      status: this.status,
      currentTask: this.currentTask?.title || null,
    };
  }

  /**
   * 获取进度
   */
  getProgress(): SubAgentProgress {
    return {
      agentId: this.id,
      status: this.status,
      currentTask: this.currentTask?.title,
      progress: this.progress,
      timestamp: new Date(),
    };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      id: this.id,
      role: this.role,
      status: this.status,
      ...this.agentLoop.getStats(),
    };
  }

  /**
   * 重置 Agent
   */
  reset(): void {
    this.status = 'idle';
    this.currentTask = null;
    this.progress = 0;
    this.agentLoop.reset();
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.communicator.destroy();
    this.removeAllListeners();
  }
}
```

### 步骤 2: 创建单元测试

创建 `tests/ai/sub-agent.test.ts`：

```typescript
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
```

---

## 验收标准

- ✅ 子 Agent 可以独立执行任务
- ✅ 进度上报正常
- ✅ 结果返回正确
- ✅ 错误处理完善
- ✅ 单元测试覆盖率 > 80%

---

## 使用示例

```typescript
import EventEmitter3 from 'eventemitter3';
import { SubAgent } from './ai/sub-agent.js';
import { AgentCommunicator } from './ai/agent-communicator.js';
import { ToolExecutor } from './tools/tool-executor.js';
import { LLMServiceFactory } from './services/llm/factory.js';

// 创建共享事件总线
const eventBus = new EventEmitter3();

// 创建工具执行器
const toolExecutor = new ToolExecutor();

// 创建 LLM 服务
const llmService = factory.create('openai', 'gpt-4o');

// 创建通信器
const communicator = new AgentCommunicator('worker-1', eventBus);

// 创建子 Agent
const subAgent = new SubAgent({
  id: 'worker-1',
  role: 'developer',
  llmService,
  toolExecutor,
  communicator,
  systemPrompt: 'You are a helpful development assistant.',
});

// 监听进度
subAgent.on('progress', (report) => {
  console.log(`[${report.agentId}] ${report.message} (${report.progress}%)`);
});

// 执行任务
const result = await subAgent.executeTask(
  {
    id: 'task-1',
    title: 'Implement feature X',
    description: 'Add new feature to the application',
  },
  {
    workspaceDir: '/path/to/workspace',
    taskId: 'task-1',
  }
);

console.log('Result:', result);
```

---

## 相关文档

- 任务 7: `docs/v5/tasks/task-07.md`
- 任务 8: `docs/v5/tasks/task-08.md`
- 架构设计：`docs/v5/02-architecture.md`

---

**任务完成标志**：

- [ ] SubAgent 类实现完成
- [ ] AgentLoop 集成完成
- [ ] AgentCommunicator 集成完成
- [ ] 进度上报实现完成
- [ ] 单元测试通过
- [ ] 测试覆盖率 > 80%
