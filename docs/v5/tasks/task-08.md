# Task 8: 实现 Agent 通信系统

**优先级**: P1
**预计工时**: 6 小时
**依赖**: 任务 7
**状态**: 待执行

---

## 目标

1. 实现 AgentCommunicator 类
2. 实现事件总线
3. 实现广播、点对点、请求-响应模式

---

## 输入

- 架构设计：`docs/v5/02-architecture.md`

---

## 输出

- `src/ai/agent-communicator.ts`
- 单元测试：`tests/ai/agent-communicator.test.ts`

---

## 实现步骤

### 步骤 1: 实现 AgentCommunicator

创建 `src/ai/agent-communicator.ts`：

```typescript
import EventEmitter3 from 'eventemitter3';

export interface AgentMessage {
  id: string;
  from: string;
  to?: string; // undefined 表示广播
  type: 'broadcast' | 'direct' | 'request' | 'response';
  payload: any;
  timestamp: Date;
  requestId?: string; // 用于请求-响应配对
}

export interface RequestOptions {
  timeout?: number;
}

export class AgentCommunicator {
  private eventBus: EventEmitter3;
  private agentId: string;
  private messageIdCounter: number = 0;
  private pendingRequests: Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: any) => void;
      timeoutId: NodeJS.Timeout;
    }
  > = new Map();

  constructor(agentId: string, eventBus?: EventEmitter3) {
    this.agentId = agentId;
    this.eventBus = eventBus || new EventEmitter3();

    // 监听直接消息
    this.eventBus.on(`agent:${agentId}:message`, this.handleMessage.bind(this));

    // 监听广播消息
    this.eventBus.on('agent:broadcast', this.handleBroadcast.bind(this));
  }

  /**
   * 广播消息
   */
  broadcast(payload: any): void {
    const message: AgentMessage = {
      id: this.generateMessageId(),
      from: this.agentId,
      type: 'broadcast',
      payload,
      timestamp: new Date(),
    };

    this.eventBus.emit('agent:broadcast', message);
  }

  /**
   * 发送点对点消息
   */
  send(to: string, payload: any): void {
    const message: AgentMessage = {
      id: this.generateMessageId(),
      from: this.agentId,
      to,
      type: 'direct',
      payload,
      timestamp: new Date(),
    };

    this.eventBus.emit(`agent:${to}:message`, message);
  }

  /**
   * 请求-响应模式
   */
  async request(
    to: string,
    payload: any,
    options: RequestOptions = {}
  ): Promise<any> {
    const requestId = this.generateMessageId();
    const timeout = options.timeout || 30000;

    const message: AgentMessage = {
      id: this.generateMessageId(),
      from: this.agentId,
      to,
      type: 'request',
      payload,
      requestId,
      timestamp: new Date(),
    };

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      // 保存 Promise 处理器
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
      });

      // 发送请求
      this.eventBus.emit(`agent:${to}:message`, message);
    });
  }

  /**
   * 响应请求
   */
  respond(requestId: string, to: string, payload: any): void {
    const message: AgentMessage = {
      id: this.generateMessageId(),
      from: this.agentId,
      to,
      type: 'response',
      payload,
      requestId,
      timestamp: new Date(),
    };

    this.eventBus.emit(`agent:${to}:message`, message);
  }

  /**
   * 监听消息
   */
  onMessage(
    handler: (message: AgentMessage) => void | Promise<void>
  ): () => void {
    const listener = async (message: AgentMessage) => {
      await handler(message);
    };

    this.eventBus.on(`message:${this.agentId}`, listener);

    // 返回取消监听的函数
    return () => {
      this.eventBus.off(`message:${this.agentId}`, listener);
    };
  }

  /**
   * 监听特定类型的消息
   */
  onMessageType(
    type: AgentMessage['type'],
    handler: (message: AgentMessage) => void | Promise<void>
  ): () => void {
    return this.onMessage(async (message) => {
      if (message.type === type) {
        await handler(message);
      }
    });
  }

  /**
   * 监听广播消息
   */
  onBroadcast(
    handler: (message: AgentMessage) => void | Promise<void>
  ): () => void {
    const listener = async (message: AgentMessage) => {
      // 忽略自己发送的广播
      if (message.from !== this.agentId) {
        await handler(message);
      }
    };

    this.eventBus.on('broadcast:received', listener);

    return () => {
      this.eventBus.off('broadcast:received', listener);
    };
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(message: AgentMessage): void {
    // 检查是否是响应消息
    if (message.type === 'response' && message.requestId) {
      const pending = this.pendingRequests.get(message.requestId);

      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(message.requestId);
        pending.resolve(message.payload);
        return;
      }
    }

    // 触发通用消息事件
    this.eventBus.emit(`message:${this.agentId}`, message);
  }

  /**
   * 处理广播消息
   */
  private handleBroadcast(message: AgentMessage): void {
    // 忽略自己发送的广播
    if (message.from === this.agentId) {
      return;
    }

    this.eventBus.emit('broadcast:received', message);
    this.eventBus.emit(`message:${this.agentId}`, message);
  }

  /**
   * 生成消息 ID
   */
  private generateMessageId(): string {
    return `${this.agentId}-${Date.now()}-${++this.messageIdCounter}`;
  }

  /**
   * 获取 Agent ID
   */
  getAgentId(): string {
    return this.agentId;
  }

  /**
   * 获取事件总线（用于共享）
   */
  getEventBus(): EventEmitter3 {
    return this.eventBus;
  }

  /**
   * 清理资源
   */
  destroy(): void {
    // 清理所有待处理的请求
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Agent communicator destroyed'));
    }

    this.pendingRequests.clear();

    // 移除所有监听器
    this.eventBus.removeAllListeners(`agent:${this.agentId}:message`);
    this.eventBus.removeAllListeners(`message:${this.agentId}`);
    this.eventBus.removeAllListeners('broadcast:received');
  }
}
```

### 步骤 2: 创建单元测试

创建 `tests/ai/agent-communicator.test.ts`：

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import EventEmitter3 from 'eventemitter3';
import { AgentCommunicator } from '../../src/ai/agent-communicator.js';

describe('AgentCommunicator', () => {
  let eventBus: EventEmitter3;
  let agent1: AgentCommunicator;
  let agent2: AgentCommunicator;

  beforeEach(() => {
    eventBus = new EventEmitter3();
    agent1 = new AgentCommunicator('agent-1', eventBus);
    agent2 = new AgentCommunicator('agent-2', eventBus);
  });

  describe('broadcast', () => {
    it('should broadcast message to all agents', (done) => {
      const payload = { type: 'status', data: 'working' };

      agent2.onBroadcast((message) => {
        expect(message.from).toBe('agent-1');
        expect(message.payload).toEqual(payload);
        expect(message.type).toBe('broadcast');
        done();
      });

      agent1.broadcast(payload);
    });

    it('should not receive own broadcasts', () => {
      const handler = vi.fn();

      agent1.onBroadcast(handler);
      agent1.broadcast({ test: 'data' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('send (point-to-point)', () => {
    it('should send message to specific agent', (done) => {
      const payload = { task: 'process-data', data: [1, 2, 3] };

      agent2.onMessage((message) => {
        expect(message.from).toBe('agent-1');
        expect(message.to).toBe('agent-2');
        expect(message.payload).toEqual(payload);
        expect(message.type).toBe('direct');
        done();
      });

      agent1.send('agent-2', payload);
    });

    it('should not receive messages sent to other agents', () => {
      const agent3 = new AgentCommunicator('agent-3', eventBus);
      const handler = vi.fn();

      agent3.onMessage(handler);
      agent1.send('agent-2', { test: 'data' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('request-response', () => {
    it('should handle request-response pattern', async () => {
      const requestPayload = { action: 'get-status' };
      const responsePayload = { status: 'idle' };

      // Agent 2 处理请求
      agent2.onMessageType('request', (message) => {
        expect(message.payload).toEqual(requestPayload);
        agent2.respond(message.requestId!, message.from, responsePayload);
      });

      // Agent 1 发送请求
      const response = await agent1.request('agent-2', requestPayload);

      expect(response).toEqual(responsePayload);
    });

    it('should timeout if no response received', async () => {
      // Agent 2 不响应
      agent2.onMessageType('request', () => {
        // 故意不响应
      });

      await expect(
        agent1.request('agent-2', { test: 'data' }, { timeout: 100 })
      ).rejects.toThrow('Request timeout');
    });

    it('should handle multiple concurrent requests', async () => {
      let requestCount = 0;

      agent2.onMessageType('request', (message) => {
        requestCount++;
        setTimeout(() => {
          agent2.respond(message.requestId!, message.from, {
            response: requestCount,
          });
        }, 50);
      });

      const [r1, r2, r3] = await Promise.all([
        agent1.request('agent-2', { id: 1 }),
        agent1.request('agent-2', { id: 2 }),
        agent1.request('agent-2', { id: 3 }),
      ]);

      expect(r1.response).toBe(1);
      expect(r2.response).toBe(2);
      expect(r3.response).toBe(3);
    });
  });

  describe('onMessageType', () => {
    it('should filter messages by type', () => {
      const directHandler = vi.fn();
      const broadcastHandler = vi.fn();

      agent2.onMessageType('direct', directHandler);
      agent2.onMessageType('broadcast', broadcastHandler);

      agent1.send('agent-2', { test: 'direct' });
      agent1.broadcast({ test: 'broadcast' });

      // 需要等待事件处理
      setTimeout(() => {
        expect(directHandler).toHaveBeenCalledTimes(1);
        expect(broadcastHandler).toHaveBeenCalledTimes(1);
      }, 10);
    });
  });

  describe('destroy', () => {
    it('should cleanup resources', () => {
      const handler = vi.fn();

      agent1.onMessage(handler);
      agent1.destroy();

      agent2.send('agent-1', { test: 'data' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should reject pending requests on destroy', async () => {
      const promise = agent1.request('agent-2', { test: 'data' });

      agent1.destroy();

      await expect(promise).rejects.toThrow('destroyed');
    });
  });
});
```

---

## 验收标准

- ✅ 广播模式正常
- ✅ 点对点消息正确路由
- ✅ 请求-响应模式支持超时
- ✅ 消息格式标准化
- ✅ 单元测试覆盖率 > 80%

---

## 依赖安装

```bash
npm install eventemitter3
npm install --save-dev @types/eventemitter3
```

---

## 使用示例

```typescript
import EventEmitter3 from 'eventemitter3';
import { AgentCommunicator } from './ai/agent-communicator.js';

// 创建共享事件总线
const eventBus = new EventEmitter3();

// 创建 Agent 通信器
const masterComm = new AgentCommunicator('master', eventBus);
const worker1Comm = new AgentCommunicator('worker-1', eventBus);
const worker2Comm = new AgentCommunicator('worker-2', eventBus);

// 广播消息
masterComm.broadcast({
  type: 'task-started',
  taskId: 'task-123',
});

// Worker 监听广播
worker1Comm.onBroadcast((message) => {
  console.log('Worker 1 received broadcast:', message.payload);
});

// 点对点消息
masterComm.send('worker-1', {
  action: 'process',
  data: [1, 2, 3],
});

// Worker 监听消息
worker1Comm.onMessage((message) => {
  console.log('Worker 1 received message:', message.payload);
});

// 请求-响应
worker1Comm.onMessageType('request', (message) => {
  // 处理请求
  const result = { status: 'completed' };

  // 发送响应
  worker1Comm.respond(message.requestId!, message.from, result);
});

// Master 发送请求
const response = await masterComm.request('worker-1', {
  action: 'get-status',
});

console.log('Response:', response);
```

---

## 相关文档

- 任务 7: `docs/v5/tasks/task-07.md`
- 架构设计：`docs/v5/02-architecture.md`

---

**任务完成标志**：

- [ ] AgentCommunicator 类实现完成
- [ ] 广播模式实现完成
- [ ] 点对点消息实现完成
- [ ] 请求-响应模式实现完成
- [ ] 单元测试通过
- [ ] 测试覆盖率 > 80%
