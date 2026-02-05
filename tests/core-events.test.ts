import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventSystem, type EventType, type Event, type EventHandler } from '../src/core/events.js';

describe('EventSystem', () => {
  let eventSystem: EventSystem;

  beforeEach(() => {
    eventSystem = new EventSystem();
  });

  describe('on/off', () => {
    it('should register an event listener', () => {
      const handler: EventHandler = vi.fn();
      eventSystem.on('task.created' as EventType, handler);
      
      expect(eventSystem.listenerCount('task.created' as EventType)).toBe(1);
    });

    it('should remove an event listener', () => {
      const handler: EventHandler = vi.fn();
      eventSystem.on('task.created' as EventType, handler);
      eventSystem.off('task.created' as EventType, handler);
      
      expect(eventSystem.listenerCount('task.created' as EventType)).toBe(0);
    });

    it('should support multiple listeners for same event', () => {
      const handler1: EventHandler = vi.fn();
      const handler2: EventHandler = vi.fn();
      
      eventSystem.on('task.created' as EventType, handler1);
      eventSystem.on('task.created' as EventType, handler2);
      
      expect(eventSystem.listenerCount('task.created' as EventType)).toBe(2);
    });
  });

  describe('once', () => {
    it('should call handler only once', () => {
      const handler: EventHandler = vi.fn();
      eventSystem.once('task.created' as EventType, handler);
      
      eventSystem.emit('task.created' as EventType, { test: 'data' });
      eventSystem.emit('task.created' as EventType, { test: 'data' });
      
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should remove listener after execution', () => {
      const handler: EventHandler = vi.fn();
      eventSystem.once('task.created' as EventType, handler);
      
      // Once listeners are stored separately, so listenerCount doesn't include them
      expect(eventSystem.hasListeners('task.created' as EventType)).toBe(true);
      
      eventSystem.emit('task.created' as EventType, { test: 'data' });
      eventSystem.emit('task.created' as EventType, { test: 'data' });
      
      expect(handler).toHaveBeenCalledTimes(1);
      expect(eventSystem.hasListeners('task.created' as EventType)).toBe(false);
    });
  });

  describe('emit', () => {
    it('should emit event to all listeners', () => {
      const handler1: EventHandler = vi.fn();
      const handler2: EventHandler = vi.fn();
      
      eventSystem.on('task.created' as EventType, handler1);
      eventSystem.on('task.created' as EventType, handler2);
      
      eventSystem.emit('task.created' as EventType, { test: 'data' });
      
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should pass event data to handlers', () => {
      const handler: EventHandler = vi.fn();
      eventSystem.on('task.created' as EventType, handler);
      
      const eventData = { taskId: 'T001', title: 'Test Task' };
      eventSystem.emit('task.created' as EventType, eventData);
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task.created',
          data: eventData,
          timestamp: expect.any(Date),
        })
      );
    });

    it('should handle errors in handlers gracefully', () => {
      const errorHandler: EventHandler = () => {
        throw new Error('Test error');
      };
      
      eventSystem.on('task.created' as EventType, errorHandler);
      
      expect(() => {
        eventSystem.emit('task.created' as EventType, { test: 'data' });
      }).not.toThrow();
    });
  });

  describe('hasListeners', () => {
    it('should return true when listeners exist', () => {
      const handler: EventHandler = vi.fn();
      eventSystem.on('task.created' as EventType, handler);
      
      expect(eventSystem.hasListeners('task.created' as EventType)).toBe(true);
    });

    it('should return false when no listeners exist', () => {
      expect(eventSystem.hasListeners('task.created' as EventType)).toBe(false);
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for specific event', () => {
      eventSystem.on('task.created' as EventType, vi.fn());
      eventSystem.on('task.started' as EventType, vi.fn());
      
      eventSystem.removeAllListeners('task.created' as EventType);
      
      expect(eventSystem.hasListeners('task.created' as EventType)).toBe(false);
      expect(eventSystem.hasListeners('task.started' as EventType)).toBe(true);
    });

    it('should remove all listeners when no event specified', () => {
      eventSystem.on('task.created' as EventType, vi.fn());
      eventSystem.on('task.started' as EventType, vi.fn());
      
      eventSystem.removeAllListeners();
      
      expect(eventSystem.hasListeners('task.created' as EventType)).toBe(false);
      expect(eventSystem.hasListeners('task.started' as EventType)).toBe(false);
    });
  });

  describe('getEventStats', () => {
    it('should return event statistics', () => {
      eventSystem.on('task.created' as EventType, vi.fn());
      eventSystem.on('task.created' as EventType, vi.fn());
      
      eventSystem.emit('task.created' as EventType, { test: 'data' });
      eventSystem.emit('task.created' as EventType, { test: 'data' });
      
      const stats = eventSystem.getEventStats();
      
      expect(stats['task.created']).toEqual({
        count: 2,
        handlers: 2,
      });
    });
  });

  describe('getListeners', () => {
    it('should return all listeners for an event', () => {
      const handler1: EventHandler = vi.fn();
      const handler2: EventHandler = vi.fn();
      
      eventSystem.on('task.created' as EventType, handler1);
      eventSystem.on('task.created' as EventType, handler2);
      
      const listeners = eventSystem.getListeners('task.created' as EventType);
      
      expect(listeners).toHaveLength(2);
      expect(listeners).toContain(handler1);
      expect(listeners).toContain(handler2);
    });

    it('should return empty array when no listeners', () => {
      const listeners = eventSystem.getListeners('task.created' as EventType);
      
      expect(listeners).toHaveLength(0);
    });
  });
});
