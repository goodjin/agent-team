/**
 * Integration Test: Project Agent
 * Tests the core ProjectAgent functionality with real module interactions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProjectAgent } from '../../src/core/project-agent.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { ToolRegistry } from '../../src/tools/tool-registry.js';
import { RoleManager } from '../../src/roles/role-manager.js';
import { RuleManager } from '../../src/rules/rule-manager.js';
import { CheckpointManager } from '../../src/ai/checkpoint.js';
import { EventSystem } from '../../src/core/events.js';
import type { LLMProvider } from '../../src/types/index.js';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

describe('Integration: ProjectAgent Core', () => {
  let tempDir: string;
  let toolRegistry: ToolRegistry;
  let eventSystem: EventSystem;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-team-integration-'));
    vi.clearAllMocks();
    vi.useFakeTimers();
    toolRegistry = new ToolRegistry();
    eventSystem = new EventSystem();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Project Initialization', () => {
    it('should create ProjectAgent with minimal config', () => {
      const config = {
        projectName: 'TestProject',
        projectPath: tempDir
      };

      const agent = new ProjectAgent(config);
      expect(agent).toBeDefined();
    });

    it('should create ProjectAgent with LLM config', () => {
      const config = {
        projectName: 'TestProject',
        projectPath: tempDir,
        llmConfig: {
          provider: 'openai' as LLMProvider,
          model: 'gpt-4',
          apiKey: 'test-key'
        }
      };

      const agent = new ProjectAgent(config);
      expect(agent).toBeDefined();
    });

    it('should create ProjectAgent with LLM config', () => {
      const config = {
        projectName: 'TestProject',
        projectPath: tempDir,
        llmConfig: {
          provider: 'openai' as LLMProvider,
          model: 'gpt-4',
          apiKey: 'test-key'
        }
      };

      const agent = new ProjectAgent(config);
      expect(agent).toBeDefined();
    });
  });

  describe('TaskManager Integration', () => {
    it('should create tasks with various types', () => {
      const config = {
        projectName: 'TestProject',
        projectPath: tempDir
      };

      const taskManager = new TaskManager(config, toolRegistry);

      const taskTypes = [
        'requirement-analysis',
        'architecture-design',
        'development',
        'testing',
        'documentation',
        'code-review',
        'refactoring',
        'bug-fix',
        'custom'
      ] as const;

      taskTypes.forEach((type, index) => {
        const task = taskManager.createTask({
          type,
          title: `Task ${index + 1}`,
          description: `Description for ${type}`
        });
        expect(task.type).toBe(type);
      });
    });

    it('should track task status transitions', () => {
      const config = {
        projectName: 'TestProject',
        projectPath: tempDir
      };

      const taskManager = new TaskManager(config, toolRegistry);
      const task = taskManager.createTask({
        title: 'Test Task',
        description: 'Description'
      });

      expect(task.status).toBe('pending');

      taskManager.updateTaskStatus(task.id, 'in-progress');
      let updated = taskManager.getTask(task.id);
      expect(updated?.status).toBe('in-progress');

      taskManager.updateTaskStatus(task.id, 'completed');
      updated = taskManager.getTask(task.id);
      expect(updated?.status).toBe('completed');
    });

    it('should handle task dependencies', () => {
      const config = {
        projectName: 'TestProject',
        projectPath: tempDir
      };

      const taskManager = new TaskManager(config, toolRegistry);
      
      const task1 = taskManager.createTask({
        title: 'Task 1',
        description: 'First task'
      });

      const task2 = taskManager.createTask({
        title: 'Task 2',
        description: 'Second task',
        dependencies: [task1.id]
      });

      expect(task2.dependencies).toContain(task1.id);
    });

    it('should handle task priorities', () => {
      const config = {
        projectName: 'TestProject',
        projectPath: tempDir
      };

      const taskManager = new TaskManager(config, toolRegistry);

      const priorities: Array<'low' | 'medium' | 'high' | 'critical'> = [
        'low', 'medium', 'high', 'critical'
      ];

      priorities.forEach(priority => {
        const task = taskManager.createTask({
          title: `Task ${priority}`,
          description: 'Description',
          priority
        });
        expect(task.priority).toBe(priority);
      });
    });
  });

  describe('ToolRegistry Integration', () => {
    it('should have default tools registered', () => {
      expect(toolRegistry.has('read-file')).toBe(true);
      expect(toolRegistry.has('write-file')).toBe(true);
      expect(toolRegistry.has('search-files')).toBe(true);
      expect(toolRegistry.has('git-status')).toBe(true);
    });

    it('should return error for non-existent tools', async () => {
      const result = await toolRegistry.execute('nonExistentTool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool not found');
    });
  });

  describe('RoleManager Integration', () => {
    it('should be instantiable', () => {
      expect(() => new RoleManager()).not.toThrow();
    });
  });

  describe('RuleManager Integration', () => {
    it('should be instantiable', () => {
      expect(() => new RuleManager()).not.toThrow();
    });
  });

  describe('CheckpointManager Integration', () => {
    it('should save and load checkpoints', async () => {
      const checkpointManager = new CheckpointManager('test-project');

      const testData: Record<string, any> = {
        progress: {
          completedSteps: ['step1', 'step2'],
          remainingSteps: ['step3'],
          percentComplete: 66
        }
      };

      const checkpointId = await checkpointManager.saveCheckpoint({
        taskId: 'task-123',
        agentId: 'agent-1',
        projectId: 'test-project',
        type: 'step-complete',
        data: testData,
        stepIndex: 2,
        stepName: 'Step 2'
      });

      expect(checkpointId).toBeDefined();

      const loaded = await checkpointManager.loadCheckpoint(checkpointId);
      expect(loaded).toBeDefined();
      expect(loaded?.taskId).toBe('task-123');
      expect(loaded?.data.progress?.percentComplete).toBe(66);
    });

    it('should check if checkpoints exist', async () => {
      const checkpointManager = new CheckpointManager('test-project');

      await checkpointManager.saveCheckpoint({
        taskId: 'task-1',
        agentId: 'agent-1',
        projectId: 'test-project',
        type: 'step-complete',
        data: {},
        stepIndex: 1,
        stepName: 'Step 1'
      });

      expect(checkpointManager.hasCheckpoints('task-1')).toBe(true);
      expect(checkpointManager.hasCheckpoints('task-999')).toBe(false);
    });

    it('should delete checkpoints', async () => {
      const checkpointManager = new CheckpointManager('test-project');

      const id = await checkpointManager.saveCheckpoint({
        taskId: 'task-1',
        agentId: 'agent-1',
        projectId: 'test-project',
        type: 'step-complete',
        data: {},
        stepIndex: 1,
        stepName: 'Step 1'
      });
      
      checkpointManager.deleteCheckpoint(id);
      
      const loaded = await checkpointManager.loadCheckpoint(id);
      expect(loaded).toBeNull();
    });
  });

  describe('EventSystem Integration', () => {
    it('should emit and receive task events', () => {
      const eventSystem = new EventSystem();
      const received: any[] = [];

      eventSystem.on('task.created', (event) => {
        received.push(event.data);
      });

      eventSystem.emit('task.created', { value: 1 });
      eventSystem.emit('task.created', { value: 2 });

      expect(received.length).toBe(2);
      expect(received[0].value).toBe(1);
      expect(received[1].value).toBe(2);
    });

    it('should handle one-time events', () => {
      const eventSystem = new EventSystem();
      let callCount = 0;

      eventSystem.once('task.completed', () => {
        callCount++;
      });

      eventSystem.emit('task.completed', {});
      eventSystem.emit('task.completed', {});

      expect(callCount).toBe(1);
    });

    it('should remove event listeners', () => {
      const eventSystem = new EventSystem();
      let callCount = 0;

      const handler = () => { callCount++; };
      eventSystem.on('agent.stopped', handler);
      eventSystem.off('agent.stopped', handler);

      eventSystem.emit('agent.stopped', {});

      expect(callCount).toBe(0);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full task lifecycle', () => {
      const config = {
        projectName: 'E2E Test',
        projectPath: tempDir
      };

      const taskManager = new TaskManager(config, toolRegistry);
      const eventSystem = new EventSystem();

      const task = taskManager.createTask({
        type: 'development',
        title: 'Implement feature',
        description: 'Implement the new feature',
        priority: 'high',
        dependencies: []
      });

      let eventCalled = false;
      eventSystem.on('task.completed', () => {
        eventCalled = true;
      });

      taskManager.updateTaskStatus(task.id, 'in-progress');
      taskManager.updateTaskStatus(task.id, 'completed');

      expect(taskManager.getTask(task.id)?.status).toBe('completed');
    });

    it('should handle concurrent task operations', () => {
      const config = {
        projectName: 'Concurrent Test',
        projectPath: tempDir
      };

      const taskManager = new TaskManager(config, toolRegistry);

      const tasks = Array.from({ length: 10 }, (_, i) =>
        taskManager.createTask({
          title: `Concurrent Task ${i}`,
          description: `Description ${i}`
        })
      );

      tasks.forEach((task) => {
        taskManager.updateTaskStatus(task.id, 'in-progress');
      });

      tasks.forEach((task) => {
        const updated = taskManager.getTask(task.id);
        expect(updated?.status).toBe('in-progress');
      });
    });
  });
});
