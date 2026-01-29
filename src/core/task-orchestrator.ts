import { ProjectAgent } from './project-agent.js';
import { TaskMatcher, TaskMatchResult } from './task-matcher.js';
import type { Task, TaskMessage, RoleType } from '../types/index.js';
import { LLMServiceFactory } from '../services/llm.service.js';
import { getLLMConfigManager } from '../services/llm-config.js';
import { RoleFactory } from '../roles/index.js';

/**
 * 任务编排器
 * 负责：
 * 1. 判断新输入是否属于已有任务
 * 2. 智能分配角色
 * 3. 复杂任务拆分
 */
export class TaskOrchestrator {
  private agent: ProjectAgent;
  private matcher: TaskMatcher;

  constructor(agent: ProjectAgent) {
    this.agent = agent;
    this.matcher = new TaskMatcher(agent);
  }

  /**
   * 处理用户输入，判断是否属于已有任务或创建新任务
   */
  async processUserInput(userInput: string): Promise<{
    task: Task;
    isNew: boolean;
    matchResult?: TaskMatchResult;
  }> {
    const taskManager = this.agent.getTaskManager();
    const allTasks = taskManager.getAllTasks();

    // 尝试匹配已有任务
    const matchResult = await this.matcher.matchTask(userInput, allTasks);

    if (matchResult.matched && matchResult.taskId) {
      // 属于已有任务，添加到消息历史
      const task = taskManager.getTask(matchResult.taskId);
      if (task) {
        taskManager.addMessage(matchResult.taskId, {
          role: 'user',
          content: userInput,
          timestamp: new Date(),
        });

        return {
          task,
          isNew: false,
          matchResult,
        };
      }
    }

    // 创建新任务
    const roleAssignment = await this.assignRole(userInput);
    const task = taskManager.createTask({
      title: await this.generateTaskTitle(userInput),
      description: userInput,
      assignedRole: roleAssignment.role,
      ownerRole: roleAssignment.needsProjectManager ? 'product-manager' : roleAssignment.role,
      priority: roleAssignment.priority,
      initialMessage: userInput,
    });

    return {
      task,
      isNew: true,
      matchResult,
    };
  }

  /**
   * 智能分配角色
   */
  private async assignRole(userInput: string): Promise<{
    role: RoleType;
    needsProjectManager: boolean;
    priority: 'low' | 'medium' | 'high' | 'critical';
  }> {
    try {
      const manager = getLLMConfigManager();
      const roleConfig = manager.getRoleLLMConfig('product-manager');
      
      if (!roleConfig) {
        // 默认分配
        return {
          role: 'developer',
          needsProjectManager: false,
          priority: 'medium',
        };
      }

      const llmService = LLMServiceFactory.create(roleConfig);
      const prompt = `分析以下用户需求，判断应该分配给哪个角色执行，以及是否需要项目经理拆分任务。

用户需求：
"${userInput}"

可用角色：
- product-manager: 产品经理，负责需求分析和任务拆分
- architect: 架构师，负责系统设计
- developer: 开发者，负责代码实现
- tester: 测试工程师，负责测试
- doc-writer: 文档编写者，负责文档

请返回JSON格式：
{
  "role": "角色名称",
  "needsProjectManager": true/false,
  "priority": "low/medium/high/critical",
  "reason": "原因"
}

只返回JSON，不要其他内容。`;

      const response = await llmService.complete([
        {
          role: 'system',
          content: '你是一个任务分配助手，负责分析用户需求并分配给合适的角色。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ], {
        temperature: 0.3,
        maxTokens: 300,
      });

      // 解析响应
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          role: result.role || 'developer',
          needsProjectManager: result.needsProjectManager || false,
          priority: result.priority || 'medium',
        };
      }
    } catch (error) {
      console.error('角色分配失败:', error);
    }

    // 默认分配
    return {
      role: 'developer',
      needsProjectManager: false,
      priority: 'medium',
    };
  }

  /**
   * 生成任务标题
   */
  private async generateTaskTitle(userInput: string): Promise<string> {
    // 简单实现：取前50个字符
    if (userInput.length <= 50) {
      return userInput;
    }

    // 尝试使用LLM生成标题
    try {
      const manager = getLLMConfigManager();
      const roleConfig = manager.getRoleLLMConfig('product-manager');
      
      if (roleConfig) {
        const llmService = LLMServiceFactory.create(roleConfig);
        const response = await llmService.complete([
          {
            role: 'user',
            content: `为以下需求生成一个简洁的任务标题（不超过20字）：\n\n"${userInput}"\n\n只返回标题，不要其他内容。`,
          },
        ], {
          temperature: 0.5,
          maxTokens: 50,
        });

        const title = response.content.trim();
        if (title.length > 0 && title.length <= 50) {
          return title;
        }
      }
    } catch (error) {
      console.error('生成标题失败:', error);
    }

    // 后备方案
    return userInput.substring(0, 47) + '...';
  }

  /**
   * 执行任务（支持对话式执行）
   */
  async executeTaskWithChat(taskId: string): Promise<{
    response: string;
    tokensUsed?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }> {
    const taskManager = this.agent.getTaskManager();
    const task = taskManager.getTask(taskId);
    
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (!task.assignedRole) {
      throw new Error(`Task has no assigned role: ${taskId}`);
    }

    // 获取角色的LLM服务
    const manager = getLLMConfigManager();
    const roleLLMConfig = manager.getRoleLLMConfig(task.assignedRole);
    
    if (!roleLLMConfig) {
      throw new Error(`No LLM config for role: ${task.assignedRole}`);
    }

    const llmService = LLMServiceFactory.create(roleLLMConfig);
    const role = RoleFactory.createRole(task.assignedRole, llmService);
    
    // 构建消息历史
    const messages = (task.messages || []).map(m => ({
      role: m.role,
      content: m.content,
    }));

    // 执行任务
    const result = await taskManager.executeTask(taskId);

    // 添加助手回复
    if (result.success && result.data) {
      const assistantMessage: TaskMessage = {
        role: 'assistant',
        content: typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
        timestamp: new Date(),
      };
      taskManager.addMessage(taskId, assistantMessage);
    }

    return {
      response: result.success 
        ? (typeof result.data === 'string' ? result.data : JSON.stringify(result.data))
        : result.error || '执行失败',
      tokensUsed: result.metadata?.tokensUsed,
    };
  }
}