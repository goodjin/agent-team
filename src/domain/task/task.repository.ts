import { Task, CreateTaskParams } from './task.entity.js';
import { IFileStore } from '../../infrastructure/file-store/index.js';
import { generateId } from '../../infrastructure/utils/id.js';

export interface ITaskRepository {
  save(task: Task): Promise<void>;
  findById(id: string): Promise<Task | null>;
  findAll(options?: { status?: Task['status']; parentId?: string }): Promise<Task[]>;
  findByParentId(parentId: string): Promise<Task[]>;
  delete(id: string): Promise<void>;
}

export class TaskRepository implements ITaskRepository {
  private indexCache: Map<string, string> = new Map();
  private indexPath = 'tasks/index.json';

  constructor(private fileStore: IFileStore) {}

  private async loadIndex(): Promise<Map<string, string>> {
    try {
      const content = await this.fileStore.readText(this.indexPath);
      const index = JSON.parse(content);
      return new Map(Object.entries(index));
    } catch {
      return new Map();
    }
  }

  private async saveIndex(index: Map<string, string>): Promise<void> {
    const obj = Object.fromEntries(index);
    await this.fileStore.write(this.indexPath, JSON.stringify(obj, null, 2));
  }

  async save(task: Task): Promise<void> {
    const taskPath = `tasks/${task.id}.json`;
    await this.fileStore.write(taskPath, JSON.stringify(task, null, 2));

    const index = await this.loadIndex();
    index.set(task.id, taskPath);
    await this.saveIndex(index);
    this.indexCache = index;
  }

  async findById(id: string): Promise<Task | null> {
    const index = this.indexCache.size > 0 ? this.indexCache : await this.loadIndex();
    const taskPath = index.get(id);

    if (!taskPath) return null;

    try {
      const content = await this.fileStore.readText(taskPath);
      return JSON.parse(content) as Task;
    } catch {
      return null;
    }
  }

  async findAll(options?: { status?: Task['status']; parentId?: string }): Promise<Task[]> {
    const index = await this.loadIndex();
    const tasks: Task[] = [];

    for (const [id, taskPath] of index) {
      try {
        const content = await this.fileStore.readText(taskPath);
        const task = JSON.parse(content) as Task;

        if (options?.status && task.status !== options.status) continue;
        if (options?.parentId !== undefined && task.parentId !== options.parentId) continue;

        tasks.push(task);
      } catch {
        // 忽略读取错误
      }
    }

    return tasks.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async findByParentId(parentId: string): Promise<Task[]> {
    return this.findAll({ parentId });
  }

  async delete(id: string): Promise<void> {
    const index = await this.loadIndex();
    const taskPath = index.get(id);

    if (taskPath) {
      await this.fileStore.delete(taskPath);
      index.delete(id);
      await this.saveIndex(index);
      this.indexCache = index;
    }
  }
}
