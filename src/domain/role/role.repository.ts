import type { Role } from '../agent/agent.entity.js';
import type { IFileStore } from '../../infrastructure/file-store/index.js';

export interface IRoleRepository {
  save(role: Role): Promise<void>;
  findById(id: string): Promise<Role | null>;
  list(): Promise<Role[]>;
  delete(id: string): Promise<void>;
}

/**
 * 持久化自定义角色：`{dataPath}/roles/{id}.json`
 */
export class RoleRepository implements IRoleRepository {
  private basePath = 'roles';

  constructor(private fileStore: IFileStore) {}

  async save(role: Role): Promise<void> {
    const p = `${this.basePath}/${role.id}.json`;
    await this.fileStore.write(p, JSON.stringify(role, null, 2));
  }

  async findById(id: string): Promise<Role | null> {
    const p = `${this.basePath}/${id}.json`;
    try {
      const text = await this.fileStore.readText(p);
      return JSON.parse(text) as Role;
    } catch {
      return null;
    }
  }

  async list(): Promise<Role[]> {
    const files = await this.fileStore.list(this.basePath);
    const out: Role[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const text = await this.fileStore.readText(`${this.basePath}/${file}`);
        out.push(JSON.parse(text) as Role);
      } catch {
        // skip
      }
    }
    return out;
  }

  async delete(id: string): Promise<void> {
    await this.fileStore.delete(`${this.basePath}/${id}.json`);
  }
}
