import type { Task, TaskMessage } from '../types/index.js';
import { ProjectAgent } from './project-agent.js';
import { LLMServiceFactory } from '../services/llm.service.js';
import { getLLMConfigManager } from '../services/llm-config.js';

/**
 * 任务匹配结果
 */
export interface TaskMatchResult {
  matched: boolean;
  taskId?: string;
  confidence: number; // 0-1，匹配度
  reason?: string;
}

/**
 * 任务匹配器
 * 使用大模型判断新输入是否属于已有任务
 */
export class TaskMatcher {
  private agent: ProjectAgent;

  constructor(agent: ProjectAgent) {
    this.agent = agent;
  }

  /**
   * 判断新输入是否属于已有任务
   */
  async matchTask(
    userInput: string,
    existingTasks: Task[]
  ): Promise<TaskMatchResult> {
    if (existingTasks.length === 0) {
      return {
        matched: false,
        confidence: 0,
        reason: '没有现有任务',
      };
    }

    // 过滤出进行中的任务
    const activeTasks = existingTasks.filter(
      t => t.status === 'pending' || t.status === 'in-progress'
    );

    if (activeTasks.length === 0) {
      return {
        matched: false,
        confidence: 0,
        reason: '没有进行中的任务',
      };
    }

    // 构建提示词
    const prompt = this.buildMatchPrompt(userInput, activeTasks);

    try {
      // 使用LLM判断
      const llmConfig = this.agent.getLLMConfig();
      const manager = getLLMConfigManager();
      const roleConfig = manager.getRoleLLMConfig('product-manager');
      
      if (!roleConfig) {
        // 如果没有配置，使用简单的关键词匹配
        return this.simpleMatch(userInput, activeTasks);
      }

      const llmService = LLMServiceFactory.create(roleConfig);
      const response = await llmService.complete([
        {
          role: 'system',
          content: '你是一个任务分类助手，负责判断用户的新输入是否属于已有的任务。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ], {
        temperature: 0.3,
        maxTokens: 500,
      });

      // 解析响应
      return this.parseMatchResponse(response.content, activeTasks);
    } catch (error) {
      console.error('任务匹配失败，使用简单匹配:', error);
      return this.simpleMatch(userInput, activeTasks);
    }
  }

  /**
   * 构建匹配提示词
   */
  private buildMatchPrompt(userInput: string, tasks: Task[]): string {
    const tasksDescription = tasks.map((task, index) => {
      const messages = task.messages || [];
      const recentMessages = messages.slice(-3); // 最近3条消息
      const messagesText = recentMessages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      return `
任务 ${index + 1} (ID: ${task.id}):
- 标题: ${task.title}
- 描述: ${task.description}
- 状态: ${task.status}
- 负责角色: ${task.assignedRole || '未分配'}
- 最近对话:
${messagesText || '无'}
`;
    }).join('\n');

    return `
现有任务列表：
${tasksDescription}

用户新输入：
"${userInput}"

请判断用户的新输入是否属于上述某个已有任务。如果属于，请返回：
MATCHED:任务ID:匹配度(0-1):原因

如果不属于任何任务，请返回：
NOT_MATCHED:0:原因

只返回结果，不要其他内容。
`;
  }

  /**
   * 解析匹配响应
   */
  private parseMatchResponse(
    response: string,
    tasks: Task[]
  ): TaskMatchResult {
    const lines = response.trim().split('\n');
    const firstLine = lines[0].trim();

    if (firstLine.startsWith('MATCHED:')) {
      const parts = firstLine.split(':');
      if (parts.length >= 4) {
        const taskId = parts[1];
        const confidence = parseFloat(parts[2]) || 0.5;
        const reason = parts.slice(3).join(':');

        // 验证任务ID是否存在
        const task = tasks.find(t => t.id === taskId);
        if (task && confidence > 0.3) {
          return {
            matched: true,
            taskId,
            confidence,
            reason,
          };
        }
      }
    }

    return {
      matched: false,
      confidence: 0,
      reason: 'LLM判断不属于已有任务',
    };
  }

  /**
   * 简单匹配（关键词匹配，作为后备方案）
   */
  private simpleMatch(userInput: string, tasks: Task[]): TaskMatchResult {
    const inputLower = userInput.toLowerCase();
    const keywords = inputLower.split(/\s+/).filter(w => w.length > 2);

    let bestMatch: { task: Task; score: number } | null = null;

    for (const task of tasks) {
      let score = 0;
      const taskText = `${task.title} ${task.description}`.toLowerCase();
      const messages = task.messages || [];
      const messagesText = messages
        .map(m => m.content.toLowerCase())
        .join(' ');
      const fullText = `${taskText} ${messagesText}`;

      // 关键词匹配
      for (const keyword of keywords) {
        if (fullText.includes(keyword)) {
          score += 1;
        }
      }

      // 标题匹配权重更高
      if (task.title.toLowerCase().includes(inputLower) ||
          inputLower.includes(task.title.toLowerCase())) {
        score += 3;
      }

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { task, score };
      }
    }

    if (bestMatch && bestMatch.score >= 2) {
      return {
        matched: true,
        taskId: bestMatch.task.id,
        confidence: Math.min(bestMatch.score / 5, 0.8), // 最高0.8
        reason: `关键词匹配得分: ${bestMatch.score}`,
      };
    }

    return {
      matched: false,
      confidence: 0,
      reason: '关键词匹配失败',
    };
  }
}