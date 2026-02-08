import React, { useState, useEffect } from 'react';
import type { Agent } from '../../types/index.js';
import { AgentChat } from './AgentChat.js';
import { apiClient } from '../utils/api-client.js';

interface AgentListProps {
  taskId: string;
}

export const AgentList: React.FC<AgentListProps> = ({ taskId }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();

    // 订阅 Agent 实时更新
    const eventSource = new EventSource(`/api/tasks/${taskId}/agents/events`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleAgentUpdate(data);
      } catch (err) {
        console.error('Failed to parse agent SSE event:', err);
      }
    };

    eventSource.onerror = () => {
      console.warn('SSE connection error for agents of task:', taskId);
    };

    return () => {
      eventSource.close();
    };
  }, [taskId]);

  const loadAgents = async () => {
    try {
      const response = await apiClient.get(`/tasks/${taskId}/agents`);
      setAgents(response.data || []);
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  };

  const handleAgentUpdate = (data: any) => {
    if (data.type === 'agent:created') {
      setAgents((prev) => [...prev, data.agent]);
    } else if (data.type === 'agent:updated') {
      setAgents((prev) =>
        prev.map((a) => (a.id === data.agent.id ? data.agent : a))
      );
    } else if (data.type === 'agent:destroyed') {
      setAgents((prev) => prev.filter((a) => a.id !== data.agentId));
    }
  };

  return (
    <div className="agent-list">
      <div className="agent-items">
        {agents.length === 0 ? (
          <div className="no-agents">No agents running</div>
        ) : (
          agents.map((agent) => (
            <AgentItem
              key={agent.id}
              agent={agent}
              selected={selectedAgent === agent.id}
              onClick={() => setSelectedAgent(agent.id)}
            />
          ))
        )}
      </div>

      {selectedAgent && (
        <div className="agent-chat-panel">
          <AgentChat agentId={selectedAgent} onClose={() => setSelectedAgent(null)} />
        </div>
      )}
    </div>
  );
};

interface AgentItemProps {
  agent: Agent;
  selected: boolean;
  onClick: () => void;
}

const AgentItem: React.FC<AgentItemProps> = ({ agent, selected, onClick }) => {
  const statusIcon: Record<string, string> = {
    idle: '[IDLE]',
    running: '[RUNNING]',
    stopped: '[STOPPED]',
  };

  return (
    <div
      className={`agent-item status-${agent.status} ${selected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="agent-header">
        <div className="agent-status">{statusIcon[agent.status] || '[?]'}</div>
        <div className="agent-id">{agent.id}</div>
      </div>
      <div className="agent-role">{agent.roleId}</div>
      {agent.currentTaskId && (
        <div className="agent-task">Task: {agent.currentTaskId}</div>
      )}
    </div>
  );
};
