import { Agent, Role } from './agent.entity.js';
import { IFileStore } from '../../infrastructure/file-store/index.js';
import { generateId } from '../../infrastructure/utils/id.js';

export interface IAgentRepository {
  save(agent: Agent): Promise<void>;
  findById(id: string): Promise<Agent | null>;
  findByTaskId(taskId: string): Promise<Agent[]>;
  delete(id: string): Promise<void>;
}

export class AgentRepository implements IAgentRepository {
  private basePath = 'agents';

  constructor(private fileStore: IFileStore) {}

  async save(agent: Agent): Promise<void> {
    const agentPath = `${this.basePath}/${agent.id}.json`;
    await this.fileStore.write(agentPath, JSON.stringify(agent, null, 2));
  }

  async findById(id: string): Promise<Agent | null> {
    const agentPath = `${this.basePath}/${id}.json`;
    
    try {
      const content = await this.fileStore.readText(agentPath);
      return JSON.parse(content) as Agent;
    } catch {
      return null;
    }
  }

  async findByTaskId(taskId: string): Promise<Agent[]> {
    const files = await this.fileStore.list(this.basePath);
    const agents: Agent[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      try {
        const content = await this.fileStore.readText(`${this.basePath}/${file}`);
        const agent = JSON.parse(content) as Agent;
        
        if (agent.taskId === taskId) {
          agents.push(agent);
        }
      } catch {
        // 忽略读取错误
      }
    }

    return agents;
  }

  async delete(id: string): Promise<void> {
    const agentPath = `${this.basePath}/${id}.json`;
    await this.fileStore.delete(agentPath);
  }
}
