/**
 * 智能 AI Agent
 * 类似 Claude Code 的真正 AI Agent，可以：
 * - 理解用户意图
 * - 分析代码和项目
 * - 自主使用工具
 * - 多轮对话
 * - 记忆上下文
 */

import type { ProjectAgent } from '../core/project-agent.js';
import type { Message, LLMResponse } from '../types/index.js';
import { LLMServiceFactory } from '../services/index.js';
import { getLogger } from '../utils/logger.js';

/**
 * 对话消息
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string;
  name: string;
  parameters: any;
  result?: any;
}

/**
 * Agent 配置
 */
export interface AIAgentConfig {
  maxHistory?: number;
  maxToolIterations?: number;
  showThoughts?: boolean;
  autoConfirmTools?: boolean;
  output?: (text: string) => void;
}

/**
 * 智能 AI Agent
 */
export class IntelligentAgent {
  private agent: ProjectAgent;
  private history: ChatMessage[] = [];
  private config: Required<AIAgentConfig>;
  private tools: Map<string, (params: any) => Promise<any>> = new Map();
  private output: (text: string) => void;

  constructor(agent: ProjectAgent, config: AIAgentConfig = {}) {
    this.agent = agent;
    const output = config.output || ((text: string) => console.log(text));
    this.config = {
      maxHistory: 50,
      maxToolIterations: 10,
      showThoughts: false,
      autoConfirmTools: true,
      ...config,
      output,
    };
    this.output = this.config.output;

    this.registerTools();
  }

  private emitOutput(text: string): void {
    this.output(text);
  }

  /**
   * 注册可用工具
   */
  private registerTools(): void {
    // 文件工具
    this.tools.set('read_file', async (params) => {
      return await this.agent.useTool('read-file', params);
    });

    this.tools.set('write_file', async (params) => {
      return await this.agent.useTool('write-file', params);
    });

    this.tools.set('search_files', async (params) => {
      return await this.agent.useTool('search-files', params);
    });

    this.tools.set('list_directory', async (params) => {
      return await this.agent.useTool('list-directory', params);
    });

    // Git 工具
    this.tools.set('git_status', async (params) => {
      return await this.agent.useTool('git-status', params);
    });

    this.tools.set('git_commit', async (params) => {
      return await this.agent.useTool('git-commit', params);
    });

    this.tools.set('git_diff', async (params) => {
      return await this.agent.useTool('git-diff', params);
    });
  }

  /**
   * 聊天 - 主要入口
   */
  async chat(userMessage: string): Promise<string> {
    // 添加用户消息到历史
    this.history.push({
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    });

    // 构建系统提示
    const systemPrompt = this.buildSystemPrompt();

    // 构建消息列表
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...this.history.slice(-this.config.maxHistory).map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    // 多轮对话：直到不需要工具调用或达到最大迭代次数
    let iterations = 0;
    let finalResponse = '';

    while (iterations < this.config.maxToolIterations) {
      iterations++;

      // 调用 LLM
      const llmResponse = await this.callLLM(messages);

      if (!llmResponse) {
        break;
      }

      // 解析响应
      const { response, toolCalls } = this.parseResponse(llmResponse);

      // 如果没有工具调用，返回结果
      if (!toolCalls || toolCalls.length === 0) {
        finalResponse = response;
        break;
      }

      // 显示思考过程
      if (this.config.showThoughts) {
        this.emitOutput(`\nThinking... (iteration ${iterations})\n`);
      }

      // 执行工具调用
      const toolResults = await this.executeTools(toolCalls);

      // 添加助手消息和工具结果到历史
      this.history.push({
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
        toolCalls,
      });

      // 添加工具结果作为用户消息
      messages.push({
        role: 'assistant',
        content: response,
      });

      // 添加工具结果
      for (const result of toolResults) {
        const resultContent = this.formatToolResult(result);
        messages.push({
          role: 'user',
          content: resultContent,
        });
        this.history.push({
          role: 'user',
          content: resultContent,
          timestamp: Date.now(),
        });
      }

      // 如果这是最后一次迭代，获取最终响应
      if (iterations >= this.config.maxToolIterations - 1) {
        const finalLLMResponse = await this.callLLM(messages);
        if (finalLLMResponse) {
          finalResponse = finalLLMResponse.content;
        }
        break;
      }
    }

    // 保存助手响应
    this.history.push({
      role: 'assistant',
      content: finalResponse,
      timestamp: Date.now(),
    });

    return finalResponse;
  }

  /**
   * 构建系统提示
   */
  private buildSystemPrompt(): string {
    const toolList = Array.from(this.tools.keys()).join(', ');

    return `你是一个智能编程助手，类似于 Claude Code。你可以回答任何编程相关的问题，也可以执行各种编程任务。

## 核心能力
1. **回答问题** - 直接回答用户的编程问题、概念解释、最佳实践等
2. **代码理解** - 阅读和分析代码，解释代码逻辑
3. **文件操作** - 读写文件、搜索代码、浏览项目结构
4. **Git 操作** - 查看状态、提交代码、管理版本
5. **问题诊断** - 分析错误、提供修复建议
6. **代码生成** - 根据需求生成代码
7. **重构优化** - 改进代码质量、性能优化

## 可用工具
你可以使用以下工具：
${toolList}

## 工具使用格式
当你需要使用工具时，请按以下格式回复：

\`\`\`tool
<tool_name>
<parameters_json>
\`\`\`

例如：
\`\`\`tool
read_file
{"filePath": "./src/index.ts"}
\`\`\`

## 处理原则

### 对于问题（如"什么是闭包？"、"如何优化这个函数？"）
- **直接回答**：如果不需要查看代码，直接给出答案
- **查看代码**：如果问题涉及具体代码，先读取相关文件再回答
- **提供示例**：给出代码示例帮助理解
- **主动建议**：提供相关的最佳实践和建议

### 对于任务（如"实现登录功能"、"修复这个bug"）
- **理解需求**：先确认理解用户的需求
- **分析现状**：使用工具查看相关代码和文件
- **制定计划**：说明你的解决方案和步骤
- **执行操作**：使用工具读取、修改或创建文件
- **验证结果**：检查修改是否正确
- **清晰解释**：说明你做了什么以及为什么这样做

## 工作流程
1. **理解输入** - 判断是问题还是任务
2. **分析情况** - 如需查看代码，使用工具读取文件
3. **制定方案** - 说明你的思路（对于任务）
4. **执行操作** - 使用工具完成操作（如需要）
5. **验证结果** - 确保结果正确
6. **清晰解释** - 给出清晰的回复和说明

## 重要提示
- **灵活应对**：根据用户输入灵活选择回答或执行任务
- **主动思考**：在使用工具前，先说明你打算做什么
- **清晰沟通**：使用工具后，解释结果和下一步
- **代码展示**：如果需要修改文件，先展示修改内容
- **提供建议**：主动发现潜在问题并提供改进建议
- **简洁明了**：回复要简洁，直接回答核心问题

## 回复风格
- 简洁明了，直接回答问题或说明任务
- 使用代码块展示代码（用 \`\`\`language 格式）
- 用emoji标记重要信息（✅ 成功、⚠️ 警告、❌ 错误、💡 提示）
- 主动提供相关建议和最佳实践
- 对于复杂任务，分步骤说明`;
  }

  /**
   * 调用 LLM
   */
  private async callLLM(messages: Message[]): Promise<LLMResponse | null> {
    try {
      // 获取 LLM 服务
      const llmService = LLMServiceFactory.createForRole('developer');

      if (!llmService) {
        // 获取配置管理器以提供更详细的错误信息
        const { getLLMConfigManager } = await import('../services/llm-config.js');
        const manager = getLLMConfigManager();
        const validation = await manager.validateConfig();

        // 构建友好的错误信息
        const errorMessages: string[] = [];
        errorMessages.push('❌ 无法获取 LLM 服务');
        errorMessages.push('');
        errorMessages.push('可能的原因：');
        
        if (validation.summary.enabledProviders === 0) {
          errorMessages.push('  • 没有启用任何 LLM 提供商');
          errorMessages.push('  • 请编辑 ~/.agent-team/config.yaml，将至少一个提供商的 enabled 设为 true');
        } else if (validation.summary.readyToUse === 0) {
          errorMessages.push('  • 已启用的提供商未正确配置 API Key');
          errorMessages.push('  • 请检查配置文件中的 apiKey 字段或设置相应的环境变量');
        } else {
          errorMessages.push('  • 角色 "developer" 未映射到可用的提供商');
          errorMessages.push('  • 请检查配置文件中的 roleMapping 配置');
        }

        errorMessages.push('');
        errorMessages.push('💡 解决方案：');
        errorMessages.push('  1. 运行 "project-agent config show" 查看当前配置');
        errorMessages.push('  2. 运行 "project-agent config test" 测试配置');
        errorMessages.push('  3. 编辑 ~/.agent-team/config.yaml 启用并配置提供商');
        errorMessages.push('  4. 设置环境变量，例如：export ANTHROPIC_API_KEY=sk-ant-xxx');

        throw new Error(errorMessages.join('\n'));
      }

      const logger = getLogger();
      logger.debug('调用 LLM', { messagesCount: messages.length });
      
      const response = await llmService.complete(messages);
      
      logger.debug('LLM 响应', { 
        contentLength: response.content?.length || 0,
      });
      
      return response;
    } catch (error) {
      const logger = getLogger();
      logger.error('LLM 调用失败', { error });
      
      // 如果是我们自定义的错误，直接抛出
      if (error instanceof Error && error.message.includes('❌')) {
        throw error;
      }
      
      // 其他错误，包装成友好信息
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // 检查是否是网络或 API 错误
      if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('timeout')) {
        throw new Error(`❌ 网络连接失败\n\n可能的原因：\n  • 网络连接问题\n  • API 服务不可用\n  • 请求超时\n\n💡 请检查网络连接后重试`);
      }
      
      if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('unauthorized')) {
        throw new Error(`❌ API 认证失败\n\n可能的原因：\n  • API Key 无效或已过期\n  • API Key 权限不足\n\n💡 解决方案：\n  1. 检查配置文件中的 apiKey\n  2. 确认环境变量已正确设置\n  3. 在提供商网站验证 API Key 是否有效`);
      }

      if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        throw new Error(`❌ API 请求频率限制\n\n可能的原因：\n  • 请求过于频繁\n  • 达到 API 使用限额\n\n💡 解决方案：\n  1. 稍后重试\n  2. 检查 API 使用配额\n  3. 考虑升级 API 计划`);
      }

      // 默认错误信息
      throw new Error(`❌ LLM 调用失败\n\n错误详情：${errorMessage}\n\n💡 请检查：\n  1. 配置文件是否正确\n  2. API Key 是否有效\n  3. 网络连接是否正常`);
    }
  }

  /**
   * 解析 LLM 响应
   */
  private parseResponse(response: LLMResponse): {
    response: string;
    toolCalls: ToolCall[];
  } {
    const content = response.content || '';
    const toolCalls: ToolCall[] = [];

    // 解析工具调用
    const toolRegex = /```tool\s+(\w+)\s+(\{.*?\})\s*```/gs;
    let match;

    while ((match = toolRegex.exec(content)) !== null) {
      toolCalls.push({
        id: `tool_${Date.now()}_${toolCalls.length}`,
        name: match[1],
        parameters: JSON.parse(match[2]),
      });
    }

    // 移除工具调用块，得到纯文本响应
    const cleanResponse = content.replace(/```tool\s+.*?```/gs, '').trim();

    return {
      response: cleanResponse,
      toolCalls,
    };
  }

  /**
   * 执行工具调用
   */
  private async executeTools(toolCalls: ToolCall[]): Promise<Array<{ call: ToolCall; result: any }>> {
    const results = [];

    for (const call of toolCalls) {
      try {
        const toolFunc = this.tools.get(call.name);

        if (!toolFunc) {
          results.push({
            call,
            result: { success: false, error: `未知工具: ${call.name}` },
          });
          continue;
        }

      // 显示工具调用信息
      const toolDisplayName = this.getToolDisplayName(call.name);
      const logger = getLogger();
      logger.debug('执行工具', { tool: call.name, parameters: call.parameters });
      
      this.emitOutput(`\n[tool] ${toolDisplayName}\n`);
      
      if (this.config.showThoughts) {
        this.emitOutput(`   params: ${JSON.stringify(call.parameters, null, 2)}\n`);
      }

      // 如果需要确认且未自动确认，询问用户
      if (!this.config.autoConfirmTools && this.isDangerousTool(call.name)) {
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(`   ⚠️  这是一个危险操作，是否继续？(y/n): `, (ans) => {
            rl.close();
            resolve(ans.trim().toLowerCase());
          });
        });

        if (answer !== 'y' && answer !== 'yes' && answer !== '是') {
          results.push({
            call,
            result: { success: false, error: '用户取消了操作' },
          });
          this.emitOutput(`   canceled\n`);
          continue;
        }
      }

      // 执行工具
      const result = await toolFunc(call.parameters);

      // 记录结果
      call.result = result;

      results.push({
        call,
        result,
      });

      // 显示结果摘要（简化显示，主要信息在最终回复中）
        if (result.success) {
          logger.debug('工具执行成功', { tool: call.name });
          if (this.config.showThoughts) {
            this.emitOutput(`   success\n`);
          }
        } else {
          logger.warn('工具执行失败', { tool: call.name, error: result.error });
          this.emitOutput(`   failed: ${result.error}\n`);
        }

      } catch (error) {
        results.push({
          call,
          result: { success: false, error: String(error) },
        });
        this.emitOutput(`   error: ${error}\n`);
      }
    }

    return results;
  }

  /**
   * 获取工具显示名称
   */
  private getToolDisplayName(toolName: string): string {
    const displayNames: Record<string, string> = {
      'read_file': '📖 读取文件',
      'write_file': '✏️  写入文件',
      'search_files': '🔍 搜索文件',
      'list_directory': '📁 列出目录',
      'git_status': '📊 Git 状态',
      'git_commit': '💾 Git 提交',
      'git_diff': '📝 Git 差异',
    };
    return displayNames[toolName] || `🔧 ${toolName}`;
  }

  /**
   * 判断是否是危险工具
   */
  private isDangerousTool(toolName: string): boolean {
    const dangerousTools = ['write_file', 'delete_file', 'git_commit', 'git_push'];
    return dangerousTools.includes(toolName);
  }

  /**
   * 格式化工具结果
   */
  private formatToolResult(result: { call: ToolCall; result: any }): string {
    const { call, result: res } = result;

    let output = `工具 ${call.name} 的执行结果:\n`;

    if (res.success === false) {
      output += `错误: ${res.error}\n`;
    } else if (res.data) {
      // 如果是文件读取结果
      if (res.data.content) {
        output += `\n文件内容:\n${res.data.content}\n`;
      } else {
        output += `\n结果:\n${JSON.stringify(res.data, null, 2)}\n`;
      }
    }

    return output;
  }

  /**
   * 清除历史
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * 获取历史
   */
  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  /**
   * 设置配置
   */
  setConfig(config: Partial<AIAgentConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 分析项目
   */
  async analyzeProject(projectPath?: string): Promise<string> {
    return await this.chat(`请分析当前项目的结构和主要功能${projectPath ? ` (${projectPath})` : ''}`);
  }

  /**
   * 修复错误
   */
  async fixError(errorMessage: string, context?: string): Promise<string> {
    let message = `遇到以下错误，请帮我分析并修复：\n\`\`\`\n${errorMessage}\n\`\`\``;

    if (context) {
      message += `\n\n相关代码：\n\`\`\`\n${context}\n\`\`\``;
    }

    return await this.chat(message);
  }

  /**
   * 生成代码
   */
  async generateCode(requirement: string, context?: string): Promise<string> {
    let message = `请生成以下代码：\n${requirement}`;

    if (context) {
      message += `\n\n上下文：\n\`\`\`\n${context}\n\`\`\``;
    }

    return await this.chat(message);
  }
}

/**
 * 创建 AI Agent
 */
export function createIntelligentAgent(
  agent: ProjectAgent,
  config?: AIAgentConfig
): IntelligentAgent {
  return new IntelligentAgent(agent, config);
}
