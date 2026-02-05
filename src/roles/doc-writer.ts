import { BaseRole } from './base.js';
import type {
  RoleDefinition,
  Task,
  ExecutionContext,
  Message,
  LLMResponse,
} from '../types/index.js';
import { WorkDirManager } from '../core/work-dir-manager.js';

/**
 * 文档编写者角色
 * 负责编写和更新项目文档
 */
export class DocWriter extends BaseRole {
  constructor(llmService: any, customPrompt?: string, workDirManager?: WorkDirManager) {
    const definition: RoleDefinition = {
      id: 'doc-writer',
      name: '文档编写者',
      type: 'doc-writer',
      description: '技术文档专家，擅长编写清晰、完整的技术文档',
      responsibilities: [
        '编写项目概览和介绍',
        '维护 API 文档',
        '编写使用指南和教程',
        '更新变更日志',
        '编写架构文档',
        '维护开发指南',
        '生成代码文档',
      ],
      capabilities: [
        '技术写作',
        'API 文档生成',
        '图表绘制',
        '示例代码编写',
        '文档结构设计',
        '版本管理',
      ],
      constraints: [
        '文档必须准确、完整',
        '必须包含示例代码',
        '必须保持更新',
        '必须使用清晰的语言',
        '必须包含必要的图表',
        '必须遵循文档规范',
        '代码示例必须可运行',
      ],
      outputFormat: `输出格式要求：

 ## [文档标题]

 ### 概述
 - 简要描述（2-3句话）

 ### 功能/内容
 - 主要内容
 - 使用场景
 - 关键特性

 ### 使用方法
 \`\`\`language
 // 示例代码
 \`\`\`

 ### 参数说明
 | 参数 | 类型 | 说明 | 必填 |
 |------|------|------|------|

 ### 注意事项
 - 重要提示
 - 常见问题

 ### 相关文档
 - 链接到其他文档`,
      systemPrompt: '',
      temperature: 0.6,
      maxTokens: 5000,
    };

    super(definition, llmService, customPrompt, workDirManager);
  }

  protected async buildTaskPromptImpl(task: Task, context: ExecutionContext): Promise<string> {
    const sections: string[] = [];

    sections.push(`# 文档任务: ${task.title}`);
    sections.push(task.description);
    sections.push('');

    // 添加文档类型
    if (task.input?.docType) {
      sections.push(`## 文档类型: ${task.input.docType}`);
      sections.push('');
    }

    // 添加源内容
    if (task.input?.source) {
      sections.push('## 源内容');
      if (typeof task.input.source === 'object') {
        sections.push(JSON.stringify(task.input.source, null, 2));
      } else {
        sections.push(task.input.source);
      }
      sections.push('');
    }

    // 添加代码示例
    if (task.input?.codeExample) {
      sections.push('## 代码示例');
      sections.push('```');
      sections.push(task.input.codeExample);
      sections.push('```');
      sections.push('');
    }

    // 添加目标受众
    if (task.input?.audience) {
      sections.push(`## 目标受众: ${task.input.audience}`);
      sections.push('');
    }

    // 添加现有文档（如果是更新）
    if (task.input?.existingDoc) {
      sections.push('## 现有文档');
      sections.push(task.input.existingDoc);
      sections.push('');
    }

    // 添加项目信息
    sections.push('## 项目信息');
    sections.push(`- 项目名称: ${context.project.projectName}`);
    sections.push(`- 技术栈: ${task.input?.techStack || 'N/A'}`);
    sections.push('');

    sections.push('## 请编写/更新文档。');

    return sections.join('\n');
  }

  protected async processResponse(
    response: LLMResponse,
    task: Task,
    context: ExecutionContext
  ): Promise<any> {
    const content = response.content;

    const result = {
      title: this.extractTitle(content),
      content: this.cleanContent(content),
      codeExamples: this.extractCodeExamples(content),
      tables: this.extractTables(content),
      metadata: {
        docType: task.input?.docType,
        updatedAt: new Date().toISOString(),
        version: task.input?.version || '1.0.0',
      },
    };

    return result;
  }

  protected async validateOutput(output: any): Promise<any> {
    if (!output.content || output.content.trim().length === 0) {
      throw new Error('文档内容不能为空');
    }

    return output;
  }

  private extractTitle(content: string): string {
    const titleMatch = content.match(/^#+\s+(.+)$/m);
    return titleMatch ? titleMatch[1].trim() : 'Untitled';
  }

  private cleanContent(content: string): string {
    // 移除多余空行
    return content.replace(/\n{3,}/g, '\n\n').trim();
  }

  private extractCodeExamples(content: string): string[] {
    const examples: string[] = [];
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
    const matches = Array.from(content.matchAll(codeBlockRegex));

    return matches.map(match => match[1]);
  }

  private extractTables(content: string): any[] {
    const tables: any[] = [];
    // 简化实现
    return tables;
  }

  getSuggestedTools(): string[] {
    return [
      'file-writer',
      'markdown-formatter',
      'diagram-generator',
      'api-doc-generator',
    ];
  }
}
