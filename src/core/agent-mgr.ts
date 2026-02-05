/**
 * Agent Manager
 * Manages agent lifecycle, creation, monitoring, and restart
 */

import { v4 as uuidv4 } from 'uuid';
import type { Agent, AgentStatus } from '../types/index.js';
import { EventSystem, type Event } from './events.js';

export interface AgentConfig {
  roleId: string;
  projectId: string;
  name?: string;
  llmProvider?: string;
  llmModel?: string;
}

export interface AgentCheckResult {
  status: AgentStatus;
  lastActiveAt: Date;
  needsRestart: boolean;
  error?: string;
}

export interface HeartbeatData {
  agentId: string;
  timestamp: Date;
  load: number;
  memoryUsage?: number;
}

export type AgentEventType =
  | 'agent.created'
  | 'agent.deleted'
  | 'agent.status.changed'
  | 'agent.restarted'
  | 'agent.heartbeat'
  | 'agent.health.failed'
  | 'agent.auto-restarted'
  | 'agent.monitoring.started'
  | 'agent.monitoring.stopped';

export class AgentMgr {
  private agents: Map<string, Agent> = new Map();
  private projectId: string;
  private eventSystem: EventSystem;
  private INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private persistencePath: string | null = null;
  private restartFailedAgents: boolean = true;
  private maxRestartAttempts: number = 3;

  constructor(projectId: string, eventSystem: EventSystem) {
    this.projectId = projectId;
    this.eventSystem = eventSystem;
  }

  configure(options: {
    persistencePath?: string;
    restartFailedAgents?: boolean;
    maxRestartAttempts?: number;
    inactivityThresholdMs?: number;
  }): void {
    if (options.persistencePath !== undefined) {
      this.persistencePath = options.persistencePath;
    }
    if (options.restartFailedAgents !== undefined) {
      this.restartFailedAgents = options.restartFailedAgents;
    }
    if (options.maxRestartAttempts !== undefined) {
      this.maxRestartAttempts = options.maxRestartAttempts;
    }
    if (options.inactivityThresholdMs !== undefined) {
      this.INACTIVITY_THRESHOLD_MS = options.inactivityThresholdMs;
    }
  }

  startMonitoring(intervalMs: number = 30000): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      this.processHeartbeats();
    }, intervalMs);

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.runHealthChecks();
    }, intervalMs * 2);

    this.eventSystem.emit('agent.monitoring.started', {
      type: 'agent.monitoring.started',
      data: { intervalMs },
      timestamp: new Date(),
    });
  }

  stopMonitoring(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.eventSystem.emit('agent.monitoring.stopped', {
      type: 'agent.monitoring.stopped',
      data: {},
      timestamp: new Date(),
    });
  }

  private async processHeartbeats(): Promise<void> {
    for (const agent of this.agents.values()) {
      if (agent.status === 'running') {
        this.markActive(agent.id);

        this.eventSystem.emit('agent.heartbeat', {
          type: 'agent.heartbeat',
          data: {
            agentId: agent.id,
            timestamp: new Date(),
            agent,
          },
          timestamp: new Date(),
        });
      }
    }
  }

  private async runHealthChecks(): Promise<void> {
    for (const agent of this.agents.values()) {
      try {
        const result = await this.checkAgentStatus(agent.id);

        if (result.needsRestart && this.restartFailedAgents) {
          const canRestart = agent.metadata.restartCount < this.maxRestartAttempts;
          if (canRestart) {
            await this.restartAgent(agent.id);

            this.eventSystem.emit('agent.auto-restarted', {
              type: 'agent.auto-restarted',
              data: {
                agent,
                reason: 'health check failed',
                restartCount: agent.metadata.restartCount,
              },
              timestamp: new Date(),
            });
          } else {
            await this.setAgentStatus(agent.id, 'stopped');

            this.eventSystem.emit('agent.health.failed', {
              type: 'agent.health.failed',
              data: {
                agent,
                reason: 'max restart attempts reached',
              },
              timestamp: new Date(),
            });
          }
        }
      } catch (error: any) {
        console.error(`Health check failed for agent ${agent.id}:`, error.message);

        this.eventSystem.emit('agent.health.failed', {
          type: 'agent.health.failed',
          data: {
            agentId: agent.id,
            error: error.message,
          },
          timestamp: new Date(),
        });
      }
    }
  }

  async saveState(): Promise<void> {
    if (!this.persistencePath) {
      return;
    }

    try {
      const fs = await import('fs');
      const path = await import('path');

      const state = {
        agents: Array.from(this.agents.values()),
        savedAt: new Date().toISOString(),
      };

      const dir = path.dirname(this.persistencePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.persistencePath, JSON.stringify(state, null, 2));
    } catch (error: any) {
      console.error('Failed to save agent state:', error.message);
    }
  }

  async loadState(): Promise<void> {
    if (!this.persistencePath) {
      return;
    }

    try {
      const fs = await import('fs');
      const path = await import('path');

      if (!fs.existsSync(this.persistencePath)) {
        return;
      }

      const data = JSON.parse(fs.readFileSync(this.persistencePath, 'utf-8'));
      const savedAt = new Date(data.savedAt);

      for (const agentData of data.agents || []) {
        const savedAgent: Agent = {
          ...agentData,
          metadata: {
            ...agentData.metadata,
            createdAt: new Date(agentData.metadata.createdAt),
            lastActiveAt: new Date(agentData.metadata.lastActiveAt),
          },
        };

        const timeSinceSave = Date.now() - savedAt.getTime();
        if (timeSinceSave > this.INACTIVITY_THRESHOLD_MS && savedAgent.status === 'running') {
          savedAgent.status = 'stopped';
        }

        this.agents.set(savedAgent.id, savedAgent);
      }

      console.log(`Loaded ${this.agents.size} agents from state file`);
    } catch (error: any) {
      console.error('Failed to load agent state:', error.message);
    }
  }

  on(eventType: AgentEventType, handler: (event: Event) => void | Promise<void>): void {
    this.eventSystem.on(eventType as any, handler);
  }

  async createAgent(config: AgentConfig): Promise<Agent> {
    const agent: Agent = {
      id: uuidv4(),
      roleId: config.roleId,
      projectId: config.projectId || this.projectId,
      name: config.name || `${config.roleId}-agent`,
      status: 'idle',
      llmProvider: config.llmProvider,
      llmModel: config.llmModel,
      metadata: {
        createdAt: new Date(),
        lastActiveAt: new Date(),
        restartCount: 0,
      },
    };

    this.agents.set(agent.id, agent);

    this.eventSystem.emit('agent.created', {
      type: 'agent.created',
      data: { agent },
      timestamp: new Date(),
    });

    await this.saveState();

    return agent;
  }

  getAgent(id: string): Agent | null {
    return this.agents.get(id) || null;
  }

  getAgentsByRole(roleId: string): Agent[] {
    return Array.from(this.agents.values()).filter(a => a.roleId === roleId);
  }

  getAgentsByStatus(status: AgentStatus): Agent[] {
    return Array.from(this.agents.values()).filter(a => a.status === status);
  }

  async getAgents(filters?: {
    projectId?: string;
    roleId?: string;
    status?: AgentStatus;
  }): Promise<Agent[]> {
    let agents = Array.from(this.agents.values());

    if (filters?.projectId) {
      agents = agents.filter(a => a.projectId === filters.projectId);
    }
    if (filters?.roleId) {
      agents = agents.filter(a => a.roleId === filters.roleId);
    }
    if (filters?.status) {
      agents = agents.filter(a => a.status === filters.status);
    }

    return agents;
  }

  async setAgentStatus(id: string, status: AgentStatus): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }

    const oldStatus = agent.status;
    agent.status = status;
    agent.metadata.lastActiveAt = new Date();

    if (status === 'running') {
      agent.currentTaskId = undefined;
    }

    this.eventSystem.emit('agent.status.changed', {
      type: 'agent.status.changed',
      data: { agent, oldStatus, newStatus: status },
      timestamp: new Date(),
    });

    await this.saveState();
  }

  async setCurrentTask(id: string, taskId: string | null): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }

    agent.currentTaskId = taskId || undefined;
    agent.metadata.lastActiveAt = new Date();

    if (taskId) {
      agent.status = 'running';
    } else {
      agent.status = 'idle';
    }

    await this.saveState();
  }

  async restartAgent(id: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }

    agent.status = 'idle';
    agent.currentTaskId = undefined;
    agent.metadata.restartCount++;
    agent.metadata.lastActiveAt = new Date();

    this.eventSystem.emit('agent.restarted', {
      type: 'agent.restarted',
      data: { agent },
      timestamp: new Date(),
    });

    await this.saveState();
  }

  async checkAgentStatus(id: string): Promise<AgentCheckResult> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }

    const now = new Date();
    const lastActive = new Date(agent.metadata.lastActiveAt);
    const inactiveDuration = now.getTime() - lastActive.getTime();
    const needsRestart = inactiveDuration > this.INACTIVITY_THRESHOLD_MS;

    let status = agent.status;
    if (needsRestart && agent.status === 'running') {
      status = 'stopped';
      agent.status = 'stopped';
    }

    return {
      status,
      lastActiveAt: agent.metadata.lastActiveAt,
      needsRestart,
    };
  }

  async incrementRestartCount(id: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }

    agent.metadata.restartCount++;
    await this.saveState();
  }

  async deleteAgent(id: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }

    this.agents.delete(id);

    this.eventSystem.emit('agent.deleted', {
      type: 'agent.deleted',
      data: { agentId: id },
      timestamp: new Date(),
    });

    await this.saveState();
  }

  getStats(): {
    total: number;
    byStatus: Record<AgentStatus, number>;
  } {
    const byStatus: Record<AgentStatus, number> = {
      idle: 0,
      running: 0,
      stopped: 0,
    };

    for (const agent of this.agents.values()) {
      byStatus[agent.status]++;
    }

    return {
      total: this.agents.size,
      byStatus,
    };
  }

  markActive(id: string): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.metadata.lastActiveAt = new Date();
    }
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }
}



