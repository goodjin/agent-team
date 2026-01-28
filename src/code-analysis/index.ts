/**
 * 代码分析模块入口
 */

import { promises as fs } from 'fs';
import path from 'path';

export { ErrorDiagnoser, getErrorDiagnoser, resetErrorDiagnoser } from '../utils/error-diagnoser.js';
export type { DiagnosisResult, FixSuggestion, ErrorType, ErrorSeverity } from '../utils/error-diagnoser.js';

/**
 * 简单的代码分析结果
 */
export interface SimpleCodeAnalysis {
  language: string;
  lineCount: number;
  functionCount: number;
  classCount: number;
  importCount: number;
  complexity: 'low' | 'medium' | 'high';
  hasTypeAnnotations: boolean;
  hasTests: boolean;
}

/**
 * 简单的代码分析器（无需 AST）
 */
export async function analyzeCodeSimple(
  filePath: string
): Promise<SimpleCodeAnalysis> {
  const content = await fs.readFile(filePath, 'utf-8');
  const language = detectLanguage(filePath);

  const lines = content.split('\n');
  const functionRegex = /(?:function|const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  const classRegex = /class\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const importRegex = /(?:import|require)\s*\(/g;
  const typeAnnotationRegex = /:\s*(string|number|boolean|any|void|null|undefined|Object|Array|Map|Set|Promise|Function)/g;

  let functionCount = 0;
  let classCount = 0;
  let importCount = 0;
  let hasTypeAnnotations = false;

  // 统计函数
  let match;
  while ((match = functionRegex.exec(content)) !== null) {
    if (!match[1].startsWith('if') && !match[1].startsWith('for') && !match[1].startsWith('while')) {
      functionCount++;
    }
  }

  // 统计类
  while ((match = classRegex.exec(content)) !== null) {
    classCount++;
  }

  // 统计导入
  while ((match = importRegex.exec(content)) !== null) {
    importCount++;
  }

  // 检查类型注解
  hasTypeAnnotations = typeAnnotationRegex.test(content);

  // 计算复杂度
  let complexity: 'low' | 'medium' | 'high' = 'low';
  const cyclomaticComplexity = estimateCyclomaticComplexity(content);
  if (cyclomaticComplexity > 20) {
    complexity = 'high';
  } else if (cyclomaticComplexity > 10) {
    complexity = 'medium';
  }

  // 检查是否有测试
  const hasTests = /\.(test|spec)\.(ts|js)$/.test(filePath) ||
    /describe\(|it\(/.test(content);

  return {
    language,
    lineCount: lines.length,
    functionCount,
    classCount,
    importCount,
    complexity,
    hasTypeAnnotations,
    hasTests,
  };
}

/**
 * 检测编程语言
 */
function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  const languageMap: { [key: string]: string } = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript (React)',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript (React)',
    '.py': 'Python',
    '.java': 'Java',
    '.cpp': 'C++',
    '.c': 'C',
    '.h': 'C/C++ Header',
    '.go': 'Go',
    '.rs': 'Rust',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.swift': 'Swift',
    '.kt': 'Kotlin',
    '.scala': 'Scala',
  };

  return languageMap[ext] || 'Unknown';
}

/**
 * 估计圈复杂度
 */
function estimateCyclomaticComplexity(content: string): number {
  let complexity = 1; // 基础复杂度

  // 统计条件语句
  const conditions = [
    /if\s*\(/g,
    /else\s+if/g,
    /for\s*\(/g,
    /while\s*\(/g,
    /case\s+/g,
    /catch\s*\(/g,
    /\?\s*.*\s*:/g, // 三元运算符
  ];

  for (const regex of conditions) {
    const matches = content.match(regex);
    if (matches) {
      complexity += matches.length;
    }
  }

  return complexity;
}

/**
 * 查找文件中的特定模式
 */
export async function findPatterns(
  filePath: string,
  patterns: RegExp[]
): Promise<Map<RegExp, RegExpMatchArray[]>> {
  const content = await fs.readFile(filePath, 'utf-8');
  const results = new Map<RegExp, RegExpMatchArray[]>();

  for (const pattern of patterns) {
    const matches: RegExpMatchArray[] = [];
    let match;

    while ((match = pattern.exec(content)) !== null) {
      matches.push(match);
    }

    if (matches.length > 0) {
      results.set(pattern, matches);
    }
  }

  return results;
}

/**
 * 获取文件统计信息
 */
export async function getFileStats(
  filePath: string
): Promise<{
  size: number;
  lines: number;
  words: number;
  chars: number;
}> {
  const content = await fs.readFile(filePath, 'utf-8');

  return {
    size: content.length,
    lines: content.split('\n').length,
    words: content.split(/\s+/).length,
    chars: content.length,
  };
}

/**
 * 项目代码分析
 */
export async function analyzeProject(
  projectRoot: string
): Promise<{
  totalFiles: number;
  totalLines: number;
  languageDistribution: { [language: string]: number };
  complexityDistribution: { low: number; medium: number; high: number };
  testCoverage: number;
}> {
  const stats = {
    totalFiles: 0,
    totalLines: 0,
    languageDistribution: {} as { [language: string]: number },
    complexityDistribution: { low: 0, medium: 0, high: 0 },
    testCoverage: 0,
  };

  // 统计项目文件
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java'];

  for (const ext of extensions) {
    const files = await findFiles(projectRoot, `**/*${ext}`);
    stats.languageDistribution[ext.replace('.', '')] = files.length;
    stats.totalFiles += files.length;

    for (const file of files) {
      try {
        const analysis = await analyzeCodeSimple(file);
        stats.totalLines += analysis.lineCount;
        stats.complexityDistribution[analysis.complexity]++;
      } catch {
        // 忽略无法分析的文件
      }
    }
  }

  // 估算测试覆盖率
  const testFiles = await findFiles(projectRoot, '**/*.test.*');
  const allSourceFiles = await findFiles(projectRoot, '**/*.spec.*');
  const totalTestable = stats.totalFiles - testFiles.length;
  if (totalTestable > 0) {
    stats.testCoverage = Math.round((testFiles.length / totalTestable) * 100);
  }

  return stats;
}

/**
 * 递归查找文件
 */
async function findFiles(
  dir: string,
  pattern: string
): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.match(/^(node_modules|dist|build|__pycache__|\.git)$/)) {
          results.push(...(await findFiles(fullPath, pattern)));
        }
      } else if (entry.name.match(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '.*'))) {
        results.push(fullPath);
      }
    }
  } catch {
    // 忽略无法访问的目录
  }

  return results;
}
