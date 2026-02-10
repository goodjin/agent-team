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
    it('should broadcast message to all agents', () => {
      const payload = { type: 'status', data: 'working' };

      return new Promise<void>((resolve) => {
        agent2.onBroadcast((message) => {
          expect(message.from).toBe('agent-1');
          expect(message.payload).toEqual(payload);
          expect(message.type).toBe('broadcast');
          resolve();
        });

        agent1.broadcast(payload);
      });
    });

    it('should not receive own broadcasts', () => {
      const handler = vi.fn();

      agent1.onBroadcast(handler);
      agent1.broadcast({ test: 'data' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('send (point-to-point)', () => {
    it('should send message to specific agent', () => {
      const payload = { task: 'process-data', data: [1, 2, 3] };

      return new Promise<void>((resolve) => {
        agent2.onMessage((message) => {
          expect(message.from).toBe('agent-1');
          expect(message.to).toBe('agent-2');
          expect(message.payload).toEqual(payload);
          expect(message.type).toBe('direct');
          resolve();
        });

        agent1.send('agent-2', payload);
      });
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

      const promise = agent1.request('agent-2', { test: 'data' }, { timeout: 100 });

      // 推进假定时器使超时触发
      vi.advanceTimersByTime(200);

      await expect(promise).rejects.toThrow('Request timeout');
    });

    it('should handle multiple concurrent requests', async () => {
      let requestCount = 0;

      agent2.onMessageType('request', (message) => {
        requestCount++;
        const currentCount = requestCount;
        // 使用同步响应避免假定时器问题
        agent2.respond(message.requestId!, message.from, {
          response: currentCount,
        });
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

      expect(directHandler).toHaveBeenCalledTimes(1);
      expect(broadcastHandler).toHaveBeenCalledTimes(1);
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
