export * from './llm.js';
export * from './tools.js';
export * from './events.js';

import { vi } from 'vitest';
import { createMockEventSystem } from './events.js';

export function createMockProjectAgentContext() {
  return {
    projectPath: '/mock/project',
    projectId: 'proj-mock-001',
    config: {
      apiKey: 'mock-api-key',
      model: 'gpt-4',
      maxRetries: 3,
      timeout: 30000,
    },
    taskManager: {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(),
    },
    agentMgr: {
      createAgent: vi.fn(),
      destroyAgent: vi.fn(),
      listAgents: vi.fn(),
      getAgent: vi.fn(),
    },
    eventSystem: createMockEventSystem(),
  };
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function mockFn<T extends (...args: unknown[]) => unknown>(implementation?: T) {
  return vi.fn(implementation as T);
}
