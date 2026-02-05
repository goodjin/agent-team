import type { PersistedTask } from '../types/persistence.js';
import type { TaskStorage, StorageMetadata } from '../types/storage.js';

export interface PersistenceConfig {
  storagePath: string;
  backupPath?: string;
  autoSaveIntervalMs: number;
  maxBackupCount: number;
}

export class TaskPersistence {
  private config: PersistenceConfig;
  private pendingWrites: Map<string, Promise<void>> = new Map();
  private saveInterval?: NodeJS.Timeout;
  private taskGetter?: () => PersistedTask[];

  constructor(config: PersistenceConfig) {
    this.config = config;
  }

  setTaskGetter(getter: () => PersistedTask[]): void {
    this.taskGetter = getter;
  }

  async saveTask(task: PersistedTask): Promise<void> {
    const storage = await this.loadStorage();
    storage.tasks.set(task.id, task);
    storage.lastSavedAt = new Date();
    await this.saveStorage(storage);
  }

  async saveTasks(tasks: PersistedTask[]): Promise<void> {
    const storage = await this.loadStorage();
    for (const task of tasks) {
      storage.tasks.set(task.id, task);
    }
    storage.lastSavedAt = new Date();
    await this.saveStorage(storage);
  }

  async loadTasks(): Promise<PersistedTask[]> {
    const storage = await this.loadStorage();
    return Array.from(storage.tasks.values());
  }

  async deleteTask(taskId: string): Promise<void> {
    const storage = await this.loadStorage();
    storage.tasks.delete(taskId);
    await this.saveStorage(storage);
  }

  async clear(): Promise<void> {
    const storage = await this.loadStorage();
    storage.tasks.clear();
    storage.taskOrder = [];
    await this.saveStorage(storage);
  }

  startAutoSave(): void {
    if (!this.taskGetter) return;

    this.saveInterval = setInterval(async () => {
      try {
        await this.saveTasks(this.taskGetter!());
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, this.config.autoSaveIntervalMs);
  }

  stopAutoSave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
  }

  private async loadStorage(): Promise<TaskStorage> {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const data = await fs.readFile(this.config.storagePath, 'utf-8');
      const parsed = JSON.parse(data);

      const tasks = new Map<string, PersistedTask>(Object.entries(parsed.tasks || {}));

      return {
        version: parsed.version || '1.0',
        lastSavedAt: new Date(parsed.lastSavedAt),
        tasks,
        taskOrder: parsed.taskOrder || [],
        metadata: parsed.metadata || {
          totalTasks: tasks.size,
          completedTasks: 0,
          failedTasks: 0,
          totalExecutions: 0,
        },
      };
    } catch {
      return {
        version: '1.0',
        lastSavedAt: new Date(),
        tasks: new Map(),
        taskOrder: [],
        metadata: {
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          totalExecutions: 0,
        },
      };
    }
  }

  private async saveStorage(storage: TaskStorage): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const storageDir = path.dirname(this.config.storagePath);
    await fs.mkdir(storageDir, { recursive: true });

    const tempPath = `${this.config.storagePath}.tmp`;
    const data = JSON.stringify({
      version: storage.version,
      lastSavedAt: storage.lastSavedAt.toISOString(),
      tasks: Object.fromEntries(storage.tasks),
      taskOrder: storage.taskOrder,
      metadata: storage.metadata,
    }, null, 2);

    await fs.writeFile(tempPath, data, 'utf-8');
    await fs.rename(tempPath, this.config.storagePath);

    if (this.config.backupPath) {
      await this.createBackup();
    }
  }

  private async createBackup(): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    if (!this.config.backupPath) return;

    const timestamp = Date.now();
    const backupPath = path.join(this.config.backupPath, `tasks.${timestamp}.json`);

    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.copyFile(this.config.storagePath, backupPath);

    await this.cleanupOldBackups();
  }

  private async cleanupOldBackups(): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    if (!this.config.backupPath) return;

    try {
      const files = await fs.readdir(this.config.backupPath);
      const backups = files.filter(f => f.startsWith('tasks.')).sort().reverse();

      for (const file of backups.slice(this.config.maxBackupCount)) {
        await fs.unlink(path.join(this.config.backupPath, file));
      }
    } catch {
      // Directory does not exist, ignore
    }
  }
}
