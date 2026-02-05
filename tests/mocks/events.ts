import { vi } from 'vitest';
import { EventEmitter } from 'eventemitter3';

export function createMockEventSystem() {
  const emitter = new EventEmitter();
  
  return {
    emitter,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      emitter.on(event, handler);
      return () => emitter.off(event, handler);
    }),
    once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      emitter.once(event, handler);
    }),
    off: vi.fn((event: string, handler?: (...args: unknown[]) => void) => {
      if (handler) {
        emitter.off(event, handler);
      } else {
        emitter.removeAllListeners(event);
      }
    }),
    emit: vi.fn((event: string, data?: unknown) => {
      emitter.emit(event, data);
    }),
    removeAllListeners: vi.fn(() => {
      emitter.removeAllListeners();
    }),
    listenerCount: vi.fn((event: string) => {
      return emitter.listenerCount(event);
    }),
  };
}

export const mockEvents = {
  TASK_CREATED: 'task:created',
  TASK_STARTED: 'task:started',
  TASK_COMPLETED: 'task:completed',
  TASK_FAILED: 'task:failed',
  AGENT_STARTED: 'agent:started',
  AGENT_STOPPED: 'agent:stopped',
  AGENT_ERROR: 'agent:error',
  PROJECT_STARTED: 'project:started',
  PROJECT_STOPPED: 'project:stopped',
  CHECKPOINT_SAVED: 'checkpoint:saved',
  CHECKPOINT_LOADED: 'checkpoint:loaded',
};
