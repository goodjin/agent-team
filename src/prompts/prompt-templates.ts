/**
 * 提示词模板系统
 */

import type { PromptTemplate, TaskPromptConfig } from './types.js';
import { VariableParser, replaceVariables, extractTemplateVariables } from './prompt-variables.js';

/**
 * 模板渲染结果
 */
export interface TemplateRenderResult {
  content: string;
  usedVariables: string[];
  missingVariables: string[];
}

/**
 * 模板渲染器
 */
export class TemplateRenderer {
  private templates: Map<string, PromptTemplate> = new Map();
  private variableParser: VariableParser;

  constructor() {
    this.variableParser = new VariableParser();
  }

  /**
   * 注册模板
   */
  registerTemplate(name: string, template: PromptTemplate): void {
    this.templates.set(name, template);
  }

  /**
   * 批量注册模板
   */
  registerTemplates(templates: TaskPromptConfig): void {
    for (const [name, template] of Object.entries(templates)) {
      this.registerTemplate(name, template as PromptTemplate);
    }
  }

  /**
   * 渲染模板
   */
  render(
    templateName: string,
    values: { [key: string]: any }
  ): TemplateRenderResult {
    const template = this.templates.get(templateName);

    if (!template) {
      return {
        content: '',
        usedVariables: [],
        missingVariables: [],
      };
    }

    // 使用模板中的变量定义
    if (template.variables) {
      for (const varName of template.variables) {
        if (values[varName] === undefined) {
          // 使用模板中定义的默认值
          // 这里可以扩展支持模板中的默认值
        }
      }
    }

    // 设置变量值
    this.variableParser.setValues(values);

    // 渲染模板
    const content = this.variableParser.parseTemplate(template.template);

    // 提取使用的变量
    const usedVariables = extractTemplateVariables(template.template);

    // 找出缺失的必需变量
    const missingVariables = this.variableParser.getMissingRequiredVariables(
      template.template
    );

    // 重置变量解析器
    this.variableParser.reset();

    return {
      content,
      usedVariables,
      missingVariables,
    };
  }

  /**
   * 渲染所有任务模板
   */
  renderAll(values: { [key: string]: any }): {
    [key: string]: TemplateRenderResult;
  } {
    const results: { [key: string]: TemplateRenderResult } = {};

    for (const [name, template] of this.templates) {
      results[name] = this.render(name, values);
    }

    return results;
  }

  /**
   * 获取模板
   */
  getTemplate(name: string): PromptTemplate | undefined {
    return this.templates.get(name);
  }

  /**
   * 获取所有模板名称
   */
  getTemplateNames(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * 检查模板是否存在
   */
  hasTemplate(name: string): boolean {
    return this.templates.has(name);
  }
}

/**
 * 创建模板渲染器并注册内置模板
 */
export function createTemplateRenderer(
  taskTemplates: TaskPromptConfig
): TemplateRenderer {
  const renderer = new TemplateRenderer();
  renderer.registerTemplates(taskTemplates);
  return renderer;
}

/**
 * 渲染提示词
 */
export function renderPrompt(
  systemPrompt: string,
  taskTemplates: TaskPromptConfig,
  taskType: string,
  taskValues: { [key: string]: any }
): {
  systemPrompt: string;
  taskPrompt: string;
  missingVariables: string[];
} {
  // 创建模板渲染器
  const renderer = createTemplateRenderer(taskTemplates);

  // 渲染系统提示词
  const systemResult = renderer.render('systemPrompt', taskValues);

  // 渲染任务提示词
  const taskResult = renderer.render(taskType, taskValues);

  // 合并缺失变量
  const missingVariables = [
    ...new Set([...systemResult.missingVariables, ...taskResult.missingVariables]),
  ];

  return {
    systemPrompt: systemResult.content,
    taskPrompt: taskResult.content,
    missingVariables,
  };
}

/**
 * 格式化模板为字符串（用于调试）
 */
export function formatTemplate(template: PromptTemplate, indent = 0): string {
  const spaces = '  '.repeat(indent);
  let result = '';

  if (template.description) {
    result += `${spaces}// ${template.description}\n`;
  }

  result += `${spaces}template: |\n`;

  const lines = template.template.split('\n');
  for (const line of lines) {
    result += `${spaces}  ${line}\n`;
  }

  if (template.variables && template.variables.length > 0) {
    result += `${spaces}variables: [${template.variables.join(', ')}]\n`;
  }

  return result;
}

/**
 * 验证模板语法
 */
export function validateTemplateSyntax(template: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 检查未闭合的变量标记
  const openCount = (template.match(/\{\{/g) || []).length;
  const closeCount = (template.match(/\}\}/g) || []).length;
  if (openCount !== closeCount) {
    errors.push(`变量标记不匹配：{{ 出现 ${openCount}} 次，}} 出现 ${closeCount} 次`);
  }

  // 检查嵌套变量
  const nestedRegex = /\{\{.*\{\{.*\}\}.*\}\}/;
  if (nestedRegex.test(template)) {
    errors.push('不支持嵌套的变量标记');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
