export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed';

export type AgentKind = 'master' | 'worker';

export interface ToolPolicy {
  /** 允许的工具类别（为空/不填表示不按类别限制） */
  categories?: import('../tool/index.js').ToolCategory[];
  /** 工具白名单（若存在则仅允许这些工具名） */
  allowTools?: string[];
  /** 工具黑名单（从最终集合中剔除） */
  denyTools?: string[];
}

export interface AgentContext {
  systemPrompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  variables: Record<string, any>;
}

export interface Agent {
  id: string;
  taskId: string;
  roleId: string;
  /** v10：主控会话 vs 工人；缺省按 worker 处理 */
  kind?: AgentKind;
  /** v10：工人展示名（主 Agent 无则可为空） */
  displayName?: string;
  /** v10：所属主 Agent id（工人必填，主控与旧数据可空） */
  masterAgentId?: string;
  /** v10：工人可用工具策略（可选；用于主控按类别分配工具集） */
  toolPolicy?: ToolPolicy;
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
  /** 系统预留角色：不可删除；不可作为工人角色派工 */
  isSystem?: boolean;
}
