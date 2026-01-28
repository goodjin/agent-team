/**
 * Diff 工具 - 实现增量文件修改
 */

import { promises as fs } from 'fs';
import type { ToolResult } from './base.js';
export type { ToolResult };

/**
 * Diff 配置
 */
export interface DiffConfig {
  contextLines: number;
  lineThreshold: number;
}

/**
 * Diff 行
 */
export interface DiffLine {
  type: 'context' | 'added' | 'removed';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Diff 块
 */
export interface DiffBlock {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

/**
 * Diff 结果
 */
export interface DiffResult {
  success: boolean;
  oldContent?: string;
  newContent?: string;
  diff?: string;
  hunks?: DiffBlock[];
  error?: string;
}

/**
 * 行差异计算器
 */
export class DiffCalculator {
  private config: DiffConfig;

  constructor(config?: Partial<DiffConfig>) {
    this.config = {
      contextLines: config?.contextLines ?? 3,
      lineThreshold: config?.lineThreshold ?? 1000,
    };
  }

  /**
   * 计算两个字符串的差异
   */
  calculate(oldContent: string, newContent: string): DiffResult {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    // 处理 Windows 换行符
    const normalizedOldLines = oldContent.replace(/\r\n/g, '\n').split('\n');
    const normalizedNewLines = newContent.replace(/\r\n/g, '\n').split('\n');

    // 使用 LCS 算法计算差异
    const diff = this.longestCommonSubsequence(normalizedOldLines, normalizedNewLines);

    // 生成 diff 格式
    const hunks = this.generateHunks(diff, normalizedOldLines, normalizedNewLines);

    // 生成统一 diff 格式
    const unifiedDiff = this.generateUnifiedDiff(
      normalizedOldLines,
      normalizedNewLines,
      hunks
    );

    return {
      success: true,
      oldContent,
      newContent,
      diff: unifiedDiff,
      hunks,
    };
  }

  /**
   * 计算行的添加和删除
   */
  calculateLineChanges(
    oldContent: string,
    newContent: string
  ): {
    added: number;
    removed: number;
    unchanged: number;
    changes: Array<{ type: 'add' | 'remove'; lineNumber: number; content: string }>;
  } {
    const oldLines = oldContent.replace(/\r\n/g, '\n').split('\n');
    const newLines = newContent.replace(/\r\n/g, '\n').split('\n');

    const changes: Array<{ type: 'add' | 'remove'; lineNumber: number; content: string }> = [];
    let added = 0;
    let removed = 0;
    let unchanged = 0;

    const diff = this.longestCommonSubsequence(oldLines, newLines);

    let oldIndex = 0;
    let newIndex = 0;

    for (const item of diff) {
      if (item.type === 'same') {
        oldIndex++;
        newIndex++;
        unchanged++;
      } else if (item.type === 'remove') {
        changes.push({
          type: 'remove',
          lineNumber: oldIndex + 1,
          content: oldLines[oldIndex],
        });
        removed++;
        oldIndex++;
      } else if (item.type === 'add') {
        changes.push({
          type: 'add',
          lineNumber: newIndex + 1,
          content: newLines[newIndex],
        });
        added++;
        newIndex++;
      }
    }

    return { added, removed, unchanged, changes };
  }

  /**
   * LCS 算法计算差异
   */
  private longestCommonSubsequence(
    oldLines: string[],
    newLines: string[]
  ): Array<{ type: 'same' | 'add' | 'remove'; line: string }> {
    const m = oldLines.length;
    const n = newLines.length;

    // 构建 DP 表
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // 回溯构建差异列表
    const result: Array<{ type: 'same' | 'add' | 'remove'; line: string }> = [];
    let i = m;
    let j = n;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        result.unshift({ type: 'same', line: oldLines[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.unshift({ type: 'add', line: newLines[j - 1] });
        j--;
      } else {
        result.unshift({ type: 'remove', line: oldLines[i - 1] });
        i--;
      }
    }

    return result;
  }

  /**
   * 生成分块
   */
  private generateHunks(
    diff: Array<{ type: 'same' | 'add' | 'remove'; line: string }>,
    oldLines: string[],
    newLines: string[]
  ): DiffBlock[] {
    const hunks: DiffBlock[] = [];
    let currentHunk: DiffBlock | null = null;
    let contextStart = 0;

    for (let i = 0; i < diff.length; i++) {
      const item = diff[i];

      if (item.type !== 'same') {
        // 找到上下文开始位置
        contextStart = Math.max(0, i - this.config.contextLines);

        // 初始化或继续当前块
        if (!currentHunk) {
          const oldStart = this.countSameBefore(diff, i) + 1;
          const newStart = this.countAddBefore(diff, i) + 1;

          currentHunk = {
            oldStart,
            oldLines: 0,
            newStart,
            newLines: 0,
            lines: [],
          };
        }
      }

      if (currentHunk) {
        // 添加行到当前块
        if (item.type === 'same') {
          currentHunk.lines.push({
            type: 'context',
            content: item.line,
            oldLineNumber: currentHunk.oldStart + currentHunk.oldLines,
            newLineNumber: currentHunk.newStart + currentHunk.newLines,
          });
          currentHunk.oldLines++;
          currentHunk.newLines++;

          // 检查是否应该结束当前块
          const sameAfter = this.countSameAfter(diff, i);
          if (sameAfter > this.config.contextLines * 2) {
            hunks.push(currentHunk);
            currentHunk = null;
          }
        } else if (item.type === 'remove') {
          currentHunk.lines.push({
            type: 'removed',
            content: item.line,
            oldLineNumber: currentHunk.oldStart + currentHunk.oldLines,
          });
          currentHunk.oldLines++;
        } else {
          currentHunk.lines.push({
            type: 'added',
            content: item.line,
            newLineNumber: currentHunk.newStart + currentHunk.newLines,
          });
          currentHunk.newLines++;
        }
      }
    }

    // 添加最后一个块
    if (currentHunk && currentHunk.lines.length > 0) {
      hunks.push(currentHunk);
    }

    return hunks;
  }

  /**
   * 生成统一 diff 格式
   */
  private generateUnifiedDiff(
    oldLines: string[],
    newLines: string[],
    hunks: DiffBlock[]
  ): string {
    const lines: string[] = [];

    lines.push('--- a/original');
    lines.push('+++ b/modified');

    for (const hunk of hunks) {
      const oldEnd = hunk.oldStart + hunk.oldLines - 1;
      const newEnd = hunk.newStart + hunk.newLines - 1;

      lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);

      for (const line of hunk.lines) {
        const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
        lines.push(`${prefix}${line.content}`);
      }
    }

    return lines.join('\n');
  }

  private countSameBefore(
    diff: Array<{ type: 'same' | 'add' | 'remove'; line: string }>,
    index: number
  ): number {
    let count = 0;
    for (let i = 0; i < index; i++) {
      if (diff[i].type === 'same') count++;
    }
    return count;
  }

  private countAddBefore(
    diff: Array<{ type: 'same' | 'add' | 'remove'; line: string }>,
    index: number
  ): number {
    let count = 0;
    for (let i = 0; i < index; i++) {
      if (diff[i].type === 'add') count++;
    }
    return count;
  }

  private countSameAfter(
    diff: Array<{ type: 'same' | 'add' | 'remove'; line: string }>,
    index: number
  ): number {
    let count = 0;
    for (let i = index; i < diff.length; i++) {
      if (diff[i].type === 'same') count++;
      else count = 0;
    }
    return count;
  }
}

/**
 * 应用 diff 到文件
 */
export async function applyDiff(
  filePath: string,
  diff: string
): Promise<ToolResult> {
  try {
    // 读取原始文件
    const oldContent = await fs.readFile(filePath, 'utf-8');

    // 解析 diff 并应用
    const newContent = parseAndApplyDiff(oldContent, diff);

    // 写入新内容
    await fs.writeFile(filePath, newContent, 'utf-8');

    return {
      success: true,
      data: { filePath, applied: true },
    };
  } catch (error: any) {
    return {
      success: false,
      error: `应用 diff 失败: ${error.message}`,
    };
  }
}

/**
 * 解析并应用 diff
 */
function parseAndApplyDiff(content: string, diff: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const diffLines = diff.split('\n');

  // 解析 diff
  const changes: Array<{ type: 'add' | 'remove'; lineNumber: number; content: string }> = [];

  let currentHunk: any = null;

  for (const diffLine of diffLines) {
    if (diffLine.startsWith('@@')) {
      // 解析 hunk 头
      const match = diffLine.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      if (match) {
        currentHunk = {
          oldLine: parseInt(match[1], 10),
          newLine: parseInt(match[2], 10),
        };
      }
    } else if (currentHunk && (diffLine.startsWith('+') || diffLine.startsWith('-'))) {
      const type = diffLine.startsWith('+') ? 'add' : 'remove';
      const lineContent = diffLine.slice(1);

      if (type === 'add') {
        changes.push({
          type,
          lineNumber: currentHunk.newLine,
          content: lineContent,
        });
        currentHunk.newLine++;
      } else {
        changes.push({
          type,
          lineNumber: currentHunk.oldLine,
          content: lineContent,
        });
        currentHunk.oldLine++;
      }
    } else if (currentHunk && diffLine.startsWith(' ')) {
      currentHunk.oldLine++;
      currentHunk.newLine++;
    }
  }

  // 应用更改
  let result = [...lines];
  let offset = 0;

  for (const change of changes) {
    const actualLineNumber = change.lineNumber + offset - 1;

    if (change.type === 'add') {
      result.splice(actualLineNumber + 1, 0, change.content);
      offset++;
    } else if (change.type === 'remove') {
      result.splice(actualLineNumber, 1);
      offset--;
    }
  }

  return result.join('\n');
}

/**
 * 创建 diff 计算器
 */
export function createDiffCalculator(config?: Partial<DiffConfig>): DiffCalculator {
  return new DiffCalculator(config);
}
