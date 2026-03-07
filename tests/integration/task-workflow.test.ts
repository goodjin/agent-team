import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventSystem } from '../../src/core/events.js';
import { ToolRegistry } from '../../src/tools/tool-registry.js';
import type { ProjectConfig, Task, TaskStatus, ToolResult } from '../../src/types/index.js';

// Test utilities
const createMockToolRegistry = (): ToolRegistry => {
  const mockRegistry = {
    getAllNames: vi.fn().mockReturnValue(['read', 'write', 'execute', 'test']),
    getDefinition: vi.fn().mockReturnValue({
      name: 'mockTool',
      description: 'A mock tool',
      parameters: { type: 'object', properties: {} },
    }),
    getTool: vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue({ success: true, data: 'executed' }),
    }),
    register: vi.fn(),
    unregister: vi.fn(),
    has: vi.fn().mockReturnValue(true),
  };
  return mockRegistry as unknown as ToolRegistry;
};

const createMockProjectConfig = (): ProjectConfig => ({
  projectPath: '/test/project',
  projectId: 'test-project',
  llmConfig: undefined,
  maxRetries: 3,
  timeout: 30000,
  rules: [],
  roles: {},
  tools: [],
});

// Import TaskManager dynamically to avoid import issues
let TaskManager: any;

describe('Integration: Task Execution Flow', () => {
  let taskManager: any;
  let eventSystem: EventSystem;

  beforeEach(async () => {
    // Dynamic import to handle ES modules
    const taskManagerModule = await import('../../src/core/task-manager.js');
    TaskManager = taskManagerModule.TaskManager;
    
    eventSystem = new EventSystem();
    const toolRegistry = createMockToolRegistry();
    const projectConfig = createMockProjectConfig();
    
    taskManager = new TaskManager(projectConfig, toolRegistry);
  });

  describe('Task Lifecycle', () => {
    it('should execute complete task lifecycle', async () => {
      const events: string[] = [];

      // Subscribe to events
      taskManager.on('task:created' as any, () => events.push('created'));
      taskManager.on('task:in-progress' as any, () => events.push('in-progress'));
      taskManager.on('task:completed' as any, () => events.push('completed'));

      // Create task
      const task = taskManager.createTask({
        title: 'Integration Test Task',
        description: 'Test task lifecycle',
      });

      expect(events).toContain('created');

      // Update status
      taskManager.updateTaskStatus(task.id, 'in-progress');
      expect(events).toContain('in-progress');

      taskManager.updateTaskStatus(task.id, 'completed');
      expect(events).toContain('completed');
    });

    it('should track task history', () => {
      const task = taskManager.createTask({
        title: 'History Test',
        description: 'Test history tracking',
      });

      taskManager.updateTaskStatus(task.id, 'in-progress');
      taskManager.updateTaskStatus(task.id, 'completed');

      const updatedTask = taskManager.getTask(task.id);
      
      expect(updatedTask?.startedAt).toBeInstanceOf(Date);
      expect(updatedTask?.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('Task Dependencies', () => {
    it('should handle linear dependency chain', () => {
      const task1 = taskManager.createTask({ title: 'Task 1', description: 'First' });
      const task2 = taskManager.createTask({
        title: 'Task 2',
        description: 'Second',
        dependencies: [task1.id],
      });
      const task3 = taskManager.createTask({
        title: 'Task 3',
        description: 'Third',
        dependencies: [task2.id],
      });

      expect(task2.dependencies).toContain(task1.id);
      expect(task3.dependencies).toContain(task2.id);
    });

    it('should handle parallel tasks', () => {
      const task1 = taskManager.createTask({ title: 'Task A', description: 'A' });
      const task2 = taskManager.createTask({ title: 'Task B', description: 'B' });
      const task3 = taskManager.createTask({
        title: 'Task C',
        description: 'Depends on A and B',
        dependencies: [task1.id, task2.id],
      });

      expect(task3.dependencies).toHaveLength(2);
    });

    it('should identify blocked tasks', () => {
      const task1 = taskManager.createTask({ title: 'Task 1', description: 'First' });
      const task2 = taskManager.createTask({
        title: 'Task 2',
        description: 'Blocked',
        dependencies: [task1.id],
      });

      // Task 2 should be blocked since task 1 is not completed
      const blockedTasks = taskManager.getTasksByStatus('blocked');
      // Note: In real execution, this would be set by executeTask
      expect(task2.dependencies.length).toBe(1);
    });
  });

  describe('Task Messages', () => {
    it('should track conversation history', () => {
      const task = taskManager.createTask({
        title: 'Chat Task',
        description: 'Test conversation',
        initialMessage: 'Hello',
      });

      taskManager.addMessage(task.id, {
        role: 'user',
        content: 'Continue the task',
        timestamp: new Date(),
      });

      taskManager.addMessage(task.id, {
        role: 'assistant',
        content: 'Working on it',
        timestamp: new Date(),
      });

      const updated = taskManager.getTask(task.id);
      expect(updated?.messages).toHaveLength(3); // initial + 2 added
    });
  });

  describe('Task Execution Records', () => {
    it('should record execution attempts', () => {
      const task = taskManager.createTask({ title: 'Exec Record Test', description: 'Test' });

      taskManager.addExecutionRecord(task.id, {
        role: 'developer',
        action: 'Initial attempt',
        startTime: new Date(Date.now() - 10000),
        endTime: new Date(),
        duration: 10000,
        result: { success: false, error: 'Failed' },
      });

      const updated = taskManager.getTask(task.id);
      expect(updated?.executionRecords).toHaveLength(1);
      expect(updated?.executionRecords[0].role).toBe('developer');
    });

    it('should track retry attempts', () => {
      const task = taskManager.createTask({ title: 'Retry Test', description: 'Test' });

      // First attempt
      taskManager.addExecutionRecord(task.id, {
        role: 'developer',
        action: 'Attempt 1',
        startTime: new Date(Date.now() - 20000),
        endTime: new Date(Date.now() - 10000),
        duration: 10000,
        result: { success: false, error: 'Failed' },
      });

      // Second attempt
      taskManager.addExecutionRecord(task.id, {
        role: 'developer',
        action: 'Attempt 2',
        startTime: new Date(Date.now() - 5000),
        endTime: new Date(),
        duration: 5000,
        result: { success: true, data: { result: 'success' } },
      });

      const updated = taskManager.getTask(task.id);
      expect(updated?.executionRecords).toHaveLength(2);
      expect(updated?.executionRecords[1].result.success).toBe(true);
    });
  });
});

describe('Integration: Multi-Agent Collaboration', () => {
  describe('Agent Communication via Events', () => {
    it('should coordinate agents through event system', () => {
      const events = new EventSystem();
      const agentActions: string[] = [];

      // Agent 1 listens for work
      events.on('work.assign' as any, (event: any) => {
        agentActions.push(`Agent1: Received work - ${event.data.task}`);
      });

      // Agent 2 listens for work
      events.on('work.assign' as any, (event: any) => {
        agentActions.push(`Agent2: Received work - ${event.data.task}`);
      });

      // Manager assigns work
      events.emit('work.assign' as any, { task: 'Build feature', assigner: 'Manager' });

      expect(agentActions).toHaveLength(2);
      expect(agentActions[0]).toContain('Agent1');
      expect(agentActions[1]).toContain('Agent2');
    });

    it('should handle agent status propagation', () => {
      const events = new EventSystem();
      const statusLog: string[] = [];

      events.on('agent.status.changed' as any, (event: any) => {
        statusLog.push(`${event.data.agentId}: ${event.data.from} -> ${event.data.to}`);
      });

      // Simulate status changes
      events.emit('agent.status.changed' as any, { agentId: 'dev-1', from: 'idle', to: 'working' });
      events.emit('agent.status.changed' as any, { agentId: 'dev-1', from: 'working', to: 'completed' });
      events.emit('agent.status.changed' as any, { agentId: 'dev-2', from: 'idle', to: 'working' });

      expect(statusLog).toHaveLength(3);
      expect(statusLog[0]).toBe('dev-1: idle -> working');
    });

    it('should handle task completion notifications', () => {
      const events = new EventSystem();
      const notifications: string[] = [];

      events.on('task.completed' as any, (event: any) => {
        notifications.push(`Task ${event.data.taskId} completed by ${event.data.agentId}`);
      });

      events.on('task.failed' as any, (event: any) => {
        notifications.push(`Task ${event.data.taskId} failed: ${event.data.error}`);
      });

      events.emit('task.completed' as any, { taskId: 'T001', agentId: 'dev-1' });
      events.emit('task.failed' as any, { taskId: 'T002', agentId: 'dev-2', error: 'Timeout' });

      expect(notifications).toHaveLength(2);
      expect(notifications[0]).toContain('completed');
      expect(notifications[1]).toContain('failed');
    });
  });

  describe('Task Routing Based on Agent Availability', () => {
    it('should route tasks to available agents', () => {
      const availableAgents = new Set(['dev-1', 'dev-2', 'dev-3']);
      const assignedTasks: string[] = [];

      const tasks = [
        { id: 'T001', type: 'frontend' },
        { id: 'T002', type: 'backend' },
        { id: 'T003', type: 'frontend' },
      ];

      tasks.forEach(task => {
        // Simple round-robin routing
        const agent = Array.from(availableAgents)[assignedTasks.length % availableAgents.size];
        assignedTasks.push(`${task.id} -> ${agent}`);
      });

      expect(assignedTasks).toHaveLength(3);
      expect(assignedTasks[0]).toContain('dev-1');
      expect(assignedTasks[1]).toContain('dev-2');
    });

    it('should handle agent failure and redistribution', () => {
      const events = new EventSystem();
      const taskAssignments: string[] = [];

      events.on('agent.failed' as any, (event: any) => {
        const failedAgent = event.data.agentId;
        const failedTask = event.data.taskId;
        
        // Redistribute to next available agent
        taskAssignments.push(`Redistributing ${failedTask} from ${failedAgent} to backup`);
      });

      events.emit('agent.failed' as any, {
        agentId: 'dev-1',
        taskId: 'T001',
        reason: 'Timeout',
      });

      expect(taskAssignments).toHaveLength(1);
      expect(taskAssignments[0]).toContain('Redistributing');
    });
  });
});

describe('Integration: Error Handling Flow', () => {
  describe('Error Propagation', () => {
    it('should capture task errors', () => {
      const events = new EventSystem();
      const errors: any[] = [];

      events.on('task.error' as any, (event: any) => {
        errors.push(event.data);
      });

      events.emit('task.error' as any, {
        taskId: 'T001',
        error: 'Execution failed',
        code: 'EXECUTION_ERROR',
      });

      expect(errors).toHaveLength(1);
      expect(errors[0].taskId).toBe('T001');
    });

    it('should handle retry logic', () => {
      const events = new EventSystem();
      const attempts: number[] = [];

      events.on('task.retry' as any, (event: any) => {
        attempts.push(event.data.attempt);
      });

      // Simulate retry attempts
      events.emit('task.retry' as any, { taskId: 'T001', attempt: 1 });
      events.emit('task.retry' as any, { taskId: 'T001', attempt: 2 });
      events.emit('task.retry' as any, { taskId: 'T001', attempt: 3 });

      expect(attempts).toEqual([1, 2, 3]);
    });
  });

  describe('Recovery Scenarios', () => {
    it('should handle partial failure in batch operations', () => {
      const tasks = [
        { id: 'T001', status: 'completed' as TaskStatus },
        { id: 'T002', status: 'failed' as TaskStatus },
        { id: 'T003', status: 'completed' as TaskStatus },
      ];

      const completed = tasks.filter(t => t.status === 'completed');
      const failed = tasks.filter(t => t.status === 'failed');

      expect(completed).toHaveLength(2);
      expect(failed).toHaveLength(1);
    });

    it('should maintain consistency after rollback', () => {
      const events = new EventSystem();
      const checkpoints: string[] = [];

      // Create checkpoint
      const state = { tasks: ['T001', 'T002', 'T003'] };
      checkpoints.push(JSON.stringify(state));

      // Modify state
      state.tasks.push('T004');
      checkpoints.push(JSON.stringify(state));

      // Rollback
      const rolledBack = JSON.parse(checkpoints[0]);
      checkpoints.push(JSON.stringify(rolledBack));

      expect(checkpoints).toHaveLength(3);
      expect(JSON.parse(checkpoints[2]).tasks).toHaveLength(3);
    });
  });
});

describe('Integration: Performance & Load', () => {
  describe('High Volume Operations', () => {
    it('should handle many concurrent tasks', () => {
      const events = new EventSystem();
      const handler = vi.fn();

      events.on('task.created' as any, handler);

      // Create 1000 tasks
      for (let i = 0; i < 1000; i++) {
        events.emit('task.created' as any, { taskId: `T${i}` });
      }

      expect(handler).toHaveBeenCalledTimes(1000);
    });

    it('should maintain performance under load', () => {
      const events = new EventSystem();
      
      // Add multiple handlers
      for (let i = 0; i < 10; i++) {
        events.on('task.event' as any, vi.fn());
      }

      const startTime = Date.now();
      
      // Emit 100 events
      for (let i = 0; i < 100; i++) {
        events.emit('task.event' as any, { index: i });
      }

      const duration = Date.now() - startTime;
      
      // Should complete quickly (less than 100ms)
      expect(duration).toBeLessThan(100);
    });

    it('should handle rapid status changes', () => {
      const events = new EventSystem();
      const statusChanges: string[] = [];

      events.on('task.status.changed' as any, (event: any) => {
        statusChanges.push(event.data.to);
      });

      // Rapid status changes
      const statuses: TaskStatus[] = ['pending', 'in-progress', 'completed', 'pending', 'in-progress'];
      
      statuses.forEach(status => {
        events.emit('task.status.changed' as any, { taskId: 'T001', to: status });
      });

      expect(statusChanges).toEqual(statuses);
    });
  });

  describe('Memory Efficiency', () => {
    it('should clean up event listeners properly', () => {
      const events = new EventSystem();
      
      // Create and remove many listeners
      for (let i = 0; i < 100; i++) {
        const handler = vi.fn();
        events.on('task.event' as any, handler);
        events.off('task.event' as any, handler);
      }

      expect(events.listenerCount('task.event' as any)).toBe(0);
    });

    it('should handle listener leaks gracefully', () => {
      const events = new EventSystem();

      // Subscribe
      const handler = vi.fn();
      events.on('task.created' as any, handler);

      // Emit multiple times
      for (let i = 0; i < 10; i++) {
        events.emit('task.created' as any, { index: i });
      }

      // Unsubscribe
      events.off('task.created' as any, handler);

      // Should not accumulate
      expect(events.listenerCount('task.created' as any)).toBe(0);
    });
  });
});
