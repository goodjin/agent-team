import * as fs from 'fs/promises';
import * as path from 'path';
import type { ILogger } from '../../infrastructure/logger/index.js';
import type { IRoleRepository } from '../../domain/role/role.repository.js';
import { LLMService, type Message } from '../../infrastructure/llm/index.js';

export interface PlanReviewIssue {
  severity: 'blocker' | 'major' | 'minor';
  description: string;
  fix_suggestion: string;
  acceptance: string;
}

export interface PlanReviewVerdict {
  passed: boolean;
  summary: string;
  issues: PlanReviewIssue[];
  next_action: string;
}

const DEFAULT_SYSTEM_PROMPT = `你是 **Momus 风格的计划审查员**，职责是对执行计划进行严格质量门禁。你必须只输出 JSON。

## 评审标准（四大维度）
1. **清晰性**：每个任务是否指向明确的文件/模块/接口或可落地的产出。
2. **可验证性**：是否有具体验收标准或可运行的验证步骤。
3. **上下文完整性**：是否覆盖关键依赖、风险、边界条件。
4. **全局一致性**：与需求/范围一致，不缺关键阶段或关键角色。

## 输出要求（必须严格 JSON）
{
  "passed": true|false,
  "summary": "一句话结论",
  "issues": [
    {
      "severity": "blocker|major|minor",
      "description": "问题描述",
      "fix_suggestion": "修复建议",
      "acceptance": "如何验收通过"
    }
  ],
  "next_action": "下一步行动建议"
}

## 审查规则
- 材料不足或无法验证时必须判定为不通过。
- 只输出 JSON，不要任何额外文字。
- 不要编造需求或文件内容。`;

function resolveInWorkspace(root: string, userPath: string): string | null {
  const raw = String(userPath || '').trim().replace(/\\/g, '/');
  if (!raw) return null;
  const base = path.resolve(root);
  const candidate = path.isAbsolute(raw) || /^[a-zA-Z]:\//.test(raw) || raw.startsWith('//')
    ? path.resolve(raw)
    : path.resolve(base, raw);
  const rel = path.relative(base, candidate);
  if (!rel || rel === '.') return candidate;
  if (rel.startsWith('..') || rel.includes(`..${path.sep}`)) return null;
  return candidate;
}

async function readClip(root: string, rel: string, maxChars: number): Promise<string> {
  const abs = resolveInWorkspace(root, rel);
  if (!abs) return '（路径非法/越界）';
  try {
    const txt = await fs.readFile(abs, 'utf-8');
    const t = txt.trim();
    if (t.length <= maxChars) return t;
    return `${t.slice(0, maxChars)}\n\n…（截断）`;
  } catch {
    return '（无法读取）';
  }
}

function safeJsonParse(text: string): any | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const i = raw.indexOf('{');
    const j = raw.lastIndexOf('}');
    if (i !== -1 && j !== -1 && j > i) {
      try {
        return JSON.parse(raw.slice(i, j + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeVerdict(raw: any): PlanReviewVerdict | null {
  if (!raw || typeof raw !== 'object') return null;
  const passed = !!raw.passed;
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
  const issues = Array.isArray(raw.issues) ? raw.issues : [];
  const next_action = typeof raw.next_action === 'string' ? raw.next_action.trim() : '';
  const normIssues = issues
    .filter((x: any) => x && typeof x === 'object')
    .map((x: any) => ({
      severity:
        x.severity === 'blocker' || x.severity === 'major' || x.severity === 'minor'
          ? x.severity
          : 'major',
      description: String(x.description ?? '').trim(),
      fix_suggestion: String(x.fix_suggestion ?? '').trim(),
      acceptance: String(x.acceptance ?? '').trim(),
    }))
    .filter((x: { description: string }) => x.description);
  return {
    passed,
    summary,
    issues: normIssues,
    next_action,
  };
}

export class PlanReviewService {
  constructor(
    private roleRepo: IRoleRepository,
    private llmService: LLMService,
    private logger: ILogger
  ) {}

  async reviewPlan(opts: {
    taskId: string;
    planPath?: string;
    planContent?: string;
    focus?: string;
  }): Promise<PlanReviewVerdict> {
    const { taskId } = opts;
    const wsRoot = path.resolve(process.cwd(), 'data/workspaces', taskId);

    const planContent =
      (opts.planContent || '').trim() ||
      (opts.planPath ? await readClip(wsRoot, opts.planPath, 14000) : '');

    if (!planContent || planContent === '（无法读取）') {
      return {
        passed: false,
        summary: '计划内容不可用或为空，无法评审。',
        issues: [
          {
            severity: 'blocker',
            description: '未提供有效的计划文档内容。',
            fix_suggestion: '请先 write_file 保存完整计划，再调用 review_plan。',
            acceptance: '计划文档可读且包含任务清单、依赖、验收标准。',
          },
        ],
        next_action: '补齐计划文档后重新评审。',
      };
    }

    const requirements = await readClip(wsRoot, 'docs/REQUIREMENTS.md', 12000);
    const taskMd = await readClip(wsRoot, 'TASK.md', 8000);
    const changeLog = await readClip(wsRoot, 'docs/CHANGE_LOG.md', 4000);

    const role = await this.roleRepo.findById('plan-reviewer');
    const systemPrompt = role?.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;

    const focus = opts.focus ? `\n评审关注点: ${opts.focus}\n` : '';

    const user: Message = {
      role: 'user',
      content:
        `请审查以下计划文档，并按系统格式输出 JSON。${focus}\n\n` +
        `- taskId: ${taskId}\n` +
        (opts.planPath ? `- planPath: ${opts.planPath}\n` : '') +
        `\n## 需求文档（截断）\n${requirements}\n\n` +
        `## TASK.md（截断）\n${taskMd}\n\n` +
        `## 变更日志（截断）\n${changeLog}\n\n` +
        `## 计划正文\n${planContent}\n\n` +
        `重要：计划需明确任务范围、依赖、验收。材料不足必须判定不通过。`,
    };

    try {
      const res = await this.llmService.chatWithFallback({
        messages: [
          { role: 'system', content: systemPrompt },
          user,
        ],
        temperature: typeof role?.temperature === 'number' ? role.temperature : 0.2,
        maxTokens: 1800,
      });
      const parsed = safeJsonParse(res.message.content || '');
      const verdict = normalizeVerdict(parsed);
      if (verdict) return verdict;
    } catch (error) {
      await this.logger.log({
        timestamp: new Date(),
        level: 'error',
        taskId,
        type: 'error',
        content: `PlanReview failed: ${error instanceof Error ? error.message : String(error)}`,
        metadata: {},
      });
    }

    return {
      passed: false,
      summary: '计划评审未返回可解析结果。',
      issues: [
        {
          severity: 'major',
          description: '评审输出不可解析或为空。',
          fix_suggestion: '重新调用 review_plan 或改用简化版本评审。',
          acceptance: '评审返回 JSON，包含 passed/summary/issues/next_action。',
        },
      ],
      next_action: '重新评审并补齐计划说明。',
    };
  }
}
