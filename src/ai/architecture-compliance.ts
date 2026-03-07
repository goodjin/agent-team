/**
 * Architecture Compliance Checker - Ensures code follows project standards
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface ComplianceIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'structure' | 'naming' | 'import' | 'dependency' | 'organization';
  message: string;
  file?: string;
  rule: string;
  expected?: string;
  actual?: string;
}

export interface ComplianceResult {
  passed: boolean;
  issues: ComplianceIssue[];
  summary: string;
  score: number;
  file?: string;
}

export interface ArchitectureRule {
  id: string;
  description: string;
  check: (context: ComplianceContext) => ComplianceIssue[];
}

export interface ComplianceContext {
  rootDir: string;
  srcDir: string;
  filePath: string;
  content: string;
  imports: string[];
  exports: string[];
  dependencies: Map<string, string[]>;
}

export interface ComplianceConfig {
  rules: string[];
  strictMode: boolean;
  allowedDirectories: string[];
  maxFileSize: number;
  allowCircularDependencies: boolean;
}

const DEFAULT_CONFIG: ComplianceConfig = {
  rules: ['structure', 'naming', 'import', 'dependency', 'organization'],
  strictMode: false,
  allowedDirectories: ['src', 'tests', 'docs', 'scripts', 'config'],
  maxFileSize: 100000, // 100KB
  allowCircularDependencies: false,
};

// Directory structure rules
const STRUCTURE_RULES: ArchitectureRule[] = [
  {
    id: 'dir-src-only',
    description: 'Source code must be in src directory',
    check: (ctx) => {
      const issues: ComplianceIssue[] = [];
      if (!ctx.filePath.startsWith(ctx.srcDir) && !ctx.filePath.includes('/node_modules/')) {
        issues.push({
          severity: 'high',
          category: 'structure',
          message: 'Source file outside src directory',
          file: ctx.filePath,
          rule: 'dir-src-only',
          expected: 'src/',
          actual: path.dirname(ctx.filePath),
        });
      }
      return issues;
    },
  },
  {
    id: 'no-mixed-content',
    description: 'No mixed content in directories (tests with src)',
    check: (ctx) => {
      const issues: ComplianceIssue[] = [];
      const fileDir = path.dirname(ctx.filePath);
      const srcRel = path.relative(ctx.srcDir, fileDir);

      // Check if file is in a test directory mixed with src
      if (srcRel.includes('__tests__') || srcRel.includes('.test.') || srcRel.includes('.spec.')) {
        if (srcRel.includes('/src/') || ctx.filePath.includes('/src/')) {
          issues.push({
            severity: 'medium',
            category: 'structure',
            message: 'Test files should not be mixed with source in src directory',
            file: ctx.filePath,
            rule: 'no-mixed-content',
          });
        }
      }
      return issues;
    },
  },
];

// Naming convention rules
const NAMING_RULES: ArchitectureRule[] = [
  {
    id: 'file-name-kebab',
    description: 'File names should use kebab-case',
    check: (ctx) => {
      const issues: ComplianceIssue[] = [];
      const fileName = path.basename(ctx.filePath);
      const ext = path.extname(fileName);
      const nameWithoutExt = fileName.replace(ext, '');

      // Allow PascalCase for React components
      const isReactComponent = /^[A-Z][a-zA-Z]*\.tsx?$/.test(nameWithoutExt);
      const isTypeScriptDecl = /\.d\.ts$/.test(fileName);

      if (!isReactComponent && !isTypeScriptDecl) {
        // Check for kebab-case
        if (!/^[a-z][a-z0-9-]*$/.test(nameWithoutExt) && !nameWithoutExt.includes('-')) {
          // Allow index files
          if (nameWithoutExt !== 'index') {
            issues.push({
              severity: 'low',
              category: 'naming',
              message: 'File name should use kebab-case',
              file: ctx.filePath,
              rule: 'file-name-kebab',
              expected: 'my-file-name.ts',
              actual: nameWithoutExt + ext,
            });
          }
        }
      }
      return issues;
    },
  },
  {
    id: 'class-name-pascal',
    description: 'Class names should use PascalCase',
    check: (ctx) => {
      const issues: ComplianceIssue[] = [];
      const classMatch = ctx.content.match(/class\s+([A-Z][a-zA-Z0-9]*)/g);

      if (classMatch) {
        for (const match of classMatch) {
          const className = match.replace('class ', '');
          if (!/^[A-Z][a-zA-Z0-9]*$/.test(className)) {
            issues.push({
              severity: 'medium',
              category: 'naming',
              message: `Class ${className} should use PascalCase`,
              file: ctx.filePath,
              rule: 'class-name-pascal',
              expected: 'class MyClass',
              actual: match,
            });
          }
        }
      }
      return issues;
    },
  },
  {
    id: 'const-enum-naming',
    description: 'Constants should use UPPER_SNAKE_CASE',
    check: (ctx) => {
      const issues: ComplianceIssue[] = [];
      const constMatch = ctx.content.match(/const\s+([A-Z][A-Z0-9_]*)\s*=/g);

      if (constMatch) {
        for (const match of constMatch) {
          const constName = match.replace('const ', '').replace(' =', '');
          if (!/^[A-Z][A-Z0-9_]*$/.test(constName)) {
            issues.push({
              severity: 'low',
              category: 'naming',
              message: `Constant ${constName} should use UPPER_SNAKE_CASE`,
              file: ctx.filePath,
              rule: 'const-enum-naming',
            });
          }
        }
      }
      return issues;
    },
  },
];

// Import/export rules
const IMPORT_RULES: ArchitectureRule[] = [
  {
    id: 'no-relative-imports',
    description: 'Avoid relative imports beyond 2 levels',
    check: (ctx) => {
      const issues: ComplianceIssue[] = [];
      const relativeImports = ctx.content.match(/from\s+['"]\.\.?\/+/g) || [];

      for (const imp of relativeImports) {
        const depth = (imp.match(/\.\./g) || []).length;
        if (depth > 2) {
          issues.push({
            severity: 'medium',
            category: 'import',
            message: 'Deep relative imports - consider using package imports',
            file: ctx.filePath,
            rule: 'no-relative-imports',
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'ordered-imports',
    description: 'Imports should be organized (external, then internal, then relative)',
    check: (ctx) => {
      const issues: ComplianceIssue[] = [];
      const importLines = ctx.content.match(/^import\s+.*$/gm) || [];

      if (importLines.length > 3) {
        let lastType = '';
        for (const line of importLines) {
          const currentType = line.includes('from \'@') || line.includes('from "@')
            ? 'external'
            : line.startsWith('import {') || line.includes('from \'./') || line.includes('from "./')
              ? 'relative'
              : 'internal';

          if (lastType && lastType === 'relative' && currentType === 'external') {
            issues.push({
              severity: 'low',
              category: 'import',
              message: 'Import order: external imports should come before relative imports',
              file: ctx.filePath,
              rule: 'ordered-imports',
            });
            break;
          }
          lastType = currentType;
        }
      }
      return issues;
    },
  },
  {
    id: 'no-barrel-imports',
    description: 'Avoid barrel imports (index.ts re-exports) in hot paths',
    check: (ctx) => {
      const issues: ComplianceIssue[] = [];
      const barrelImports = ctx.content.match(/from\s+['"]\.\/index['"]/g) ||
                          ctx.content.match(/from\s+['"]\.\/['"]\s*;?\s*$/gm);

      if (barrelImports && barrelImports.length > 0) {
        issues.push({
          severity: 'low',
          category: 'import',
          message: 'Barrel imports detected - consider direct imports for better tree-shaking',
          file: ctx.filePath,
          rule: 'no-barrel-imports',
        });
      }
      return issues;
    },
  },
];

// Dependency rules
const DEPENDENCY_RULES: ArchitectureRule[] = [
  {
    id: 'no-circular-dependency',
    description: 'Detect circular dependencies',
    check: (ctx) => {
      const issues: ComplianceIssue[] = [];
      const fileName = path.basename(ctx.filePath, path.extname(ctx.filePath));

      for (const [module, deps] of ctx.dependencies) {
        if (deps.includes(fileName)) {
          // Check if this file is in the dependency chain
          const chain = ctx.dependencies.get(fileName) || [];
          if (chain.includes(module)) {
            issues.push({
              severity: 'high',
              category: 'dependency',
              message: `Circular dependency detected: ${fileName} -> ${module} -> ${fileName}`,
              file: ctx.filePath,
              rule: 'no-circular-dependency',
            });
          }
        }
      }
      return issues;
    },
  },
  {
    id: 'module-boundary',
    description: 'Respect module boundaries (e.g., no core imports from tools)',
    check: (ctx) => {
      const issues: ComplianceIssue[] = [];
      const srcRel = path.relative(ctx.srcDir, ctx.filePath);
      const currentModule = srcRel.split(path.sep)[0];

      const boundaryRules: Record<string, string[]> = {
        'tools': ['config', 'types', 'prompts'],
        'services': ['config', 'types', 'prompts'],
        'core': ['config', 'types', 'services'],
      };

      const allowed = boundaryRules[currentModule];
      if (allowed) {
        for (const imp of ctx.imports) {
          const impModule = imp.split('/')[0];
          if (!allowed.includes(impModule) && impModule !== currentModule && !imp.startsWith('@')) {
            issues.push({
              severity: 'medium',
              category: 'dependency',
              message: `Module boundary violation: ${currentModule} should not import from ${impModule}`,
              file: ctx.filePath,
              rule: 'module-boundary',
              expected: allowed.join(', '),
              actual: impModule,
            });
          }
        }
      }
      return issues;
    },
  },
];

// Organization rules
const ORGANIZATION_RULES: ArchitectureRule[] = [
  {
    id: 'max-file-size',
    description: 'Files should not exceed maximum size',
    check: (ctx) => {
      const issues: ComplianceIssue[] = [];
      const maxSize = 100000; // 100KB

      if (ctx.content.length > maxSize) {
        issues.push({
          severity: 'medium',
          category: 'organization',
          message: `File exceeds maximum size (${Math.round(ctx.content.length / 1000)}KB > ${Math.round(maxSize / 1000)}KB)`,
          file: ctx.filePath,
          rule: 'max-file-size',
          expected: `< ${Math.round(maxSize / 1000)}KB`,
          actual: `${Math.round(ctx.content.length / 1000)}KB`,
        });
      }
      return issues;
    },
  },
  {
    id: 'single-responsibility',
    description: 'Files should have single responsibility (one export class/function)',
    check: (ctx) => {
      const issues: ComplianceIssue[] = [];
      const exports = ctx.content.match(/export\s+(class|function|const|interface|type)\s+\w+/g) || [];

      if (exports.length > 5) {
        issues.push({
          severity: 'low',
          category: 'organization',
          message: `Multiple exports (${exports.length}) - consider splitting file`,
          file: ctx.filePath,
          rule: 'single-responsibility',
        });
      }
      return issues;
    },
  },
  {
    id: 'no-duplicate-exports',
    description: 'No duplicate exports in the same file',
    check: (ctx) => {
      const issues: ComplianceIssue[] = [];
      const exportMatches = ctx.content.match(/export\s+(default\s+)?(?:class|function|const|interface|type)\s+(\w+)/g) || [];
      const seen = new Set<string>();

      for (const exp of exportMatches) {
        const name = exp.replace('export ', '').replace('default ', '').trim();
        if (seen.has(name)) {
          issues.push({
            severity: 'medium',
            category: 'organization',
            message: `Duplicate export: ${name}`,
            file: ctx.filePath,
            rule: 'no-duplicate-exports',
          });
        }
        seen.add(name);
      }
      return issues;
    },
  },
];

export class ArchitectureComplianceChecker {
  private config: ComplianceConfig;
  private dependencies: Map<string, string[]> = new Map();

  constructor(config: Partial<ComplianceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async checkFile(filePath: string): Promise<ComplianceResult> {
    const content = await fs.readFile(filePath, 'utf-8');
    const context = await this.buildContext(filePath, content);

    const issues: ComplianceIssue[] = [];

    // Run enabled rules
    if (this.config.rules.includes('structure')) {
      for (const rule of STRUCTURE_RULES) {
        issues.push(...rule.check(context));
      }
    }

    if (this.config.rules.includes('naming')) {
      for (const rule of NAMING_RULES) {
        issues.push(...rule.check(context));
      }
    }

    if (this.config.rules.includes('import')) {
      for (const rule of IMPORT_RULES) {
        issues.push(...rule.check(context));
      }
    }

    if (this.config.rules.includes('dependency')) {
      for (const rule of DEPENDENCY_RULES) {
        issues.push(...rule.check(context));
      }
    }

    if (this.config.rules.includes('organization')) {
      for (const rule of ORGANIZATION_RULES) {
        issues.push(...rule.check(context));
      }
    }

    // Check file size
    if (content.length > this.config.maxFileSize) {
      issues.push({
        severity: 'medium',
        category: 'organization',
        message: `File size exceeds limit: ${content.length} > ${this.config.maxFileSize}`,
        file: filePath,
        rule: 'max-file-size',
      });
    }

    // Filter circular dependencies if allowed
    const filteredIssues = this.config.allowCircularDependencies
      ? issues.filter(i => i.rule !== 'no-circular-dependency')
      : issues;

    const score = this.calculateScore(filteredIssues);

    return {
      passed: filteredIssues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
      issues: filteredIssues,
      summary: this.generateSummary(filteredIssues),
      score,
    };
  }

  private async buildContext(filePath: string, content: string): Promise<ComplianceContext> {
    const rootDir = process.cwd();
    const srcDir = path.join(rootDir, 'src');

    // Extract imports
    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // Extract exports
    const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|interface|type)\s+(\w+)/g;
    const exports: string[] = [];
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    // Get dependencies for this module
    const fileName = path.basename(filePath, path.extname(filePath));
    const moduleDeps = this.dependencies.get(fileName) || [];

    return {
      rootDir,
      srcDir,
      filePath,
      content,
      imports,
      exports,
      dependencies: this.dependencies,
    };
  }

  async analyzeDependencies(dirPath: string): Promise<void> {
    const files = await this.getTypeScriptFiles(dirPath);

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const fileName = path.basename(file, path.extname(file));

      const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
      const imports: string[] = [];
      let match;

      while ((match = importRegex.exec(content)) !== null) {
        const imp = match[1];
        if (!imp.startsWith('@') && !imp.startsWith('.') && !imp.includes('node_modules')) {
          imports.push(imp);
        }
      }

      this.dependencies.set(fileName, imports);
    }
  }

  private async getTypeScriptFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') {
          const subFiles = await this.getTypeScriptFiles(fullPath);
          files.push(...subFiles);
        }
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private calculateScore(issues: ComplianceIssue[]): number {
    if (issues.length === 0) return 100;

    const severityWeights: Record<ComplianceIssue['severity'], number> = {
      critical: 25,
      high: 15,
      medium: 5,
      low: 1,
    };

    let deduction = 0;
    for (const issue of issues) {
      deduction += severityWeights[issue.severity];
    }

    return Math.max(0, 100 - deduction);
  }

  private generateSummary(issues: ComplianceIssue[]): string {
    if (issues.length === 0) return 'All checks passed';

    const byCategory = {
      structure: issues.filter(i => i.category === 'structure').length,
      naming: issues.filter(i => i.category === 'naming').length,
      import: issues.filter(i => i.category === 'import').length,
      dependency: issues.filter(i => i.category === 'dependency').length,
      organization: issues.filter(i => i.category === 'organization').length,
    };

    const parts: string[] = [];
    for (const [cat, count] of Object.entries(byCategory)) {
      if (count > 0) parts.push(`${count} ${cat}`);
    }

    return `${issues.length} issue(s): ${parts.join(', ')}`;
  }

  async checkDirectory(dirPath: string): Promise<ComplianceResult[]> {
    await this.analyzeDependencies(dirPath);

    const results: ComplianceResult[] = [];
    const files = await this.getTypeScriptFiles(dirPath);

    for (const file of files) {
      try {
        const result = await this.checkFile(file);
        if (result.issues.length > 0 || result.score < 100) {
          results.push(result);
        }
      } catch (error) {
        console.error(`Error checking ${file}:`, error);
      }
    }

    return results;
  }

  generateReport(results: ComplianceResult[]): string {
    const totalFiles = results.length;
    const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
    const avgScore = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
      : 100;

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    let report = `# Architecture Compliance Report\n\n`;
    report += `## Summary\n`;
    report += `- Files Checked: ${totalFiles}\n`;
    report += `- Passed: ${passed} | Failed: ${failed}\n`;
    report += `- Total Issues: ${totalIssues}\n`;
    report += `- Average Score: ${avgScore}/100\n\n`;

    // Group issues by category
    const categories = ['structure', 'naming', 'import', 'dependency', 'organization'] as const;

    for (const cat of categories) {
      const catIssues = results.flatMap(r => r.issues.filter(i => i.category === cat));
      if (catIssues.length > 0) {
        report += `## ${cat.charAt(0).toUpperCase() + cat.slice(1)} Issues (${catIssues.length})\n`;
        for (const issue of catIssues.slice(0, 5)) {
          report += `- ${issue.message}${issue.file ? ` [${issue.file}]` : ''}\n`;
        }
        if (catIssues.length > 5) {
          report += `- ... and ${catIssues.length - 5} more\n`;
        }
        report += '\n';
      }
    }

    // Failed files
    const failedFiles = results.filter(r => !r.passed);
    if (failedFiles.length > 0) {
      report += `## Failed Files\n`;
      for (const result of failedFiles) {
        report += `- ${result.file}: ${result.issues.filter(i => i.severity === 'critical' || i.severity === 'high').length} critical/high issues\n`;
      }
    }

    return report;
  }
}

export function createArchitectureComplianceChecker(config?: Partial<ComplianceConfig>): ArchitectureComplianceChecker {
  return new ArchitectureComplianceChecker(config);
}
