import * as fs from 'fs/promises';
import * as path from 'path';
import type { IEventBus } from '../../infrastructure/event-bus/index.js';
import type { ILogger } from '../../infrastructure/logger/index.js';
import { LLMService, type Message } from '../../infrastructure/llm/index.js';
import type { IRoleRepository } from '../../domain/role/role.repository.js';
import type { ITaskRepository } from '../../domain/task/task.repository.js';
import type { IAgentRepository } from '../../domain/agent/agent.repository.js';
import type { OrchestratorService } from '../orchestration/orchestrator.service.js';
import type { ReviewRoleMappingStore } from './review-role-mapping.store.js';
import type { PlanExecutorType, PlanNodeKind } from '../../domain/orchestration/plan-dag.js';
import type { ProgressReport } from '../orchestration/progress-report.js';

type ReviewVerdict = {
  passed: boolean;
  summary: string;
  issues: Array<{
    severity: 'blocker' | 'major' | 'minor';
    description: string;
    fix_suggestion: string;
    acceptance: string;
  }>;
  rework_brief: string;
};

function resolveInWorkspace(wsRoot: string, userPath: string): string | null {
  const raw = String(userPath || '').trim().replace(/\\/g, '/');
  if (!raw) return null;
  const root = path.resolve(wsRoot);
  const candidate = path.isAbsolute(raw) || /^[a-zA-Z]:\//.test(raw) || raw.startsWith('//')
    ? path.resolve(raw)
    : path.resolve(root, raw);
  const rel = path.relative(root, candidate);
  if (!rel || rel === '.') return candidate;
  if (rel.startsWith('..') || rel.includes(`..${path.sep}`)) return null;
  return candidate;
}

function safeJsonParse(text: string): any | null {
  const t = String(text || '').trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    // try extract first {...}
    const i = t.indexOf('{');
    const j = t.lastIndexOf('}');
    if (i !== -1 && j !== -1 && j > i) {
      try {
        return JSON.parse(t.slice(i, j + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeVerdict(raw: any): ReviewVerdict | null {
  if (!raw || typeof raw !== 'object') return null;
  const passed = !!raw.passed;
  const summary = typeof raw.summary === 'string' ? raw.summary : '';
  const issues = Array.isArray(raw.issues) ? raw.issues : [];
  const rework_brief = typeof raw.rework_brief === 'string' ? raw.rework_brief : '';
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
    summary: summary.trim(),
    issues: normIssues,
    rework_brief: rework_brief.trim(),
  };
}

async function readClip(wsRoot: string, rel: string, maxChars: number): Promise<string> {
  const abs = resolveInWorkspace(wsRoot, rel);
  if (!abs) return '（路径非法/越界）';
  try {
    const txt = await fs.readFile(abs, 'utf-8');
    const t = txt.trim();
    if (t.length <= maxChars) return t;
    return t.slice(0, maxChars) + '\n\n…（截断）';
  } catch {
    return '（无法读取）';
  }
}

export class ReviewGateService {
  private filesByNode = new Map<string, Set<string>>();

  constructor(
    private taskRepo: ITaskRepository,
    private roleRepo: IRoleRepository,
    private agentRepo: IAgentRepository,
    private mappingStore: ReviewRoleMappingStore,
    private orchestrator: OrchestratorService,
    private llmService: LLMService,
    private logger: ILogger
  ) {}

  start(bus: IEventBus): void {
    bus.subscribe('file.created', (ev) => {
      const p = ev.payload as { taskId?: string; nodeId?: string; filePath?: string };
      if (!p?.taskId || !p.nodeId || !p.filePath) return;
      const key = `${p.taskId}:${p.nodeId}`;
      const set = this.filesByNode.get(key) ?? new Set<string>();
      set.add(String(p.filePath));
      this.filesByNode.set(key, set);
    });

    bus.subscribe('orch.node.completed', (ev) => {
      const p = ev.payload as {
        taskId?: string;
        nodeId?: string;
        success?: boolean;
        reviewAttempts?: number;
        workerId?: string;
        submasterId?: string;
        executorType?: PlanExecutorType;
        executorId?: string;
        nodeKind?: PlanNodeKind;
        report?: ProgressReport;
      };
      if (!p?.taskId || !p.nodeId) return;
      if (!p.success) return; // 失败仍按原逻辑结束
      void this.reviewNode(
        p.taskId,
        p.nodeId,
        typeof p.reviewAttempts === 'number' ? p.reviewAttempts : 0,
        typeof p.executorType === 'string'
          ? p.executorType
          : typeof p.submasterId === 'string'
            ? 'submaster'
            : 'worker',
        typeof p.executorId === 'string'
          ? p.executorId
          : typeof p.submasterId === 'string'
            ? p.submasterId
            : typeof p.workerId === 'string'
              ? p.workerId
              : '',
        p.nodeKind === 'module' ? 'module' : 'atomic',
        p.report
      );
    });
  }

  private async reviewNode(
    taskId: string,
    nodeId: string,
    reviewAttempts: number,
    executorType: PlanExecutorType,
    executorId: string,
    nodeKind: PlanNodeKind,
    report?: ProgressReport
  ): Promise<void> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) return;
    const wsRoot = path.resolve(process.cwd(), 'data/workspaces', taskId);

    const executor = executorId ? await this.agentRepo.findById(executorId) : null;
    const executorRoleId = executor?.roleId ? String(executor.roleId) : '';
    const mapping = await this.mappingStore.get();
    const reviewerRoleId =
      executorType === 'worker' && executorRoleId
        ? mapping.roleToReviewer[executorRoleId] || mapping.defaultReviewerRoleId
        : mapping.defaultReviewerRoleId;

    const role = await this.roleRepo.findById(reviewerRoleId);
    const systemPrompt =
      role?.systemPrompt?.trim() ||
      `你是产出审查员。请严格输出 JSON：{passed, summary, issues, rework_brief}。材料不足则不通过。`;

    const req = await readClip(wsRoot, 'docs/REQUIREMENTS.md', 12000);
    const exp = await readClip(wsRoot, 'docs/EXPERIENCE.md', 8000);
    const taskMd = await readClip(wsRoot, 'TASK.md', 8000);
    const moduleDoc =
      nodeKind === 'module' ? await readClip(wsRoot, `docs/modules/${nodeId}.md`, 8000) : '';
    const snapshot = await this.orchestrator.getSnapshot(taskId);
    const nodeSnapshot = snapshot.activePlan?.nodes.find((node) => node.id === nodeId);
    const childSummaries =
      nodeKind === 'module'
        ? (snapshot.activePlan?.nodes ?? [])
            .filter((node) => node.parentNodeId === nodeId)
            .map((node) => {
              const raw = node.lastReport
                ? `${node.lastReport.status} / ${node.lastReport.outputs[0] ?? '详见工作区产物'}`
                : node.status;
              return `- ${node.id}: ${raw}`;
            })
            .join('\n')
        : '';

    const changed = this.collectChangedFiles(taskId, nodeId, nodeKind);
    const changedBlocks: string[] = [];
    for (const fp of changed.slice(0, 24)) {
      const clip = await readClip(wsRoot, fp, 4000);
      changedBlocks.push(`\n## 修改文件: ${fp}\n${clip}`);
    }

    const user: Message = {
      role: 'user',
      content:
        `请对节点产出做质量门禁审查，并按你的规范输出 JSON。\n\n` +
        `- taskId: ${taskId}\n` +
        `- nodeId: ${nodeId}\n` +
        `- executorType: ${executorType}\n` +
        (executorId ? `- executorId: ${executorId}\n` : '') +
        (executorRoleId ? `- executorRoleId: ${executorRoleId}\n` : '') +
        `- nodeKind: ${nodeKind}\n` +
        `- reviewerRoleId: ${reviewerRoleId}\n` +
        `- 返工轮次(已发生): ${reviewAttempts}\n\n` +
        `## 全局需求（截断）\n${req}\n\n` +
        `## 经验文件（截断，可选）\n${exp}\n\n` +
        `## TASK.md（截断，可选）\n${taskMd}\n\n` +
        (nodeKind === 'module' ? `## 模块文档（截断，可选）\n${moduleDoc || '（无法读取）'}\n\n` : '') +
        `## 当前节点上行汇报（截断，可选）\n${
          report
            ? JSON.stringify(report, null, 2)
            : nodeSnapshot?.lastReport
              ? JSON.stringify(nodeSnapshot.lastReport, null, 2)
              : '（无）'
        }\n\n` +
        (nodeKind === 'module'
          ? `## 直属子节点摘要\n${childSummaries || '（无直属子节点摘要）'}\n\n`
          : '') +
        `## 本节点修改的文件片段（仅来自该节点 write_file 记录；可能不含 execute_command 产生的改动）\n` +
        (changedBlocks.length ? changedBlocks.join('\n\n') : '（未捕获到该节点写入的文件；请要求实现者补充关键文件路径与验收方式）') +
        `\n\n重要：若材料不足以确认通过，请不通过，并给出需要补齐的产出与验收口径。模块节点除检查文件外，还要检查模块汇总是否准确覆盖直属子节点结果、风险和遗留项。`,
    };

    let verdict: ReviewVerdict | null = null;
    try {
      const res = await this.llmService.chatWithFallback({
        messages: [
          { role: 'system', content: systemPrompt },
          user,
        ],
        temperature: typeof role?.temperature === 'number' ? role.temperature : 0.2,
        maxTokens: 2048,
      });
      const parsed = safeJsonParse(res.message.content || '');
      verdict = normalizeVerdict(parsed);
    } catch (e) {
      await this.logger.log({
        timestamp: new Date(),
        level: 'error',
        taskId,
        type: 'error',
        content: `[ReviewGate] LLM 调用失败: ${e instanceof Error ? e.message : String(e)}`,
        metadata: { nodeId },
      });
      verdict = null;
    }

    if (!verdict) {
      await this.orchestrator.onNodeReviewDone(
        taskId,
        nodeId,
        {
          passed: false,
          notes: '审查器未能生成有效 JSON 结果（可能是模型输出异常或解析失败）。请补充关键文件/说明后重试。',
          reworkBrief:
            '请补充：本节点修改/新增的关键文件路径与验收方式（如何验证）。必要时提供最小复现/运行命令，并确保文档与代码落盘到工作区。',
        },
        { maxAttempts: 2 }
      );
      return;
    }

    const notes =
      verdict.passed
        ? `通过。${verdict.summary || ''}`.trim()
        : `不通过。${verdict.summary || ''}\n\n问题清单：\n` +
          verdict.issues
            .map((it, i) => `${i + 1}. [${it.severity}] ${it.description}`)
            .join('\n');

    await this.logger.log({
      timestamp: new Date(),
      level: verdict.passed ? 'info' : 'warn',
      taskId,
      type: 'milestone',
      content: `[ReviewGate] 节点 ${nodeId} 审查${verdict.passed ? '通过' : '不通过'}`,
      metadata: { nodeId, passed: verdict.passed },
    });

    await this.orchestrator.onNodeReviewDone(
      taskId,
      nodeId,
      {
        passed: verdict.passed,
        notes,
        reworkBrief: verdict.rework_brief || '',
      },
      { maxAttempts: 2 }
    );
  }

  private collectChangedFiles(taskId: string, nodeId: string, nodeKind: PlanNodeKind): string[] {
    const files = new Set<string>();
    const prefix = `${taskId}:`;
    for (const [key, set] of this.filesByNode.entries()) {
      if (!key.startsWith(prefix)) continue;
      const trackedNodeId = key.slice(prefix.length);
      const include =
        trackedNodeId === nodeId || (nodeKind === 'module' && trackedNodeId.startsWith(`${nodeId}/`));
      if (!include) continue;
      for (const file of set) files.add(file);
    }
    return [...files];
  }
}
