import { describe, it, expect } from 'vitest';
import type {
  Result,
  AsyncResult,
  ProjectStatus,
  Project,
  TaskStatusAPI,
  TaskAPI,
  AgentStatus,
  Agent,
  RoleTypeAPI,
  Role,
  RuleType,
  Rule,
  EventType,
  Event,
  EventHandler,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ToolCall,
  TokenStats,
  ProviderInfo,
  ToolResult,
} from '../src/types/index.js';

describe('Type Definitions', () => {
  describe('Result type', () => {
    it('should allow successful result with data', () => {
      const result: Result<string> = {
        success: true,
        data: 'test data',
      };
      expect(result.success).toBe(true);
      expect(result.data).toBe('test data');
    });

    it('should allow failed result with error', () => {
      const result: Result<string> = {
        success: false,
        error: {
          code: 'ERROR_CODE',
          message: 'Error message',
          details: { extra: 'info' },
        },
      };
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ERROR_CODE');
    });
  });

  describe('Project types', () => {
    it('should allow active project status', () => {
      const status: ProjectStatus = 'active';
      expect(status).toBe('active');
    });

    it('should allow archived project status', () => {
      const status: ProjectStatus = 'archived';
      expect(status).toBe('archived');
    });

    it('should create valid Project object', () => {
      const project: Project = {
        id: 'proj-001',
        name: 'Test Project',
        path: '/test/path',
        description: 'A test project',
        status: 'active',
        config: {
          projectName: 'Test',
          projectPath: '/test',
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
        },
      };
      expect(project.id).toBe('proj-001');
      expect(project.status).toBe('active');
    });
  });

  describe('Task types', () => {
    it('should allow pending task status', () => {
      const status: TaskStatusAPI = 'pending';
      expect(status).toBe('pending');
    });

    it('should allow running task status', () => {
      const status: TaskStatusAPI = 'running';
      expect(status).toBe('running');
    });

    it('should allow done task status', () => {
      const status: TaskStatusAPI = 'done';
      expect(status).toBe('done');
    });

    it('should create valid TaskAPI object', () => {
      const task: TaskAPI = {
        id: 'task-001',
        projectId: 'proj-001',
        category: 'development',
        title: 'Test Task',
        description: 'A test task',
        progress: '50%',
        status: 'running',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(task.id).toBe('task-001');
      expect(task.status).toBe('running');
    });
  });

  describe('Agent types', () => {
    it('should allow idle agent status', () => {
      const status: AgentStatus = 'idle';
      expect(status).toBe('idle');
    });

    it('should allow running agent status', () => {
      const status: AgentStatus = 'running';
      expect(status).toBe('running');
    });

    it('should allow stopped agent status', () => {
      const status: AgentStatus = 'stopped';
      expect(status).toBe('stopped');
    });

    it('should create valid Agent object', () => {
      const agent: Agent = {
        id: 'agent-001',
        roleId: 'role-001',
        projectId: 'proj-001',
        name: 'Test Agent',
        status: 'idle',
        llmProvider: 'openai',
        llmModel: 'gpt-4',
        metadata: {
          createdAt: new Date(),
          lastActiveAt: new Date(),
          restartCount: 0,
        },
      };
      expect(agent.id).toBe('agent-001');
      expect(agent.status).toBe('idle');
    });
  });

  describe('Role types', () => {
    it('should allow all role types', () => {
      const roles: RoleTypeAPI[] = [
        'product-manager',
        'project-manager',
        'architect',
        'developer',
        'tester',
        'doc-writer',
        'custom',
      ];
      expect(roles).toHaveLength(7);
    });

    it('should create valid Role object', () => {
      const role: Role = {
        id: 'role-001',
        name: 'Developer',
        type: 'developer',
        description: 'Developer role',
        promptPath: '/prompts/developer.txt',
        createdBy: 'system',
        enabled: true,
      };
      expect(role.id).toBe('role-001');
      expect(role.type).toBe('developer');
    });
  });

  describe('Rule types', () => {
    it('should allow all rule types', () => {
      const types: RuleType[] = ['global', 'project', 'role'];
      expect(types).toHaveLength(3);
    });

    it('should create valid Rule object', () => {
      const rule: Rule = {
        id: 'rule-001',
        name: 'Code Style',
        type: 'global',
        filePath: '/rules/code-style.md',
        enabled: true,
      };
      expect(rule.id).toBe('rule-001');
      expect(rule.type).toBe('global');
    });
  });

  describe('Event types', () => {
    it('should allow all event types', () => {
      const events: EventType[] = [
        'task.created',
        'task.started',
        'task.completed',
        'task.failed',
        'agent.created',
        'agent.stopped',
      ];
      expect(events).toHaveLength(6);
    });

    it('should create valid Event object', () => {
      const event: Event<{ taskId: string }> = {
        type: 'task.created',
        data: { taskId: 'task-001' },
        timestamp: new Date(),
      };
      expect(event.type).toBe('task.created');
      expect(event.data.taskId).toBe('task-001');
    });

    it('should allow EventHandler function', () => {
      const handler: EventHandler = (event) => {
        console.log(event.type);
      };
      expect(typeof handler).toBe('function');
    });
  });

  describe('Chat types', () => {
    it('should create valid ChatMessage', () => {
      const message: ChatMessage = {
        role: 'user',
        content: 'Hello',
      };
      expect(message.role).toBe('user');
    });

    it('should create valid ChatMessage with tool calls', () => {
      const message: ChatMessage = {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call-001',
            type: 'function',
            function: {
              name: 'testTool',
              arguments: '{}',
            },
          },
        ],
      };
      expect(message.toolCalls).toHaveLength(1);
    });

    it('should create valid ChatRequest', () => {
      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
      };
      expect(request.model).toBe('gpt-4');
    });

    it('should create valid ChatResponse', () => {
      const response: ChatResponse = {
        id: 'resp-001',
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello!',
            },
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      };
      expect(response.id).toBe('resp-001');
      expect(response.usage.totalTokens).toBe(15);
    });
  });

  describe('TokenStats', () => {
    it('should create valid TokenStats', () => {
      const stats: TokenStats = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      };
      expect(stats.totalTokens).toBe(stats.promptTokens + stats.completionTokens);
    });
  });

  describe('ProviderInfo', () => {
    it('should create valid ProviderInfo', () => {
      const provider: ProviderInfo = {
        name: 'openai',
        enabled: true,
        models: ['gpt-4', 'gpt-3.5-turbo'],
      };
      expect(provider.models).toContain('gpt-4');
    });
  });

  describe('ToolResult', () => {
    it('should create successful ToolResult', () => {
      const result: ToolResult<string> = {
        success: true,
        data: 'result',
      };
      expect(result.success).toBe(true);
    });

    it('should create failed ToolResult', () => {
      const result: ToolResult<string> = {
        success: false,
        error: 'Something went wrong',
      };
      expect(result.success).toBe(false);
    });
  });
});
