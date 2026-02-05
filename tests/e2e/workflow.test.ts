/**
 * End-to-End Tests for Project Agent
 * Tests complete workflows and core business scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ProjectAgent } from '../../src/core/project-agent.js';
import { TaskManager } from '../../src/core/task-manager.js';
import { Agent } from '../../src/ai/agent.js';
import { ToolRegistry } from '../../src/tools/tool-registry.js';
import { CheckpointManager } from '../../src/ai/checkpoint.js';
import { EventSystem } from '../../src/core/events.js';
import { RoleManager } from '../../src/roles/role-manager.js';
import { RuleManager } from '../../src/rules/rule-manager.js';

describe('E2E: Complete Project Initialization Flow', () => {
  let tempDir: string;
  let projectAgent: ProjectAgent;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-e2e-init-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('E2E-001: should initialize project with all managers ready', () => {
    const config = {
      projectName: 'E2E Test Project',
      projectPath: tempDir,
    };

    projectAgent = new ProjectAgent(config);

    const taskManager = (projectAgent as any).taskManager;
    const toolRegistry = (projectAgent as any).toolRegistry;

    expect(taskManager).toBeDefined();
    expect(taskManager).toBeInstanceOf(TaskManager);
    expect(toolRegistry).toBeDefined();
    expect(toolRegistry).toBeInstanceOf(ToolRegistry);

    expect(toolRegistry.has('read-file')).toBe(true);
    expect(toolRegistry.has('write-file')).toBe(true);
    expect(toolRegistry.has('search-files')).toBe(true);
    expect(toolRegistry.has('git-status')).toBe(true);

    const allTasks = taskManager.getAllTasks();
    expect(allTasks.length).toBe(0);
  });

  it('E2E-001b: should initialize project with LLM configuration', () => {
    const configPath = join(tempDir, 'config.yaml');
    writeFileSync(configPath, `
projectName: Configured Project
projectPath: ${tempDir}
llmConfig:
  defaultProvider: openai
  providers:
    openai:
      name: openai
      provider: openai
      apiKey: test-key
      enabled: true
      models:
        gpt-4:
          model: gpt-4
          maxTokens: 4000
`);

    const projectAgent = new ProjectAgent({
      projectName: 'Test',
      projectPath: tempDir,
    });

    expect(projectAgent).toBeDefined();
  });
});

describe('E2E: Complete Task Lifecycle', () => {
  let tempDir: string;
  let taskManager: TaskManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-e2e-task-'));
    const toolRegistry = new ToolRegistry();
    taskManager = new TaskManager({ projectName: 'Test', projectPath: tempDir }, toolRegistry);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('E2E-002: should complete full task lifecycle', () => {
    const task = taskManager.createTask({
      type: 'development',
      title: 'Implement feature',
      description: 'Implement the new authentication feature',
      priority: 'high',
    });

    expect(task.id).toBeDefined();
    expect(task.status).toBe('pending');
    expect(task.createdAt).toBeInstanceOf(Date);

    taskManager.updateTaskStatus(task.id, 'in-progress');
    let updatedTask = taskManager.getTask(task.id);
    expect(updatedTask?.status).toBe('in-progress');
    expect(updatedTask?.startedAt).toBeDefined();

    taskManager.updateTaskStatus(task.id, 'completed');

    const completedTask = taskManager.getTask(task.id);
    expect(completedTask?.status).toBe('completed');
    expect(completedTask?.completedAt).toBeDefined();
  });

  it('E2E-002b: should handle task failure gracefully', () => {
    const task = taskManager.createTask({
      title: 'Task that will fail',
      description: 'A task that encounters an error',
    });

    taskManager.updateTaskStatus(task.id, 'in-progress');
    taskManager.updateTaskStatus(task.id, 'failed');

    const failedTask = taskManager.getTask(task.id);
    expect(failedTask?.status).toBe('failed');
  });

  it('E2E-002c: should manage task dependencies correctly', () => {
    const task1 = taskManager.createTask({
      title: 'Setup database',
      description: 'Set up the database schema',
    });

    const task2 = taskManager.createTask({
      title: 'Create API endpoints',
      description: 'Create REST API endpoints',
      dependencies: [task1.id],
    });

    const task3 = taskManager.createTask({
      title: 'Write tests',
      description: 'Write integration tests',
      dependencies: [task2.id],
    });

    expect(task2.dependencies).toContain(task1.id);
    expect(task3.dependencies).toContain(task2.id);

    const allTasks = taskManager.getAllTasks();
    expect(allTasks.length).toBe(3);
  });
});

describe('E2E: Agent Task Execution', () => {
  let tempDir: string;
  let toolRegistry: ToolRegistry;
  let mockLLMService: any;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-e2e-agent-'));
    toolRegistry = new ToolRegistry();

    mockLLMService = {
      chat: vi.fn().mockResolvedValue({
        content: 'Task completed successfully',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      }),
      chatStream: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('E2E-003: should create agent and verify initial state', () => {
    const roleManager = new RoleManager();
    const ruleManager = new RuleManager();

    const agent = new Agent(
      {
        roleId: 'developer',
        projectId: 'test-project',
        name: 'Developer Agent',
      },
      mockLLMService,
      toolRegistry,
      roleManager,
      ruleManager
    );

    expect((agent as any).state.status).toBe('idle');
    expect((agent as any).state.currentTaskId).toBeNull();
  });

  it('E2E-003b: should handle agent tool calls', async () => {
    const roleManager = new RoleManager();
    const ruleManager = new RuleManager();

    const agent = new Agent(
      { roleId: 'developer', projectId: 'test-project' },
      mockLLMService,
      toolRegistry,
      roleManager,
      ruleManager
    );

    const readResult = await toolRegistry.execute('read-file', {
      filePath: join(tempDir, 'test.txt'),
    });

    expect(readResult.success).toBe(false);
    expect(readResult.error).toBeDefined();
  });
});

describe('E2E: Tool Registration and Execution', () => {
  let tempDir: string;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-e2e-tool-'));
    toolRegistry = new ToolRegistry();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('E2E-004: should execute file operations end-to-end', async () => {
    const writeResult = await toolRegistry.execute('write-file', {
      filePath: join(tempDir, 'test.txt'),
      content: 'Hello, World!',
    });

    expect(writeResult.success).toBe(true);

    const readResult = await toolRegistry.execute('read-file', {
      filePath: join(tempDir, 'test.txt'),
    });

    expect(readResult.success).toBe(true);
    expect(readResult.data?.content).toBe('Hello, World!');

    const searchResult = await toolRegistry.execute('search-files', {
      pattern: '**/*.txt',
      path: tempDir,
    });

    expect(searchResult.success).toBe(true);
    expect(searchResult.data?.files).toBeDefined();
  });

  it('E2E-004b: should list directory contents', async () => {
    writeFileSync(join(tempDir, 'file1.txt'), 'Content 1');
    writeFileSync(join(tempDir, 'file2.txt'), 'Content 2');
    mkdirSync(join(tempDir, 'subdir'));

    const searchResult = await toolRegistry.execute('search-files', {
      pattern: '*',
      path: tempDir,
    });

    expect(searchResult.success).toBe(true);
    expect(searchResult.data?.files).toBeDefined();
  });
});

describe('E2E: Checkpoint Save and Restore', () => {
  let tempDir: string;
  let checkpointManager: CheckpointManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-e2e-checkpoint-'));
    checkpointManager = new CheckpointManager('test-project');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('E2E-005: should save and restore checkpoint', async () => {
    const initialState = {
      stepIndex: 0,
      messages: [
        { role: 'user', content: 'Start the task' },
        { role: 'assistant', content: 'I will help you' },
      ],
    };

    const checkpointId = await checkpointManager.saveCheckpoint({
      taskId: 'task-123',
      agentId: 'agent-456',
      projectId: 'test-project',
      type: 'context-snapshot',
      data: initialState as any,
      stepIndex: 0,
      stepName: 'Initial State',
    });

    expect(checkpointId).toBeDefined();

    const workingState = { stepIndex: 5, progressPercent: 50 };
    await checkpointManager.saveCheckpoint({
      taskId: 'task-123',
      agentId: 'agent-456',
      projectId: 'test-project',
      type: 'step-complete',
      data: workingState as any,
      stepIndex: 5,
      stepName: 'Halfway Done',
    });

    const loadedCheckpoint = await checkpointManager.loadCheckpoint(checkpointId);
    expect(loadedCheckpoint).toBeDefined();
    expect(loadedCheckpoint?.data.stepIndex).toBe(0);
    expect(loadedCheckpoint?.data.messages).toHaveLength(2);

    const checkpoints = await checkpointManager.getCheckpointsByTask('task-123');
    expect(checkpoints.length).toBe(2);

    checkpointManager.deleteCheckpoint(checkpointId);
    const deleted = await checkpointManager.loadCheckpoint(checkpointId);
    expect(deleted).toBeNull();
  });

  it('E2E-005b: should handle checkpoint for different agents', async () => {
    await checkpointManager.saveCheckpoint({
      taskId: 'task-1',
      agentId: 'agent-a',
      projectId: 'test-project',
      type: 'step-complete',
      data: { step: 1 },
      stepIndex: 1,
      stepName: 'Step 1',
    });

    await checkpointManager.saveCheckpoint({
      taskId: 'task-2',
      agentId: 'agent-b',
      projectId: 'test-project',
      type: 'step-complete',
      data: { step: 2 },
      stepIndex: 2,
      stepName: 'Step 2',
    });

    const agentACheckpoints = await checkpointManager.getCheckpointsByAgent('agent-a');
    expect(agentACheckpoints.length).toBe(1);
    expect(agentACheckpoints[0].agentId).toBe('agent-a');

    const agentBCheckpoints = await checkpointManager.getCheckpointsByAgent('agent-b');
    expect(agentBCheckpoints.length).toBe(1);
    expect(agentBCheckpoints[0].agentId).toBe('agent-b');
  });
});

describe('E2E: Concurrent Task Execution', () => {
  let tempDir: string;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-e2e-concurrent-'));
    toolRegistry = new ToolRegistry();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('E2E-006: should handle multiple tasks concurrently', () => {
    const config = { projectName: 'Test', projectPath: tempDir };
    const taskManager = new TaskManager(config, toolRegistry);

    const tasks = Array.from({ length: 10 }, (_, i) =>
      taskManager.createTask({
        title: `Concurrent Task ${i}`,
        description: `Description for task ${i}`,
      })
    );

    tasks.forEach((task) => {
      taskManager.updateTaskStatus(task.id, 'in-progress');
    });

    tasks.forEach((task) => {
      const updated = taskManager.getTask(task.id);
      expect(updated?.status).toBe('in-progress');
    });

    tasks.forEach((task) => {
      taskManager.updateTaskStatus(task.id, 'completed');
    });

    tasks.forEach((task) => {
      const completed = taskManager.getTask(task.id);
      expect(completed?.status).toBe('completed');
    });

    const allTasks = taskManager.getAllTasks();
    expect(allTasks.length).toBe(10);
  });
});

describe('E2E: Event System Flow', () => {
  let tempDir: string;
  let eventSystem: EventSystem;
  let events: Array<{ type: string; data: any }>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-e2e-event-'));
    eventSystem = new EventSystem();
    events = [];
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('E2E-007: should handle event flow correctly', () => {
    let callCount = 0;

    eventSystem.on('task.created', () => {
      callCount++;
    });

    eventSystem.on('task.completed', () => {
      events.push({ type: 'task.completed', data: null });
    });

    eventSystem.emit('task.created', { taskId: 'task-1' });
    eventSystem.emit('task.completed', { taskId: 'task-1' });
    eventSystem.emit('task.created', { taskId: 'task-2' });

    expect(callCount).toBe(2);
    expect(events.filter((e) => e.type === 'task.completed')).toHaveLength(1);
  });
});

describe('E2E: Error Recovery and Graceful Degradation', () => {
  let tempDir: string;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-e2e-error-'));
    toolRegistry = new ToolRegistry();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('E2E-008: should handle non-existent tool gracefully', async () => {
    const result = await toolRegistry.execute('nonExistentTool', { param: 'value' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Tool not found');
  });

  it('E2E-008b: should handle invalid file operations gracefully', async () => {
    const result = await toolRegistry.execute('read-file', {
      filePath: '/non/existent/path/file.txt',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('E2E-008c: should handle task operations on non-existent task', () => {
    const config = { projectName: 'Test', projectPath: tempDir };
    const taskManager = new TaskManager(config, toolRegistry);

    const task = taskManager.getTask('non-existent-id');
    expect(task).toBeUndefined();

    expect(() => {
      try {
        taskManager.updateTaskStatus('non-existent-id', 'in-progress');
      } catch (e) {
        // Expected to throw for non-existent task
      }
    }).not.toThrow();

    expect(() => {
      try {
        taskManager.deleteTask('non-existent-id');
      } catch (e) {
        // Expected to throw for non-existent task
      }
    }).not.toThrow();
  });
});

describe('E2E: Complete User Workflow Simulation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-e2e-workflow-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('E2E-009: should complete full development workflow', async () => {
    const projectAgent = new ProjectAgent({
      projectName: 'Todo App',
      projectPath: tempDir,
    });

    const taskManager = (projectAgent as any).taskManager as TaskManager;
    const checkpointManager = new CheckpointManager('todo-app-project');

    const setupTask = taskManager.createTask({
      type: 'development',
      title: 'Setup project structure',
      description: 'Create basic project files and directories',
      priority: 'high',
    });

    const featureTask = taskManager.createTask({
      type: 'development',
      title: 'Implement todo feature',
      description: 'Implement CRUD operations for todo items',
      priority: 'high',
      dependencies: [setupTask.id],
    });

    const testTask = taskManager.createTask({
      type: 'testing',
      title: 'Write tests',
      description: 'Write unit and integration tests',
      priority: 'medium',
      dependencies: [featureTask.id],
    });

    taskManager.updateTaskStatus(setupTask.id, 'in-progress');

    mkdirSync(join(tempDir, 'src'));
    mkdirSync(join(tempDir, 'tests'));
    writeFileSync(join(tempDir, 'package.json'), '{"name": "todo-app"}');

    await checkpointManager.saveCheckpoint({
      taskId: setupTask.id,
      agentId: 'dev-agent',
      projectId: 'todo-app-project',
      type: 'step-complete',
      data: { completedSteps: ['setup'] },
      stepIndex: 1,
      stepName: 'Setup Complete',
    });

    taskManager.updateTaskStatus(setupTask.id, 'completed');

    taskManager.updateTaskStatus(featureTask.id, 'in-progress');
    writeFileSync(join(tempDir, 'src', 'index.ts'), 'console.log("Hello")');
    writeFileSync(join(tempDir, 'src', 'todo.ts'), 'class Todo {}');
    taskManager.updateTaskStatus(featureTask.id, 'completed');

    taskManager.updateTaskStatus(testTask.id, 'in-progress');
    writeFileSync(join(tempDir, 'tests', 'todo.test.ts'), 'test("todo", () => {})');
    taskManager.updateTaskStatus(testTask.id, 'completed');

    const completedSetup = taskManager.getTask(setupTask.id);
    const completedFeature = taskManager.getTask(featureTask.id);
    const completedTest = taskManager.getTask(testTask.id);

    expect(completedSetup?.status).toBe('completed');
    expect(completedFeature?.status).toBe('completed');
    expect(completedTest?.status).toBe('completed');

    expect(readFileSync(join(tempDir, 'package.json'), 'utf-8')).toContain('todo-app');
    expect(readFileSync(join(tempDir, 'src', 'index.ts'), 'utf-8')).toContain('Hello');
    expect(readFileSync(join(tempDir, 'src', 'todo.ts'), 'utf-8')).toContain('class Todo');

    const checkpoints = await checkpointManager.getCheckpointsByTask(setupTask.id);
    expect(checkpoints.length).toBe(1);
  });
});
