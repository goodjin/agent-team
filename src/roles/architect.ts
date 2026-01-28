import { BaseRole } from './base.js';
import type {
  RoleDefinition,
  Task,
  ExecutionContext,
  ArchitectureDesign,
  Message,
  LLMResponse,
} from '../types/index.js';

/**
 * 架构师角色
 * 负责系统设计、技术选型和架构决策
 */
export class Architect extends BaseRole {
  constructor(llmService: any) {
    const definition: RoleDefinition = {
      id: 'architect',
      name: '架构师',
      type: 'architect',
      description: '资深技术架构师，擅长系统设计、技术选型和架构决策',
      responsibilities: [
        '分析需求并设计系统架构',
        '选择合适的技术栈',
        '设计系统组件和接口',
        '定义数据流和状态管理',
        '考虑性能、可扩展性和安全性',
        '制定技术标准和规范',
        '评估技术风险',
        '进行架构评审',
      ],
      capabilities: [
        '系统架构设计',
        '技术选型和评估',
        '设计模式应用',
        '性能优化',
        '安全设计',
        '可扩展性设计',
        '技术债务管理',
      ],
      constraints: [
        '必须考虑可维护性',
        '必须遵循最佳实践',
        '必须考虑性能和安全性',
        '必须评估技术风险',
        '必须平衡短期和长期需求',
        '必须考虑团队能力',
        '设计必须可测试',
      ],
      outputFormat: `输出格式要求：
## 架构概述
- 整体架构描述
- 关键设计决策

## 系统组件
| 组件名 | 类型 | 职责 | 接口 | 依赖 |
|--------|------|------|------|------|

## 数据流
- 描述主要数据流
- 使用 Mermaid 图表（可选）

## 技术栈
- 前端框架和库
- 后端框架和库
- 数据库
- DevOps 工具
- 测试框架

## 设计模式
- 模式名称
- 应用场景
- 使用理由

## 技术权衡
| 决策 | 优点 | 缺点 | 理由 |
|------|------|------|------|`,
      systemPrompt: '',
      temperature: 0.6,
      maxTokens: 5000,
    };

    super(definition, llmService);
  }

  protected buildTaskPrompt(task: Task, context: ExecutionContext): string {
    const sections: string[] = [];

    sections.push(`# 架构设计任务: ${task.title}`);
    sections.push(task.description);
    sections.push('');

    // 添加需求分析结果（如果有）
    const requirementAnalysis = this.findAnalysisResult(context);
    if (requirementAnalysis) {
      sections.push('## 需求分析');
      sections.push(`概述: ${requirementAnalysis.summary}`);
      sections.push('');
      sections.push('功能列表:');
      requirementAnalysis.features.forEach((f: any) => {
        sections.push(`- ${f.name} (${f.priority})`);
      });
      sections.push('');
    }

    // 添加项目信息（如果有）
    if (task.input?.projectInfo) {
      sections.push('## 项目信息');
      sections.push(JSON.stringify(task.input.projectInfo, null, 2));
      sections.push('');
    }

    // 添加技术约束
    if (task.input?.techConstraints) {
      sections.push('## 技术约束');
      sections.push(JSON.stringify(task.input.techConstraints, null, 2));
      sections.push('');
    }

    // 添加现有项目结构
    if (task.input?.existingStructure) {
      sections.push('## 现有项目结构');
      sections.push(task.input.existingStructure);
      sections.push('');
    }

    sections.push('## 请设计系统架构，并按照角色定义的输出格式提供结果。');

    return sections.join('\n');
  }

  protected async processResponse(
    response: LLMResponse,
    task: Task,
    context: ExecutionContext
  ): Promise<ArchitectureDesign> {
    const content = response.content;

    const design: ArchitectureDesign = {
      overview: this.extractSection(content, '架构概述'),
      components: this.extractComponents(content),
      dataFlow: this.extractDataFlow(content),
      techStack: this.extractTechStack(content),
      patterns: this.extractPatterns(content),
      tradeoffs: this.extractTradeoffs(content),
    };

    return design;
  }

  protected async validateOutput(output: ArchitectureDesign): Promise<ArchitectureDesign> {
    if (!output.overview) {
      throw new Error('架构概述不能为空');
    }
    if (!output.components || output.components.length === 0) {
      throw new Error('至少需要定义一个组件');
    }
    if (!output.techStack) {
      throw new Error('必须定义技术栈');
    }

    // 验证组件结构
    for (const component of output.components) {
      if (!component.name || !component.type || !component.responsibility) {
        throw new Error('组件定义不完整');
      }
    }

    return output;
  }

  private findAnalysisResult(context: ExecutionContext): any {
    return context.history.find(
      r => r.metadata?.type === 'requirement-analysis'
    )?.data;
  }

  private extractSection(content: string, sectionName: string): string {
    const regex = new RegExp(`##?\\s*${sectionName}[\\s\\S]*?(?=##?|$)`, 'i');
    const match = content.match(regex);
    return match ? match[0].replace(/^##?\\s*${sectionName}\\s*/i, '').trim() : '';
  }

  private extractComponents(content: string): any[] {
    const components: any[] = [];
    const lines = content.split('\n');
    let inTable = false;
    let headers: string[] = [];

    for (const line of lines) {
      if (line.includes('组件') && line.includes('|')) {
        inTable = true;
        const nextLine = lines[lines.indexOf(line) + 1];
        headers = nextLine.split('|').map(h => h.trim()).filter(Boolean);
        continue;
      }

      if (inTable && line.startsWith('|') && !line.includes('---')) {
        const values = line.split('|').map(v => v.trim()).filter(Boolean);
        if (values.length >= 3) {
          components.push({
            name: values[0],
            type: values[1],
            responsibility: values[2],
            interfaces: values[3] ? values[3].split(',').map((s: string) => s.trim()) : [],
            dependencies: values[4] ? values[4].split(',').map((s: string) => s.trim()) : [],
          });
        }
      }

      if (inTable && line.trim() === '') {
        inTable = false;
      }
    }

    return components;
  }

  private extractDataFlow(content: string): any[] {
    const flows: any[] = [];
    const lines = content.split('\n');
    let inFlowSection = false;

    for (const line of lines) {
      if (line.match(/数据流|Data Flow/i)) {
        inFlowSection = true;
        continue;
      }

      if (inFlowSection && line.includes('->')) {
        const parts = line.split('->');
        if (parts.length >= 2) {
          flows.push({
            from: parts[0].trim(),
            to: parts[1].trim(),
            data: parts[2] ? parts[2].trim() : 'data',
            protocol: 'HTTP',
          });
        }
      }
    }

    return flows;
  }

  private extractTechStack(content: string): any {
    const stack: any = {
      frontend: [],
      backend: [],
      database: [],
      devops: [],
      testing: [],
    };

    const lines = content.split('\n');
    let currentSection = '';

    for (const line of lines) {
      if (line.match(/前端|Frontend/i)) currentSection = 'frontend';
      else if (line.match(/后端|Backend/i)) currentSection = 'backend';
      else if (line.match(/数据库|Database/i)) currentSection = 'database';
      else if (line.match(/DevOps/i)) currentSection = 'devops';
      else if (line.match(/测试|Testing/i)) currentSection = 'testing';
      else if (line.trim().startsWith('-') && currentSection) {
        const tech = line.replace(/^-/, '').trim();
        stack[currentSection].push(tech);
      }
    }

    return stack;
  }

  private extractPatterns(content: string): any[] {
    const patterns: any[] = [];
    // 简化实现
    return patterns;
  }

  private extractTradeoffs(content: string): any[] {
    const tradeoffs: any[] = [];
    // 简化实现
    return tradeoffs;
  }

  getSuggestedTools(): string[] {
    return [
      'code-analyzer',
      'dependency-scanner',
      'architecture-linter',
      'performance-profiler',
    ];
  }
}
