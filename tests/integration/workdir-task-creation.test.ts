import { describe, it, expect, beforeEach } from 'vitest';
import { TaskManager } from '../../src/core/task-manager.js';
import { ToolRegistry } from '../../src/tools/tool-registry.js';
import { WorkDirManager } from '../../src/core/work-dir-manager.js';

describe('WorkDir Task Creation Integration', () => {
  let taskManager: TaskManager;
  let toolRegistry: ToolRegistry;
  let workDirManager: WorkDirManager;

  beforeEach(() => {
    workDirManager = new WorkDirManager();
    toolRegistry = new ToolRegistry(workDirManager);
    taskManager = new TaskManager({
      projectName: 'Test Project',
      projectPath: '/test',
    }, toolRegistry);
  });

  it('should create work dir when task is created with workDir config', () => {
    const task = taskManager.createTask({
      title: 'Test Task',
      description: 'Test description',
      input: {
        workDir: { basePath: 'workspace' },
      },
    });

    expect(task.input.workDirState).toBeDefined();
    expect(task.input.workDirState.rootPath).toContain('workspace/');
    expect(task.input.workDirState.rootPath).toContain(task.id);
    expect(task.input.workDirState.taskId).toBe(task.id);
    expect(task.input.workDirState.structure).toBeDefined();
    expect(task.input.workDirState.structure.root).toBe(task.input.workDirState.rootPath);
  });

  it('should create custom path work dir', () => {
    const task = taskManager.createTask({
      title: 'Custom Path Task',
      description: 'Custom path',
      input: {
        workDir: { path: './my-custom-path' },
      },
    });

    expect(task.input.workDirState).toBeDefined();
    expect(task.input.workDirState.rootPath).toBe('./my-custom-path');
  });

  it('should not create work dir when not configured', () => {
    const task = taskManager.createTask({
      title: 'No WorkDir Task',
      description: 'No workdir',
    });

    expect(task.input.workDirState).toBeUndefined();
  });

  it('should create work dir with custom template', () => {
    const task = taskManager.createTask({
      title: 'Custom Template Task',
      description: 'Custom template',
      input: {
        workDir: {
          basePath: 'custom-workspace',
          template: 'default',
        },
      },
    });

    expect(task.input.workDirState).toBeDefined();
    expect(task.input.workDirState.rootPath).toContain('custom-workspace/');
    expect(task.input.workDirState.rootPath).toContain(task.id);
  });

  it('should create work dir with minimal template', () => {
    const task = taskManager.createTask({
      title: 'Minimal Template Task',
      description: 'Minimal template',
      input: {
        workDir: {
          basePath: 'minimal-workspace',
          template: 'minimal',
        },
      },
    });

    expect(task.input.workDirState).toBeDefined();
    expect(task.input.workDirState.rootPath).toContain('minimal-workspace/');
  });

  it('should preserve work dir when configured', () => {
    const task = taskManager.createTask({
      title: 'Preserve WorkDir Task',
      description: 'Preserve workdir',
      input: {
        workDir: {
          basePath: 'preserve-workspace',
          preserve: true,
        },
      },
    });

    expect(task.input.workDirState).toBeDefined();
    expect(task.input.workDirState.preserve).toBe(true);
  });

  it('should create work dir structure with all directories', () => {
    const task = taskManager.createTask({
      title: 'Structure Test Task',
      description: 'Structure test',
      input: {
        workDir: { basePath: 'structure-workspace' },
      },
    });

    const structure = task.input.workDirState.structure;
    expect(structure.src).toBeDefined();
    expect(structure.tests).toBeDefined();
    expect(structure.docs).toBeDefined();
    expect(structure.output).toBeDefined();
    expect(structure.state).toBeDefined();
  });
});
