import type {
  RoleDefinition,
  Task,
  ToolResult,
  ExecutionContext,
  Message,
  LLMResponse,
  RoleOutput,
  RoleOutputMetadata,
  ValidationResult,
} from '../types/index.js';
import { LLMService } from '../services/llm.service.js';
import { getPromptLoader } from '../prompts/loader.js';
import { WorkDirManager } from '../core/work-dir-manager.js';

/**
 * 基础角色类
 * 所有具体角色都应该继承这个类
 */
export abstract class BaseRole {
  protected definition: RoleDefinition;
  protected llmService: LLMService;
  protected customSystemPrompt?: string;
  protected workDirManager: WorkDirManager;

  constructor(
    definition: RoleDefinition,
    llmService: LLMService,
    customPrompt?: string,
    workDirManager?: WorkDirManager
  ) {
    this.definition = definition;
    this.llmService = llmService;
    this.customSystemPrompt = customPrompt;
    this.workDirManager = workDirManager || new WorkDirManager();

    // 如果提供了自定义提示词，更新定义
    if (customPrompt) {
      this.definition.systemPrompt = customPrompt;
    }
  }

  /**
   * 获取角色定义
   */
  getDefinition(): RoleDefinition {
    return this.definition;
  }

  /**
   * 执行任务
   */
  async execute(task: Task, context: ExecutionContext): Promise<ToolResult> {
    try {
      // 1. 准备上下文
      const messages = await this.prepareMessages(task, context);

      // 2. 调用 LLM
      const response = await this.callLLM(messages);

      // 3. 处理响应
      const result = await this.processResponse(response, task, context);

      // 4. 验证输出
      const validated = await this.validateOutput(result);

      return {
        success: true,
        data: validated,
        metadata: {
          role: this.definition.type,
          taskType: task.type,
          model: this.llmService.getModel(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 准备消息
   */
  protected async prepareMessages(
    task: Task,
    context: ExecutionContext
  ): Promise<Message[]> {
    const messages: Message[] = [
      {
        role: 'system',
        content: this.buildSystemPrompt(context),
      },
    ];

    // 添加历史上下文
    for (const result of context.history) {
      if (result.metadata?.conversation) {
        messages.push(...result.metadata.conversation);
      }
    }

    // 添加当前任务
    messages.push({
      role: 'user',
      content: await this.buildTaskPrompt(task, context),
    });

    return messages;
  }

  /**
   * 构建系统提示词
   */
  protected buildSystemPrompt(context: ExecutionContext): string {
    // 如果定义中有 systemPrompt，直接使用
    if (this.definition.systemPrompt) {
      let prompt = this.definition.systemPrompt;

      // 添加项目信息
      prompt += `\n\n## 项目信息\n`;
      prompt += `- 项目名称: ${context.project.projectName}\n`;
      prompt += `- 项目路径: ${context.project.projectPath}\n`;

      // 添加项目约束
      if (context.project.constraints) {
        prompt += `\n## 项目约束\n`;
        if (context.project.constraints.codeStyle) {
          prompt += `- 代码风格: ${context.project.constraints.codeStyle}\n`;
        }
        if (context.project.constraints.testCoverage) {
          prompt += `- 测试覆盖率要求: ${context.project.constraints.testCoverage}%\n`;
        }
        if (context.project.constraints.customStandards) {
          context.project.constraints.customStandards.forEach(standard => {
            prompt += `- ${standard}\n`;
          });
        }
      }

      return prompt;
    }

    // 否则使用默认的构建方式
    const { definition } = this;

    return `你是一个${definition.name}（${definition.type}）。

${definition.description}

## 职责
${definition.responsibilities.map(r => `- ${r}`).join('\n')}

## 能力
${definition.capabilities.map(c => `- ${c}`).join('\n')}

## 约束
${definition.constraints.map(c => `- ${c}`).join('\n')}

## 输出格式
${definition.outputFormat}

## 项目信息
- 项目名称: ${context.project.projectName}
- 项目路径: ${context.project.projectPath}

请严格按照你的角色定义和约束条件来执行任务。`;
  }

  /**
   * 构建工作目录提示词
   */
  protected buildWorkDirPrompt(task: Task): string {
    const taskId = task.metadata?.taskId || task.id;
    const state = this.workDirManager.getWorkDir(taskId);
    if (!state) return '';

    const structureDescriptions = [
      { path: 'src/', purpose: '源代码文件' },
      { path: 'tests/', purpose: '测试文件' },
      { path: 'docs/', purpose: '文档文件' },
      { path: '.agent-state/', purpose: '状态文件' },
    ];

    const structureTable = structureDescriptions
      .map(d => `| \`${d.path}\` | ${d.purpose} |`)
      .join('\n');

    const filesList = state.files.length > 0
      ? state.files.map(f => `- ${f}`).join('\n')
      : '- (暂无文件)';

    return `
## 工作目录信息

**重要**: 所有文件操作必须在此目录下进行！

**工作目录**: \`${state.rootPath}\`

### 目录结构
| 目录 | 用途 |
|-----|------|
${structureTable}

### 当前文件列表
${filesList}
`.trim();
  }

  /**
   * 构建任务提示词
   */
  protected async buildTaskPrompt(task: Task, context: ExecutionContext): Promise<string> {
    const basePrompt = await this.buildTaskPromptImpl(task, context);
    const workDirPrompt = this.buildWorkDirPrompt(task);

    if (workDirPrompt) {
      return `${basePrompt}\n\n${workDirPrompt}`;
    }
    return basePrompt;
  }

  /**
   * 任务提示词实现（子类需重写）
   */
  protected abstract buildTaskPromptImpl(task: Task, context: ExecutionContext): Promise<string>;

  /**
   * 调用 LLM
   */
  protected async callLLM(messages: Message[]): Promise<LLMResponse> {
    const temperature = this.definition.temperature ?? 0.7;
    const maxTokens = this.definition.maxTokens ?? 4000;

    return this.llmService.complete(messages, {
      temperature,
      maxTokens,
    });
  }

  /**
   * 处理 LLM 响应
   */
  protected abstract processResponse(
    response: LLMResponse,
    task: Task,
    context: ExecutionContext
  ): Promise<any>;

  /**
   * 验证输出
   */
  protected async validateOutput(output: any): Promise<any> {
    // 子类可以重写此方法来验证输出
    return output;
  }

  /**
   * 检查是否可以执行任务
   */
  canHandle(task: Task): boolean {
    return task.assignedRole === this.definition.type;
  }

  /**
   * 获取角色建议的工具
   */
  getSuggestedTools(): string[] {
    // 子类可以重写此方法
    return [];
  }
}

/**
 * 输出验证器
 * 提供角色输出的验证和标准化功能
 */
export class OutputValidator {
  /**
   * 验证角色输出
   */
  static validate(output: any, role: string): RoleOutput {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证必需字段
    if (!output) {
      errors.push('输出不能为空');
      return this.buildResult(null, role, errors, warnings);
    }

    if (!output.content) {
      errors.push('输出缺少必需字段: content');
    }

    // 检查内容长度
    if (output.content && typeof output.content === 'string' && output.content.length < 10) {
      warnings.push('输出内容可能过于简短');
    }

    // 构建标准化输出
    const metadata: RoleOutputMetadata = {
      role,
      taskType: output.taskType || 'unknown',
      model: output.model || 'unknown',
      tokensUsed: output.tokensUsed || 0,
      duration: output.duration || 0,
    };

    return {
      content: output.content || '',
      metadata,
      data: output.data,
    };
  }

  /**
   * 验证文件操作
   */
  static validateFileOperations(files: any[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(files)) {
      errors.push('文件操作必须是数组');
      return { valid: false, errors, warnings };
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (!file.path) {
        errors.push(`第 ${i + 1} 个文件操作缺少 path 字段`);
      }

      if (!file.action) {
        errors.push(`文件 ${file.path || `第 ${i + 1} 个`} 缺少 action 字段`);
      } else if (!['create', 'update', 'delete'].includes(file.action)) {
        errors.push(`文件 ${file.path || `第 ${i + 1} 个`} 的 action 无效`);
      }

      if (file.action === 'create' && !file.content) {
        warnings.push(`文件 ${file.path || `第 ${i + 1} 个`} 是新建操作但没有提供 content`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 验证问题列表
   */
  static validateIssues(issues: any[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(issues)) {
      return { valid: true, errors, warnings };
    }

    const validSeverities = ['error', 'warning', 'info'];

    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];

      if (!issue.message) {
        errors.push(`第 ${i + 1} 个问题缺少 message 字段`);
      }

      if (issue.severity && !validSeverities.includes(issue.severity)) {
        warnings.push(`第 ${i + 1} 个问题的 severity 无效，将使用默认的 'info'`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 构建验证结果
   */
  private static buildResult(
    output: RoleOutput | null,
    role: string,
    errors: string[],
    warnings: string[]
  ): RoleOutput {
    if (!output) {
      return {
        content: '',
        metadata: {
          role,
          taskType: 'unknown',
          model: 'unknown',
          tokensUsed: 0,
          duration: 0,
        },
      };
    }

    return output;
  }
}
