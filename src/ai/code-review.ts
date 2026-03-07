/**
 * Code Review Agent - Automatic code review with security, performance, and best practices checks
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface ReviewIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'security' | 'performance' | 'best-practice' | 'type-safety' | 'style' | 'architecture';
  message: string;
  line?: number;
  file: string;
  rule: string;
  suggestion?: string;
}

export interface CodeReviewResult {
  file: string;
  issues: ReviewIssue[];
  score: number;
  summary: string;
}

export interface ReviewConfig {
  includeSecurity: boolean;
  includePerformance: boolean;
  includeBestPractices: boolean;
  includeTypeSafety: boolean;
  excludePatterns: string[];
  maxIssuesPerFile: number;
}

// Security patterns to detect vulnerabilities
const SECURITY_PATTERNS = [
  {
    pattern: /eval\s*\(/g,
    message: 'Avoid using eval() - potential code injection risk',
    severity: 'critical' as const,
    rule: 'no-eval',
  },
  {
    pattern: /exec\s*\(|spawn\s*\(/g,
    message: 'Command injection risk - sanitize user input',
    severity: 'critical' as const,
    rule: 'no-command-injection',
  },
  {
    pattern: /innerHTML\s*=|\.html\s*\(/g,
    message: 'XSS vulnerability - use textContent or sanitize HTML',
    severity: 'high' as const,
    rule: 'no-inner-html',
  },
  {
    pattern: /SELECT.*FROM|INSERT INTO|UPDATE.*SET|DELETE FROM/gi,
    message: 'Potential SQL injection - use parameterized queries',
    severity: 'critical' as const,
    rule: 'no-sql-injection',
  },
  {
    pattern: /process\.env\.|process\.argv/g,
    message: 'Ensure sensitive data is not exposed via environment',
    severity: 'medium' as const,
    rule: 'env-security',
  },
  {
    pattern: /password|secret|token|api[_-]?key/gi,
    message: 'Potential hardcoded credential - use environment variables',
    severity: 'high' as const,
    rule: 'no-hardcoded-credentials',
  },
  {
    pattern: /Math\.random\s*\(\)/g,
    message: 'Math.random() is not cryptographically secure',
    severity: 'medium' as const,
    rule: 'secure-random',
  },
];

// Performance patterns
const PERFORMANCE_PATTERNS = [
  {
    pattern: /for\s*\(\s*let\s+\w+\s+in\s+/g,
    message: 'Use for...of instead of for...in for arrays',
    severity: 'medium' as const,
    rule: 'prefer-for-of',
  },
  {
    pattern: /\.map\s*\(\s*\w+\s*=>\s*\{\s*return/g,
    message: 'Arrow function can be simplified (implicit return)',
    severity: 'low' as const,
    rule: 'simplify-arrow',
  },
  {
    pattern: /JSON\.parse\s*\(/g,
    message: 'Consider try-catch around JSON.parse',
    severity: 'low' as const,
    rule: 'json-parse-safety',
  },
  {
    pattern: /\.forEach\s*\(/g,
    message: 'Consider using for...of or .map() for better performance',
    severity: 'low' as const,
    rule: 'prefer-map',
  },
];

// Best practices patterns
const BEST_PRACTICE_PATTERNS = [
  {
    pattern: /console\.(log|debug|info)\s*\(/g,
    message: 'Remove console statements in production code',
    severity: 'low' as const,
    rule: 'no-console',
  },
  {
    pattern: /catch\s*\(\s*\)/g,
    message: 'Empty catch block - handle errors properly',
    severity: 'medium' as const,
    rule: 'no-empty-catch',
  },
  {
    pattern: /TODO|FIXME|HACK|XXX/g,
    message: 'TODO comment found - should be addressed',
    severity: 'info' as const,
    rule: 'no-todo',
  },
  {
    pattern: /any\s*\(\s*\)/g,
    message: 'Avoid using any type - use specific types',
    severity: 'medium' as const,
    rule: 'no-any-type',
  },
  {
    pattern: /@ts-ignore|@ts-expect-error|@ts-nocheck/g,
    message: 'TypeScript disable comments found - fix type issues',
    severity: 'medium' as const,
    rule: 'no-ts-ignore',
  },
  {
    pattern: /==\s*null|!=\s*null/g,
    message: 'Use === for strict equality',
    severity: 'low' as const,
    rule: 'strict-equality',
  },
];

// Architecture patterns
const ARCHITECTURE_PATTERNS = [
  {
    pattern: /require\s*\(\s*['"][^'"]+['"]\s*\)/g,
    message: 'Use ES6 imports instead of CommonJS require',
    severity: 'low' as const,
    rule: 'prefer-esm',
  },
  {
    pattern: /export\s+default/g,
    message: 'Prefer named exports over default exports',
    severity: 'low' as const,
    rule: 'prefer-named-exports',
  },
  {
    pattern: /new\s+Promise\s*\(\s*\(\s*resolve/g,
    message: 'Consider using async/await instead of Promise constructor',
    severity: 'low' as const,
    rule: 'prefer-async-await',
  },
];

export class CodeReviewAgent {
  private config: ReviewConfig;

  constructor(config: Partial<ReviewConfig> = {}) {
    this.config = {
      includeSecurity: true,
      includePerformance: true,
      includeBestPractices: true,
      includeTypeSafety: true,
      excludePatterns: ['node_modules', 'dist', 'build', '.git'],
      maxIssuesPerFile: 50,
      ...config,
    };
  }

  async reviewFile(filePath: string): Promise<CodeReviewResult> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const issues: ReviewIssue[] = [];

    // Skip if file matches exclude patterns
    for (const pattern of this.config.excludePatterns) {
      if (filePath.includes(pattern)) {
        return {
          file: filePath,
          issues: [],
          score: 100,
          summary: 'Skipped (excluded pattern)',
        };
      }
    }

    // Check file extension
    const ext = path.extname(filePath);
    const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];

    if (!supportedExtensions.includes(ext)) {
      return {
        file: filePath,
        issues: [],
        score: 100,
        summary: 'Skipped (unsupported file type)',
      };
    }

    // Run security checks
    if (this.config.includeSecurity) {
      issues.push(...this.runPatternChecks(content, lines, SECURITY_PATTERNS, 'security'));
    }

    // Run performance checks
    if (this.config.includePerformance) {
      issues.push(...this.runPatternChecks(content, lines, PERFORMANCE_PATTERNS, 'performance'));
    }

    // Run best practices checks
    if (this.config.includeBestPractices) {
      issues.push(...this.runPatternChecks(content, lines, BEST_PRACTICE_PATTERNS, 'best-practice'));
    }

    // Run architecture checks
    issues.push(...this.runPatternChecks(content, lines, ARCHITECTURE_PATTERNS, 'architecture'));

    // Type safety checks for TypeScript files
    if (this.config.includeTypeSafety && (ext === '.ts' || ext === '.tsx')) {
      issues.push(...this.checkTypeSafety(content, lines, filePath));
    }

    // Limit issues per file
    const limitedIssues = issues.slice(0, this.config.maxIssuesPerFile);

    // Calculate score
    const score = this.calculateScore(limitedIssues);

    return {
      file: filePath,
      issues: limitedIssues,
      score,
      summary: this.generateSummary(limitedIssues),
    };
  }

  private runPatternChecks(
    content: string,
    lines: string[],
    patterns: Array<{ pattern: RegExp; message: string; severity: ReviewIssue['severity']; rule: string }>,
    category: ReviewIssue['category']
  ): ReviewIssue[] {
    const issues: ReviewIssue[] = [];

    for (const { pattern, message, severity, rule } of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;

      while ((match = regex.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const line = lines[lineNumber - 1]?.trim() || '';

        issues.push({
          severity,
          category,
          message,
          line: lineNumber,
          file: '',
          rule,
          suggestion: this.getSuggestion(rule, line),
        });
      }
    }

    return issues;
  }

  private checkTypeSafety(content: string, lines: string[], filePath: string): ReviewIssue[] {
    const issues: ReviewIssue[] = [];

    // Check for any type usage
    const anyTypePattern = /:\s*any\b/g;
    let match;
    while ((match = anyTypePattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      issues.push({
        severity: 'medium',
        category: 'type-safety',
        message: 'Avoid using :any type annotation',
        line: lineNumber,
        file: filePath,
        rule: 'no-any-annotation',
        suggestion: 'Use specific type or unknown',
      });
    }

    // Check for non-null assertion
    const nonNullPattern = /!\s*[;=)]/g;
    while ((match = nonNullPattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      issues.push({
        severity: 'medium',
        category: 'type-safety',
        message: 'Non-null assertion found - consider proper null handling',
        line: lineNumber,
        file: filePath,
        rule: 'no-non-null-assertion',
      });
    }

    return issues;
  }

  private getSuggestion(rule: string, line: string): string | undefined {
    const suggestions: Record<string, string> = {
      'no-eval': 'Use Function constructor or JSON.parse instead',
      'no-command-injection': 'Use execFile with arguments array or a validation library',
      'no-inner-html': 'Use textContent or a sanitization library like DOMPurify',
      'no-sql-injection': 'Use parameterized queries or an ORM',
      'no-hardcoded-credentials': 'Use process.env.VARIABLE_NAME',
      'secure-random': 'Use crypto.randomBytes() or crypto.getRandomValues()',
      'prefer-for-of': 'for (const item of array)',
      'no-console': 'Remove console statements or use a logger',
      'no-empty-catch': 'Log the error or handle it appropriately',
      'no-todo': 'Create a GitHub issue to track this',
      'no-any-type': 'Use specific type or unknown',
      'no-ts-ignore': 'Fix the underlying type issue',
      'strict-equality': 'Use === or !==',
    };

    return suggestions[rule];
  }

  private calculateScore(issues: ReviewIssue[]): number {
    if (issues.length === 0) return 100;

    const severityWeights: Record<ReviewIssue['severity'], number> = {
      critical: 20,
      high: 10,
      medium: 5,
      low: 2,
      info: 1,
    };

    let deduction = 0;
    for (const issue of issues) {
      deduction += severityWeights[issue.severity];
    }

    return Math.max(0, 100 - deduction);
  }

  private generateSummary(issues: ReviewIssue[]): string {
    if (issues.length === 0) return 'No issues found';

    const bySeverity = {
      critical: issues.filter(i => i.severity === 'critical').length,
      high: issues.filter(i => i.severity === 'high').length,
      medium: issues.filter(i => i.severity === 'medium').length,
      low: issues.filter(i => i.severity === 'low').length,
      info: issues.filter(i => i.severity === 'info').length,
    };

    const parts: string[] = [];
    if (bySeverity.critical > 0) parts.push(`${bySeverity.critical} critical`);
    if (bySeverity.high > 0) parts.push(`${bySeverity.high} high`);
    if (bySeverity.medium > 0) parts.push(`${bySeverity.medium} medium`);
    if (bySeverity.low > 0) parts.push(`${bySeverity.low} low`);
    if (bySeverity.info > 0) parts.push(`${bySeverity.info} info`);

    return `${issues.length} issue(s): ${parts.join(', ')}`;
  }

  async reviewDirectory(dirPath: string): Promise<CodeReviewResult[]> {
    const results: CodeReviewResult[] = [];
    const files = await this.getFiles(dirPath);

    for (const file of files) {
      try {
        const result = await this.reviewFile(file);
        if (result.issues.length > 0 || result.score < 100) {
          results.push(result);
        }
      } catch (error) {
        console.error(`Error reviewing ${file}:`, error);
      }
    }

    return results;
  }

  private async getFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (this.config.excludePatterns.includes(entry.name)) continue;
        const subFiles = await this.getFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  generateReport(results: CodeReviewResult[]): string {
    const totalFiles = results.length;
    const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
    const avgScore = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
      : 100;

    let report = `# Code Review Report\n\n`;
    report += `## Summary\n`;
    report += `- Files Reviewed: ${totalFiles}\n`;
    report += `- Total Issues: ${totalIssues}\n`;
    report += `- Average Score: ${avgScore}/100\n\n`;

    // Group issues by severity
    const critical = results.flatMap(r => r.issues.filter(i => i.severity === 'critical'));
    const high = results.flatMap(r => r.issues.filter(i => i.severity === 'high'));
    const medium = results.flatMap(r => r.issues.filter(i => i.severity === 'medium'));

    if (critical.length > 0) {
      report += `## Critical Issues (${critical.length})\n`;
      for (const issue of critical.slice(0, 10)) {
        report += `- [${issue.file}:${issue.line}] ${issue.message} (${issue.rule})\n`;
      }
      if (critical.length > 10) {
        report += `- ... and ${critical.length - 10} more\n`;
      }
      report += '\n';
    }

    if (high.length > 0) {
      report += `## High Priority Issues (${high.length})\n`;
      for (const issue of high.slice(0, 10)) {
        report += `- [${issue.file}:${issue.line}] ${issue.message} (${issue.rule})\n`;
      }
      if (high.length > 10) {
        report += `- ... and ${high.length - 10} more\n`;
      }
      report += '\n';
    }

    // File-by-file breakdown
    report += `## File Breakdown\n`;
    for (const result of results) {
      if (result.issues.length > 0) {
        report += `- ${result.file}: ${result.score}/100 (${result.issues.length} issues)\n`;
      }
    }

    return report;
  }
}

export function createCodeReviewAgent(config?: Partial<ReviewConfig>): CodeReviewAgent {
  return new CodeReviewAgent(config);
}
