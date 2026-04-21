import type { ITaskRepository } from '../../domain/task/task.repository.js';
import type { IAgentRepository } from '../../domain/agent/agent.repository.js';
import type { Task } from '../../domain/task/task.entity.js';
import type { IEventBus } from '../../infrastructure/event-bus/index.js';
import { WebSocketManager } from '../../infrastructure/websocket/index.js';
import {
  parsePlanPayload,
  topologicalLayers,
  type DecompositionPolicy,
  type PlanExecutorType,
  type PlanNodeKind,
} from '../../domain/orchestration/plan-dag.js';
import { generateId } from '../../infrastructure/utils/id.js';
import { WorkerMailbox, type MailboxEnvelope } from './mailbox.js';
import {
  summarizeProgressReport,
  type ProgressReport,
} from './progress-report.js';
import path from 'path';
import { readFile } from 'fs/promises';

/** 主控维护的全局需求文档（相对任务工作空间根） */
export const TASK_REQUIREMENTS_DOC_REL = 'docs/REQUIREMENTS.md';

const REQUIREMENTS_INLINE_MAX_CHARS = 14_000;

async function loadOverallRequirementsText(task: Task): Promise<string> {
  const abs = path.resolve(process.cwd(), 'data/workspaces', task.id, TASK_REQUIREMENTS_DOC_REL);
  try {
    const raw = await readFile(abs, 'utf-8');
    const t = raw.trim();
    if (t) {
      if (t.length <= REQUIREMENTS_INLINE_MAX_CHARS) return t;
      return (
        t.slice(0, REQUIREMENTS_INLINE_MAX_CHARS) +
        '\n\n…（需求正文过长已截断；完整内容请 read_file `docs/REQUIREMENTS.md`）'
      );
    }
  } catch {
    // 文件不存在或不可读
  }
  const d = String(task.description ?? '').trim();
  if (d) {
    if (d.length <= REQUIREMENTS_INLINE_MAX_CHARS) return d;
    return (
      d.slice(0, REQUIREMENTS_INLINE_MAX_CHARS) +
      '\n\n…（任务描述过长已截断）'
    );
  }
  return '（尚未写入工作区 docs/REQUIREMENTS.md，且任务描述为空；请 read_file 查看工作区或向主控确认。）';
}

type AssignmentMeta = {
  nodeId?: string;
  parentNodeId?: string;
  dependsOn?: string[];
  parallelGroup?: string;
  decompositionPolicy?: DecompositionPolicy;
  planVersion?: number;
};

/** 系统固定派工说明格式：先整体需求正文，再节点信息与主控派工说明 */
function formatWorkerAssignBrief(
  requirementsBody: string,
  assignmentFromMaster: string,
  meta?: AssignmentMeta
): string {
  const r = (requirementsBody || '').trim() || '（暂无需求正文）';
  const a =
    (assignmentFromMaster || '').trim() || '（无单独说明，请结合节点 id 与子任务文档执行）';
  const metaLines: string[] = [];
  if (meta?.nodeId) metaLines.push(`- 节点ID: ${meta.nodeId}`);
  if (meta?.parentNodeId) metaLines.push(`- 父节点: ${meta.parentNodeId}`);
  if (meta?.dependsOn?.length) metaLines.push(`- 依赖: ${meta.dependsOn.join(', ')}`);
  else if (meta?.nodeId) metaLines.push(`- 依赖: 无`);
  if (meta?.parallelGroup) metaLines.push(`- 并行组: ${meta.parallelGroup}`);
  if (meta?.decompositionPolicy) metaLines.push(`- 拆分策略: ${meta.decompositionPolicy}`);
  if (typeof meta?.planVersion === 'number') metaLines.push(`- planVersion: ${meta.planVersion}`);
  const metaBlock = metaLines.length ? `\n\n节点信息:\n${metaLines.join('\n')}` : '';
  return `整体任务的需求:\n${r}${metaBlock}\n\n以下是主控向你派发的任务：\n${a}`;
}

type NodeStatus = 'pending' | 'running' | 'reviewing' | 'completed' | 'failed';

interface TrackedNode {
  id: string;
  executorType: PlanExecutorType;
  executorId: string;
  nodeKind: PlanNodeKind;
  parentNodeId?: string;
  childNodeIds: string[];
  dependsOn: string[];
  parallelGroup?: string;
  brief?: string;
  decompositionPolicy?: DecompositionPolicy;
  status: NodeStatus;
  reviewAttempts: number;
  finalizeQueued?: boolean;
  lastReviewNotes?: string;
  lastReport?: ProgressReport;
}

interface ActivePlan {
  planVersion: number;
  nodes: Map<string, TrackedNode>;
  /** 预计算层序（调试用）；调度以依赖为准 */
  layers: string[][];
}

/**
 * v10：submit_plan 校验、planVersion、DAG 推进与事件发布
 */
export class OrchestratorService {
  private active = new Map<string, ActivePlan>();
  private workerScheduleFn: ((workerId: string) => void) | null = null;
  private submasterScheduleFn: ((submasterId: string) => void) | null = null;

  constructor(
    private taskRepo: ITaskRepository,
    private agentRepo: IAgentRepository,
    private eventBus: IEventBus,
    private wsManager: WebSocketManager,
    private mailbox: WorkerMailbox
  ) {}

  setWorkerScheduler(fn: (workerId: string) => void): void {
    this.workerScheduleFn = fn;
  }

  setSubmasterScheduler(fn: (submasterId: string) => void): void {
    this.submasterScheduleFn = fn;
  }

  private scheduleExecutor(executorType: PlanExecutorType, executorId: string): void {
    if (executorType === 'submaster') {
      this.submasterScheduleFn?.(executorId);
      return;
    }
    this.workerScheduleFn?.(executorId);
  }

  async submitPlan(
    taskId: string,
    planPayload: unknown,
    opts?: { expectedPlanVersion?: number }
  ): Promise<
    { ok: true; planVersion: number; nodeCount: number } | { ok: false; error: string }
  > {
    const task = await this.taskRepo.findById(taskId);
    if (!task) return { ok: false, error: 'TASK_NOT_FOUND' };
    if (task.orchestrationMode !== 'v10-master') {
      return { ok: false, error: 'not v10-master task' };
    }

    const parsed = parsePlanPayload(planPayload);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const currentPv = task.planVersion ?? 0;
    if (opts?.expectedPlanVersion !== undefined && opts.expectedPlanVersion !== currentPv) {
      return { ok: false, error: 'STALE_PLAN_VERSION' };
    }

    const execValidation = await this.validatePlanExecutors(task, parsed.plan.nodes);
    if (!execValidation.ok) return execValidation;

    const newPv = currentPv + 1;
    task.planVersion = newPv;
    /** 与「开始编排」API 一致：计划落盘后立刻进入执行阶段并派发可运行节点，避免主控只能让用户手动点按钮 */
    task.orchestrationState = 'executing_workers';
    await this.taskRepo.save(task);

    const nodes = new Map<string, TrackedNode>();
    for (const n of parsed.plan.nodes) {
      nodes.set(n.id, {
        id: n.id,
        executorType: n.executorType,
        executorId: n.executorId,
        nodeKind: n.nodeKind,
        parentNodeId: undefined,
        childNodeIds: [],
        dependsOn: n.dependsOn ?? [],
        parallelGroup: n.parallelGroup,
        brief: n.brief,
        decompositionPolicy: n.decompositionPolicy,
        status: 'pending',
        reviewAttempts: 0,
        finalizeQueued: false,
        lastReport: undefined,
      });
    }

    const layers = topologicalLayers(parsed.plan.nodes);
    const ap: ActivePlan = { planVersion: newPv, nodes, layers };
    this.active.set(taskId, ap);

    await this.eventBus.publish({
      type: 'orch.plan.submitted',
      timestamp: new Date(),
      payload: { taskId, planVersion: newPv, nodeCount: parsed.plan.nodes.length },
    });

    this.wsManager.broadcast(taskId, {
      type: 'orchestration.plan_updated',
      timestamp: new Date().toISOString(),
      data: { taskId, planVersion: newPv, summary: `${parsed.plan.nodes.length} nodes` },
    });

    await this.tryLaunchPending(taskId, ap);

    return { ok: true, planVersion: newPv, nodeCount: parsed.plan.nodes.length };
  }

  async submitSubplan(
    taskId: string,
    parentNodeId: string,
    submittedByAgentId: string,
    planPayload: unknown,
    opts?: { expectedPlanVersion?: number }
  ): Promise<
    { ok: true; planVersion: number; nodeCount: number; parentNodeId: string } | { ok: false; error: string }
  > {
    const task = await this.taskRepo.findById(taskId);
    if (!task) return { ok: false, error: 'TASK_NOT_FOUND' };
    const ap = this.active.get(taskId);
    if (!ap) return { ok: false, error: 'PLAN_NOT_ACTIVE' };
    if (opts?.expectedPlanVersion !== undefined && opts.expectedPlanVersion !== (task.planVersion ?? 0)) {
      return { ok: false, error: 'STALE_PLAN_VERSION' };
    }

    const parent = ap.nodes.get(parentNodeId);
    if (!parent) return { ok: false, error: 'PARENT_NODE_NOT_FOUND' };
    if (parent.executorType !== 'submaster') {
      return { ok: false, error: 'PARENT_NODE_NOT_SUBMASTER' };
    }
    if (parent.executorId !== submittedByAgentId) {
      return { ok: false, error: 'PARENT_NODE_NOT_OWNED_BY_AGENT' };
    }
    if (parent.childNodeIds.length > 0) {
      return { ok: false, error: 'SUBPLAN_ALREADY_SUBMITTED' };
    }
    if (parent.status !== 'running') {
      return { ok: false, error: 'PARENT_NODE_NOT_RUNNING' };
    }

    const parsed = parsePlanPayload(planPayload);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const remappedNodes = parsed.plan.nodes.map((node) => ({
      ...node,
      id: `${parentNodeId}/${node.id}`,
      dependsOn: (node.dependsOn ?? []).map((dep) => `${parentNodeId}/${dep}`),
    }));

    const dup = remappedNodes.find((node) => ap.nodes.has(node.id));
    if (dup) {
      return { ok: false, error: `DUPLICATE_NODE_ID: ${dup.id}` };
    }

    const execValidation = await this.validatePlanExecutors(task, remappedNodes);
    if (!execValidation.ok) return execValidation;

    for (const node of remappedNodes) {
      ap.nodes.set(node.id, {
        id: node.id,
        executorType: node.executorType,
        executorId: node.executorId,
        nodeKind: node.nodeKind,
        parentNodeId,
        childNodeIds: [],
        dependsOn: node.dependsOn ?? [],
        parallelGroup: node.parallelGroup,
        brief: node.brief,
        decompositionPolicy: node.decompositionPolicy,
        status: 'pending',
        reviewAttempts: 0,
        finalizeQueued: false,
        lastReport: undefined,
      });
    }
    parent.childNodeIds = remappedNodes.map((node) => node.id);
    ap.layers = topologicalLayers(
      [...ap.nodes.values()].map((node) => ({
        id: node.id,
        executorType: node.executorType,
        executorId: node.executorId,
        nodeKind: node.nodeKind,
        dependsOn: node.dependsOn,
        parallelGroup: node.parallelGroup,
        brief: node.brief,
        decompositionPolicy: node.decompositionPolicy,
      }))
    );

    await this.eventBus.publish({
      type: 'orch.subplan.submitted',
      timestamp: new Date(),
      payload: {
        taskId,
        planVersion: ap.planVersion,
        parentNodeId,
        nodeCount: remappedNodes.length,
        submittedByAgentId,
      },
    });
    this.wsManager.broadcast(taskId, {
      type: 'orchestration.plan_updated',
      timestamp: new Date().toISOString(),
      data: {
        taskId,
        planVersion: ap.planVersion,
        summary: `subplan for ${parentNodeId}: ${remappedNodes.length} nodes`,
      },
    });

    await this.tryLaunchPending(taskId, ap);
    return { ok: true, planVersion: ap.planVersion, nodeCount: remappedNodes.length, parentNodeId };
  }

  hasSubmittedSubplan(taskId: string, nodeId: string): boolean {
    const node = this.active.get(taskId)?.nodes.get(nodeId);
    return !!node?.childNodeIds.length;
  }

  async startOrchestration(
    taskId: string
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const task = await this.taskRepo.findById(taskId);
    if (!task?.planVersion) return { ok: false, error: 'NO_PLAN' };
    const ap = this.active.get(taskId);
    if (!ap || ap.planVersion !== task.planVersion) {
      return { ok: false, error: 'PLAN_NOT_ACTIVE' };
    }

    task.orchestrationState = 'executing_workers';
    await this.taskRepo.save(task);

    await this.tryLaunchPending(taskId, ap);
    return { ok: true };
  }

  private classifyPending(
    n: TrackedNode,
    nodes: Map<string, TrackedNode>
  ): 'wait' | 'runnable' | 'blocked' {
    if (n.parentNodeId) {
      const parent = nodes.get(n.parentNodeId);
      if (!parent) return 'blocked';
      if (parent.status === 'failed') return 'blocked';
      if (parent.status === 'pending') return 'wait';
    }
    for (const d of n.dependsOn) {
      const dn = nodes.get(d);
      if (!dn) return 'blocked';
      if (dn.status === 'pending' || dn.status === 'running' || dn.status === 'reviewing') return 'wait';
      if (dn.status === 'failed') return 'blocked';
    }
    return 'runnable';
  }

  private async tryLaunchPending(taskId: string, ap: ActivePlan): Promise<void> {
    for (const n of ap.nodes.values()) {
      if (n.status !== 'pending') continue;
      const c = this.classifyPending(n, ap.nodes);
      if (c === 'blocked') {
        n.status = 'failed';
      } else if (c === 'runnable') {
        await this.assignRunnableNode(taskId, ap, n);
      }
    }
    await this.maybeScheduleSubmasterFinalization(taskId, ap);
    await this.maybeFinalizeOrchestration(taskId, ap);
  }

  private async assignRunnableNode(taskId: string, ap: ActivePlan, node: TrackedNode): Promise<void> {
    if (node.executorType === 'submaster') {
      await this.sendAssignSubplan(taskId, ap, node);
      return;
    }
    await this.sendAssignWork(taskId, ap, node);
  }

  private async sendAssignWork(taskId: string, ap: ActivePlan, node: TrackedNode): Promise<void> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) return;

    await this.eventBus.publish({
      type: 'orch.node.ready',
      timestamp: new Date(),
      payload: { taskId, planVersion: ap.planVersion, nodeId: node.id },
    });

    const reqText = await loadOverallRequirementsText(task);
    const assignment = (node.brief ?? `执行节点 ${node.id}`).trim();
    const brief = formatWorkerAssignBrief(reqText, assignment, {
      nodeId: node.id,
      parentNodeId: node.parentNodeId,
      dependsOn: node.dependsOn,
      parallelGroup: node.parallelGroup,
      decompositionPolicy: node.decompositionPolicy,
      planVersion: ap.planVersion,
    });

    const correlationId = generateId();
    const body: Record<string, unknown> = {
      op: 'ASSIGN_WORK',
      brief,
      successCriteria: [],
      nodeId: node.id,
    };

    await this.eventBus.publish({
      type: 'master.to.worker.command',
      timestamp: new Date(),
      payload: {
        taskId,
        targetWorkerId: node.executorId,
        command: 'ASSIGN_WORK',
        correlationId,
        planVersion: ap.planVersion,
        body,
      },
    });

    this.mailbox.enqueue(node.executorId, {
      correlationId,
      planVersion: ap.planVersion,
      command: 'ASSIGN_WORK',
      body,
    });
    node.status = 'running';
    this.scheduleExecutor(node.executorType, node.executorId);

    this.wsManager.broadcast(taskId, {
      type: 'worker.status',
      timestamp: new Date().toISOString(),
      data: {
        taskId,
        workerId: node.executorId,
        displayName: node.executorId,
        status: 'running',
        nodeId: node.id,
      },
    });
  }

  private async sendAssignSubplan(taskId: string, ap: ActivePlan, node: TrackedNode): Promise<void> {
    const correlationId = generateId();
    const body: Record<string, unknown> = {
      op: 'ASSIGN_SUBPLAN',
      brief: (node.brief ?? '').trim(),
      nodeId: node.id,
      meta: {
        nodeId: node.id,
        parentNodeId: node.parentNodeId,
        dependsOn: node.dependsOn,
        parallelGroup: node.parallelGroup,
        decompositionPolicy: node.decompositionPolicy,
        planVersion: ap.planVersion,
      },
    };
    this.mailbox.enqueue(node.executorId, {
      correlationId,
      planVersion: ap.planVersion,
      command: 'ASSIGN_SUBPLAN',
      body,
    });
    node.status = 'running';
    this.scheduleExecutor(node.executorType, node.executorId);
  }

  private async sendFinalizeSubplan(taskId: string, ap: ActivePlan, node: TrackedNode): Promise<void> {
    const correlationId = generateId();
    const childrenPassed = node.childNodeIds.every((id) => ap.nodes.get(id)?.status === 'completed');
    const body: Record<string, unknown> = {
      op: 'FINALIZE_SUBPLAN',
      nodeId: node.id,
      childSummary: this.buildChildSummary(ap, node),
      childrenPassed,
      reviewNotes: node.lastReviewNotes ?? '',
      meta: {
        nodeId: node.id,
        parentNodeId: node.parentNodeId,
        dependsOn: node.dependsOn,
        parallelGroup: node.parallelGroup,
        decompositionPolicy: node.decompositionPolicy,
        planVersion: ap.planVersion,
      },
    };
    this.mailbox.enqueue(node.executorId, {
      correlationId,
      planVersion: ap.planVersion,
      command: 'FINALIZE_SUBPLAN',
      body,
      priority: -10,
    });
    node.status = 'reviewing';
    node.finalizeQueued = true;
    this.scheduleExecutor(node.executorType, node.executorId);
  }

  async onWorkerNodeDone(
    taskId: string,
    nodeId: string,
    success: boolean,
    report?: ProgressReport
  ): Promise<void> {
    const ap = this.active.get(taskId);
    if (!ap) return;
    const node = ap.nodes.get(nodeId);
    if (!node) return;
    if (node.status !== 'running') return;

    node.lastReport = report;
    node.status = success ? 'reviewing' : 'failed';

    await this.eventBus.publish({
      type: 'orch.node.completed',
      timestamp: new Date(),
      payload: {
        taskId,
        planVersion: ap.planVersion,
        nodeId,
        workerId: node.executorId,
        executorType: node.executorType,
        executorId: node.executorId,
        nodeKind: node.nodeKind,
        success,
        reviewAttempts: node.reviewAttempts,
        report,
      },
    });

    this.wsManager.broadcast(taskId, {
      type: 'worker.status',
      timestamp: new Date().toISOString(),
      data: {
        taskId,
        workerId: node.executorId,
        displayName: node.executorId,
        status: success ? 'reviewing' : 'failed',
        nodeId,
      },
    });

    await this.tryLaunchPending(taskId, ap);
  }

  async onSubmasterNodeDone(
    taskId: string,
    nodeId: string,
    success: boolean,
    report?: ProgressReport
  ): Promise<void> {
    const ap = this.active.get(taskId);
    if (!ap) return;
    const node = ap.nodes.get(nodeId);
    if (!node) return;
    if (node.status !== 'running' && node.status !== 'reviewing') return;

    node.lastReport = report;
    node.status = success ? 'reviewing' : 'failed';
    if (success) {
      await this.eventBus.publish({
        type: 'orch.node.completed',
        timestamp: new Date(),
        payload: {
          taskId,
          planVersion: ap.planVersion,
          nodeId,
          submasterId: node.executorId,
          executorType: node.executorType,
          executorId: node.executorId,
          nodeKind: node.nodeKind,
          success: true,
          reviewAttempts: node.reviewAttempts,
          report,
        },
      });
      await this.tryLaunchPending(taskId, ap);
      return;
    }
    await this.eventBus.publish({
      type: 'orch.node.finalized',
      timestamp: new Date(),
      payload: {
        taskId,
        planVersion: ap.planVersion,
        nodeId,
        submasterId: node.executorId,
        success,
        report,
      },
    });

    await this.tryLaunchPending(taskId, ap);
  }

  async onNodeReviewDone(
    taskId: string,
    nodeId: string,
    verdict: { passed: boolean; notes: string; reworkBrief?: string },
    opts?: { maxAttempts?: number }
  ): Promise<void> {
    const ap = this.active.get(taskId);
    if (!ap) return;
    const node = ap.nodes.get(nodeId);
    if (!node) return;
    if (node.status !== 'reviewing') return;

    const maxAttempts = typeof opts?.maxAttempts === 'number' ? opts.maxAttempts : 2;
    node.lastReviewNotes = verdict.notes;

    if (verdict.passed) {
      node.status = 'completed';
      await this.eventBus.publish({
        type: 'orch.node.reviewed',
        timestamp: new Date(),
        payload: {
          taskId,
          planVersion: ap.planVersion,
          nodeId,
          workerId: node.executorId,
          executorType: node.executorType,
          executorId: node.executorId,
          nodeKind: node.nodeKind,
          passed: true,
          reviewAttempts: node.reviewAttempts,
        },
      });
      if (node.executorType === 'worker') {
        this.wsManager.broadcast(taskId, {
          type: 'worker.status',
          timestamp: new Date().toISOString(),
          data: {
            taskId,
            workerId: node.executorId,
            displayName: node.executorId,
            status: 'completed',
            nodeId,
          },
        });
      }
      await this.tryLaunchPending(taskId, ap);
      return;
    }

    node.reviewAttempts = (node.reviewAttempts ?? 0) + 1;

    if (node.reviewAttempts > maxAttempts) {
      node.status = 'failed';
      await this.eventBus.publish({
        type: 'orch.node.reviewed',
        timestamp: new Date(),
        payload: {
          taskId,
          planVersion: ap.planVersion,
          nodeId,
          workerId: node.executorId,
          executorType: node.executorType,
          executorId: node.executorId,
          nodeKind: node.nodeKind,
          passed: false,
          reviewAttempts: node.reviewAttempts,
          terminal: true,
        },
      });
      if (node.executorType === 'worker') {
        this.wsManager.broadcast(taskId, {
          type: 'worker.status',
          timestamp: new Date().toISOString(),
          data: {
            taskId,
            workerId: node.executorId,
            displayName: node.executorId,
            status: 'failed',
            nodeId,
          },
        });
      }
      await this.tryLaunchPending(taskId, ap);
      return;
    }

    if (node.executorType === 'submaster') {
      node.lastReviewNotes = (verdict.reworkBrief || verdict.notes || '').trim();
      node.status = 'running';
      node.finalizeQueued = false;
      await this.eventBus.publish({
        type: 'orch.node.reviewed',
        timestamp: new Date(),
        payload: {
          taskId,
          planVersion: ap.planVersion,
          nodeId,
          submasterId: node.executorId,
          executorType: node.executorType,
          executorId: node.executorId,
          nodeKind: node.nodeKind,
          passed: false,
          reviewAttempts: node.reviewAttempts,
        },
      });
      await this.sendFinalizeSubplan(taskId, ap, node);
      await this.tryLaunchPending(taskId, ap);
      return;
    }

    // 返工：把节点重新置为 pending 并立刻重派（brief 追加审查意见）
    const rework = (verdict.reworkBrief || verdict.notes || '').trim();
    if (rework) {
      const prefix = node.brief ? `${node.brief}\n\n` : '';
      node.brief =
        prefix +
        `【质量门禁未通过·第 ${node.reviewAttempts} 轮返工】\n` +
        `${rework}\n`;
    }
    node.status = 'pending';
    await this.eventBus.publish({
      type: 'orch.node.reviewed',
      timestamp: new Date(),
      payload: {
        taskId,
        planVersion: ap.planVersion,
        nodeId,
        workerId: node.executorId,
        executorType: node.executorType,
        executorId: node.executorId,
        nodeKind: node.nodeKind,
        passed: false,
        reviewAttempts: node.reviewAttempts,
      },
    });
    await this.assignRunnableNode(taskId, ap, node);
    await this.tryLaunchPending(taskId, ap);
  }

  private async maybeScheduleSubmasterFinalization(taskId: string, ap: ActivePlan): Promise<void> {
    for (const node of ap.nodes.values()) {
      if (node.executorType !== 'submaster') continue;
      if (!node.childNodeIds.length) continue;
      if (node.finalizeQueued) continue;
      if (node.status !== 'running') continue;
      const children = node.childNodeIds.map((id) => ap.nodes.get(id)).filter(Boolean) as TrackedNode[];
      if (!children.length) continue;
      const allSettled = children.every((child) => child.status === 'completed' || child.status === 'failed');
      if (!allSettled) continue;
      await this.sendFinalizeSubplan(taskId, ap, node);
    }
  }

  private async maybeFinalizeOrchestration(taskId: string, ap: ActivePlan): Promise<void> {
    const vals = [...ap.nodes.values()];
    if (!vals.length) return;
    const done = vals.every((x) => x.status === 'completed' || x.status === 'failed');
    if (!done) return;

    const task = await this.taskRepo.findById(taskId);
    if (task) {
      task.orchestrationState = 'awaiting_user';
      await this.taskRepo.save(task);
    }
  }

  async getSnapshot(taskId: string): Promise<{
    taskPlanVersion: number;
    orchestrationState?: string;
      activePlan?: {
        planVersion: number;
        /** 拓扑分层：每层为一批可并行节点 id（与 submit_plan 解析顺序一致） */
        layers: string[][];
        nodes: Array<{
          id: string;
          executorType: PlanExecutorType;
          executorId: string;
          nodeKind: PlanNodeKind;
          parentNodeId?: string;
          childNodeIds: string[];
          status: NodeStatus;
          brief?: string;
          dependsOn: string[];
          parallelGroup?: string;
          decompositionPolicy?: DecompositionPolicy;
          lastReport?: ProgressReport;
          workerId?: string;
        }>;
      };
    /** 各工人信箱待处理指令（工人视角即「收件箱」） */
    inboxByWorker: Record<string, MailboxEnvelope[]>;
    mailboxDepths: Record<string, number>;
  }> {
    const task = await this.taskRepo.findById(taskId);
    const agents = await this.agentRepo.findByTaskId(taskId);
    const executorIds = agents
      .filter((a) => a.kind !== 'master' && a.id !== task?.masterAgentId)
      .map((a) => a.id);

    const ap = this.active.get(taskId);
    const mailboxDepths = this.mailbox.depthsForTask(executorIds);
    const inboxByWorker = this.mailbox.snapshotQueues(executorIds);

    return {
      taskPlanVersion: task?.planVersion ?? 0,
      orchestrationState: task?.orchestrationState,
      activePlan: ap
        ? {
            planVersion: ap.planVersion,
            layers: ap.layers.map((layer) => [...layer]),
            nodes: [...ap.nodes.values()].map((n) => ({
              id: n.id,
              executorType: n.executorType,
              executorId: n.executorId,
              nodeKind: n.nodeKind,
              parentNodeId: n.parentNodeId,
              childNodeIds: [...n.childNodeIds],
              status: n.status,
              brief: n.brief,
              dependsOn: n.dependsOn,
              parallelGroup: n.parallelGroup,
              decompositionPolicy: n.decompositionPolicy,
              lastReport: n.lastReport,
              workerId: n.executorType === 'worker' ? n.executorId : undefined,
            })),
          }
        : undefined,
      inboxByWorker,
      mailboxDepths,
    };
  }

  getActivePlanVersion(taskId: string): number | undefined {
    return this.active.get(taskId)?.planVersion;
  }

  /** 主控工具 send_worker_command：校验 planVersion 后入队并唤醒 WorkerRunner */
  async enqueueAdHocCommand(
    taskId: string,
    targetWorkerId: string,
    command: string,
    body: Record<string, unknown>,
    correlationId: string,
    planVersion: number
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) return { ok: false, error: 'TASK_NOT_FOUND' };
    if ((task.planVersion ?? 0) !== planVersion) {
      return { ok: false, error: 'STALE_PLAN_VERSION' };
    }
    const agent = await this.agentRepo.findById(targetWorkerId);
    if (!agent || agent.taskId !== taskId) {
      return { ok: false, error: 'WORKER_NOT_FOUND' };
    }
    if (agent.kind === 'master' || agent.id === task.masterAgentId) {
      return { ok: false, error: 'WORKER_NOT_FOUND' };
    }

    const op = String(body.op ?? command);
    let bodyOut: Record<string, unknown> = { ...body, op };
    if (op === 'ASSIGN_WORK') {
      const masterAssignment =
        typeof bodyOut.brief === 'string' ? bodyOut.brief : '（主控未提供 brief）';
      const reqText = await loadOverallRequirementsText(task);
      const nodeId =
        typeof bodyOut.nodeId === 'string' && bodyOut.nodeId.trim()
          ? bodyOut.nodeId.trim()
          : undefined;
      const node = nodeId ? this.active.get(taskId)?.nodes.get(nodeId) : undefined;
      const meta = node
        ? {
            nodeId: node.id,
            parentNodeId: node.parentNodeId,
            dependsOn: node.dependsOn,
            parallelGroup: node.parallelGroup,
            decompositionPolicy: node.decompositionPolicy,
            planVersion,
          }
        : nodeId
          ? { nodeId, planVersion }
          : undefined;
      bodyOut = {
        ...bodyOut,
        brief: formatWorkerAssignBrief(reqText, masterAssignment, meta),
      };
    }

    await this.eventBus.publish({
      type: 'master.to.worker.command',
      timestamp: new Date(),
      payload: {
        taskId,
        targetWorkerId,
        command,
        correlationId,
        planVersion,
        body: bodyOut,
      },
    });

    this.mailbox.enqueue(targetWorkerId, {
      correlationId,
      planVersion,
      command,
      body: bodyOut,
    });
    this.scheduleExecutor('worker', targetWorkerId);
    return { ok: true };
  }

  private async validatePlanExecutors(
    task: Task,
    nodes: Array<{ executorType: PlanExecutorType; executorId: string }>
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const agents = await this.agentRepo.findByTaskId(task.id);
    const validWorkers = new Set<string>();
    const validSubmasters = new Set<string>();
    for (const agent of agents) {
      if (task.masterAgentId && agent.id === task.masterAgentId) continue;
      if (agent.kind === 'master') continue;
      if (agent.kind === 'submaster') {
        validSubmasters.add(agent.id);
        continue;
      }
      validWorkers.add(agent.id);
    }

    for (const node of nodes) {
      if (node.executorType === 'worker' && !validWorkers.has(node.executorId)) {
        return { ok: false, error: `WORKER_NOT_FOUND: ${node.executorId}` };
      }
      if (node.executorType === 'submaster' && !validSubmasters.has(node.executorId)) {
        return { ok: false, error: `SUBMASTER_NOT_FOUND: ${node.executorId}` };
      }
    }
    return { ok: true };
  }

  private buildChildSummary(ap: ActivePlan, node: TrackedNode): string {
    return node.childNodeIds
      .map((id) => {
        const child = ap.nodes.get(id);
        if (!child) return `- ${id}: missing`;
        const reportSummary = child.lastReport ? summarizeProgressReport(child.lastReport) : '';
        return `- ${child.id}: ${child.status}${reportSummary ? ` | ${reportSummary}` : ''}`;
      })
      .join('\n');
  }
}
