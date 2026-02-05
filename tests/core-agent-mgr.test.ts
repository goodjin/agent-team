import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentMgr } from '../src/core/agent-mgr.js';
import { EventSystem } from '../src/core/events.js';
import type { AgentStatus } from '../src/types/index.js';

describe('AgentMgr', () => {
  let agentMgr: AgentMgr;
  let eventSystem: EventSystem;

  beforeEach(() => {
    eventSystem = new EventSystem();
    agentMgr = new AgentMgr('project-123', eventSystem);
  });

  describe('createAgent', () => {
    it('should create an agent with default name', async () => {
      const agent = await agentMgr.createAgent({
        roleId: 'developer',
        projectId: 'project-123',
      });
      
      expect(agent.id).toBeDefined();
      expect(agent.roleId).toBe('developer');
      expect(agent.projectId).toBe('project-123');
      expect(agent.name).toBe('developer-agent');
      expect(agent.status).toBe('idle');
    });

    it('should create an agent with custom name', async () => {
      const agent = await agentMgr.createAgent({
        roleId: 'developer',
        projectId: 'project-123',
        name: 'my-custom-agent',
      });
      
      expect(agent.name).toBe('my-custom-agent');
    });

    it('should emit agent.created event', async () => {
      const eventHandler = vi.fn();
      eventSystem.on('agent.created' as any, eventHandler);
      
      await agentMgr.createAgent({
        roleId: 'developer',
        projectId: 'project-123',
      });
      
      expect(eventHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAgent', () => {
    it('should return null for non-existent agent', () => {
      const agent = agentMgr.getAgent('non-existent');
      
      expect(agent).toBeNull();
    });

    it('should return agent by id', async () => {
      const created = await agentMgr.createAgent({
        roleId: 'developer',
        projectId: 'project-123',
      });
      
      const retrieved = agentMgr.getAgent(created.id);
      
      expect(retrieved).toEqual(created);
    });
  });

  describe('getAgentsByRole', () => {
    it('should return agents filtered by role', async () => {
      await agentMgr.createAgent({ roleId: 'developer', projectId: 'project-123' });
      await agentMgr.createAgent({ roleId: 'developer', projectId: 'project-123' });
      await agentMgr.createAgent({ roleId: 'architect', projectId: 'project-123' });
      
      const developerAgents = agentMgr.getAgentsByRole('developer');
      
      expect(developerAgents).toHaveLength(2);
      expect(developerAgents.every(a => a.roleId === 'developer')).toBe(true);
    });
  });

  describe('getAgentsByStatus', () => {
    it('should return agents filtered by status', async () => {
      const agent1 = await agentMgr.createAgent({ roleId: 'developer', projectId: 'project-123' });
      await agentMgr.createAgent({ roleId: 'architect', projectId: 'project-123' });
      
      await agentMgr.setAgentStatus(agent1.id, 'running' as AgentStatus);
      
      const runningAgents = agentMgr.getAgentsByStatus('running' as AgentStatus);
      
      expect(runningAgents).toHaveLength(1);
      expect(runningAgents[0].id).toBe(agent1.id);
    });
  });

  describe('setAgentStatus', () => {
    it('should update agent status', async () => {
      const agent = await agentMgr.createAgent({
        roleId: 'developer',
        projectId: 'project-123',
      });
      
      await agentMgr.setAgentStatus(agent.id, 'running' as AgentStatus);
      
      const updated = agentMgr.getAgent(agent.id);
      expect(updated?.status).toBe('running');
    });

    it('should throw error for non-existent agent', async () => {
      await expect(agentMgr.setAgentStatus('non-existent', 'running' as AgentStatus))
        .rejects.toThrow('Agent not found');
    });
  });

  describe('setCurrentTask', () => {
    it('should set current task and update status', async () => {
      const agent = await agentMgr.createAgent({
        roleId: 'developer',
        projectId: 'project-123',
      });
      
      await agentMgr.setCurrentTask(agent.id, 'task-123');
      
      const updated = agentMgr.getAgent(agent.id);
      expect(updated?.currentTaskId).toBe('task-123');
      expect(updated?.status).toBe('running');
    });

    it('should set status to idle when task is null', async () => {
      const agent = await agentMgr.createAgent({
        roleId: 'developer',
        projectId: 'project-123',
      });
      
      await agentMgr.setCurrentTask(agent.id, null);
      
      const updated = agentMgr.getAgent(agent.id);
      expect(updated?.status).toBe('idle');
    });
  });

  describe('restartAgent', () => {
    it('should reset agent status and increment restart count', async () => {
      const agent = await agentMgr.createAgent({
        roleId: 'developer',
        projectId: 'project-123',
      });
      
      await agentMgr.setAgentStatus(agent.id, 'running' as AgentStatus);
      await agentMgr.restartAgent(agent.id);
      
      const updated = agentMgr.getAgent(agent.id);
      expect(updated?.status).toBe('idle');
      expect(updated?.currentTaskId).toBeUndefined();
      expect(updated?.metadata.restartCount).toBe(1);
    });
  });

  describe('checkAgentStatus', () => {
    it('should return current status for newly created agent', async () => {
      const agent = await agentMgr.createAgent({
        roleId: 'developer',
        projectId: 'project-123',
      });
      
      const result = await agentMgr.checkAgentStatus(agent.id);
      
      expect(result.status).toBe('idle');
      expect(result.needsRestart).toBe(false);
    });

    it('should detect running agent that has been inactive', async () => {
      const agent = await agentMgr.createAgent({
        roleId: 'developer',
        projectId: 'project-123',
      });
      
      await agentMgr.setAgentStatus(agent.id, 'running' as AgentStatus);
      
      const result = await agentMgr.checkAgentStatus(agent.id);
      
      // Agent just created, so it shouldn't need restart yet
      expect(result.status).toBe('running');
    });
  });

  describe('getStats', () => {
    it('should return agent statistics', async () => {
      await agentMgr.createAgent({ roleId: 'developer', projectId: 'project-123' });
      await agentMgr.createAgent({ roleId: 'developer', projectId: 'project-123' });
      const agent3 = await agentMgr.createAgent({ roleId: 'architect', projectId: 'project-123' });
      
      await agentMgr.setAgentStatus(agent3.id, 'running' as AgentStatus);
      
      const stats = agentMgr.getStats();
      
      expect(stats.total).toBe(3);
      expect(stats.byStatus.idle).toBe(2);
      expect(stats.byStatus.running).toBe(1);
      expect(stats.byStatus.stopped).toBe(0);
    });
  });

  describe('deleteAgent', () => {
    it('should delete an agent', async () => {
      const agent = await agentMgr.createAgent({
        roleId: 'developer',
        projectId: 'project-123',
      });
      
      await agentMgr.deleteAgent(agent.id);
      
      expect(agentMgr.getAgent(agent.id)).toBeNull();
    });

    it('should throw error for non-existent agent', async () => {
      await expect(agentMgr.deleteAgent('non-existent'))
        .rejects.toThrow('Agent not found');
    });
  });
});
