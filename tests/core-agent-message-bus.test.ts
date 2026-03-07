import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AgentMessageBus,
  createMessageBus,
  type AgentId,
  type Message,
  type MessageContent,
  type MessageBusConfig,
} from '../src/core/agent-message-bus.js';

describe('AgentMessageBus', () => {
  let messageBus: AgentMessageBus;
  const agentA: AgentId = { id: 'agent-a', name: 'Agent A', type: 'developer' };
  const agentB: AgentId = { id: 'agent-b', name: 'Agent B', type: 'architect' };
  const agentC: AgentId = { id: 'agent-c', name: 'Agent C', type: 'tester' };

  beforeEach(() => {
    messageBus = createMessageBus({ enableLogging: false });
    // Register agents
    messageBus.registerAgent(agentA);
    messageBus.registerAgent(agentB);
    messageBus.registerAgent(agentC);
  });

  describe('registerAgent', () => {
    it('should register an agent', () => {
      const newAgent: AgentId = { id: 'new-agent', name: 'New Agent' };
      messageBus.registerAgent(newAgent);
      
      expect(messageBus.isAgentRegistered('new-agent')).toBe(true);
    });

    it('should reject registration without ID', () => {
      expect(() => {
        messageBus.registerAgent({ name: 'No ID Agent' } as any);
      }).toThrow('Agent ID is required');
    });

    it('should list registered agents', () => {
      const agents = messageBus.getRegisteredAgents();
      
      expect(agents.length).toBeGreaterThanOrEqual(3);
      expect(agents.map(a => a.id)).toContain('agent-a');
      expect(agents.map(a => a.id)).toContain('agent-b');
    });
  });

  describe('unregisterAgent', () => {
    it('should unregister an agent', () => {
      messageBus.unregisterAgent('agent-a');
      
      expect(messageBus.isAgentRegistered('agent-a')).toBe(false);
    });

    it('should handle unregistering non-existent agent', () => {
      expect(() => {
        messageBus.unregisterAgent('non-existent');
      }).not.toThrow();
    });
  });

  describe('sendDirectMessage', () => {
    it('should send direct message between agents', async () => {
      const content = { type: 'task', payload: { taskId: '123' } };
      const result = await messageBus.sendDirectMessage(agentA, agentB, content);
      
      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.deliveredTo.length).toBe(1);
      expect(result.deliveredTo[0].id).toBe('agent-b');
    });

    it('should fail when recipient not registered', async () => {
      const unknownAgent: AgentId = { id: 'unknown', name: 'Unknown' };
      const content = { type: 'test', payload: {} };
      const result = await messageBus.sendDirectMessage(agentA, unknownAgent, content);
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should track message statistics', async () => {
      const statsBefore = messageBus.getStats();
      const content = { type: 'test', payload: {} };
      
      await messageBus.sendDirectMessage(agentA, agentB, content);
      
      const statsAfter = messageBus.getStats();
      expect(statsAfter.directMessages).toBe(statsBefore.directMessages + 1);
    });
  });

  describe('sendBroadcast', () => {
    it('should broadcast to all agents except sender', async () => {
      const content = { type: 'broadcast', payload: { message: 'Hello all' } };
      const result = await messageBus.sendBroadcast(agentA, content);
      
      expect(result.success).toBe(true);
      expect(result.deliveredTo.length).toBe(2); // agentB and agentC
    });

    it('should broadcast to specific agents', async () => {
      const content = { type: 'broadcast', payload: { message: 'Hello' } };
      const result = await messageBus.sendBroadcast(agentA, content, {
        to: [agentB],
      });
      
      expect(result.deliveredTo.length).toBe(1);
      expect(result.deliveredTo[0].id).toBe('agent-b');
    });
  });

  describe('topic subscription', () => {
    it('should subscribe to a topic', async () => {
      const callback = vi.fn();
      const subscriberId = messageBus.subscribe(agentA, 'notifications', callback);
      
      expect(subscriberId).toBeDefined();
      expect(messageBus.getTopicSubscriberCount('notifications')).toBe(1);
    });

    it('should subscribe to multiple topics', async () => {
      const callback = vi.fn();
      messageBus.subscribe(agentA, ['topic1', 'topic2'], callback);
      
      expect(messageBus.getTopicSubscriberCount('topic1')).toBe(1);
      expect(messageBus.getTopicSubscriberCount('topic2')).toBe(1);
    });

    it('should publish topic message', async () => {
      const callback = vi.fn();
      messageBus.subscribe(agentB, 'notifications', callback);
      
      const content = { type: 'alert', payload: { level: 'info' } };
      await messageBus.publishTopic(agentA, 'notifications', content);
      
      expect(callback).toHaveBeenCalled();
    });

    it('should not deliver to wrong topic', async () => {
      const callback = vi.fn();
      messageBus.subscribe(agentB, 'topic-a', callback);
      
      const content = { type: 'test', payload: {} };
      await messageBus.publishTopic(agentA, 'topic-b', content);
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should unsubscribe', () => {
      const callback = vi.fn();
      const subscriberId = messageBus.subscribe(agentA, 'test-topic', callback);
      
      messageBus.unsubscribe(subscriberId);
      
      expect(messageBus.getTopicSubscriberCount('test-topic')).toBe(0);
    });
  });

  describe('subscribeToAgent', () => {
    it('should subscribe to specific agent messages', async () => {
      const callback = vi.fn();
      // Subscribe to messages that agent-c receives
      messageBus.subscribeToAgent('agent-c', agentA, callback);
      
      const content = { type: 'direct', payload: {} };
      await messageBus.sendDirectMessage(agentB, agentC, content);
      
      // Agent A should be notified when agent-c receives a message
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('message handlers', () => {
    it('should register message handler', async () => {
      const handler = vi.fn();
      messageBus.registerMessageHandler('custom-type', handler);
      
      const content = { type: 'custom-type', payload: {} };
      await messageBus.sendDirectMessage(agentA, agentB, content);
      
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('message correlation', () => {
    it('should include correlation ID', async () => {
      const content = { type: 'test', payload: {} };
      const result = await messageBus.sendDirectMessage(agentA, agentB, content, {
        correlationId: 'corr-123',
      });
      
      expect(result.messageId).toBeDefined();
    });

    it('should support replyTo', async () => {
      const content = { type: 'test', payload: {} };
      const result = await messageBus.sendDirectMessage(agentA, agentB, content, {
        replyTo: 'original-msg-id',
      });
      
      expect(result.success).toBe(true);
    });
  });

  describe('replyTo', () => {
    it('should reply to message', async () => {
      // First send a message
      const originalContent = { type: 'request', payload: { action: 'get-info' } };
      const sendResult = await messageBus.sendDirectMessage(agentA, agentB, originalContent);
      
      // Then reply
      const replyContent = { type: 'response', payload: { data: 'here is info' } };
      const replyResult = await messageBus.replyTo(
        { id: sendResult.messageId, from: agentA, to: agentB } as Message,
        agentB,
        replyContent
      );
      
      expect(replyResult.success).toBe(true);
      expect(replyResult.deliveredTo[0].id).toBe('agent-a');
    });
  });

  describe('statistics', () => {
    it('should track message statistics', async () => {
      messageBus.resetStats();
      const stats = messageBus.getStats();
      
      expect(stats.totalMessages).toBe(0);
      expect(stats.delivered).toBe(0);
      expect(stats.failed).toBe(0);
    });

    it('should count subscribers', async () => {
      messageBus.subscribe(agentA, 'topic1', vi.fn());
      messageBus.subscribe(agentB, 'topic1', vi.fn());
      
      const stats = messageBus.getStats();
      expect(stats.subscribers).toBeGreaterThan(0);
    });
  });

  describe('getTopics', () => {
    it('should list all topics', () => {
      messageBus.subscribe(agentA, 'topic-a', vi.fn());
      messageBus.subscribe(agentB, 'topic-b', vi.fn());
      
      const topics = messageBus.getTopics();
      
      expect(topics).toContain('topic-a');
      expect(topics).toContain('topic-b');
    });
  });

});
