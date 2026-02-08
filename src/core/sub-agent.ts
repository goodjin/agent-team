import type { Task, ToolResult, ExecutionContext, TaskMessage, LLMConfig } from '../types/index.js';
import { LLMService } from '../services/llm.service.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { LLMQueue, llmQueue } from '../services/llm-queue.js';
import { getLLMConfigManager } from '../services/llm-config.js';
import { v4 as uuidv4 } from 'uuid';

export interface SubAgentConfig {
  maxIterations: number;
  maxToolCallsPerIteration: number;
  queue: LLMQueue;
}

export interface SubAgentState {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  messages: TaskMessage[];
  results: any[];
  createdAt: Date;
  updatedAt: Date;
  parentTaskId?: string;
}

function log(level: 'info' | 'warn' | 'error', ...args: any[]): void {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
  const prefix = `[${timestamp}] [SubAgent]`;
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
  if (level === 'error') {
    console.error(`${prefix} ${msg}`);
  } else if (level === 'warn') {
    console.warn(`${prefix} ${msg}`);
  } else {
    console.log(`${prefix} ${msg}`);
  }
}

export class SubAgent {
  private task: Task;
  private context: ExecutionContext;
  private llmService: LLMService;
  private toolRegistry: ToolRegistry;
  private config: SubAgentConfig;
  public state: SubAgentState;

  constructor(
    task: Task,
    context: ExecutionContext,
    llmService: LLMService,
    toolRegistry: ToolRegistry,
    config?: Partial<SubAgentConfig>
  ) {
    this.task = task;
    this.context = context;
    this.llmService = llmService;
    this.toolRegistry = toolRegistry;
    this.config = {
      maxIterations: config?.maxIterations ?? 10,
      maxToolCallsPerIteration: config?.maxToolCallsPerIteration ?? 5,
      queue: config?.queue ?? llmQueue,
    };

    this.state = {
      taskId: task.id,
      status: 'pending',
      messages: this.buildInitialMessages(),
      results: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      parentTaskId: context.currentTask?.id,
    };

    log('info', `创建子任务代理: id=${task.id}, title=${task.title}, role=${task.assignedRole}`);
  }

  private buildInitialMessages(): TaskMessage[] {
    const messages: TaskMessage[] = [];

    if (this.task.input?.initialMessage) {
      messages.push({
        role: 'user',
        content: this.task.input.initialMessage,
        timestamp: new Date(),
      });
    }

    return messages;
  }

  async start(): Promise<ToolResult> {
    log('info', `开始执行: id=${this.task.id}, title=${this.task.title}`);
    this.state.status = 'running';
    this.state.updatedAt = new Date();

    try {
      const result = await this.execute();
      this.state.status = result.success ? 'completed' : 'failed';
      this.state.updatedAt = new Date();

      if (result.success) {
        log('info', `✅ 任务完成: id=${this.task.id}, title=${this.task.title}, 迭代次数=${result.metadata?.iterations}, 工具调用=${result.metadata?.toolCount}`);
      } else {
        log('error', `❌ 任务失败: id=${this.task.id}, title=${this.task.title}, 错误=${result.error}`);
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.state.status = 'failed';
      this.state.updatedAt = new Date();
      log('error', `💥 任务异常: id=${this.task.id}, title=${this.task.title}, 错误=${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  async sendMessage(content: string): Promise<ToolResult> {
    const message: TaskMessage = {
      role: 'user',
      content,
      timestamp: new Date(),
    };

    this.state.messages.push(message);
    this.state.updatedAt = new Date();

    try {
      const result = await this.executeIteration();
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log('error', `消息处理失败: id=${this.task.id}, 错误=${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  private async execute(): Promise<ToolResult> {
    const conversation: any[] = [];

    const systemPrompt = this.buildSystemPrompt();
    conversation.push({ role: 'system', content: systemPrompt });

    for (const msg of this.state.messages) {
      conversation.push({
        role: msg.role,
        content: msg.content,
      });
    }

    let iteration = 0;
    let finalResult: any = null;

    log('info', `开始执行循环: id=${this.task.id}, 最大迭代=${this.config.maxIterations}`);

    while (iteration < this.config.maxIterations) {
      iteration++;

      try {
        const response = await this.callLLM(conversation, iteration);

        const responseContent = typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);

        conversation.push({
          role: 'assistant',
          content: responseContent,
        });

        const toolCalls = this.parseToolCalls(responseContent);

        if (toolCalls.length === 0) {
          finalResult = this.extractFinalResult(response.content);
          if (finalResult) {
            log('info', `迭代${iteration}: 无工具调用，提取到结果`);
            break;
          }

          conversation.push({
            role: 'user',
            content: '请提供具体的结果或继续执行任务。',
          });
          continue;
        }

        log('info', `迭代${iteration}: 调用${toolCalls.length}个工具`);
        for (const toolCall of toolCalls.slice(0, this.config.maxToolCallsPerIteration)) {
          const result = await this.executeTool(toolCall, iteration);

          conversation.push({
            role: 'user',
            content: `<tool_result id="${toolCall.id}">\n${this.formatToolResult(result)}\n</tool_result>`,
          });

          this.state.results.push({
            tool: toolCall.tool,
            parameters: toolCall.parameters,
            result,
            timestamp: new Date(),
          });

          if (result.success && result.data?.shouldStop) {
            finalResult = result.data;
            log('info', `迭代${iteration}: 工具调用要求停止任务`);
            break;
          }
        }

        if (finalResult) {
          break;
        }

        conversation.push({
          role: 'user',
          content: '请基于工具返回的结果继续执行任务。',
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log('error', `迭代${iteration}出错: id=${this.task.id}, 错误=${errorMsg}`);
        throw error;
      }
    }

    if (!finalResult) {
      finalResult = this.extractFinalResultFromConversation(conversation);
      if (!finalResult) {
        finalResult = {
          summary: '任务执行完成（超时或达到最大迭代）',
          completed: true,
        };
      }
    }

    const files = this.extractFilesFromResults();
    log('info', `执行完成: id=${this.task.id}, 创建文件=${files.length}`);

    return {
      success: true,
      data: {
        ...finalResult,
        files,
        subtaskId: this.task.id,
        subtaskTitle: this.task.title,
        agentRole: this.task.assignedRole,
      },
      metadata: {
        iterations: iteration,
        toolCount: this.state.results.length,
        model: this.llmService.getModel(),
      },
    };
  }

  private async executeIteration(): Promise<ToolResult> {
    const conversation: any[] = [];

    conversation.push({
      role: 'system',
      content: this.buildSystemPrompt(),
    });

    for (const msg of this.state.messages) {
      conversation.push({
        role: msg.role,
        content: msg.content,
      });
    }

    const response = await this.callLLM(conversation, 1);

    conversation.push({
      role: 'assistant',
      content: response.content,
    });

    const toolCalls = this.parseToolCalls(response.content);

    if (toolCalls.length === 0) {
      return {
        success: true,
        data: {
          message: response.content,
          completed: false,
        },
      };
    }

    for (const toolCall of toolCalls) {
      const result = await this.executeTool(toolCall, 1);

      conversation.push({
        role: 'user',
        content: `<tool_result id="${toolCall.id}">\n${this.formatToolResult(result)}\n</tool_result>`,
      });

      this.state.results.push({
        tool: toolCall.tool,
        parameters: toolCall.parameters,
        result,
        timestamp: new Date(),
      });
    }

    return {
      success: true,
      data: {
        message: '工具执行完成',
        completed: false,
      },
      metadata: {
        toolCount: this.state.results.length,
      },
    };
  }

  private async callLLM(messages: any[], iteration: number): Promise<any> {
    const manager = getLLMConfigManager();
    const role = this.task.assignedRole || 'developer';
    const roleConfig = manager.getRoleLLMConfig(role);

    if (!roleConfig) {
      throw new Error(`角色${role}的LLM配置不存在`);
    }

    log('info', `迭代${iteration}: 调用LLM, role=${role}, model=${roleConfig.model}`);

    return this.config.queue.request(messages, {
      temperature: roleConfig.temperature ?? 0.7,
      maxTokens: roleConfig.maxTokens ?? 4000,
      config: roleConfig,
    });
  }

  private buildSystemPrompt(): string {
    const role = this.task.assignedRole || 'developer';
    const workDir = this.context.project.projectPath;

    return `你是一个专业的 ${role}，负责独立完成任务。

## 任务信息
- 任务ID: ${this.task.id}
- 任务标题: ${this.task.title}
- 任务描述: ${this.task.description || '无'}
- 工作目录: ${workDir}

## 职责
1. 独立分析任务需求
2. 自主决定需要使用的工具
3. 完成自己负责的功能模块
4. 确保代码质量

## 可用工具
${this.formatTools()}

## 执行规则
1. 独立思考，不依赖其他子任务
2. 每个工具调用格式：
<tool_call>
<tool_name>工具名</tool_name>
<parameters>{"filePath": "路径", "content": "内容"}</parameters>
</tool_call>

3. 任务完成时提供结果：
<result>
<summary>完成摘要</summary>
<files>
<file><path>文件路径</path><description>描述</description></file>
</files>
</result>

## 重要
- 这是独立子任务，只负责自己的部分
- 不要尝试做不属于自己职责范围的事情
- 保持代码简洁、功能单一`;
  }

  private formatTools(): string {
    const toolList: string[] = [];

    for (const [name, def] of this.context.tools) {
      toolList.push(`- ${name}: ${def.description}`);
    }

    return toolList.join('\n');
  }

  private parseToolCalls(content: string): any[] {
    const calls: any[] = [];
    const regex = /<tool_call>[\s\S]*?<tool_name>([^<]+)<\/tool_name>[\s\S]*?<parameters>([\s\S]*?)<\/parameters>[\s\S]*?<\/tool_call>/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
      try {
        const parameters = JSON.parse(match[2].trim());
        calls.push({
          id: uuidv4(),
          tool: match[1].trim(),
          parameters,
        });
      } catch (e) {
        // Skip invalid JSON
      }
    }

    return calls;
  }

  private async executeTool(toolCall: any, iteration: number): Promise<ToolResult> {
    const tool = this.toolRegistry.get(toolCall.tool);
    if (!tool) {
      const errorMsg = `未知工具: ${toolCall.tool}`;
      log('error', `迭代${iteration}: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }

    const workDir = this.context.project.projectPath;
    const parameters = {
      ...toolCall.parameters,
      workDir: toolCall.parameters.workDir || this.task.input?.workDir || workDir,
      projectPath: workDir,
    };

    log('info', `迭代${iteration}: 执行工具 ${toolCall.tool}`);

    const result = await this.toolRegistry.execute(toolCall.tool, parameters);

    if (result.success) {
      log('info', `迭代${iteration}: ✅ 工具 ${toolCall.tool} 执行成功`);
    } else {
      log('error', `迭代${iteration}: ❌ 工具 ${toolCall.tool} 执行失败: ${result.error}`);
    }

    return result;
  }

  private formatToolResult(result: ToolResult): string {
    if (!result.success) {
      return `错误: ${result.error || 'Unknown error'}`;
    }

    if (result.data?.content) {
      return `成功!\n${result.data.content.substring(0, 500)}`;
    }

    if (result.data?.files) {
      return `成功! 创建了 ${result.data.files.length} 个文件`;
    }

    return JSON.stringify(result.data, null, 2);
  }

  private extractFinalResult(content: string): any {
    const regex = /<result>[\s\S]*?<summary>([^<]+)<\/summary>[\s\S]*?<\/result>/;
    const match = content.match(regex);

    if (match) {
      return {
        summary: match[1].trim(),
        completed: true,
      };
    }

    return null;
  }

  private extractFinalResultFromConversation(conversation: any[]): any {
    for (let i = conversation.length - 1; i >= 0; i--) {
      if (conversation[i].role === 'assistant') {
        const result = this.extractFinalResult(conversation[i].content);
        if (result) {
          return result;
        }
      }
    }

    return {
      summary: '任务执行完成',
      completed: true,
    };
  }

  private extractFilesFromResults(): any[] {
    const files: any[] = [];

    for (const result of this.state.results) {
      if (result.result.success && result.result.data?.files) {
        files.push(...result.result.data.files);
      }
    }

    return files;
  }

  getState(): SubAgentState {
    return { ...this.state };
  }

  getStats(): {
    iterations: number;
    toolCalls: number;
    status: string;
    duration: number;
  } {
    return {
      iterations: this.state.results.length,
      toolCalls: this.state.results.length,
      status: this.state.status,
      duration: this.state.updatedAt.getTime() - this.state.createdAt.getTime(),
    };
  }
}
