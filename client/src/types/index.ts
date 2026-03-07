// API Types
export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  assignedRole?: string;
  createdAt: string;
  updatedAt: string;
  progress?: number;
  messages?: Message[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface Agent {
  id: string;
  role: string;
  status: 'running' | 'idle' | 'error';
  createdAt: string;
  lastActive?: string;
  restartCount?: number;
  notes?: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  lifecycle: 'draft' | 'in-progress' | 'review' | 'completed';
  visibility: 'private' | 'team' | 'public';
  tasks: number;
  modules: number;
  version: string;
  completion: number;
}

export interface Role {
  id: string;
  name: string;
  description: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  template?: string;
  steps: string[];
}

export interface DashboardStats {
  totalTasks: number;
  inProgress: number;
  completed: number;
  failed: number;
  runningAgents: number;
  idleAgents: number;
  errorAgents: number;
}

export interface LLMConfig {
  provider: string;
  model: string;
  apiKey?: string;
}
