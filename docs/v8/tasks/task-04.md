# Task 04: KnowledgeExtractor - 事件监听 + 知识提取

**优先级**: P0
**预计工时**: 4h
**阶段**: Phase 2
**依赖**: Task 3（VectorStore 完整实现）

---

## 目标

实现 KnowledgeExtractor，通过事件监听自动从 Agent 任务执行过程中提取知识，存入 VectorStore。支持错误经验提取、成功方案提取、最佳实践识别，以及敏感信息脱敏。

---

## 前置调研

在实现前，查阅以下文件了解现有事件系统：
- `src/ai/agent-loop.ts` - 了解 AgentLoop 事件发射方式
- `src/ai/master-agent.ts` - 了解 MasterAgent 事件发射方式
- `src/ai/sub-agent.ts` - 了解 SubAgent 事件发射方式

**关键问题**：
1. 现有代码使用 `EventEmitter` 还是其他事件系统？
2. `task:completed` 事件的 payload 格式是什么？
3. 是否存在 `tool:error` 事件？

---

## 实现步骤

### Step 1: 定义事件接口（0.5h）

在 `src/knowledge/types.ts` 中添加（或在 extractor.ts 中本地定义）：

```typescript
// 任务完成事件 payload
export interface TaskCompletedEvent {
  taskId: string;
  agentId: string;
  input: string;          // 任务原始输入
  output: string;         // 任务最终输出
  toolsUsed: string[];    // 使用的工具列表
  duration: number;       // 执行时长（ms）
  success: boolean;
}

// 任务失败事件 payload
export interface TaskFailedEvent {
  taskId: string;
  agentId: string;
  input: string;
  error: Error | string;
  toolsUsed: string[];
  duration: number;
}

// 工具错误事件 payload
export interface ToolErrorEvent {
  taskId: string;
  agentId: string;
  toolName: string;
  input: Record<string, unknown>;
  error: Error | string;
}
```

**适配策略**：如果现有 Agent 不发射这些事件，KnowledgeExtractor 提供静态方法供手动调用（不强制依赖事件系统）。

### Step 2: 规则引擎（1h）

```typescript
// src/knowledge/extractor.ts

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
    /```[\s\S]{10,}```/,                    // 代码块
    /(?:function|class|const|let|var)\s+\w+/, // JS/TS 声明
    /(?:def|class|import)\s+\w+/,            // Python 声明
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
  'other': [],  // 默认分类，不需要规则
};

// 计算分类分数
function classifyContent(text: string): KnowledgeCategory {
  const scores: Partial<Record<KnowledgeCategory, number>> = {};

  for (const [category, rules] of Object.entries(EXTRACTION_RULES) as [KnowledgeCategory, RegExp[]][]) {
    if (rules.length === 0) continue;
    const matchCount = rules.filter(r => r.test(text)).length;
    scores[category] = matchCount / rules.length;
  }

  const sorted = Object.entries(scores).sort(([,a], [,b]) => (b ?? 0) - (a ?? 0));
  const [topCategory, topScore] = sorted[0] ?? ['other', 0];

  return (topScore as number) >= 0.2 ? (topCategory as KnowledgeCategory) : 'context';
}
```

### Step 3: 敏感信息脱敏（0.5h）

```typescript
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED]' },
  { pattern: /(?:api[_-]?key|apikey)['":\s=]+[^\s'"&]+/gi, replacement: 'api_key=[REDACTED]' },
  { pattern: /(?:password|passwd|pwd)['":\s=]+[^\s'"&]+/gi, replacement: 'password=[REDACTED]' },
  { pattern: /(?:token|secret)['":\s=]+[^\s'"&]{8,}/gi, replacement: 'token=[REDACTED]' },
  // AWS Access Key
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: '[AWS_KEY_REDACTED]' },
  // 长随机字符串（疑似密钥）
  { pattern: /[A-Za-z0-9+/]{32,}={0,2}/g, replacement: '[KEY_REDACTED]' },
];

function redactSensitive(text: string): string {
  let result = text;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
```

### Step 4: KnowledgeExtractor 类（1.5h）

```typescript
import { EventEmitter } from 'events';
import type { VectorStore } from './vector-store';
import type { KnowledgeEntry, TaskCompletedEvent, TaskFailedEvent, ToolErrorEvent } from './types';

export class KnowledgeExtractor {
  private store: VectorStore;
  private extractionDelay: number = 0;  // 提取前的延迟（用于等待 store 就绪）

  constructor(store: VectorStore) {
    this.store = store;
  }

  // 挂接到 EventEmitter
  attach(emitter: EventEmitter): void {
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

    // 验证：提取时间 <= 2s
    const elapsed = Date.now() - startTime;
    if (elapsed > 2000) {
      console.warn(`[KnowledgeExtractor] 知识提取耗时 ${elapsed}ms，超过 2s 阈值`);
    }
  }

  // 任务失败时提取错误经验
  async onTaskFailed(event: TaskFailedEvent): Promise<void> {
    const errorMsg = event.error instanceof Error ? event.error.message : String(event.error);
    const content = redactSensitive(
      `错误：${errorMsg}\n触发条件：${event.input}\n工具：${event.toolsUsed.join(', ')}`
    );

    await this.saveKnowledge({
      title: `[错误] ${this.truncate(errorMsg, 80)}`,
      content,
      summary: this.truncate(errorMsg, 200),
      category: 'error-solution',
      tags: ['error', ...this.extractErrorTags(errorMsg)],
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

  // 保存知识（去重检查）
  private async saveKnowledge(
    input: Omit<KnowledgeEntry, 'id' | 'embedding' | 'embeddingModel' | 'namespace' | 'version' | 'versions' | 'status' | 'createdAt' | 'updatedAt' | 'accessedAt'>
  ): Promise<void> {
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

  // 最佳实践识别（定期调用）
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
        // 发送事件（如果有 emitter）
        this.emitter?.emit('knowledge:promoted', { entryId: entry.id });
      }
    }
  }

  // 辅助方法
  private extractTitle(text: string, category: KnowledgeCategory): string {
    // 取第一行或第一句，截断到 100 字符
    const firstLine = text.split('\n')[0].replace(/^#+\s*/, '').trim();
    return this.truncate(firstLine || `[${category}] 知识条目`, 100);
  }

  private generateSummary(text: string): string {
    // 取前 200 字符，去除 Markdown 标记
    const clean = text.replace(/```[\s\S]*?```/g, '[代码块]').replace(/[#*_`]/g, '');
    return this.truncate(clean, 200);
  }

  private extractTags(content: string, toolsUsed: string[]): string[] {
    const tags = [...toolsUsed];
    // 提取技术关键词作为标签
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
    return tags.slice(0, 10); // 最多 10 个标签
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

  private emitter?: EventEmitter;
}
```

### Step 5: 与现有 Agent 集成（0.5h）

在 `src/knowledge/index.ts` 或使用方提供集成示例：

```typescript
// 集成示例（在应用启动时）
import { VectorStore, KnowledgeExtractor } from './src/knowledge';

const store = new VectorStore({ storagePath: '.agent-memory/knowledge-store.json' });
await store.initialize();

const extractor = new KnowledgeExtractor(store);
extractor.attach(masterAgent);  // 挂接到 MasterAgent
extractor.attach(subAgent);     // 也挂接到 SubAgent

// 定期检查最佳实践（每小时）
setInterval(() => extractor.promoteBestPractices(), 60 * 60 * 1000);
```

---

## 验收标准

- [ ] 监听 `task:completed` / `task:failed` / `tool:error` 事件
- [ ] 任务完成后 <= 2s 内完成知识提取（打印 warning 如超时）
- [ ] 提取的知识条目包含 `source.taskId` 引用
- [ ] 相似度 > 0.9 的重复知识自动合并（更新 usageCount）
- [ ] 敏感信息（Bearer Token、API Key、password）自动脱敏
- [ ] 自动分类（code/error-solution/best-practice/decision/context）
- [ ] 被使用 >= 3 次且成功率 >= 80% 的知识自动升级为 `best-practice`
- [ ] `promoteBestPractices()` 发射 `knowledge:promoted` 事件
- [ ] 如现有 Agent 无事件系统，提供手动调用接口（`onTaskCompleted` 等公开方法）
- [ ] 单元测试：`tests/v8/unit/extractor.test.ts` 覆盖以上逻辑
