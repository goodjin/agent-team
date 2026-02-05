import { BaseRole } from './base.js';
import type {
  RoleDefinition,
  Task,
  ExecutionContext,
  RequirementAnalysis,
  Message,
  LLMResponse,
  Priority,
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
    if (!output.summary) {
      output.summary = '已完成需求分析';
    }

    if (!output.features || output.features.length === 0) {
      output.features = [{
        id: 'feature-1',
        name: '默认功能',
        description: '基于需求实现的功能',
        priority: 'medium',
        complexity: 'medium',
      }];
    }

    for (const feature of output.features) {
      if (!feature.id) feature.id = `feature-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      if (!feature.name) feature.name = '功能';
      if (!feature.description) feature.description = '待完善';
      feature.priority = this.normalizePriority(feature.priority) as any;
      feature.complexity = this.normalizeComplexity(feature.complexity);
    }

    if (!output.userStories || output.userStories.length === 0) {
      output.userStories = [{
        id: 'story-1',
        as: '用户',
        iWant: '完成任务',
        soThat: '满足需求',
        acceptanceCriteria: ['功能可用'],
        priority: 'medium',
      }];
    }

    for (const story of output.userStories) {
      if (!story.id) story.id = `story-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      if (!story.as) story.as = '用户';
      if (!story.iWant) story.iWant = '完成任务';
      if (!story.soThat) story.soThat = '满足需求';
      if (!story.acceptanceCriteria || !Array.isArray(story.acceptanceCriteria)) {
        story.acceptanceCriteria = ['功能可用'];
      }
      story.priority = this.normalizePriority(story.priority) as any;
    }

    if (!output.risks || !Array.isArray(output.risks)) {
      output.risks = [];
    }

    if (!output.estimates) {
      output.estimates = {
        hours: 40,
        storyPoints: 8,
        confidence: 'medium',
        breakdown: {},
      };
    }

    return output;
  }

  private extractSection(content: string, sectionName: string): string {
    const regex = new RegExp(`##?\\s*${sectionName}[\\s\\S]*?(?=##?|$)`, 'i');
    const match = content.match(regex);
    return match ? match[0].replace(/^##?\\s*${sectionName}\\s*/i, '').trim() : '';
  }

  private extractFeatures(content: string): any[] {
    const features: any[] = [];

    // 方法1：尝试解析 JSON 数组
    try {
      const jsonMatch = content.match(/\[[\s\S]*?\]\s*(?=\n##|$)/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return this.normalizeFeatures(parsed);
        }
      }
    } catch {
      // JSON 解析失败，继续尝试其他格式
    }

    // 方法1b：尝试解析 JSON 对象中的 features 数组
    try {
      const jsonObjMatch = content.match(/\{[\s\S]*?"features"[\s\S]*?\}(?=\n##|$)/i);
      if (jsonObjMatch) {
        const parsed = JSON.parse(jsonObjMatch[0]);
        if (parsed.features && Array.isArray(parsed.features) && parsed.features.length > 0) {
          return this.normalizeFeatures(parsed.features);
        }
      }
    } catch {
      // JSON 对象解析失败，继续尝试其他格式
    }

    // 方法2：尝试解析 Markdown 表格
    const tableFeatures = this.parseMarkdownTable(content);
    if (tableFeatures.length > 0) {
      return tableFeatures;
    }

    // 方法3：解析 pipe table 格式
    const pipeTableFeatures = this.parsePipeTable(content);
    if (pipeTableFeatures.length > 0) {
      return pipeTableFeatures;
    }

    // 方法4：原有 bullet point 解析
    const bulletFeatures = this.parseBulletPoints(content);
    if (bulletFeatures.length > 0) {
      return bulletFeatures;
    }

    // 方法5：尝试解析编号列表
    const numberedFeatures = this.parseNumberedList(content);
    if (numberedFeatures.length > 0) {
      return numberedFeatures;
    }

    // 方法6：尝试解析 colon-separated 格式
    const colonFeatures = this.parseColonSeparated(content);
    if (colonFeatures.length > 0) {
      return colonFeatures;
    }

    return features;
  }

  private parseColonSeparated(content: string): any[] {
    const features: any[] = [];
    const lines = content.split('\n');
    let inFeatureSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.match(/功能列表|Features|功能[:：]\s*$/i)) {
        inFeatureSection = true;
        continue;
      }

      if (inFeatureSection) {
        if (trimmed.startsWith('##') || trimmed.match(/^[A-Z][a-z]+:\s*$/)) {
          inFeatureSection = false;
          break;
        }

        const colonMatch = trimmed.match(/^[-*•]?\s*([^:：]+)[:：]\s*(.+)/);
        if (colonMatch) {
          features.push({
            id: `feature-${features.length + 1}`,
            name: colonMatch[1].trim(),
            description: colonMatch[2].trim(),
            priority: 'medium',
            complexity: 'medium',
          });
        }
      }
    }

    return features;
  }

  private parseMarkdownTable(content: string): any[] {
    const features: any[] = [];
    const lines = content.split('\n');
    let inTable = false;
    let headers: string[] = [];
    let dataStartIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.includes('|') && line.trim().startsWith('|')) {
        const cells = line.split('|').map(c => c.trim()).filter(c => c);

        if (cells.length >= 2 && !inTable) {
          // 可能是表头
          if (cells.some(c => c.includes('功能') || c.includes('名称') || c.includes('Name'))) {
            inTable = true;
            headers = cells;
            dataStartIndex = i + 1;
            continue;
          }
        }

        if (inTable && i > dataStartIndex) {
          // 检查是否是分隔行（如 |---|）
          if (cells.every(c => c.match(/^[:\-]+$/))) {
            continue;
          }

          // 解析数据行
          if (cells.length >= 2) {
            const nameIdx = headers.findIndex(h => h.includes('功能') || h.includes('名称') || h.includes('Name'));
            const descIdx = headers.findIndex(h => h.includes('描述') || h.includes('Desc'));
            const prioIdx = headers.findIndex(h => h.includes('优先') || h.includes('Prio'));
            const compIdx = headers.findIndex(h => h.includes('复杂') || h.includes('Comp'));

            features.push({
              id: `feature-${features.length + 1}`,
              name: nameIdx >= 0 ? cells[nameIdx] : cells[1],
              description: descIdx >= 0 ? cells[descIdx] : '',
              priority: prioIdx >= 0 ? this.normalizePriority(cells[prioIdx]) : 'medium',
              complexity: compIdx >= 0 ? this.normalizeComplexity(cells[compIdx]) : 'medium',
            });
          }
        }
      } else if (inTable && !line.includes('|')) {
        inTable = false;
      }
    }

    return features;
  }

  private parsePipeTable(content: string): any[] {
    const features: any[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      // 检测 pipe table 格式: | 功能1 | 描述1 | P1 | C1 |
      if (line.match(/^\s*\|[^|]+\|[^|]*\|/) && !line.includes('---')) {
        const cells = line.split('|').map(c => c.trim()).filter(c => c);
        if (cells.length >= 2) {
          features.push({
            id: `feature-${features.length + 1}`,
            name: cells[0],
            description: cells[1] || '',
            priority: cells[2] ? this.normalizePriority(cells[2]) : 'medium',
            complexity: cells[3] ? this.normalizeComplexity(cells[3]) : 'medium',
          });
        }
      }
    }

    return features;
  }

  private parseBulletPoints(content: string): any[] {
    const features: any[] = [];
    const lines = content.split('\n');
    let inFeatureSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.includes('功能列表') || trimmed.match(/功能[：:]\s*$/i) || trimmed.match(/Features?\s*[:]\s*$/i)) {
        inFeatureSection = true;
        continue;
      }

      if (inFeatureSection) {
        // 检查是否进入新章节
        if (trimmed.startsWith('##') || trimmed.match(/^[A-Z][a-z]+:\s*$/)) {
          inFeatureSection = false;
          break;
        }

        // 解析 bullet point
        const bulletMatch = trimmed.match(/^[-*•]\s+(.+)/);
        if (bulletMatch) {
          const name = bulletMatch[1].trim();
          features.push({
            id: `feature-${features.length + 1}`,
            name: name,
            description: '',
            priority: 'medium',
            complexity: 'medium',
          });
        }
      }
    }

    return features;
  }

  private parseNumberedList(content: string): any[] {
    const features: any[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      // 检测编号列表: 1. 功能名 或 1) 功能名
      const numMatch = line.match(/^\s*(\d+)[.)]\s+(.+)/);
      if (numMatch) {
        features.push({
          id: `feature-${features.length + 1}`,
          name: numMatch[2].trim(),
          description: '',
          priority: 'medium',
          complexity: 'medium',
        });
      }
    }

    return features;
  }

  private normalizeFeatures(features: any[]): any[] {
    return features.map((f, idx) => ({
      id: f.id || `feature-${idx + 1}`,
      name: f.name || f.title || f.feature || `功能${idx + 1}`,
      description: f.description || f.desc || '',
      priority: this.normalizePriority(f.priority || f.level || f.prio),
      complexity: this.normalizeComplexity(f.complexity || f.difficulty || f.comp),
    }));
  }

  private normalizePriority(priority: string): Priority {
    if (!priority) return 'medium';
    const p = priority.toLowerCase();
    if (p.includes('must') || p.includes('高') || p.includes('p0') || p.includes('p1')) return 'high';
    if (p.includes('should') || p.includes('中') || p.includes('p2')) return 'medium';
    if (p.includes('could') || p.includes('低') || p.includes('p3')) return 'low';
    return 'medium';
  }

  private normalizeComplexity(complexity: string): 'low' | 'medium' | 'high' {
    if (!complexity) return 'medium';
    const c = complexity.toLowerCase();
    if (c.includes('高') || c.includes('high') || c.includes('复杂') || c.includes('large')) return 'high';
    if (c.includes('中') || c.includes('medium') || c.includes('moderate')) return 'medium';
    if (c.includes('低') || c.includes('low') || c.includes('简单') || c.includes('small')) return 'low';
    return 'medium';
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
