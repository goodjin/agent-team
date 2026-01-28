import { BaseRole } from './base.js';
import type {
  RoleDefinition,
  Task,
  ExecutionContext,
  RequirementAnalysis,
  Message,
  LLMResponse,
} from '../types/index.js';

/**
 * 产品经理角色
 * 负责需求分析、产品设计和功能规划
 */
export class ProductManager extends BaseRole {
  constructor(llmService: any) {
    const definition: RoleDefinition = {
      id: 'product-manager',
      name: '产品经理',
      type: 'product-manager',
      description: '专业的产品经理，擅长需求分析、产品设计和功能规划',
      responsibilities: [
        '收集和分析用户需求',
        '编写产品需求文档（PRD）',
        '定义用户故事和验收标准',
        '评估功能优先级',
        '进行竞品分析',
        '制定产品路线图',
      ],
      capabilities: [
        '需求分析和拆解',
        '用户故事编写',
        '功能优先级排序',
        '工作量估算',
        '风险评估',
        '产品决策',
      ],
      constraints: [
        '必须从用户角度思考问题',
        '需求必须清晰、可测试',
        '必须考虑实现的可行性',
        '必须评估技术风险',
        '必须考虑用户体验',
        '输出必须结构化',
      ],
      outputFormat: `输出格式要求：
1. 需求概述（2-3句话）
2. 功能列表（使用表格形式）
3. 用户故事（使用标准格式：作为...我想要...以便...）
4. 验收标准（Given-When-Then格式）
5. 优先级排序（MoSCoW方法）
6. 风险评估（影响程度+发生概率）
7. 工作量估算（故事点）`,
      systemPrompt: '',
      temperature: 0.7,
      maxTokens: 4000,
    };

    super(definition, llmService);
  }

  protected buildTaskPrompt(task: Task, context: ExecutionContext): string {
    const sections: string[] = [];

    sections.push(`# 任务: ${task.title}`);
    sections.push(task.description);
    sections.push('');

    // 添加任务输入
    if (task.input) {
      sections.push('## 输入信息');
      sections.push(JSON.stringify(task.input, null, 2));
      sections.push('');
    }

    // 添加项目约束
    if (context.project.constraints) {
      sections.push('## 项目约束');
      sections.push(JSON.stringify(context.project.constraints, null, 2));
      sections.push('');
    }

    // 添加历史任务结果
    if (context.history.length > 0) {
      sections.push('## 历史上下文');
      context.history.forEach((result, index) => {
        if (result.metadata?.summary) {
          sections.push(`### 步骤 ${index + 1}: ${result.metadata.summary}`);
        }
      });
      sections.push('');
    }

    sections.push('## 请执行以上任务，并按照角色定义的输出格式提供结果。');

    return sections.join('\n');
  }

  protected async processResponse(
    response: LLMResponse,
    task: Task,
    context: ExecutionContext
  ): Promise<RequirementAnalysis> {
    const content = response.content;

    // 解析响应内容，提取结构化数据
    // 这里可以通过 LLM 再调用一次来提取结构化数据
    const analysis: RequirementAnalysis = {
      summary: this.extractSection(content, '需求概述'),
      features: this.extractFeatures(content),
      userStories: this.extractUserStories(content),
      acceptanceCriteria: this.extractAcceptanceCriteria(content),
      risks: this.extractRisks(content),
      estimates: this.extractEstimates(content),
    };

    return analysis;
  }

  protected async validateOutput(output: RequirementAnalysis): Promise<RequirementAnalysis> {
    // 验证必需字段
    if (!output.summary) {
      throw new Error('需求概述不能为空');
    }
    if (!output.features || output.features.length === 0) {
      throw new Error('至少需要一个功能');
    }
    if (!output.userStories || output.userStories.length === 0) {
      throw new Error('至少需要一个用户故事');
    }

    // 验证结构
    for (const feature of output.features) {
      if (!feature.id || !feature.name || !feature.description) {
        throw new Error('功能缺少必需字段');
      }
    }

    for (const story of output.userStories) {
      if (!story.id || !story.as || !story.iWant || !story.soThat) {
        throw new Error('用户故事格式不正确');
      }
    }

    return output;
  }

  private extractSection(content: string, sectionName: string): string {
    const regex = new RegExp(`##?\\s*${sectionName}[\\s\\S]*?(?=##?|$)`, 'i');
    const match = content.match(regex);
    return match ? match[0].replace(/^##?\\s*${sectionName}\\s*/i, '').trim() : '';
  }

  private extractFeatures(content: string): any[] {
    // 简化版本，实际应该使用更复杂的解析
    const features = [];
    const lines = content.split('\n');
    let inFeatureSection = false;

    for (const line of lines) {
      if (line.includes('功能列表') || line.includes('Features')) {
        inFeatureSection = true;
        continue;
      }
      if (inFeatureSection && line.trim().startsWith('-')) {
        features.push({
          id: `feature-${features.length + 1}`,
          name: line.replace(/^-/, '').trim(),
          description: '',
          priority: 'medium',
          complexity: 'medium',
        });
      }
    }

    return features;
  }

  private extractUserStories(content: string): any[] {
    const stories = [];
    const lines = content.split('\n');
    let currentStory: any = null;

    for (const line of lines) {
      if (line.match(/用户故事|User Story/i)) {
        if (currentStory) {
          stories.push(currentStory);
        }
        currentStory = {
          id: `story-${stories.length + 1}`,
          as: '',
          iWant: '',
          soThat: '',
          acceptanceCriteria: [],
          priority: 'medium',
        };
      } else if (currentStory) {
        if (line.match(/作为|As a/i)) {
          currentStory.as = line.replace(/作为|As a/i, '').trim();
        } else if (line.match(/我想要|I want/i)) {
          currentStory.iWant = line.replace(/我想要|I want/i, '').trim();
        } else if (line.match(/以便|So that/i)) {
          currentStory.soThat = line.replace(/以便|So that/i, '').trim();
        }
      }
    }

    if (currentStory) {
      stories.push(currentStory);
    }

    return stories;
  }

  private extractAcceptanceCriteria(content: string): string[] {
    const criteria: string[] = [];
    const lines = content.split('\n');
    let inCriteriaSection = false;

    for (const line of lines) {
      if (line.match(/验收标准|Acceptance Criteria/i)) {
        inCriteriaSection = true;
        continue;
      }
      if (inCriteriaSection && line.trim().startsWith('-')) {
        criteria.push(line.replace(/^-/, '').trim());
      }
    }

    return criteria;
  }

  private extractRisks(content: string): any[] {
    const risks = [];
    const lines = content.split('\n');
    let inRiskSection = false;

    for (const line of lines) {
      if (line.match(/风险|Risk/i)) {
        inRiskSection = true;
        continue;
      }
      if (inRiskSection && line.trim().startsWith('-')) {
        risks.push({
          id: `risk-${risks.length + 1}`,
          description: line.replace(/^-/, '').trim(),
          impact: 'medium',
          likelihood: 'medium',
          mitigation: '',
        });
      }
    }

    return risks;
  }

  private extractEstimates(content: string): any {
    // 简化版本
    return {
      hours: 40,
      storyPoints: 8,
      confidence: 'medium',
      breakdown: {},
    };
  }

  getSuggestedTools(): string[] {
    return ['file-reader', 'web-search', 'jira-api', 'notion-api'];
  }
}
