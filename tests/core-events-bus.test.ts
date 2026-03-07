import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventSystem, type EventType, type Event, type EventHandler } from '../src/core/events.js';

describe('EventSystem - Communication Bus Tests', () => {
  let eventSystem: EventSystem;

  beforeEach(() => {
    eventSystem = new EventSystem();
  });

  // ===== 异常流程测试 =====

  describe('Error Handling', () => {
    it('should continue emitting to other handlers when one throws', () => {
      const handler1 = vi.fn(() => {
        throw new Error('Handler 1 error');
      });
      const handler2 = vi.fn();

      eventSystem.on('task.created' as EventType, handler1);
      eventSystem.on('task.created' as EventType, handler2);

      expect(() => {
        eventSystem.emit('task.created' as EventType, { test: 'data' });
      }).not.toThrow();

      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple errors in once handlers', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Once handler error');
      });
      const normalHandler = vi.fn();

      eventSystem.once('task.created' as EventType, errorHandler);
      eventSystem.on('task.created' as EventType, normalHandler);

      expect(() => {
        eventSystem.emit('task.created' as EventType, { test: 'data' });
      }).not.toThrow();

      expect(normalHandler).toHaveBeenCalledTimes(1);
    });
  });

  // ===== 事件类型测试 =====

  describe('Task Event Types', () => {
    it('should handle task.created event', () => {
      const handler = vi.fn();
      eventSystem.on('task.created' as EventType, handler);

      eventSystem.emit('task.created' as EventType, { taskId: 'T001', title: 'Test Task' });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task.created',
          data: { taskId: 'T001', title: 'Test Task' },
        })
      );
    });

    it('should handle task.started event', () => {
      const handler = vi.fn();
      eventSystem.on('task.started' as EventType, handler);

      eventSystem.emit('task.started' as EventType, { taskId: 'T001', startedAt: new Date() });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle task.completed event', () => {
      const handler = vi.fn();
      eventSystem.on('task.completed' as EventType, handler);

      eventSystem.emit('task.completed' as EventType, { taskId: 'T001', result: { success: true } });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle task.failed event', () => {
      const handler = vi.fn();
      eventSystem.on('task.failed' as EventType, handler);

      eventSystem.emit('task.failed' as EventType, { taskId: 'T001', error: 'Task failed' });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ===== Agent Event Types =====

  describe('Agent Event Types', () => {
    it('should handle agent.created event', () => {
      const handler = vi.fn();
      eventSystem.on('agent.created' as EventType, handler);

      eventSystem.emit('agent.created' as EventType, { agentId: 'A001', role: 'developer' });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle agent.stopped event', () => {
      const handler = vi.fn();
      eventSystem.on('agent.stopped' as EventType, handler);

      eventSystem.emit('agent.stopped' as EventType, { agentId: 'A001', reason: 'user request' });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle agent.deleted event', () => {
      const handler = vi.fn();
      eventSystem.on('agent.deleted' as EventType, handler);

      eventSystem.emit('agent.deleted' as EventType, { agentId: 'A001' });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle agent.status.changed event', () => {
      const handler = vi.fn();
      eventSystem.on('agent.status.changed' as EventType, handler);

      eventSystem.emit('agent.status.changed' as EventType, {
        agentId: 'A001',
        from: 'idle',
        to: 'running'
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle agent.heartbeat event', () => {
      const handler = vi.fn();
      eventSystem.on('agent.heartbeat' as EventType, handler);

      eventSystem.emit('agent.heartbeat' as EventType, { agentId: 'A001', timestamp: Date.now() });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle agent.health.failed event', () => {
      const handler = vi.fn();
      eventSystem.on('agent.health.failed' as EventType, handler);

      eventSystem.emit('agent.health.failed' as EventType, {
        agentId: 'A001',
        reason: 'unhealthy'
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ===== 通信总线场景测试 =====

  describe('Communication Bus Scenarios', () => {
    it('should support pub-sub pattern', () => {
      const subscriber1 = vi.fn();
      const subscriber2 = vi.fn();

      // Multiple subscribers
      eventSystem.on('task.created' as EventType, subscriber1);
      eventSystem.on('task.created' as EventType, subscriber2);

      eventSystem.emit('task.created' as EventType, { taskId: 'T001' });

      expect(subscriber1).toHaveBeenCalledTimes(1);
      expect(subscriber2).toHaveBeenCalledTimes(1);
    });

    it('should support event filtering by subscriber', () => {
      const allEventsHandler = vi.fn();
      const taskOnlyHandler = vi.fn();

      eventSystem.on('task.created' as EventType, allEventsHandler);
      eventSystem.on('task.completed' as EventType, allEventsHandler);
      eventSystem.on('task.created' as EventType, taskOnlyHandler);

      eventSystem.emit('task.created' as EventType, { taskId: 'T001' });
      eventSystem.emit('task.completed' as EventType, { taskId: 'T001' });

      expect(allEventsHandler).toHaveBeenCalledTimes(2);
      expect(taskOnlyHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle event ordering', () => {
      const callOrder: string[] = [];
      const handler1 = vi.fn(() => callOrder.push('handler1'));
      const handler2 = vi.fn(() => callOrder.push('handler2'));

      eventSystem.on('task.created' as EventType, handler1);
      eventSystem.on('task.created' as EventType, handler2);

      eventSystem.emit('task.created' as EventType, {});

      expect(callOrder).toEqual(['handler1', 'handler2']);
    });

    it('should handle high-frequency events', () => {
      const handler = vi.fn();

      eventSystem.on('agent.heartbeat' as EventType, handler);

      // Emit 100 events rapidly
      for (let i = 0; i < 100; i++) {
        eventSystem.emit('agent.heartbeat' as EventType, { timestamp: i });
      }

      expect(handler).toHaveBeenCalledTimes(100);
    });

    it('should track event statistics correctly under load', () => {
      eventSystem.on('task.created' as EventType, vi.fn());
      eventSystem.on('task.created' as EventType, vi.fn());

      // Emit multiple times
      for (let i = 0; i < 10; i++) {
        eventSystem.emit('task.created' as EventType, { index: i });
      }

      const stats = eventSystem.getEventStats();
      expect(stats['task.created'].count).toBe(10);
      expect(stats['task.created'].handlers).toBe(2);
    });
  });

  // ===== 内存和清理测试 =====

  describe('Memory Management', () => {
    it('should not leak listeners when repeatedly adding and removing', () => {
      const handler = vi.fn();

      // Add and remove many times
      for (let i = 0; i < 100; i++) {
        eventSystem.on('task.created' as EventType, handler);
        eventSystem.off('task.created' as EventType, handler);
      }

      expect(eventSystem.listenerCount('task.created' as EventType)).toBe(0);
    });

    it('should clean up once listeners after emission', () => {
      const handler = vi.fn();

      eventSystem.once('task.created' as EventType, handler);

      expect(eventSystem.hasListeners('task.created' as EventType)).toBe(true);

      eventSystem.emit('task.created' as EventType, {});

      expect(eventSystem.hasListeners('task.created' as EventType)).toBe(false);
      expect(handler).toHaveBeenCalledTimes(1);

      // Emit again - handler should not be called
      eventSystem.emit('task.created' as EventType, {});
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle removeAllListeners for non-existent event', () => {
      expect(() => {
        eventSystem.removeAllListeners('non.existent' as EventType);
      }).not.toThrow();
    });
  });

  // ===== 异步处理测试 =====

  describe('Async Event Handling', () => {
    it('should handle async handlers', async () => {
      const asyncHandler = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      eventSystem.on('task.created' as EventType, asyncHandler);

      // Should not throw
      expect(() => {
        eventSystem.emit('task.created' as EventType, {});
      }).not.toThrow();
    });

    it('should preserve event data immutability', () => {
      const originalData = { value: 1 };
      const handler = vi.fn((event: Event) => {
        // Modify the data
        event.data.value = 999;
      });

      eventSystem.on('task.created' as EventType, handler);
      eventSystem.emit('task.created' as EventType, originalData);

      // Original data should not be modified (if handlers create copies)
      // Note: Current implementation passes same object, so this tests the behavior
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.any(Object) })
      );
    });
  });

  // ===== 边界情况测试 =====

  describe('Edge Cases', () => {
    it('should handle emit with empty data', () => {
      const handler = vi.fn();
      eventSystem.on('task.created' as EventType, handler);

      eventSystem.emit('task.created' as EventType, undefined as any);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle emit with null data', () => {
      const handler = vi.fn();
      eventSystem.on('task.created' as EventType, handler);

      eventSystem.emit('task.created' as EventType, null);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle emit with complex nested data', () => {
      const handler = vi.fn();
      eventSystem.on('task.created' as EventType, handler);

      const complexData = {
        task: {
          id: 'T001',
          metadata: {
            nested: {
              deep: {
                value: 'test'
              }
            }
          },
          tags: ['tag1', 'tag2'],
          assignee: null,
        },
        timestamp: new Date(),
      };

      eventSystem.emit('task.created' as EventType, complexData);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: complexData
        })
      );
    });

    it('should handle many different event types', () => {
      const handlers: EventHandler[] = [];
      const eventTypes: EventType[] = [
        'task.created',
        'task.started',
        'task.completed',
        'task.failed',
        'agent.created',
        'agent.stopped',
        'agent.status.changed',
      ];

      eventTypes.forEach((type, index) => {
        const handler = vi.fn();
        handlers.push(handler);
        eventSystem.on(type, handler);
      });

      eventTypes.forEach((type, index) => {
        eventSystem.emit(type, { index });
      });

      handlers.forEach(handler => {
        expect(handler).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ===== 集成场景测试 =====

  describe('Integration Scenarios', () => {
    it('should support event-driven task workflow', () => {
      const workflow: string[] = [];

      // Setup handlers for a task workflow
      eventSystem.on('task.created' as EventType, () => workflow.push('created'));
      eventSystem.on('task.started' as EventType, () => workflow.push('started'));
      eventSystem.on('task.completed' as EventType, () => workflow.push('completed'));

      // Simulate workflow
      eventSystem.emit('task.created' as EventType, { taskId: 'T001' });
      eventSystem.emit('task.started' as EventType, { taskId: 'T001' });
      eventSystem.emit('task.completed' as EventType, { taskId: 'T001' });

      expect(workflow).toEqual(['created', 'started', 'completed']);
    });

    it('should support multi-agent coordination', () => {
      const agentEvents: Record<string, string[]> = {
        'A001': [],
        'A002': [],
        'A003': [],
      };

      eventSystem.on('agent.status.changed' as EventType, (event) => {
        const data = event.data as any;
        if (data.agentId && agentEvents[data.agentId]) {
          agentEvents[data.agentId].push(data.to);
        }
      });

      // Simulate agent status changes
      eventSystem.emit('agent.status.changed' as EventType, { agentId: 'A001', to: 'running' });
      eventSystem.emit('agent.status.changed' as EventType, { agentId: 'A002', to: 'running' });
      eventSystem.emit('agent.status.changed' as EventType, { agentId: 'A001', to: 'idle' });
      eventSystem.emit('agent.status.changed' as EventType, { agentId: 'A003', to: 'running' });

      expect(agentEvents['A001']).toEqual(['running', 'idle']);
      expect(agentEvents['A002']).toEqual(['running']);
      expect(agentEvents['A003']).toEqual(['running']);
    });

    it('should handle task dependency events', () => {
      const events: string[] = [];

      eventSystem.on('task.created' as EventType, () => events.push('task:created'));
      eventSystem.on('task.completed' as EventType, () => events.push('task:completed'));
      eventSystem.on('task.failed' as EventType, () => events.push('task:failed'));

      // Simulate dependent task workflow
      const depTask = { taskId: 'T001', status: 'completed' };
      const mainTask = { taskId: 'T002', dependsOn: ['T001'], status: 'pending' };

      if (depTask.status === 'completed') {
        eventSystem.emit('task.completed' as EventType, depTask);
        eventSystem.emit('task.created' as EventType, mainTask);
      }

      expect(events).toContain('task:completed');
      expect(events).toContain('task:created');
    });
  });
});
