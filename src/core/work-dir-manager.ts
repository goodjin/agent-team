import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import type { WorkDirConfig, WorkDirState, WorkDirStructure, WorkDirMeta, PathValidationResult } from '../types/work-dir.js';

const DEFAULT_BASE_PATH = 'workspace';
const DIRECTORIES = ['src', 'tests', 'docs', 'output', '.agent-state'];

export class WorkDirManager {
  private states: Map<string, WorkDirState> = new Map();

  createWorkDirSync(config: WorkDirConfig): WorkDirState {
    const basePath = config.basePath || DEFAULT_BASE_PATH;
    const rootPath = config.customPath || path.resolve(basePath, config.taskId);
    const template = config.template || 'default';

    const structure = this.buildStructure(rootPath);

    const state: WorkDirState = {
      taskId: config.taskId,
      rootPath,
      structure,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      files: [],
      metadata: {
        totalSize: 0,
        fileCount: 0,
      },
      preserve: config.preserve || false,
    };

    this.createDirectoriesSync(structure, config);

    if (template === 'custom' && config.customDirs) {
      for (const dir of config.customDirs) {
        const fullPath = path.resolve(rootPath, dir);
        fsSync.mkdirSync(fullPath, { recursive: true });
        structure[dir as keyof WorkDirStructure] = fullPath;
      }
    }

    this.writeMetaSync(state, template);

    this.states.set(config.taskId, state);
    return state;
  }

  async createWorkDir(config: WorkDirConfig): Promise<WorkDirState> {
    const basePath = config.basePath || DEFAULT_BASE_PATH;
    const rootPath = config.customPath || path.resolve(basePath, config.taskId);
    const template = config.template || 'default';

    const structure = this.buildStructure(rootPath);

    const state: WorkDirState = {
      taskId: config.taskId,
      rootPath,
      structure,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      files: [],
      metadata: {
        totalSize: 0,
        fileCount: 0,
      },
      preserve: config.preserve || false,
    };

    await this.createDirectories(structure, config);

    if (template === 'custom' && config.customDirs) {
      for (const dir of config.customDirs) {
        const fullPath = path.resolve(rootPath, dir);
        await fs.mkdir(fullPath, { recursive: true });
        structure[dir as keyof WorkDirStructure] = fullPath;
      }
    }

    await this.writeMeta(state, template);

    this.states.set(config.taskId, state);
    return state;
  }

  private buildStructure(rootPath: string): WorkDirStructure {
    return {
      root: rootPath,
      src: path.resolve(rootPath, 'src'),
      tests: path.resolve(rootPath, 'tests'),
      docs: path.resolve(rootPath, 'docs'),
      output: path.resolve(rootPath, 'output'),
      state: path.resolve(rootPath, '.agent-state'),
    };
  }

  private createDirectoriesSync(structure: WorkDirStructure, config: WorkDirConfig): void {
    const dirs = config.template === 'minimal'
      ? ['src', 'tests', '.agent-state']
      : DIRECTORIES;

    for (const dir of dirs) {
      const dirPath = dir === '.agent-state' ? structure.state : path.resolve(structure.root, dir);
      fsSync.mkdirSync(dirPath, { recursive: true });
    }
  }

  private writeMetaSync(state: WorkDirState, template: string): void {
    const meta: WorkDirMeta = {
      taskId: state.taskId,
      createdAt: state.createdAt.toISOString(),
      lastAccessedAt: state.lastAccessedAt.toISOString(),
      template,
    };

    const metaPath = path.resolve(state.structure.state, 'meta.json');
    fsSync.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }

  private async createDirectories(structure: WorkDirStructure, config: WorkDirConfig): Promise<void> {
    const dirs = config.template === 'minimal'
      ? ['src', 'tests', '.agent-state']
      : DIRECTORIES;

    for (const dir of dirs) {
      const dirPath = dir === '.agent-state' ? structure.state : path.resolve(structure.root, dir);
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  private async writeMeta(state: WorkDirState, template: string): Promise<void> {
    const meta: WorkDirMeta = {
      taskId: state.taskId,
      createdAt: state.createdAt.toISOString(),
      lastAccessedAt: state.lastAccessedAt.toISOString(),
      template,
    };

    const metaPath = path.resolve(state.structure.state, 'meta.json');
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
  }

  async validatePath(taskId: string, filePath: string): Promise<PathValidationResult> {
    const state = this.states.get(taskId);
    if (!state) {
      return { valid: false, error: '任务工作目录不存在' };
    }

    const resolved = path.resolve(filePath);
    const prefix = state.rootPath + path.sep;

    if (resolved !== state.rootPath && !resolved.startsWith(prefix)) {
      return { valid: false, error: '路径越界' };
    }

    return { valid: true };
  }

  getWorkDir(taskId: string): WorkDirState | undefined {
    return this.states.get(taskId);
  }

  async cleanupWorkDir(taskId: string): Promise<void> {
    const state = this.states.get(taskId);
    if (!state) {
      return;
    }

    if (!state.preserve) {
      await fs.rm(state.rootPath, { recursive: true, force: true });
    }

    this.states.delete(taskId);
  }

  updateAccessTime(taskId: string): void {
    const state = this.states.get(taskId);
    if (state) {
      state.lastAccessedAt = new Date();
    }
  }
}
