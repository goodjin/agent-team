// Agent 能力注册表
// Phase 2: 协作能力增强

import { Capability, AgentCapability } from './types';

export class CapabilityRegistry {
  private agents: Map<string, AgentCapability> = new Map();

  /**
   * 注册 Agent 能力
   */
  register(agentId: string, capabilities: Capability[]): void {
    const existing = this.agents.get(agentId);
    const now = new Date();
    
    if (existing) {
      existing.capabilities = capabilities;
      existing.lastUpdated = now;
    } else {
      this.agents.set(agentId, {
        agentId,
        capabilities,
        registeredAt: now,
        lastUpdated: now
      });
    }
  }

  /**
   * 查询匹配的能力
   */
  findMatching(query: string): AgentCapability[] {
    const queryLower = query.toLowerCase();
    const results: AgentCapability[] = [];
    
    for (const agent of this.agents.values()) {
      // Find any matching non-deprecated capability
      const match = agent.capabilities.find(cap => 
        (cap.name.toLowerCase().includes(queryLower) ||
        cap.description.toLowerCase().includes(queryLower) ||
        cap.tags.some(tag => tag.toLowerCase().includes(queryLower))) &&
        !cap.deprecated
      );
      
      if (match) {
        results.push(agent);
      }
    }
    
    return results;
  }

  /**
   * 获取 Agent 的能力
   */
  get(agentId: string): AgentCapability | undefined {
    return this.agents.get(agentId);
  }

  /**
   * 获取所有已注册的 Agent
   */
  getAll(): AgentCapability[] {
    return Array.from(this.agents.values());
  }

  /**
   * 更新能力
   */
  update(agentId: string, capabilities: Capability[]): boolean {
    if (!this.agents.has(agentId)) {
      return false;
    }
    
    this.register(agentId, capabilities);
    return true;
  }

  /**
   * 注销 Agent
   */
  unregister(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  /**
   * 检查 Agent 是否已注册
   */
  isRegistered(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  /**
   * 获取非deprecated的能力列表
   */
  getActiveCapabilities(): AgentCapability[] {
    return this.getAll().map(agent => ({
      ...agent,
      capabilities: agent.capabilities.filter(cap => !cap.deprecated)
    })).filter(agent => agent.capabilities.length > 0);
  }

  /**
   * 统计信息
   */
  getStats(): { totalAgents: number; totalCapabilities: number } {
    let totalCapabilities = 0;
    for (const agent of this.agents.values()) {
      totalCapabilities += agent.capabilities.filter(c => !c.deprecated).length;
    }
    return {
      totalAgents: this.agents.size,
      totalCapabilities
    };
  }
}

// 导出单例
export const capabilityRegistry = new CapabilityRegistry();
