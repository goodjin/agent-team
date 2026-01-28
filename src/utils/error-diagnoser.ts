/**
 * 错误诊断器
 */

import type { AgentConfig, ProjectConfig } from '../config/types.js';

/**
 * 错误类型
 */
export type ErrorType =
  | 'syntax-error'
  | 'type-error'
  | 'reference-error'
  | 'runtime-error'
  | 'import-error'
  | 'configuration-error'
  | 'test-failure'
  | 'build-error'
  | 'unknown';

/**
 * 错误严重级别
 */
export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info';

/**
 * 错误诊断结果
 */
export interface DiagnosisResult {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  rootCause: string;
  affectedFiles: string[];
  suggestions: FixSuggestion[];
  relatedLinks: string[];
}

/**
 * 修复建议
 */
export interface FixSuggestion {
  description: string;
  code?: string;
  confidence: number;
  priority: number;
}

/**
 * 错误模式匹配
 */
interface ErrorPattern {
  type: ErrorType;
  severity: ErrorSeverity;
  pattern: RegExp;
  extractRootCause: (match: RegExpMatchArray) => string;
  generateSuggestions: (match: RegExpMatchArray) => FixSuggestion[];
}

/**
 * 错误诊断器类
 */
export class ErrorDiagnoser {
  private patterns: ErrorPattern[] = [];

  constructor() {
    this.registerPatterns();
  }

  /**
   * 注册错误模式
   */
  private registerPatterns(): void {
    // TypeScript 语法错误
    this.registerPattern({
      type: 'syntax-error',
      severity: 'critical',
      pattern: /TS\d+:\s*(.+)/,
      extractRootCause: (match) => match[1],
      generateSuggestions: (match) => [
        {
          description: '检查语法错误并修复',
          confidence: 0.9,
          priority: 1,
        },
      ],
    });

    // JavaScript 语法错误
    this.registerPattern({
      type: 'syntax-error',
      severity: 'critical',
      pattern: /SyntaxError:\s*(.+)/,
      extractRootCause: (match) => match[1],
      generateSuggestions: (match) => [
        {
          description: '检查代码语法',
          confidence: 0.9,
          priority: 1,
        },
      ],
    });

    // 引用错误
    this.registerPattern({
      type: 'reference-error',
      severity: 'error',
      pattern: /ReferenceError:\s*(.+) is not defined/,
      extractRootCause: (match) => `${match[1]} 未定义`,
      generateSuggestions: (match) => [
        {
          description: `检查 ${match[1]} 是否已声明或导入`,
          confidence: 0.9,
          priority: 1,
        },
        {
          description: `检查变量名拼写是否正确`,
          confidence: 0.7,
          priority: 2,
        },
      ],
    });

    // 类型错误
    this.registerPattern({
      type: 'type-error',
      severity: 'error',
      pattern: /TypeError:\s*(.+)/,
      extractRootCause: (match) => match[1],
      generateSuggestions: (match) => [
        {
          description: '检查变量类型',
          confidence: 0.8,
          priority: 1,
        },
      ],
    });

    // 导入错误
    this.registerPattern({
      type: 'import-error',
      severity: 'error',
      pattern: /Cannot find module ['"](.+)['"]/,
      extractRootCause: (match) => `模块 ${match[1]} 未找到`,
      generateSuggestions: (match) => [
        {
          description: `安装依赖: npm install ${match[1]}`,
          code: `npm install ${match[1]}`,
          confidence: 0.9,
          priority: 1,
        },
        {
          description: '检查导入路径是否正确',
          confidence: 0.8,
          priority: 2,
        },
      ],
    });

    // Jest 测试失败
    this.registerPattern({
      type: 'test-failure',
      severity: 'warning',
      pattern: /Expected:\s*(.+)\s+Received:\s*(.+)/s,
      extractRootCause: (match) => `期望 ${match[1]} 但收到了 ${match[2]}`,
      generateSuggestions: (match) => [
        {
          description: '检查测试断言是否正确',
          confidence: 0.8,
          priority: 1,
        },
        {
          description: '检查实际返回值是否符合预期',
          confidence: 0.7,
          priority: 2,
        },
      ],
    });

    // ESLint 错误
    this.registerPattern({
      type: 'syntax-error',
      severity: 'warning',
      pattern: /(.+)\s+error\s+(.+)\s+line\s+(\d+)/,
      extractRootCause: (match) => `${match[1]}: ${match[2]}`,
      generateSuggestions: (match) => [
        {
          description: `修复第 ${match[3]} 行的错误`,
          confidence: 0.9,
          priority: 1,
        },
      ],
    });
  }

  /**
   * 注册自定义错误模式
   */
  registerPattern(pattern: ErrorPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * 诊断错误
   */
  async diagnose(
    error: Error | string,
    context?: {
      filePath?: string;
      projectRoot?: string;
      language?: string;
    }
  ): Promise<DiagnosisResult> {
    const errorMessage = typeof error === 'string' ? error : error.message;

    // 尝试匹配错误模式
    for (const pattern of this.patterns) {
      const match = errorMessage.match(pattern.pattern);
      if (match) {
        const rootCause = pattern.extractRootCause(match);
        const suggestions = pattern.generateSuggestions(match);

        // 尝试识别受影响的文件
        const affectedFiles = this.extractAffectedFiles(errorMessage, context);

        return {
          type: pattern.type,
          severity: pattern.severity,
          message: errorMessage,
          rootCause,
          affectedFiles,
          suggestions,
          relatedLinks: this.getRelatedLinks(pattern.type, context?.language),
        };
      }
    }

    // 无法识别错误类型
    return {
      type: 'unknown',
      severity: 'info',
      message: errorMessage,
      rootCause: '无法确定错误原因',
      affectedFiles: context?.filePath ? [context.filePath] : [],
      suggestions: [
        {
          description: '查看错误堆栈获取更多信息',
          confidence: 0.5,
          priority: 1,
        },
      ],
      relatedLinks: [],
    };
  }

  /**
   * 提取受影响的文件
   */
  private extractAffectedFiles(
    errorMessage: string,
    context?: { filePath?: string; projectRoot?: string }
  ): string[] {
    const files: string[] = [];

    // 从错误消息中提取文件路径
    const filePathRegex = /at\s+(?:Object\.<anonymous>\s+)?([^\s()]+\.(?:ts|js|py|java|cpp|h))\s*\(?/g;
    let match;

    while ((match = filePathRegex.exec(errorMessage)) !== null) {
      const filePath = match[1];
      if (!files.includes(filePath)) {
        files.push(filePath);
      }
    }

    // 添加上下文文件
    if (context?.filePath && !files.includes(context.filePath)) {
      files.unshift(context.filePath);
    }

    return files;
  }

  /**
   * 获取相关链接
   */
  private getRelatedLinks(errorType: ErrorType, language?: string): string[] {
    const links: { [key: string]: string[] } = {
      'syntax-error': [
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors',
        'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html',
      ],
      'type-error': [
        'https://www.typescriptlang.org/docs/handbook/2/types-from-types.html',
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors',
      ],
      'import-error': [
        'https://nodejs.org/api/modules.html',
        'https://www.typescriptlang.org/docs/handbook/modules.html',
      ],
      'test-failure': [
        'https://jestjs.io/docs/expect',
        'https://vitest.dev/api/expect.html',
      ],
    };

    return links[errorType] || [];
  }

  /**
   * 批量诊断多个错误
   */
  async diagnoseMultiple(
    errors: (Error | string)[]
  ): Promise<DiagnosisResult[]> {
    return Promise.all(errors.map((error) => this.diagnose(error)));
  }

  /**
   * 创建诊断报告
   */
  async createReport(
    errors: (Error | string)[],
    context?: {
      projectRoot?: string;
      language?: string;
    }
  ): Promise<{
    summary: string;
    results: DiagnosisResult[];
    statistics: {
      critical: number;
      error: number;
      warning: number;
      info: number;
    };
  }> {
    const results = await this.diagnoseMultiple(errors);

    const statistics = {
      critical: results.filter((r) => r.severity === 'critical').length,
      error: results.filter((r) => r.severity === 'error').length,
      warning: results.filter((r) => r.severity === 'warning').length,
      info: results.filter((r) => r.severity === 'info').length,
    };

    const summary = `诊断了 ${errors.length} 个错误：` +
      `${statistics.critical > 0 ? `${statistics.critical} 个严重错误 ` : ''}` +
      `${statistics.error > 0 ? `${statistics.error} 个错误 ` : ''}` +
      `${statistics.warning > 0 ? `${statistics.warning} 个警告` : ''}`;

    return {
      summary,
      results,
      statistics,
    };
  }
}

/**
 * 错误诊断器单例
 */
let diagnoserInstance: ErrorDiagnoser | null = null;

export function getErrorDiagnoser(): ErrorDiagnoser {
  if (!diagnoserInstance) {
    diagnoserInstance = new ErrorDiagnoser();
  }
  return diagnoserInstance;
}

export function resetErrorDiagnoser(): void {
  diagnoserInstance = null;
}
