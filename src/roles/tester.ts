import { BaseRole } from './base.js';
import type {
  RoleDefinition,
  Task,
  ExecutionContext,
  Message,
  LLMResponse,
} from '../types/index.js';

/**
 * 测试工程师角色
 * 负责测试策略设计、测试用例编写和测试执行
 */
export class Tester extends BaseRole {
  constructor(llmService: any) {
    const definition: RoleDefinition = {
      id: 'tester',
      name: '测试工程师',
      type: 'tester',
      description: '专业的测试工程师，擅长测试设计、自动化测试和质量保障',
      responsibilities: [
        '分析需求并设计测试策略',
        '编写测试计划和测试用例',
        '执行功能测试',
        '进行性能测试',
        '进行安全测试',
        '编写自动化测试',
        '报告和跟踪缺陷',
        '验证缺陷修复',
      ],
      capabilities: [
        '测试策略设计',
        '测试用例设计',
        '自动化测试开发',
        '性能测试',
        '安全测试',
        '回归测试',
        '缺陷分析',
      ],
      constraints: [
        '测试用例必须覆盖所有功能点',
        '必须包含边界测试',
        '必须包含异常场景测试',
        '测试必须可重复执行',
        '必须遵循测试金字塔',
        '必须包含性能基准',
        '测试数据必须多样化',
      ],
      outputFormat: `输出格式要求：

## 测试策略
- 测试范围
- 测试方法
- 测试工具
- 测试环境

## 测试用例
| ID | 场景 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|----|------|----------|----------|----------|--------|

## 自动化测试代码
\`\`\`language
// 测试代码
\`\`\`

## 测试数据
- 正常数据
- 边界数据
- 异常数据

## 性能指标
- 响应时间要求
- 并发要求
- 资源占用要求`,
      systemPrompt: '',
      temperature: 0.5,
      maxTokens: 5000,
    };

    super(definition, llmService);
  }

  protected buildTaskPrompt(task: Task, context: ExecutionContext): string {
    const sections: string[] = [];

    sections.push(`# 测试任务: ${task.title}`);
    sections.push(task.description);
    sections.push('');

    // 添加需求信息
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

    // 添加验收标准
    if (task.input?.acceptanceCriteria) {
      sections.push('## 验收标准');
      task.input.acceptanceCriteria.forEach((criteria: string, i: number) => {
        sections.push(`${i + 1}. ${criteria}`);
      });
      sections.push('');
    }

    // 添加代码信息
    if (task.input?.code) {
      sections.push('## 待测试代码');
      sections.push('```');
      sections.push(task.input.code);
      sections.push('```');
      sections.push('');
    }

    // 添加测试框架
    if (task.input?.testFramework) {
      sections.push(`## 测试框架: ${task.input.testFramework}`);
      sections.push('');
    }

    // 添加测试类型
    if (task.input?.testTypes) {
      sections.push('## 测试类型');
      task.input.testTypes.forEach((type: string) => {
        sections.push(`- ${type}`);
      });
      sections.push('');
    }

    // 添加覆盖率要求
    if (context.project.constraints?.testCoverage) {
      sections.push(`## 覆盖率要求: ${context.project.constraints.testCoverage}%`);
      sections.push('');
    }

    sections.push('## 请设计测试方案并提供测试代码。');

    return sections.join('\n');
  }

  protected async processResponse(
    response: LLMResponse,
    task: Task,
    context: ExecutionContext
  ): Promise<any> {
    const content = response.content;

    const result = {
      strategy: this.extractSection(content, '测试策略'),
      testCases: this.extractTestCases(content),
      testCode: this.extractTestCode(content),
      testData: this.extractTestData(content),
      performanceMetrics: this.extractPerformanceMetrics(content),
    };

    return result;
  }

  protected async validateOutput(output: any): Promise<any> {
    if (!output.testCases || output.testCases.length === 0) {
      throw new Error('至少需要一个测试用例');
    }

    // 验证测试用例结构
    for (const testCase of output.testCases) {
      if (!testCase.id || !testCase.scenario || !testCase.steps) {
        throw new Error('测试用例结构不完整');
      }
    }

    return output;
  }

  private extractSection(content: string, sectionName: string): string {
    const regex = new RegExp(`##?\\s*${sectionName}[\\s\\S]*?(?=##?|$)`, 'i');
    const match = content.match(regex);
    return match ? match[0].replace(/^##?\\s*${sectionName}\\s*/i, '').trim() : '';
  }

  private extractTestCases(content: string): any[] {
    const testCases: any[] = [];
    const lines = content.split('\n');
    let inTable = false;
    let headers: string[] = [];

    for (const line of lines) {
      if (line.includes('测试用例') && line.includes('|')) {
        inTable = true;
        const nextLine = lines[lines.indexOf(line) + 1];
        headers = nextLine.split('|').map(h => h.trim()).filter(Boolean);
        continue;
      }

      if (inTable && line.startsWith('|') && !line.includes('---')) {
        const values = line.split('|').map(v => v.trim()).filter(Boolean);
        if (values.length >= 4) {
          testCases.push({
            id: values[0],
            scenario: values[1],
            preconditions: values[2],
            steps: values[3].split(',').map(s => s.trim()),
            expectedResult: values[4],
            priority: values[5] || 'medium',
          });
        }
      }

      if (inTable && line.trim() === '') {
        inTable = false;
      }
    }

    return testCases;
  }

  private extractTestCode(content: string): string | null {
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
    const matches = Array.from(content.matchAll(codeBlockRegex));

    for (const match of matches) {
      const code = match[1];
      if (code.includes('test') || code.includes('spec') || code.includes('it(')) {
        return code;
      }
    }

    return matches.length > 0 ? matches[0][1] : null;
  }

  private extractTestData(content: string): any {
    const data: any = {
      normal: [],
      boundary: [],
      exceptional: [],
    };

    const lines = content.split('\n');
    let currentSection = '';

    for (const line of lines) {
      if (line.match(/正常数据|Normal/i)) currentSection = 'normal';
      else if (line.match(/边界数据|Boundary/i)) currentSection = 'boundary';
      else if (line.match(/异常数据|Exceptional/i)) currentSection = 'exceptional';
      else if (line.trim().startsWith('-') && currentSection) {
        data[currentSection].push(line.replace(/^-/, '').trim());
      }
    }

    return data;
  }

  private extractPerformanceMetrics(content: string): any {
    const metrics: any = {};

    const lines = content.split('\n');
    let inMetricsSection = false;

    for (const line of lines) {
      if (line.match(/性能指标|Performance/i)) {
        inMetricsSection = true;
        continue;
      }

      if (inMetricsSection && line.includes(':')) {
        const [key, value] = line.split(':').map(s => s.trim());
        metrics[key] = value;
      }
    }

    return metrics;
  }

  getSuggestedTools(): string[] {
    return [
      'test-runner',
      'coverage-tool',
      'performance-tester',
      'api-tester',
      'mock-server',
    ];
  }
}
