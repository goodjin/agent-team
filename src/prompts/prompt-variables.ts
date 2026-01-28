/**
 * 提示词变量系统
 */

import type { PromptVariable, VariableSource } from './types.js';

/**
 * 系统变量（自动注入）
 */
export const SYSTEM_VARIABLES: PromptVariable[] = [
  {
    name: 'projectName',
    description: '项目名称',
    required: false,
    defaultValue: 'default-project',
  },
  {
    name: 'projectPath',
    description: '项目路径',
    required: false,
    defaultValue: '.',
  },
  {
    name: 'codeStyle',
    description: '代码风格',
    required: false,
    defaultValue: 'default',
  },
  {
    name: 'testCoverage',
    description: '测试覆盖率要求',
    required: false,
    defaultValue: 80,
  },
  {
    name: 'currentDate',
    description: '当前日期',
    required: false,
    defaultValue: new Date().toISOString().split('T')[0],
  },
  {
    name: 'language',
    description: '编程语言',
    required: false,
    defaultValue: 'typescript',
  },
  {
    name: 'framework',
    description: '使用的框架',
    required: false,
  },
  {
    name: 'techStack',
    description: '技术栈',
    required: false,
  },
  {
    name: 'projectType',
    description: '项目类型',
    required: false,
  },
  {
    name: 'testFramework',
    description: '测试框架',
    required: false,
    defaultValue: 'jest',
  },
  {
    name: 'docStyle',
    description: '文档风格',
    required: false,
    defaultValue: 'markdown',
  },
];

/**
 * 变量解析器
 */
export class VariableParser {
  private variables: Map<string, PromptVariable> = new Map();
  private values: Map<string, any> = new Map();

  constructor() {
    // 注册系统变量
    for (const variable of SYSTEM_VARIABLES) {
      this.variables.set(variable.name, variable);
    }
  }

  /**
   * 注册变量
   */
  registerVariable(variable: PromptVariable): void {
    this.variables.set(variable.name, variable);
  }

  /**
   * 设置变量值
   */
  setValue(name: string, value: any): void {
    this.values.set(name, value);
  }

  /**
   * 批量设置变量值
   */
  setValues(values: { [key: string]: any }): void {
    for (const [name, value] of Object.entries(values)) {
      this.setValue(name, value);
    }
  }

  /**
   * 获取变量值
   */
  getValue(name: string): any {
    // 先检查用户设置的值
    if (this.values.has(name)) {
      return this.values.get(name);
    }

    // 再检查系统变量
    const variable = this.variables.get(name);
    if (variable && variable.defaultValue !== undefined) {
      return variable.defaultValue;
    }

    return undefined;
  }

  /**
   * 检查变量是否存在
   */
  hasVariable(name: string): boolean {
    return this.variables.has(name);
  }

  /**
   * 获取所有变量
   */
  getAllVariables(): PromptVariable[] {
    return Array.from(this.variables.values());
  }

  /**
   * 获取已设置的变量
   */
  getSetVariables(): { name: string; value: any }[] {
    const set: { name: string; value: any }[] = [];
    for (const [name, value] of this.values) {
      set.push({ name, value });
    }
    return set;
  }

  /**
   * 解析模板中的变量
   */
  parseTemplate(template: string): string {
    // 匹配 {{variableName}} 格式
    return template.replace(/\{\{([^}]+)\}\}/g, (_, varName) => {
      const trimmedName = varName.trim();
      const value = this.getValue(trimmedName);
      return value !== undefined ? String(value) : `{{${trimmedName}}}`;
    });
  }

  /**
   * 提取模板中的变量名
   */
  extractVariables(template: string): string[] {
    const variables: string[] = [];
    const regex = /\{\{([^}]+)\}\}/g;
    let match;

    while ((match = regex.exec(template)) !== null) {
      const varName = match[1].trim().split('.')[0];
      if (!variables.includes(varName)) {
        variables.push(varName);
      }
    }

    return variables;
  }

  /**
   * 验证变量值
   */
  validateValue(name: string, value: any): { valid: boolean; error?: string } {
    const variable = this.variables.get(name);

    if (!variable) {
      return { valid: true }; // 未知变量不验证
    }

    if (variable.required && value === undefined) {
      return { valid: false, error: `变量 ${name} 是必需的` };
    }

    // 类型检查
    if (value !== undefined && variable.defaultValue !== undefined) {
      const expectedType = typeof variable.defaultValue;
      const actualType = typeof value;
      if (expectedType !== actualType) {
        return {
          valid: false,
          error: `变量 ${name} 期望类型 ${expectedType}，实际类型 ${actualType}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * 获取缺失的必需变量
   */
  getMissingRequiredVariables(template: string): string[] {
    const templateVariables = this.extractVariables(template);
    const missing: string[] = [];

    for (const varName of templateVariables) {
      const variable = this.variables.get(varName);
      if (variable?.required && !this.values.has(varName)) {
        missing.push(varName);
      }
    }

    return missing;
  }

  /**
   * 重置变量值
   */
  reset(): void {
    this.values.clear();
  }

  /**
   * 从上下文创建变量解析器
   */
  static fromContext(context: {
    projectName?: string;
    projectPath?: string;
    codeStyle?: string;
    testCoverage?: number;
    language?: string;
    framework?: string;
    [key: string]: any;
  }): VariableParser {
    const parser = new VariableParser();
    parser.setValues(context);
    return parser;
  }
}

/**
 * 变量替换工具函数
 */
export function replaceVariables(
  template: string,
  values: { [key: string]: any }
): string {
  const parser = new VariableParser();
  parser.setValues(values);
  return parser.parseTemplate(template);
}

/**
 * 提取模板中的所有变量名
 */
export function extractTemplateVariables(template: string): string[] {
  const parser = new VariableParser();
  return parser.extractVariables(template);
}

/**
 * 检查模板变量是否完整
 */
export function checkTemplateVariables(
  template: string,
  availableValues: { [key: string]: any }
): { complete: boolean; missing: string[] } {
  const parser = VariableParser.fromContext(availableValues);
  const missing = parser.getMissingRequiredVariables(template);
  return {
    complete: missing.length === 0,
    missing,
  };
}
