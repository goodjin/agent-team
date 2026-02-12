import { EventEmitter } from 'events';
import type { VectorStore } from './vector-store.js';
import type {
  KnowledgeEntry,
  KnowledgeCategory,
  TaskCompletedEvent,
  TaskFailedEvent,
  ToolErrorEvent,
} from './types.js';

// ---- 规则引擎 ----

const EXTRACTION_RULES: Record<KnowledgeCategory, RegExp[]> = {
  'error-solution': [
    /Error:\s*.+/i,
    /TypeError|ReferenceError|SyntaxError|RangeError/,
    /ENOENT|EACCES|ECONNREFUSED|ETIMEDOUT/,
    /(?:解决|修复|fix|resolved|workaround)/i,
    /Exception|exception|stack trace/i,
  ],
  'best-practice': [
    /(?:建议|推荐|应该|最佳实践)/i,
    /(?:should|recommend|best practice|always|never)/i,
    /(?:注意|避免|warning|avoid|don't|不要)/i,
  ],
  'code': [
    /```[\s\S]{10,}```/,
    /(?:function|class|const|let|var)\s+\w+/,
    /(?:def|class|import)\s+\w+/,
  ],
  'decision': [
    /(?:选择|决定|采用|选型|decided|chosen)/i,
    /(?:因为|原因|理由|because|reason|trade.?off)/i,
    /(?:vs|versus|对比|compared to)/i,
  ],
  'context': [
    /(?:项目|project|环境|environment|配置|configuration)/i,
    /(?:依赖|dependency|version|版本)/i,
  ],
  'other': [],
};

function classifyContent(text: string): KnowledgeCategory {
  const scores: Partial<Record<KnowledgeCategory, number>> = {};

  for (const [category, rules] of Object.entries(EXTRACTION_RULES) as [KnowledgeCategory, RegExp[]][]) {
    if (rules.length === 0) continue;
    const matchCount = rules.filter(r => r.test(text)).length;
    scores[category] = matchCount / rules.length;
  }

  const sorted = Object.entries(scores).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
  const [topCategory, topScore] = sorted[0] ?? ['context', 0];

  return (topScore as number) >= 0.2 ? (topCategory as KnowledgeCategory) : 'context';
}

// ---- 敏感信息脱敏 ----

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED]' },
  { pattern: /(?:api[_-]?key|apikey)['":\s=]+[^\s'"&]+/gi, replacement: 'api_key=[REDACTED]' },
  { pattern: /(?:password|passwd|pwd)['":\s=]+[^\s'"&]+/gi, replacement: 'password=[REDACTED]' },
  { pattern: /(?:token|secret)['":\s=]+[^\s'"&]{8,}/gi, replacement: 'token=[REDACTED]' },
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: '[AWS_KEY_REDACTED]' },
];

function redactSensitive(text: string): string {
  let result = text;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ---- KnowledgeExtractor ----

type SaveInput = Omit<KnowledgeEntry, 'id' | 'embedding' | 'embeddingModel' | 'namespace' | 'version' | 'versions' | 'status' | 'createdAt' | 'updatedAt' | 'accessedAt'>;

export class KnowledgeExtractor {
  private store: VectorStore;
  private emitter?: EventEmitter;

  constructor(store: VectorStore) {
    this.store = store;
  }

  // 挂接到 EventEmitter
  attach(emitter: EventEmitter): void {
    this.emitter = emitter;
    emitter.on('task:completed', (event: TaskCompletedEvent) => {
      this.onTaskCompleted(event).catch(console.error);
    });
    emitter.on('task:failed', (event: TaskFailedEvent) => {
      this.onTaskFailed(event).catch(console.error);
    });
    emitter.on('tool:error', (event: ToolErrorEvent) => {
      this.onToolError(event).catch(console.error);
    });
  }

  // 任务完成时提取知识
  async onTaskCompleted(event: TaskCompletedEvent): Promise<void> {
    const startTime = Date.now();

    const rawContent = `任务：${event.input}\n结果：${event.output}`;
    const content = redactSensitive(rawContent);
    const category = classifyContent(content);

    await this.saveKnowledge({
      title: this.extractTitle(event.output, category),
      content,
      summary: this.generateSummary(content),
      category,
      tags: this.extractTags(content, event.toolsUsed),
      source: { taskId: event.taskId, agentId: event.agentId },
      quality: {
        confidence: event.success ? 0.7 : 0.4,
        verified: false,
        usageCount: 0,
        successRate: event.success ? 1.0 : 0.0,
      },
    });

    const elapsed = Date.now() - startTime;
    if (elapsed > 2000) {
      console.warn(`[KnowledgeExtractor] 知识提取耗时 ${elapsed}ms，超过 2s 阈值`);
    }
  }

  // 任务失败时提取错误经验
  async onTaskFailed(event: TaskFailedEvent): Promise<void> {
    const errorMsg = event.error instanceof Error ? event.error.message : String(event.error);
    // 包含错误类型名称（如 TypeError），便于分类
    const errorFullStr = event.error instanceof Error
      ? `${event.error.name}: ${event.error.message}`
      : String(event.error);
    const content = redactSensitive(
      `错误：${errorFullStr}\n触发条件：${event.input}\n工具：${event.toolsUsed.join(', ')}`
    );

    await this.saveKnowledge({
      title: `[错误] ${this.truncate(errorMsg, 80)}`,
      content,
      summary: this.truncate(errorFullStr, 200),
      category: 'error-solution',
      tags: ['error', ...this.extractErrorTags(errorFullStr)],
      source: { taskId: event.taskId, agentId: event.agentId },
      quality: { confidence: 0.6, verified: false, usageCount: 0, successRate: 0 },
    });
  }

  // 工具错误时提取
  async onToolError(event: ToolErrorEvent): Promise<void> {
    const errorMsg = event.error instanceof Error ? event.error.message : String(event.error);
    const content = redactSensitive(
      `工具 ${event.toolName} 错误：${errorMsg}`
    );

    await this.saveKnowledge({
      title: `[工具错误] ${event.toolName}: ${this.truncate(errorMsg, 60)}`,
      content,
      summary: this.truncate(content, 200),
      category: 'error-solution',
      tags: ['error', 'tool-error', event.toolName],
      source: { taskId: event.taskId, agentId: event.agentId, tool: event.toolName },
      quality: { confidence: 0.5, verified: false, usageCount: 0, successRate: 0 },
    });
  }

  // 最佳实践升级
  async promoteBestPractices(options = { minUsage: 3, minSuccessRate: 0.8 }): Promise<void> {
    const { entries } = await this.store.list({ status: 'active', pageSize: 100 });
    for (const entry of entries) {
      if (
        entry.quality.usageCount >= options.minUsage &&
        entry.quality.successRate >= options.minSuccessRate &&
        entry.category !== 'best-practice' &&
        !entry.tags.includes('verified')
      ) {
        await this.store.update(entry.id, {
          category: 'best-practice',
          tags: [...entry.tags, 'verified'],
          quality: { ...entry.quality, verified: true },
        });
        this.emitter?.emit('knowledge:promoted', { entryId: entry.id });
      }
    }
  }

  // 保存知识（去重检查）
  private async saveKnowledge(input: SaveInput): Promise<void> {
    // 重复检测：搜索相似内容
    const existing = await this.store.search({
      text: input.content,
      topK: 1,
      threshold: 0.9,
      searchMode: 'semantic',
    });

    if (existing.length > 0 && existing[0].score >= 0.9) {
      // 相似度 > 0.9：合并（更新 usageCount）
      const dup = existing[0].entry;
      await this.store.update(dup.id, {
        quality: {
          ...dup.quality,
          usageCount: dup.quality.usageCount + 1,
        },
        accessedAt: new Date().toISOString(),
      });
      return;
    }

    // 新知识：创建条目
    await this.store.add({ ...input, namespace: 'global' });
  }

  // ---- 辅助方法 ----

  private extractTitle(text: string, category: KnowledgeCategory): string {
    const firstLine = text.split('\n')[0].replace(/^#+\s*/, '').trim();
    return this.truncate(firstLine || `[${category}] 知识条目`, 100);
  }

  private generateSummary(text: string): string {
    const clean = text.replace(/```[\s\S]*?```/g, '[代码块]').replace(/[#*_`]/g, '');
    return this.truncate(clean, 200);
  }

  private extractTags(content: string, toolsUsed: string[]): string[] {
    const tags = [...toolsUsed];
    const techPatterns: [RegExp, string][] = [
      [/\bexpress\b/i, 'express'],
      [/\breact\b/i, 'react'],
      [/\btypescript\b/i, 'typescript'],
      [/\bnodejs?\b/i, 'nodejs'],
      [/\bdocker\b/i, 'docker'],
      [/\bpostgres(?:ql)?\b/i, 'postgresql'],
    ];
    for (const [pattern, tag] of techPatterns) {
      if (pattern.test(content) && !tags.includes(tag)) tags.push(tag);
    }
    return tags.slice(0, 10);
  }

  private extractErrorTags(errorMsg: string): string[] {
    const tags: string[] = [];
    if (/TypeError/i.test(errorMsg)) tags.push('type-error');
    if (/ENOENT/i.test(errorMsg)) tags.push('file-not-found');
    if (/ECONNREFUSED/i.test(errorMsg)) tags.push('connection-error');
    if (/SyntaxError/i.test(errorMsg)) tags.push('syntax-error');
    return tags;
  }

  private truncate(text: string, maxLen: number): string {
    return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + '...';
  }
}
