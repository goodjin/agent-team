import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

export type OptimizationStrategy = 'simplify' | 'strengthen' | 'add-examples';

export interface PromptVersion {
  id: string;
  version: number;
  content: string;
  strategy?: OptimizationStrategy;
  createdAt: string;
  stats: {
    usageCount: number;
    successCount: number;
    successRate: number;
    avgScore: number;
  };
}

export interface PromptVariant {
  id: string;
  baseVersionId: string;
  strategy: OptimizationStrategy;
  content: string;
  hypothesis: string;
}

interface StorageData {
  versions: Record<string, PromptVersion[]>;
  variants: Record<string, PromptVariant[]>;
}

export class PromptOptimizer extends EventEmitter {
  private versions = new Map<string, PromptVersion[]>();
  private variants = new Map<string, PromptVariant[]>();
  private storagePath: string;
  private maxVersions: number;

  constructor(options?: { storagePath?: string; maxVersions?: number }) {
    super();
    this.storagePath = options?.storagePath ?? path.join(process.cwd(), '.prompt-optimizer.json');
    this.maxVersions = options?.maxVersions ?? 20;
  }

  async recordUsage(
    roleName: string,
    versionId: string,
    success: boolean,
    score: number
  ): Promise<void> {
    const versions = this.versions.get(roleName) ?? [];
    const version = versions.find((v) => v.id === versionId);
    if (!version) return;

    version.stats.usageCount++;
    if (success) version.stats.successCount++;
    version.stats.successRate =
      version.stats.usageCount > 0
        ? version.stats.successCount / version.stats.usageCount
        : 0;

    // Rolling average of score
    const prev = version.stats.avgScore;
    const count = version.stats.usageCount;
    version.stats.avgScore = prev + (score - prev) / count;

    this.emit('usage:recorded', { roleName, versionId, success, score });
  }

  getCurrentPrompt(roleName: string): PromptVersion | undefined {
    const versions = this.versions.get(roleName) ?? [];
    if (versions.length === 0) return undefined;
    // Return latest version
    return versions[versions.length - 1];
  }

  async generateVariants(roleName: string, baseContent: string): Promise<PromptVariant[]> {
    const versions = this.versions.get(roleName) ?? [];

    // Create a base version if none exists
    let baseVersion: PromptVersion;
    if (versions.length === 0) {
      baseVersion = this._createVersion(roleName, baseContent);
    } else {
      baseVersion = versions[versions.length - 1];
    }

    const strategies: OptimizationStrategy[] = ['simplify', 'strengthen', 'add-examples'];
    const newVariants: PromptVariant[] = [];

    for (const strategy of strategies) {
      const variantContent = this.applyStrategy(baseVersion.content, strategy);
      const variant: PromptVariant = {
        id: randomUUID(),
        baseVersionId: baseVersion.id,
        strategy,
        content: variantContent,
        hypothesis: this._getHypothesis(strategy),
      };
      newVariants.push(variant);
    }

    // Store variants
    const existing = this.variants.get(roleName) ?? [];
    this.variants.set(roleName, [...existing, ...newVariants]);

    this.emit('variants:generated', { roleName, variants: newVariants });
    return newVariants;
  }

  async adoptVersion(roleName: string, versionId: string): Promise<void> {
    const versions = this.versions.get(roleName) ?? [];
    const target = versions.find((v) => v.id === versionId);
    if (!target) {
      throw new Error(`版本 ${versionId} 不存在`);
    }

    // Move target to the end (mark as latest/active)
    const filtered = versions.filter((v) => v.id !== versionId);
    filtered.push(target);
    this.versions.set(roleName, filtered);

    this.emit('version:adopted', { roleName, versionId });
  }

  getVersionHistory(roleName: string): PromptVersion[] {
    return this.versions.get(roleName) ?? [];
  }

  analyzeABTest(
    roleName: string
  ): { winner?: string; confidence: number; recommendation: string } {
    const versions = this.versions.get(roleName) ?? [];
    if (versions.length < 2) {
      return { confidence: 0, recommendation: '版本数量不足，无法进行 A/B 分析' };
    }

    // Compare last two versions
    const a = versions[versions.length - 2];
    const b = versions[versions.length - 1];

    if (a.stats.usageCount < 20 || b.stats.usageCount < 20) {
      return {
        confidence: 0,
        recommendation: `样本数量不足（A: ${a.stats.usageCount}, B: ${b.stats.usageCount}），需要至少 20 次使用`,
      };
    }

    const scoreDiff = b.stats.avgScore - a.stats.avgScore;
    const confidence = Math.min(Math.abs(scoreDiff) * 10, 1);

    if (Math.abs(scoreDiff) < 0.5) {
      return {
        confidence,
        recommendation: '两个版本效果相近，建议继续收集数据',
      };
    }

    const winner = scoreDiff > 0 ? b.id : a.id;
    return {
      winner,
      confidence,
      recommendation:
        scoreDiff > 0
          ? `版本 ${b.id} 效果更好（平均分高 ${scoreDiff.toFixed(2)}），建议采纳`
          : `版本 ${a.id} 效果更好（平均分高 ${(-scoreDiff).toFixed(2)}），建议保持现版本`,
    };
  }

  async save(): Promise<void> {
    const data: StorageData = {
      versions: Object.fromEntries(this.versions),
      variants: Object.fromEntries(this.variants),
    };
    await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.storagePath, 'utf-8');
      const data = JSON.parse(content) as StorageData;
      this.versions = new Map(Object.entries(data.versions ?? {}));
      this.variants = new Map(Object.entries(data.variants ?? {}));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
      // File doesn't exist yet, start fresh
    }
  }

  private applyStrategy(content: string, strategy: OptimizationStrategy): string {
    switch (strategy) {
      case 'simplify':
        return this._applySimplify(content);
      case 'strengthen':
        return this._applyStrengthen(content);
      case 'add-examples':
        return this._applyAddExamples(content);
    }
  }

  private _applySimplify(content: string): string {
    // Remove duplicate consecutive blank lines
    let result = content.replace(/\n{3,}/g, '\n\n');
    // Remove trailing spaces
    result = result.replace(/ +$/gm, '');
    // Remove duplicate "注意" lines
    result = result.replace(/注意[：:].+\n注意[：:].+/g, (match) => match.split('\n')[0]);
    // Remove duplicate lines starting with "请"
    result = result.replace(/(请.{5,50})\n\1/g, '$1');
    result = result.trim();

    // Target ~30% reduction - truncate if still too long and content is substantial
    const targetLength = Math.floor(content.length * 0.7);
    if (result.length > targetLength && targetLength > 20) {
      // Try to find a clean break point using punctuation
      const truncated = result.slice(0, targetLength);
      const cleanBreak = truncated.replace(/[^。！？\n.!?]*$/, '').trim();
      // Only use the clean break if it's substantial enough
      if (cleanBreak.length >= Math.floor(targetLength * 0.5)) {
        result = cleanBreak;
      } else {
        // Fall back to keeping first targetLength characters
        result = truncated.trim();
      }
    }

    // Ensure we always return non-empty content
    if (!result) {
      result = content.trim();
    }

    return result;
  }

  private _applyStrengthen(content: string): string {
    // Apply language-specific strengthening
    let result = content
      .replace(/^(- .+)$/gm, (match) => `${match}（必须严格执行）`)
      .replace(/应该/g, '必须')
      .replace(/可以考虑/g, '严禁忽略')
      .replace(/should/gi, 'MUST')
      .replace(/can /gi, 'MUST ')
      .replace(/please /gi, '')
      .trim();

    // Always add a strict constraint note to ensure content is different
    if (result === content.trim()) {
      result = result + '\n\n[CONSTRAINT] All above instructions MUST be strictly followed without exception.';
    }

    return result;
  }

  private _applyAddExamples(content: string): string {
    const examples =
      '\n\n例如：\n输入：请分析这段代码的性能问题\n输出：该代码存在以下性能问题：\n1. 循环内重复计算导致 O(n²) 复杂度\n2. 建议使用缓存优化为 O(n)';
    return content.trim() + examples;
  }

  private _getHypothesis(strategy: OptimizationStrategy): string {
    const hypotheses: Record<OptimizationStrategy, string> = {
      simplify: '精简冗余内容可以降低 token 消耗，提高模型理解效率',
      strengthen: '使用强制性语言可以提高模型遵守指令的概率',
      'add-examples': '添加具体示例可以帮助模型更准确地理解输出格式要求',
    };
    return hypotheses[strategy];
  }

  private _createVersion(roleName: string, content: string): PromptVersion {
    const versions = this.versions.get(roleName) ?? [];
    const version: PromptVersion = {
      id: randomUUID(),
      version: (versions.length > 0 ? versions[versions.length - 1].version : 0) + 1,
      content,
      createdAt: new Date().toISOString(),
      stats: {
        usageCount: 0,
        successCount: 0,
        successRate: 0,
        avgScore: 0,
      },
    };

    // Enforce max versions limit
    let allVersions = [...versions, version];
    if (allVersions.length > this.maxVersions) {
      allVersions = allVersions.slice(allVersions.length - this.maxVersions);
    }
    this.versions.set(roleName, allVersions);

    return version;
  }

  // Public method to add a version directly (used in tests)
  addVersion(roleName: string, content: string, strategy?: OptimizationStrategy): PromptVersion {
    const versions = this.versions.get(roleName) ?? [];
    const version: PromptVersion = {
      id: randomUUID(),
      version: (versions.length > 0 ? versions[versions.length - 1].version : 0) + 1,
      content,
      strategy,
      createdAt: new Date().toISOString(),
      stats: {
        usageCount: 0,
        successCount: 0,
        successRate: 0,
        avgScore: 0,
      },
    };

    let allVersions = [...versions, version];
    if (allVersions.length > this.maxVersions) {
      allVersions = allVersions.slice(allVersions.length - this.maxVersions);
    }
    this.versions.set(roleName, allVersions);

    return version;
  }
}
