import type { Task, ToolResult, ExecutionContext, Message, ToolDefinition, RoleType } from '../types/index.js';
import { LLMService } from '../services/llm.service.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { SubTaskExecutor, SubTaskDefinition } from './subtask-executor.js';
import { llmQueue } from '../services/llm-queue.js';
import { v4 as uuidv4 } from 'uuid';

export interface ToolCall {
  id: string;
  tool: string;
  parameters: Record<string, any>;
}

export interface ToolExecution {
  toolCall: ToolCall;
  result: ToolResult;
  timestamp: Date;
}

export interface AgentExecutorOptions {
  maxIterations?: number;
  maxToolCallsPerIteration?: number;
  executionTimeoutMs?: number;
  enableReflections?: boolean;
}

const DEFAULT_OPTIONS: AgentExecutorOptions = {
  maxIterations: 10,
  maxToolCallsPerIteration: 5,
  executionTimeoutMs: 300000,
  enableReflections: true,
};

function log(level: 'info' | 'warn' | 'error', ...args: any[]): void {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
  const prefix = `[${timestamp}] [AgentExecutor]`;
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
  if (level === 'error') {
    console.error(`${prefix} ${msg}`);
  } else if (level === 'warn') {
    console.warn(`${prefix} ${msg}`);
  } else {
    console.log(`${prefix} ${msg}`);
  }
}

export class AgentExecutor {
  private llmService: LLMService;
  private toolRegistry: ToolRegistry;
  private options: AgentExecutorOptions;

  constructor(
    llmService: LLMService,
    toolRegistry: ToolRegistry,
    options: AgentExecutorOptions = {}
  ) {
    this.llmService = llmService;
    this.toolRegistry = toolRegistry;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    log('info', `初始化: maxIterations=${this.options.maxIterations}, maxToolCalls=${this.options.maxToolCallsPerIteration}`);
  }

  async execute(
    task: Task,
    context: ExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const toolExecutions: ToolExecution[] = [];
    const conversation: Message[] = [];

    log('info', `🚀 开始执行任务: id=${task.id}, title=${task.title}, role=${task.assignedRole}`);

    try {
      const systemPrompt = this.buildSystemPrompt(task, context);
      conversation.push({ role: 'system', content: systemPrompt });

      const taskPrompt = this.buildTaskPrompt(task, context);
      conversation.push({ role: 'user', content: taskPrompt });

      let iteration = 0;
      let subtasks: SubTaskDefinition[] = [];
      let finalResult: any = null;

      while (iteration < this.options.maxIterations!) {
        iteration++;

        log('info', `📍 第${iteration}次迭代`);

        const response = await this.llmService.complete(conversation);
        const inputTokens = response.usage?.promptTokens || 0;
        const outputTokens = response.usage?.completionTokens || 0;
        log('info', `📝 LLM响应: model=${this.llmService.getModel()}, 输入tokens=${inputTokens}, 输出tokens=${outputTokens}`);

        const responseContent = typeof response.content === 'string' 
          ? response.content 
          : JSON.stringify(response.content);

        conversation.push({
          role: 'assistant',
          content: responseContent,
        });

        subtasks = this.parseSubtasks(response.content);

        if (subtasks.length > 0) {
          log('info', `📋 发现${subtasks.length}个子任务，开始分发执行`);
          log('info', `子任务列表: ${subtasks.map(s => `${s.title}(${s.assignedRole})`).join(', ')}`);
          break;
        }

        const toolCalls = this.parseToolCalls(response.content);

        if (toolCalls.length === 0) {
          finalResult = this.extractFinalResult(response.content);

          if (finalResult) {
            log('info', `📄 提取到结果`);
            break;
          }

          conversation.push({
            role: 'user',
            content: '请提供具体的任务结果，或使用工具完成任务。如果任务已完成，请提供完整的结果摘要。',
          });
          continue;
        }

        log('info', `🔧 发现${toolCalls.length}个工具调用`);

        for (const toolCall of toolCalls.slice(0, this.options.maxToolCallsPerIteration!)) {
          try {
            const execution: ToolExecution = {
              toolCall,
              result: { success: false },
              timestamp: new Date(),
            };

            log('info', `⚙️ 执行工具: ${toolCall.tool}`);

            const toolResult = await this.executeTool(toolCall, context);

            execution.result = toolResult;
            toolExecutions.push(execution);

            if (toolResult.success) {
              log('info', `✅ 工具执行成功: ${toolCall.tool}`);
            } else {
              log('error', `❌ 工具执行失败: ${toolCall.tool}, 错误=${toolResult.error}`);
            }

            conversation.push({
              role: 'assistant',
              content: `<tool_call>\n<tool_name>${toolCall.tool}</tool_name>\n<parameters>${JSON.stringify(toolCall.parameters, null, 2)}</parameters>\n</tool_call>`,
            });

            conversation.push({
              role: 'user',
              content: `<tool_result id="${toolCall.id}">\n${this.formatToolResult(toolResult)}\n</tool_result>`,
            });

          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorResult: ToolResult = {
              success: false,
              error: errorMsg,
            };
            toolExecutions.push({
              toolCall,
              result: errorResult,
              timestamp: new Date(),
            });

            log('error', `💥 工具异常: ${toolCall.tool}, 错误=${errorMsg}`);

            conversation.push({
              role: 'user',
              content: `<tool_result id="${toolCall.id}" error="true">\n${errorMsg}\n</tool_result>`,
            });
          }
        }

        conversation.push({
          role: 'user',
          content: '请继续执行任务。基于工具返回的结果，你可以继续调用更多工具或提供最终结果。如果任务复杂需要拆分，请用<subtasks>格式提供子任务列表。',
        });
      }

      if (subtasks.length > 0) {
        log('info', `📦 开始执行${subtasks.length}个子任务...`);

        const executor = new SubTaskExecutor(context, this.toolRegistry, {
          maxConcurrent: 5,
          queue: llmQueue,
          timeoutMs: 600000,
        });

        const subtaskResults = await executor.execute(task, subtasks);

        const successfulResults = subtaskResults.filter(r => r.success);
        const failedResults = subtaskResults.filter(r => !r.success);

        const executionTime = Date.now() - startTime;

        const files = successfulResults.flatMap(r => r.files || []);

        const subtaskSummary = subtaskResults.map(r =>
          `- ${r.title}: ${r.success ? '✅ 完成' : '❌ 失败'}`
        ).join('\n');

        log('info', `📊 子任务执行完成: 成功=${successfulResults.length}/${subtaskResults.length}, 耗时=${executionTime}ms`);

        if (failedResults.length > 0) {
          log('error', `⚠️ 有${failedResults.length}个子任务失败: ${failedResults.map(r => r.title).join(', ')}`);
        }

        return {
          success: failedResults.length === 0,
          data: {
            subtasks: subtaskResults,
            files,
            summary: `子任务执行完成\n成功: ${successfulResults.length}/${subtaskResults.length}\n\n${subtaskSummary}`,
            subtaskCount: subtaskResults.length,
            successfulSubtaskCount: successfulResults.length,
          },
          metadata: {
            toolExecutions,
            iterations: iteration,
            executionTime,
            model: this.llmService.getModel(),
          },
        };
      }

      if (!finalResult) {
        finalResult = this.extractFinalResultFromConversation(conversation);
      }

      const executionTime = Date.now() - startTime;
      const files = this.extractFilesFromExecutions(toolExecutions);

      const successful = toolExecutions.filter(e => e.result.success).length;
      const failed = toolExecutions.length - successful;

      log('info', `✅ 任务执行完成: 成功=${successful}, 失败=${failed}, 耗时=${executionTime}ms`);

      return {
        success: true,
        data: {
          ...finalResult,
          files,
          summary: this.generateSummary(task, toolExecutions, executionTime),
        },
        metadata: {
          toolExecutions: toolExecutions.map(e => ({
            tool: e.toolCall.tool,
            parameters: e.toolCall.parameters,
            success: e.result.success,
            error: e.result.error,
            timestamp: e.timestamp,
          })),
          iterations: iteration,
          executionTime,
          model: this.llmService.getModel(),
        },
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const executionTime = Date.now() - startTime;
      log('error', `💥 任务执行失败: id=${task.id}, 错误=${errorMsg}, 耗时=${executionTime}ms`);

      return {
        success: false,
        error: errorMsg,
        metadata: {
          toolExecutions,
          executionTime,
        },
      };
    }
  }

  private buildSystemPrompt(task: Task, context: ExecutionContext): string {
    const tools = this.formatTools(context.tools);
    const workDir = context.project.projectPath;
    const role = task.assignedRole || 'product-manager';

    return `你是一个专业的 ${role}，负责分析任务需求并合理拆分。

## 核心职责

### 1. 任务分析与拆分
- 理解用户需求的本质
- 将复杂任务拆分成多个**独立**的子任务
- 每个子任务保持**功能单一**原则
- 一个子任务只做一件事

### 2. 子任务划分原则
- 子任务之间**尽量减少依赖**
- 可以**并行执行**的子任务要分开
- 每个子任务要有明确的**输入和输出**
- 独立自治，不依赖其他子任务的中间结果

### 3. 子任务格式
当需要拆分任务时，必须用以下 XML 格式返回：

<subtasks>
[
  {
    "type": "architecture-design",
    "title": "设计系统架构",
    "description": "设计字母小游戏的整体架构",
    "assignedRole": "architect",
    "priority": "high"
  },
  {
    "type": "development",
    "title": "实现前端界面",
    "description": "使用 HTML/CSS/JS 实现字母显示和交互",
    "assignedRole": "developer",
    "priority": "high"
  },
  {
    "type": "testing",
    "title": "编写测试用例",
    "description": "为核心功能编写单元测试",
    "assignedRole": "tester",
    "priority": "medium"
  }
]
</subtasks>

## 可用角色
- **product-manager**: 产品经理，负责需求分析和任务拆分
- **architect**: 架构师，负责系统设计和技术选型
- **developer**: 开发者，负责代码实现
- **tester**: 测试工程师，负责测试用例
- **doc-writer**: 文档工程师，负责文档编写

## 工作目录
${workDir}

## 执行规则
1. 简单任务可以直接执行，不需要拆分
2. 复杂任务必须拆分成多个子任务
3. 每个子任务只能有一个负责人
4. 拆分后不要自己执行，让子任务智能体并行处理
5. 任务完成后提供完整的结果摘要

## 输出格式
如果你要拆分任务，必须用 <subtasks> 格式
如果你要提供结果，必须用 <result> 格式`;
  }

  private buildTaskPrompt(task: Task, context: ExecutionContext): string {
    let prompt = `## 任务信息

**任务ID**: ${task.id}
**任务标题**: ${task.title}
**任务描述**: ${task.description || '无'}

`;

    if (task.input?.workDir) {
      prompt += `**工作目录**: ${task.input.workDir}\n\n`;
    }

    prompt += `请分析这个任务：
1. 如果是简单任务，直接执行
2. 如果是复杂任务，用 <subtasks> 格式拆分成多个独立子任务
3. 每个子任务要功能单一，独立自治

开始分析并执行：`;    return prompt;
  }

  private formatTools(tools: Map<string, ToolDefinition>): string {
    const toolList: string[] = [];

    for (const [name, def] of tools) {
      const params = this.extractParametersFromSchema(def);
      toolList.push(`${name}: ${def.description || ''}. ${params}`);
    }

    return toolList.join('\n');
  }

  private extractParametersFromSchema(def: ToolDefinition): string {
    if (def.schema) {
      const zodSchema = def.schema as any;
      if (zodSchema._def && zodSchema._def.typeName === 'ZodObject') {
        const shape = zodSchema._def.shape();
        const lines: string[] = [];
        for (const [key, value] of Object.entries(shape)) {
          const prop = value as any;
          let type = 'any';
          if (prop._def) {
            if (prop._def.typeName === 'ZodString') type = 'string';
            else if (prop._def.typeName === 'ZodNumber') type = 'number';
            else if (prop._def.typeName === 'ZodBoolean') type = 'boolean';
            else if (prop._def.typeName === 'ZodArray') type = 'array';
            else if (prop._def.typeName === 'ZodObject') type = 'object';
          }
          const desc = prop.description || '';
          lines.push(`${key}:${type}${desc ? ' ' + desc : ''}`);
        }
        return lines.length > 0 ? lines.join(', ') : '';
      }
    }

    return '';
  }

  private parseSubtasks(content: string): SubTaskDefinition[] {
    const regex = /<subtasks>([\s\S]*?)<\/subtasks>/;
    const match = content.match(regex);

    if (match) {
      try {
        const subtasks = JSON.parse(match[1]);
        return subtasks.map((st: any) => ({
          id: st.id || uuidv4(),
          type: st.type || 'custom',
          title: st.title,
          description: st.description || '',
          assignedRole: st.assignedRole as RoleType,
          priority: st.priority || 'medium',
          dependencies: st.dependencies,
          input: st.input,
        }));
      } catch (e) {
        console.warn('[AgentExecutor] Failed to parse subtasks:', e);
      }
    }

    return [];
  }

  private parseToolCalls(content: string): ToolCall[] {
    const calls: ToolCall[] = [];

    const callRegex = /<tool_call>[\s\S]*?<tool_name>([^<]+)<\/tool_name>[\s\S]*?<parameters>([\s\S]*?)<\/parameters>[\s\S]*?<\/tool_call>/g;

    let match;
    while ((match = callRegex.exec(content)) !== null) {
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

  private async executeTool(
    toolCall: ToolCall,
    context: ExecutionContext
  ): Promise<ToolResult> {
    const tool = this.toolRegistry.get(toolCall.tool);

    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${toolCall.tool}`,
      };
    }

    const workDir = context.project.projectPath;
    const parameters = {
      ...toolCall.parameters,
      workDir: toolCall.parameters.workDir || context.currentTask?.input?.workDir || workDir,
      projectPath: workDir,
    };

    return this.toolRegistry.execute(toolCall.tool, parameters);
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

    if (content.includes('任务完成') || content.includes('已完成')) {
      const summaryMatch = content.match(/总结[:：]\s*([\s\S]+)/i);
      return {
        summary: summaryMatch ? summaryMatch[1].trim() : '任务已完成',
        completed: true,
      };
    }

    return null;
  }

  private extractFinalResultFromConversation(conversation: any[]): any {
    for (let i = conversation.length - 1; i >= 0; i--) {
      const msg = conversation[i];
      if (msg.role === 'assistant') {
        const result = this.extractFinalResult(msg.content);
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

  private extractFilesFromExecutions(executions: ToolExecution[]): any[] {
    const files: any[] = [];

    for (const execution of executions) {
      if (execution.result.success && execution.result.data?.files) {
        files.push(...execution.result.data.files);
      }
    }

    for (const execution of executions) {
      if (execution.result.success && execution.result.data?.content) {
        const path = execution.toolCall.parameters?.filePath;
        if (path && !files.find(f => f.path === path)) {
          files.push({
            path,
            content: execution.result.data.content,
          });
        }
      }
    }

    return files;
  }

  private generateSummary(
    task: Task,
    executions: ToolExecution[],
    executionTime: number
  ): string {
    const successful = executions.filter(e => e.result.success).length;
    const failed = executions.length - successful;

    return `任务"${task.title}"执行完成。
- 总工具调用: ${executions.length}
- 成功: ${successful}
- 失败: ${failed}
- 执行时间: ${(executionTime / 1000).toFixed(2)}秒`;
  }
}
