export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface AgentContext {
  systemPrompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  variables: Record<string, any>;
}

export interface Agent {
  id: string;
  taskId: string;
  roleId: string;
  status: AgentStatus;
  context: AgentContext;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  allowedTools: string[];
  maxTokensPerTask: number;
  temperature: number;
  timeout: number;
}
