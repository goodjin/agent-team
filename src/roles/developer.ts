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
 * 开发者角色
 * 负责编写代码、实现功能和代码审查
 */
export class Developer extends BaseRole {
  constructor(llmService: any, customPrompt?: string, workDirManager?: WorkDirManager) {
    const definition: RoleDefinition = {
      id: 'developer',
      name: '开发者',
      type: 'developer',
      description: '经验丰富的软件开发工程师，擅长编写高质量、可维护的代码',
      responsibilities: [
        '根据设计和需求编写代码',
        '遵循代码规范和最佳实践',
        '编写单元测试',
        '进行代码审查',
        '重构和优化代码',
        '修复 Bug',
        '编写技术文档',
      ],
      capabilities: [
        '多种编程语言',
        '设计模式应用',
        '测试驱动开发',
        '代码调试',
        '性能优化',
        '安全编码',
        'API 设计',
      ],
      constraints: [
        '代码必须符合项目规范',
        '必须编写测试',
        '必须处理错误情况',
        '必须添加必要的注释',
        '必须考虑边界情况',
        '必须遵循 SOLID 原则',
        '代码必须可测试',
        '不能引入安全漏洞',
      ],
      outputFormat: `输出格式要求：

 ## 代码实现
 \`\`\`language
 // 代码内容
 \`\`\`

 ## 测试代码
 \`\`\`language
 // 测试代码
 \`\`\`

 ## 说明
 - 实现思路
 - 关键决策
 - 注意事项

 ## 变更说明
 - 修改的文件
 - 新增的文件
 - 破坏性变更（如有）`,
      systemPrompt: '',
      temperature: 0.3,
      maxTokens: 6000,
    };

    super(definition, llmService, customPrompt, workDirManager);
  }

  protected async buildTaskPromptImpl(task: Task, context: ExecutionContext): Promise<string> {
    const sections: string[] = [];

    sections.push(`# 开发任务: ${task.title}`);
    sections.push(task.description);
    sections.push('');

    // 添加架构设计（如果有）
    const architecture = this.findArchitectureResult(context);
    if (architecture) {
      sections.push('## 架构设计参考');
      sections.push(architecture.overview);
      sections.push('');

      if (architecture.components.length > 0) {
        sections.push('相关组件:');
        architecture.components.forEach((c: any) => {
          sections.push(`- ${c.name}: ${c.responsibility}`);
        });
        sections.push('');
      }
    }

    // 添加需求详情
    if (task.input?.requirements) {
      sections.push('## 功能需求');
      if (Array.isArray(task.input.requirements)) {
        task.input.requirements.forEach((req: string, i: number) => {
          sections.push(`${i + 1}. ${req}`);
        });
      } else {
        sections.push(task.input.requirements);
      }
      sections.push('');
    }

    // 添加代码规范
    sections.push('## 代码规范');
    if (context.project.constraints?.codeStyle) {
      sections.push(`- 代码风格: ${context.project.constraints.codeStyle}`);
    }
    if (task.constraints?.codeStyle) {
      sections.push(`- 风格配置: ${task.constraints.codeStyle}`);
    }
    if (context.project.constraints?.testCoverage) {
      sections.push(`- 测试覆盖率要求: ${context.project.constraints.testCoverage}%`);
    }
    sections.push('- 遵循 SOLID 原则');
    sections.push('- 函数单一职责');
    sections.push('- 有意义的命名');
    sections.push('- 错误处理');
    sections.push('');

    // 添加现有代码上下文
    if (task.input?.existingCode) {
      sections.push('## 现有代码');
      sections.push('```');
      sections.push(task.input.existingCode);
      sections.push('```');
      sections.push('');
    }

    // 添加文件路径
    if (task.input?.filePath) {
      sections.push(`## 目标文件: ${task.input.filePath}`);
      sections.push('');
    }

    // 添加技术栈
    if (task.input?.techStack) {
      sections.push('## 技术栈');
      sections.push(Array.isArray(task.input.techStack)
        ? task.input.techStack.join(', ')
        : task.input.techStack);
      sections.push('');
    }

    sections.push('## 请实现以上功能，包括代码和测试。');

    return sections.join('\n');
  }

  protected async processResponse(
    response: LLMResponse,
    task: Task,
    context: ExecutionContext
  ): Promise<any> {
    const content = response.content;

    const result = {
      code: this.extractCodeBlock(content),
      tests: this.extractTestBlock(content),
      explanation: this.extractSection(content, '说明'),
      changes: this.extractChanges(content),
      files: this.extractFiles(content),
    };

    return result;
  }

  protected async validateOutput(output: any): Promise<any> {
    if (!output.code && !output.files) {
      throw new Error('必须生成代码或文件');
    }

    // 验证代码块格式
    if (output.code && typeof output.code !== 'string') {
      throw new Error('代码格式不正确');
    }

    return output;
  }

  private findArchitectureResult(context: ExecutionContext): any {
    return context.history.find(
      r => r.metadata?.type === 'architecture-design'
    )?.data;
  }

  private extractCodeBlock(content: string): string | null {
    // 提取第一个代码块（非测试代码）
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
    const matches = Array.from(content.matchAll(codeBlockRegex));

    for (const match of matches) {
      const code = match[1];
      if (!code.includes('test') && !code.includes('spec')) {
        return code;
      }
    }

    return matches.length > 0 ? matches[0][1] : null;
  }

  private extractTestBlock(content: string): string | null {
    // 提取测试代码块
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
    const matches = Array.from(content.matchAll(codeBlockRegex));

    for (const match of matches) {
      const code = match[1];
      if (code.includes('test') || code.includes('spec') || code.includes('it(')) {
        return code;
      }
    }

    return null;
  }

  private extractSection(content: string, sectionName: string): string {
    const regex = new RegExp(`##?\\s*${sectionName}[\\s\\S]*?(?=##?|$)`, 'i');
    const match = content.match(regex);
    return match ? match[0].replace(/^##?\\s*${sectionName}\\s*/i, '').trim() : '';
  }

  private extractChanges(content: string): any {
    const changes: any = {
      modified: [],
      added: [],
      deleted: [],
    };

    const lines = content.split('\n');
    let inChangesSection = false;

    for (const line of lines) {
      if (line.match(/变更说明|Changes/i)) {
        inChangesSection = true;
        continue;
      }

      if (inChangesSection) {
        if (line.match(/修改|Modified/i)) {
          const files = line.split(':')[1]?.split(',').map(f => f.trim());
          if (files) changes.modified.push(...files);
        } else if (line.match(/新增|Added/i)) {
          const files = line.split(':')[1]?.split(',').map(f => f.trim());
          if (files) changes.added.push(...files);
        } else if (line.match(/删除|Deleted/i)) {
          const files = line.split(':')[1]?.split(',').map(f => f.trim());
          if (files) changes.deleted.push(...files);
        }
      }
    }

    return changes;
  }

  private extractFiles(content: string): any[] {
    const files: any[] = [];

    // 查找所有代码块及其文件路径
    const fileRegex = /###?\s*文件[:\s]+([^\n]+)\n```[\w]*\n([\s\S]*?)```/g;
    const matches = Array.from(content.matchAll(fileRegex));

    for (const match of matches) {
      files.push({
        path: match[1].trim(),
        content: match[2],
      });
    }

    return files;
  }

  getSuggestedTools(): string[] {
    return [
      'file-writer',
      'code-formatter',
      'linter',
      'test-runner',
      'git-client',
    ];
  }
}
