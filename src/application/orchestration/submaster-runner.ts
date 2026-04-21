import type { IAgentRepository } from '../../domain/agent/agent.repository.js';
import type { ITaskRepository } from '../../domain/task/task.repository.js';
import type { IEventBus } from '../../infrastructure/event-bus/index.js';
import { WorkerMailbox, type MailboxEnvelope } from './mailbox.js';
import type { OrchestratorService } from './orchestrator.service.js';
import type { MasterAgentService } from '../master-agent/master-agent.service.js';
import { normalizeProgressReport } from './progress-report.js';

function formatNodeMeta(meta?: Record<string, unknown>): string {
  if (!meta || typeof meta !== 'object') return '';
  const lines: string[] = [];
  const nodeId = typeof meta.nodeId === 'string' ? meta.nodeId : undefined;
  const parentNodeId = typeof meta.parentNodeId === 'string' ? meta.parentNodeId : undefined;
  const parallelGroup = typeof meta.parallelGroup === 'string' ? meta.parallelGroup : undefined;
  const decompositionPolicy =
    typeof meta.decompositionPolicy === 'string' ? meta.decompositionPolicy : undefined;
  const planVersion =
    typeof meta.planVersion === 'number' && Number.isFinite(meta.planVersion)
      ? meta.planVersion
      : undefined;
  const dependsOnRaw = Array.isArray(meta.dependsOn) ? meta.dependsOn : [];
  const dependsOn = dependsOnRaw.filter((x): x is string => typeof x === 'string');
  if (nodeId) lines.push(`- 节点ID: ${nodeId}`);
  if (parentNodeId) lines.push(`- 父节点: ${parentNodeId}`);
  if (dependsOn.length) lines.push(`- 依赖: ${dependsOn.join(', ')}`);
  else if (nodeId) lines.push(`- 依赖: 无`);
  if (parallelGroup) lines.push(`- 并行组: ${parallelGroup}`);
  if (decompositionPolicy) lines.push(`- 拆分策略: ${decompositionPolicy}`);
  if (planVersion !== undefined) lines.push(`- planVersion: ${planVersion}`);
  return lines.length ? `\n节点信息：\n${lines.join('\n')}` : '';
}

function buildSubmasterAssignPrompt(
  nodeId: string,
  brief: string,
  meta?: Record<string, unknown>
): string {
  const detail = brief.trim() || '（未提供模块说明，请结合当前节点与工作区文档补齐）';
  const metaBlock = formatNodeMeta(meta);
  return `[系统·模块派工]
你当前负责模块节点 ${nodeId}。

你的职责：
1. 先理解模块边界、输入输出、依赖与风险。
2. 若该模块仍然复杂，请创建直属 worker / submaster，并调用 submit_plan 为当前模块提交子计划。
3. 若该模块已经足够小、无需继续拆分，也可以直接整理模块结论并收口。
4. 你不直接面向最终用户；reply_user 仅作为给上一级主控的本轮总结。

${metaBlock}

模块说明：
${detail}`;
}

function buildSubmasterFinalizePrompt(
  nodeId: string,
  childSummary: string,
  childrenPassed: boolean,
  reviewNotes?: string,
  meta?: Record<string, unknown>
): string {
  const metaBlock = formatNodeMeta(meta);
  return `[系统·子树收口]
模块节点 ${nodeId} 的直属子节点已全部结束，请你做最后一轮收口与汇报。

要求：
1. 复核模块目标是否达成。
2. 默认不要再次 submit_plan；若审查意见明确要求补充模块说明或重新组织直属子节点结论，请先处理这些问题，再给出最新模块汇报。
3. reply_user 仅作为给上一级主控的简短汇报。

子节点状态：
${childSummary || '（无子节点摘要）'}

当前整体判定：${childrenPassed ? '所有直属子节点已通过' : '存在失败的直属子节点，请如实说明风险与阻塞'}

审查意见：
${reviewNotes?.trim() || '（无）'}
${metaBlock}`;
}

export class SubMasterRunner {
  private tails = new Map<string, Promise<void>>();

  constructor(
    private mailbox: WorkerMailbox,
    private agentRepo: IAgentRepository,
    private taskRepo: ITaskRepository,
    private masterAgentService: MasterAgentService,
    private orchestrator: OrchestratorService,
    private eventBus: IEventBus
  ) {}

  scheduleProcess(submasterId: string): void {
    const prev = this.tails.get(submasterId) ?? Promise.resolve();
    const next = prev
      .then(() => this.drainSubmaster(submasterId))
      .catch((e) => console.error('[SubMasterRunner]', submasterId, e));
    this.tails.set(submasterId, next);
  }

  private async drainSubmaster(submasterId: string): Promise<void> {
    while (true) {
      const item = this.mailbox.dequeue(submasterId);
      if (!item) break;
      await this.dispatchItem(submasterId, item);
    }
  }

  private async dispatchItem(submasterId: string, item: MailboxEnvelope): Promise<void> {
    const agent = await this.agentRepo.findById(submasterId);
    if (!agent || agent.kind !== 'submaster') return;
    const task = await this.taskRepo.findById(agent.taskId);
    if (!task) return;
    if (item.planVersion !== (task.planVersion ?? 0)) return;

    const op = String(item.body.op ?? item.command);
    if (op !== 'ASSIGN_SUBPLAN' && op !== 'FINALIZE_SUBPLAN') return;

    const nodeId = typeof item.body.nodeId === 'string' ? item.body.nodeId : '';
    if (!nodeId) return;

    agent.status = 'running';
    agent.context.variables.currentNodeId = nodeId;
    await this.agentRepo.save(agent);

    const meta =
      item.body && typeof item.body.meta === 'object'
        ? (item.body.meta as Record<string, unknown>)
        : undefined;
    const prompt =
      op === 'ASSIGN_SUBPLAN'
        ? buildSubmasterAssignPrompt(
            nodeId,
            typeof item.body.brief === 'string' ? item.body.brief : '',
            meta
          )
        : buildSubmasterFinalizePrompt(
            nodeId,
            typeof item.body.childSummary === 'string' ? item.body.childSummary : '',
            item.body.childrenPassed === true,
            typeof item.body.reviewNotes === 'string' ? item.body.reviewNotes : '',
            meta
          );

    let ok = true;
    let summary = '';
    try {
      summary = await this.masterAgentService.handleAgentMessage(task.id, submasterId, prompt, {
        broadcastReply: false,
      });
    } catch (error) {
      ok = false;
      summary = error instanceof Error ? error.message : String(error);
    }

    const hasSubplan = this.orchestrator.hasSubmittedSubplan(task.id, nodeId);
    const report = normalizeProgressReport({
      statusHint:
        op === 'FINALIZE_SUBPLAN'
          ? ok && item.body.childrenPassed === true
            ? 'done'
            : 'blocked'
          : ok
            ? hasSubplan
              ? 'in-progress'
              : 'done'
            : 'blocked',
      scopeHint: `模块节点 ${nodeId}`,
      summary,
      nextStepHint:
        op === 'ASSIGN_SUBPLAN'
          ? hasSubplan
            ? '等待直属子节点推进并在全部收口后再次总结。'
            : '等待模块级审查当前结论。'
          : ok && item.body.childrenPassed === true
            ? '等待模块级审查当前模块结果。'
            : '等待上一级决定是否返工、补充或终止。',
    });

    if (op === 'ASSIGN_SUBPLAN' && (!ok || !hasSubplan)) {
      await this.orchestrator.onSubmasterNodeDone(task.id, nodeId, ok, report);
    }
    if (op === 'FINALIZE_SUBPLAN') {
      const childrenPassed = item.body.childrenPassed === true;
      await this.orchestrator.onSubmasterNodeDone(task.id, nodeId, ok && childrenPassed, report);
    }

    agent.status = 'idle';
    agent.startedAt = undefined;
    agent.completedAt = undefined;
    agent.error = ok ? undefined : summary;
    await this.agentRepo.save(agent);

    await this.eventBus.publish({
      type: 'submaster.to.parent.progress',
      timestamp: new Date(),
      payload: {
        taskId: task.id,
        submasterId,
        nodeId,
        kind:
          op === 'FINALIZE_SUBPLAN'
            ? ok && item.body.childrenPassed === true
              ? 'COMPLETED'
              : 'FAILED'
            : ok
              ? hasSubplan
                ? 'PLANNED'
                : 'COMPLETED'
              : 'FAILED',
        summary,
        report,
      },
    });
  }
}
