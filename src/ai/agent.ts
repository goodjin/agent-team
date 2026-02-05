/**
 * AI Agent Core
 * Core logic for AI agent interacting with LLM and executing tasks
 */

import type { Task, AgentStatus, Message, ToolResult } from '../types/index.js';
import type { LLMService } from '../services/llm.service.js';
import type { LLMResponse } from '../types/index.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { CheckpointManager, type CheckpointData, type CheckpointType } from './checkpoint.js';
import { RoleManager } from '../roles/role-manager.js';
import { RuleManager } from '../rules/rule-manager.js';
import type { RoleDefinition } from '../roles/types.js';

export interface AgentConfig {
  id?: string;
  roleId: string;
  projectId: string;
  name?: string;
  llmProvider?: string;
  llmModel?: string;
}

export interface AgentState {
  status: AgentStatus;
  currentTaskId: string | null;
  messages: Message[];
  checkpoints: string[];
}

export interface AgentExecutionResult {
  success: boolean;
  output: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  progress?: string;
  error?: string;
  metadata?: {
    tokens: { prompt: number; completion: number; total: number };
    duration: number;
  };
}

export class Agent {
  private config: AgentConfig;
  private state: AgentState;
  private llmService: LLMService;
  private toolRegistry: ToolRegistry;
  private checkpointManager: CheckpointManager;
  private projectId: string;
  private roleManager: RoleManager;
  private ruleManager: RuleManager;

  constructor(
    config: AgentConfig,
    llmService: LLMService,
    toolRegistry: ToolRegistry,
    roleManager: RoleManager,
    ruleManager: RuleManager
  ) {
    this.config = {
      id: config.id,
      roleId: config.roleId,
      projectId: config.projectId,
      name: config.name || `${config.roleId}-agent`,
      llmProvider: config.llmProvider,
      llmModel: config.llmModel,
    };
    this.llmService = llmService;
    this.toolRegistry = toolRegistry;
    this.roleManager = roleManager;
    this.ruleManager = ruleManager;
    this.projectId = config.projectId;
    this.checkpointManager = new CheckpointManager(this.projectId);
    this.state = {
      status: 'idle',
      currentTaskId: null,
      messages: [],
      checkpoints: [],
    };
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }

  getState(): AgentState {
    return { ...this.state };
  }

  getStatus(): AgentStatus {
    return this.state.status;
  }

  setStatus(status: AgentStatus): void {
    this.state.status = status;
  }

  setCurrentTask(taskId: string | null): void {
    this.state.currentTaskId = taskId;
  }

  async loadRolePrompt(roleId: string): Promise<void> {
    const role = this.roleManager.getRoleById(roleId);
    
    if (role) {
      const systemPrompt = this.extractSystemPrompt(role);
      this.state.messages = [
        { role: 'system', content: systemPrompt },
      ];
    }
  }

  private extractSystemPrompt(role: RoleDefinition): string {
    const lines: string[] = [];
    lines.push(`# ${role.name}`);
    lines.push(role.description);
    lines.push('');
    lines.push('## Capabilities');
    for (const capability of role.capabilities) {
      lines.push(`- ${capability}`);
    }
    lines.push('');
    lines.push('## Responsibilities');
    for (const responsibility of role.responsibilities) {
      lines.push(`- ${responsibility}`);
    }
    if (role.constraints.length > 0) {
      lines.push('');
      lines.push('## Constraints');
      for (const constraint of role.constraints) {
        lines.push(`- ${constraint}`);
      }
    }
    return lines.join('\n');
  }

  async loadRules(projectId?: string, roleId?: string): Promise<void> {
    const rules: string[] = [];

    const globalRules = this.ruleManager.getEnabledRules();
    for (const rule of globalRules) {
      rules.push(`# ${rule.name}\n${rule.description}`);
    }

    if (rules.length > 0) {
      const systemMessage = this.state.messages.find(m => m.role === 'system');
      if (systemMessage) {
        systemMessage.content += '\n\n# Rules\n' + rules.join('\n\n');
      } else {
        this.state.messages.unshift({
          role: 'system',
          content: '# Rules\n' + rules.join('\n\n'),
        });
      }
    }
  }

  async executeTask(task: Task): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    this.state.status = 'running';
    this.state.currentTaskId = task.id;

    try {
      this.state.messages.push({
        role: 'user',
        content: task.description,
      });

      const result = await this.chat(this.state.messages);

      this.state.status = 'idle';
      this.state.currentTaskId = null;

      return {
        success: true,
        output: result.content,
        toolCalls: result.toolCalls,
        metadata: {
          tokens: result.usage ? {
            prompt: result.usage.promptTokens,
            completion: result.usage.completionTokens,
            total: result.usage.totalTokens,
          } : { prompt: 0, completion: 0, total: 0 },
          duration: Date.now() - startTime,
        },
      };
    } catch (error) {
      this.state.status = 'idle';
      this.state.currentTaskId = null;

      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          tokens: { prompt: 0, completion: 0, total: 0 },
          duration: Date.now() - startTime,
        },
      };
    }
  }

  async chat(messages: Message[]): Promise<{
    content: string;
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }> {
    const response = await this.llmService.complete(messages);

    const content = response.content || '';

    const usage = response.usage ? {
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
    } : undefined;

    return { content, usage };
  }

  async useTool(toolName: string, params: Record<string, any>): Promise<ToolResult> {
    return this.toolRegistry.execute(toolName, params);
  }

  async updateProgress(taskId: string, progress: string): Promise<void> {
    const progressData: CheckpointData = {
      progress: {
        completedSteps: [progress],
        remainingSteps: [],
        percentComplete: 0,
      },
    };

    await this.checkpointManager.saveCheckpoint({
      taskId,
      agentId: this.config.id || '',
      projectId: this.projectId,
      type: 'progress' as CheckpointType,
      data: progressData,
      stepIndex: this.state.checkpoints.length,
      stepName: progress,
    });
  }

  async reportToManager(task: Task): Promise<void> {
    console.log(`Agent ${this.config.name} completed task ${task.id}: ${task.description}`);
  }

  async saveCheckpoint(type: CheckpointType, data: CheckpointData): Promise<string> {
    return this.checkpointManager.saveCheckpoint({
      taskId: this.state.currentTaskId || '',
      agentId: this.config.id || '',
      projectId: this.projectId,
      type,
      data,
      stepIndex: this.state.checkpoints.length,
      stepName: `checkpoint-${this.state.checkpoints.length}`,
    });
  }

  async loadCheckpoint(taskId: string): Promise<CheckpointData | null> {
    const checkpoint = await this.checkpointManager.loadLatestCheckpoint(taskId);
    return checkpoint?.data || null;
  }

  destroy(): void {
    this.state.status = 'stopped';
    this.state.messages = [];
    this.state.checkpoints = [];
  }
}
