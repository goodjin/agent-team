import { Agent } from '../../domain/agent/index.js';
import { Task } from '../../domain/task/index.js';
import { ToolRegistry, ToolContext } from '../../domain/tool/index.js';
import { LLMService, Message, ToolCall } from '../../infrastructure/llm/index.js';
import { ILogger } from '../../infrastructure/logger/index.js';
import { IEventBus } from '../../infrastructure/event-bus/index.js';
import * as path from 'path';

/**
 * 执行上下文
 */
interface ExecutionContext {
  agent: Agent;
  task: Task;
  messages: Message[];
  iterationCount: number;
}

/**
 * Agent执行引擎
 * 实现ReAct（Reasoning + Acting）执行循环
 */
export class AgentExecutionEngine {
  constructor(
    private llmService: LLMService,
    private toolRegistry: ToolRegistry,
    private logger: ILogger,
    private eventBus: IEventBus,
    private maxIterations: number = 50
  ) {}

  /**
   * 执行Agent任务
   * @param agent - Agent实例
   * @param task - 任务
   */
  async execute(agent: Agent, task: Task): Promise<void> {
    const context: ExecutionContext = {
      agent,
      task,
      messages: this.buildInitialMessages(agent, task),
      iterationCount: 0
    };

    // 发布进度更新（开始）
    await this.updateProgress(context, 0);

    try {
      while (context.iterationCount < this.maxIterations) {
        context.iterationCount++;

        // 计算当前进度（基于迭代次数）
        const progress = Math.min(90, Math.floor((context.iterationCount / this.maxIterations) * 100));
        await this.updateProgress(context, progress);

        // 1. 调用LLM思考
        const response = await this.think(context);

        // 2. 检查是否有工具调用
        if (response.message.toolCalls && response.message.toolCalls.length > 0) {
          // 3. 执行工具
          for (const toolCall of response.message.toolCalls) {
            await this.executeTool(context, toolCall);
          }
        } else {
          // 无工具调用，任务完成
          await this.logCompletion(context, response.message.content);
          break;
        }
      }

      if (context.iterationCount >= this.maxIterations) {
        throw new Error(`Max iterations (${this.maxIterations}) reached`);
      }

      // 发布进度更新（完成）
      await this.updateProgress(context, 100);
    } catch (error) {
      // 记录错误
      await this.logger.log({
        timestamp: new Date(),
        level: 'error',
        taskId: context.task.id,
        agentId: context.agent.id,
        type: 'error',
        content: `Agent执行失败: ${error instanceof Error ? error.message : String(error)}`,
        metadata: { iteration: context.iterationCount }
      });
      throw error;
    }
  }

  /**
   * 更新任务进度
   */
  private async updateProgress(context: ExecutionContext, percent: number): Promise<void> {
    // 发布进度事件（用于 WebSocket 推送）
    await this.eventBus.publish({
      type: 'task.progress',
      timestamp: new Date(),
      payload: {
        taskId: context.task.id,
        percent,
        iteration: context.iterationCount
      }
    });
  }

  /**
   * 思考阶段：调用LLM获取下一步行动
   */
  private async think(context: ExecutionContext): Promise<{ message: Message; usage: { prompt: number; completion: number; total: number } }> {
    // 记录思考开始
    await this.logger.log({
      timestamp: new Date(),
      level: 'debug',
      taskId: context.task.id,
      agentId: context.agent.id,
      type: 'thought',
      content: 'Agent正在思考...',
      metadata: { iteration: context.iterationCount }
    });

    // 转换工具定义为LLM格式
    const tools = this.toolRegistry.list().map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));

    // 调用LLM
    const response = await this.llmService.chatDefault({
      messages: context.messages,
      tools,
      temperature: 0.7,
      maxTokens: 4000
    });

    // 记录思考结果
    await this.logger.log({
      timestamp: new Date(),
      level: 'info',
      taskId: context.task.id,
      agentId: context.agent.id,
      type: 'thought',
      content: response.message.content || (response.message.toolCalls ? '执行工具调用' : ''),
      metadata: {
        iteration: context.iterationCount,
        hasToolCalls: !!response.message.toolCalls?.length,
        usage: response.usage
      }
    });

    // 添加到消息历史
    context.messages.push(response.message);

    return response;
  }

  /**
   * 执行工具调用
   */
  private async executeTool(context: ExecutionContext, toolCall: ToolCall): Promise<void> {
    const tool = this.toolRegistry.get(toolCall.name);
    if (!tool) {
      throw new Error(`Tool not found: ${toolCall.name}`);
    }

    // 记录工具调用
    await this.logger.log({
      timestamp: new Date(),
      level: 'info',
      taskId: context.task.id,
      agentId: context.agent.id,
      type: 'tool_call',
      content: `调用工具: ${toolCall.name}`,
      metadata: {
        toolName: toolCall.name,
        toolInput: toolCall.arguments
      }
    });

    // 确保工作目录存在（使用绝对路径）
    const { mkdir } = await import('fs/promises');
    const workingDirectory = path.resolve(process.cwd(), `data/workspaces/${context.task.id}`);
    try {
      await mkdir(workingDirectory, { recursive: true });
    } catch (e) {
      // 目录可能已存在，忽略错误
    }

    // 执行工具
    const startTime = Date.now();
    const toolContext: ToolContext = {
      taskId: context.task.id,
      agentId: context.agent.id,
      workingDirectory
    };

    let result;
    try {
      result = await tool.execute(toolCall.arguments, toolContext);
    } catch (error) {
      result = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    const duration = Date.now() - startTime;

    // 记录工具结果
    await this.logger.log({
      timestamp: new Date(),
      level: result.success ? 'info' : 'error',
      taskId: context.task.id,
      agentId: context.agent.id,
      type: 'tool_result',
      content: result.success ? '工具执行成功' : `工具执行失败: ${result.error}`,
      metadata: {
        toolName: toolCall.name,
        toolOutput: result.success ? result.data : result.error,
        duration
      }
    });

    // 如果是写文件操作且成功，触发artifact事件
    if (tool.name === 'write_file' && result.success) {
      await this.eventBus.publish({
        type: 'file.created',
        timestamp: new Date(),
        payload: {
          taskId: context.task.id,
          filePath: toolCall.arguments.path,
          fileSize: Buffer.byteLength(toolCall.arguments.content || '', 'utf-8')
        }
      });
    }

    // 添加工具结果到消息历史
    context.messages.push({
      role: 'tool',
      content: JSON.stringify(result.success ? result.data : { error: result.error }),
      toolCallId: toolCall.id
    });
  }

  /**
   * 构建初始消息
   */
  private buildInitialMessages(agent: Agent, task: Task): Message[] {
    return [
      {
        role: 'system',
        content: agent.context.systemPrompt
      },
      {
        role: 'user',
        content: `请完成以下任务:

标题: ${task.title}
描述: ${task.description || '无'}

## 执行要求

1. **分析任务**：理解任务目标，规划执行步骤
2. **使用工具**：使用 write_file 等工具执行具体操作
3. **输出成品**：所有最终成果必须保存为文件！

## 成品输出规则（重要！）

以下类型的输出**必须**使用 write_file 工具保存为文件：
- 📄 **报告**：研究报告、分析报告、调研报告 → 保存为 report.md 或类似文件
- 📋 **规格说明**：PRD、技术规格、需求文档 → 保存为 spec.md 或 PRD.md
- 📖 **指南**：使用指南、部署指南、开发指南 → 保存为 GUIDE.md
- 📝 **文档**：API文档、架构文档、README → 保存为对应 .md 文件
- 💻 **代码**：源代码、脚本 → 保存为对应语言文件
- 📊 **数据**：JSON、CSV、配置文件 → 保存为对应格式文件

## 文件命名建议
- 使用有意义的英文名称
- Markdown 文档用 .md 后缀
- 代码文件用对应语言后缀
- 可以创建多个文件组织内容

完成后请简要总结：创建了哪些文件，存放在哪里。`
      }
    ];
  }

  /**
   * 记录任务完成
   */
  private async logCompletion(context: ExecutionContext, summary: string): Promise<void> {
    await this.logger.log({
      timestamp: new Date(),
      level: 'info',
      taskId: context.task.id,
      agentId: context.agent.id,
      type: 'milestone',
      content: `任务完成: ${summary}`,
      metadata: { totalIterations: context.iterationCount }
    });
  }
}
