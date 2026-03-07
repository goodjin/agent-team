/**
 * Integration Test Orchestrator - Multi-module testing orchestration
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface TestModule {
  name: string;
  path: string;
  testFiles: string[];
  dependencies: string[];
}

export interface TestResult {
  module: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: TestError[];
}

export interface TestError {
  message: string;
  stack?: string;
  line?: number;
}

export interface TestCoverage {
  module: string;
  lines: number;
  linesCovered: number;
  linesUncovered: number;
  branches: number;
  branchesCovered: number;
  functions: number;
  functionsCovered: number;
}

export interface TestSummary {
  totalModules: number;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  coverage: TestCoverage[];
}

export interface TestOrchestratorConfig {
  testDir: string;
  parallel: boolean;
  maxConcurrency: number;
  coverageEnabled: boolean;
  retryFailed: boolean;
  retryCount: number;
  testTimeout: number;
  watchMode: boolean;
}

const DEFAULT_CONFIG: TestOrchestratorConfig = {
  testDir: 'src',
  parallel: true,
  maxConcurrency: 4,
  coverageEnabled: true,
  retryFailed: true,
  retryCount: 2,
  testTimeout: 60000,
  watchMode: false,
};

export class IntegrationTestOrchestrator {
  private config: TestOrchestratorConfig;
  private modules: Map<string, TestModule> = new Map();
  private results: TestResult[] = [];

  constructor(config: Partial<TestOrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async discoverModules(): Promise<TestModule[]> {
    const modules: TestModule[] = [];
    const testPatterns = ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**/*.ts'];

    for (const pattern of testPatterns) {
      const files = await this.glob(pattern);
      for (const file of files) {
        const modulePath = this.getModulePath(file);
        let module = this.modules.get(modulePath);

        if (!module) {
          module = {
            name: this.getModuleName(modulePath),
            path: modulePath,
            testFiles: [],
            dependencies: [],
          };
          this.modules.set(modulePath, module);
          modules.push(module);
        }

        module.testFiles.push(file);
      }
    }

    // Analyze dependencies
    for (const [modulePath, module] of this.modules) {
      module.dependencies = this.analyzeDependencies(module.testFiles);
    }

    return modules;
  }

  private getModulePath(filePath: string): string {
    const parts = filePath.split(path.sep);
    const srcIndex = parts.indexOf('src');

    if (srcIndex !== -1 && srcIndex < parts.length - 1) {
      return path.join(...parts.slice(0, srcIndex + 2));
    }

    return path.dirname(filePath);
  }

  private getModuleName(modulePath: string): string {
    const parts = modulePath.split(path.sep);
    return parts[parts.length - 1] || 'root';
  }

  private analyzeDependencies(testFiles: string[]): string[] {
    const deps = new Set<string>();

    for (const file of testFiles) {
      const content = fs.readFileSync ? require('fs').readFileSync(file, 'utf-8') : '';
      // Simple import analysis
      const importMatches = content.match(/from\s+['"]@([^'"]+)['"]/g) || [];
      for (const imp of importMatches) {
        const match = imp.match(/from\s+['"]@([^'"]+)['"]/);
        if (match) {
          deps.add(match[1].split('/')[0]);
        }
      }
    }

    return Array.from(deps);
  }

  private async glob(pattern: string): Promise<string[]> {
    // Simple glob implementation
    const files: string[] = [];
    const searchDir = this.config.testDir;

    await this.walkDir(searchDir, pattern, files);

    return files;
  }

  private async walkDir(dir: string, pattern: string, files: string[]): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await this.walkDir(fullPath, pattern, files);
          }
        } else if (entry.isFile()) {
          const regex = new RegExp(pattern.replace('**/', '').replace('*', '.*'));
          if (regex.test(entry.name)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  async runAllTests(): Promise<TestSummary> {
    const startTime = Date.now();
    this.results = [];

    const modules = await this.discoverModules();

    if (this.config.parallel) {
      await this.runParallelTests(modules);
    } else {
      await this.runSequentialTests(modules);
    }

    const coverage = await this.collectCoverage();

    const summary: TestSummary = {
      totalModules: modules.length,
      totalTests: this.results.reduce((sum, r) => sum + r.passed + r.failed + r.skipped, 0),
      passed: this.results.filter(r => r.status === 'passed').length,
      failed: this.results.filter(r => r.status === 'failed').length,
      skipped: this.results.filter(r => r.status === 'skipped').length,
      duration: Date.now() - startTime,
      coverage,
    };

    return summary;
  }

  private async runParallelTests(modules: TestModule[]): Promise<void> {
    const chunks: TestModule[][] = [];

    for (let i = 0; i < modules.length; i += this.config.maxConcurrency) {
      chunks.push(modules.slice(i, i + this.config.maxConcurrency));
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(module => this.runModuleTests(module)));
    }
  }

  private async runSequentialTests(modules: TestModule[]): Promise<void> {
    for (const module of modules) {
      await this.runModuleTests(module);
    }
  }

  private async runModuleTests(module: TestModule): Promise<void> {
    // Run tests using vitest or jest if available
    const hasVitest = await this.hasTestFramework('vitest');
    const hasJest = await this.hasTestFramework('jest');

    if (hasVitest) {
      await this.runVitestTests(module);
    } else if (hasJest) {
      await this.runJestTests(module);
    } else {
      // Fallback to simple test runner
      await this.runSimpleTests(module);
    }
  }

  private async hasTestFramework(name: string): Promise<boolean> {
    try {
      await fs.access(path.join(process.cwd(), 'node_modules', name));
      return true;
    } catch {
      return false;
    }
  }

  private async runVitestTests(module: TestModule): Promise<void> {
    const args = ['test', '--reporter=json', '--no-coverage'];

    if (this.config.coverageEnabled) {
      args.push('--coverage');
    }

    if (this.config.watchMode) {
      args.push('--watch');
    }

    args.push(...module.testFiles);

    const result = await this.runCommand('npx', args, { timeout: this.config.testTimeout });

    const parsed = this.parseVitestOutput(result.stdout);
    this.results.push(...parsed);
  }

  private async runJestTests(module: TestModule): Promise<void> {
    const args = ['--json', '--coverage=' + this.config.coverageEnabled];

    if (this.config.watchMode) {
      args.push('--watch');
    }

    args.push(...module.testFiles);

    const result = await this.runCommand('npx', ['jest', ...args], { timeout: this.config.testTimeout });

    const parsed = this.parseJestOutput(result.stdout);
    this.results.push(...parsed);
  }

  private async runSimpleTests(module: TestModule): Promise<void> {
    // Simple test runner for files that just export test functions
    for (const file of module.testFiles) {
      const startTime = Date.now();
      const result: TestResult = {
        module: module.name,
        file,
        status: 'passed',
        duration: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        errors: [],
      };

      try {
        // Dynamic import for ES modules
        const moduleName = path.relative(process.cwd(), file);
        const testModule = await import(`./${moduleName}`);

        // Find test functions
        const testFunctions = Object.keys(testModule).filter(k =>
          typeof testModule[k] === 'function' &&
          (k.startsWith('test') || k.startsWith('it') || k.startsWith('describe'))
        );

        for (const fnName of testFunctions) {
          try {
            await testModule[fnName]();
            result.passed++;
          } catch (error: any) {
            result.failed++;
            result.errors.push({
              message: error.message,
              stack: error.stack,
            });
          }
        }

        result.status = result.failed > 0 ? 'failed' : 'passed';
      } catch (error: any) {
        result.status = 'failed';
        result.errors.push({
          message: error.message,
          stack: error.stack,
        });
      }

      result.duration = Date.now() - startTime;
      this.results.push(result);
    }
  }

  private runCommand(cmd: string, args: string[], options: { timeout: number }): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { shell: true });
      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timed out after ${options.timeout}ms`));
      }, options.timeout);

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ stdout, stderr, code: code || 0 });
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private parseVitestOutput(output: string): TestResult[] {
    const results: TestResult[] = [];

    try {
      const lines = output.split('\n');
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'test' || parsed.type === 'task') {
            results.push({
              module: parsed.file || 'unknown',
              file: parsed.file || 'unknown',
              status: parsed.state === 'pass' ? 'passed' : parsed.state === 'fail' ? 'failed' : 'skipped',
              duration: parsed.duration || 0,
              passed: parsed.state === 'pass' ? 1 : 0,
              failed: parsed.state === 'fail' ? 1 : 0,
              skipped: 0,
              errors: [],
            });
          }
        } catch {
          // Not JSON, skip
        }
      }
    } catch {
      // Ignore parse errors
    }

    return results;
  }

  private parseJestOutput(output: string): TestResult[] {
    const results: TestResult[] = [];

    try {
      const data = JSON.parse(output);
      for (const suite of data.testResults || []) {
        for (const assertion of suite.assertionResults || []) {
          results.push({
            module: suite.name,
            file: suite.name,
            status: assertion.status === 'passed' ? 'passed' : assertion.status === 'failed' ? 'failed' : 'skipped',
            duration: assertion.duration || 0,
            passed: assertion.status === 'passed' ? 1 : 0,
            failed: assertion.status === 'failed' ? 1 : 0,
            skipped: assertion.status === 'pending' ? 1 : 0,
            errors: assertion.failureMessages || [],
          });
        }
      }
    } catch {
      // Ignore parse errors
    }

    return results;
  }

  async collectCoverage(): Promise<TestCoverage[]> {
    const coverage: TestCoverage[] = [];
    const coverageFiles = await this.glob('**/coverage/coverage-summary.json');

    for (const file of coverageFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const data = JSON.parse(content);

        for (const [pathKey, metrics] of Object.entries(data)) {
          const m = metrics as any;
          coverage.push({
            module: pathKey,
            lines: m.lines?.total || 0,
            linesCovered: m.lines?.covered || 0,
            linesUncovered: m.lines?.uncovered || 0,
            branches: m.branches?.total || 0,
            branchesCovered: m.branches?.covered || 0,
            functions: m.functions?.total || 0,
            functionsCovered: m.functions?.covered || 0,
          });
        }
      } catch {
        // Ignore parse errors
      }
    }

    return coverage;
  }

  getResults(): TestResult[] {
    return this.results;
  }

  async retryFailed(): Promise<void> {
    const failedResults = this.results.filter(r => r.status === 'failed');

    for (let i = 0; i < this.config.retryCount; i++) {
      for (const result of failedResults) {
        const module = Array.from(this.modules.values()).find(m => m.testFiles.includes(result.file));
        if (module) {
          await this.runModuleTests(module);
        }
      }
    }
  }

  generateReport(summary: TestSummary): string {
    const passRate = summary.totalTests > 0
      ? ((summary.passed / summary.totalTests) * 100).toFixed(1)
      : '0.0';

    let report = `# Integration Test Report\n\n`;
    report += `## Summary\n`;
    report += `- Modules: ${summary.totalModules}\n`;
    report += `- Total Tests: ${summary.totalTests}\n`;
    report += `- Passed: ${summary.passed}\n`;
    report += `- Failed: ${summary.failed}\n`;
    report += `- Skipped: ${summary.skipped}\n`;
    report += `- Pass Rate: ${passRate}%\n`;
    report += `- Duration: ${(summary.duration / 1000).toFixed(2)}s\n\n`;

    // Failed tests
    if (summary.failed > 0) {
      report += `## Failed Tests\n`;
      const failedResults = this.results.filter(r => r.status === 'failed');
      for (const result of failedResults.slice(0, 20)) {
        report += `- ${result.file}: ${result.errors[0]?.message || 'Unknown error'}\n`;
      }
      if (failedResults.length > 20) {
        report += `- ... and ${failedResults.length - 20} more\n`;
      }
      report += '\n';
    }

    // Coverage
    if (summary.coverage.length > 0) {
      report += `## Coverage\n`;
      report += `| Module | Lines | Branches | Functions |\n`;
      report += `|--------|-------|----------|----------|\n`;

      for (const cov of summary.coverage.slice(0, 10)) {
        const linePercent = cov.lines > 0 ? ((cov.linesCovered / cov.lines) * 100).toFixed(1) : '0.0';
        const branchPercent = cov.branches > 0 ? ((cov.branchesCovered / cov.branches) * 100).toFixed(1) : '0.0';
        const funcPercent = cov.functions > 0 ? ((cov.functionsCovered / cov.functions) * 100).toFixed(1) : '0.0';

        report += `| ${cov.module} | ${linePercent}% | ${branchPercent}% | ${funcPercent}% |\n`;
      }
    }

    return report;
  }
}

export function createTestOrchestrator(config?: Partial<TestOrchestratorConfig>): IntegrationTestOrchestrator {
  return new IntegrationTestOrchestrator(config);
}
