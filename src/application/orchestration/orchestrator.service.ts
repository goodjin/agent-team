import type { ITaskRepository } from '../../domain/task/task.repository.js';
import type { IAgentRepository } from '../../domain/agent/agent.repository.js';
import type { Task } from '../../domain/task/task.entity.js';
import type { IEventBus } from '../../infrastructure/event-bus/index.js';
import { WebSocketManager } from '../../infrastructure/websocket/index.js';
import { parsePlanPayload, topologicalLayers } from '../../domain/orchestration/plan-dag.js';
import { generateId } from '../../infrastructure/utils/id.js';
import { WorkerMailbox, type MailboxEnvelope } from './mailbox.js';
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

/** 系统固定派工说明格式：先整体需求正文，再主控下发的节点/派工说明 */
function formatWorkerAssignBrief(requirementsBody: string, assignmentFromMaster: string): string {
  const r = (requirementsBody || '').trim() || '（暂无需求正文）';
  const a =
    (assignmentFromMaster || '').trim() || '（无单独说明，请结合节点 id 与子任务文档执行）';
  return `整体任务的需求:\n${r}\n\n以下是主控向你派发的任务：\n${a}`;
}

type NodeStatus = 'pending' | 'running' | 'reviewing' | 'completed' | 'failed';

interface TrackedNode {
  id: string;
  workerId: string;
  dependsOn: string[];
  parallelGroup?: string;
  brief?: string;
  status: NodeStatus;
  reviewAttempts: number;
  lastReviewNotes?: string;
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
  private scheduleFn: ((workerId: string) => void) | null = null;

  constructor(
    private taskRepo: ITaskRepository,
    private agentRepo: IAgentRepository,
    private eventBus: IEventBus,
    private wsManager: WebSocketManager,
    private mailbox: WorkerMailbox
  ) {}

  setWorkerScheduler(fn: (workerId: string) => void): void {
    this.scheduleFn = fn;
  }

  private scheduleWorker(workerId: string): void {
    this.scheduleFn?.(workerId);
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

    const agents = await this.agentRepo.findByTaskId(taskId);
    const validWorker = new Set<string>();
    for (const w of agents) {
      if (task.masterAgentId && w.id === task.masterAgentId) continue;
      if (w.kind === 'master') continue;
      validWorker.add(w.id);
    }

    for (const n of parsed.plan.nodes) {
      if (!validWorker.has(n.workerId)) {
        return { ok: false, error: `WORKER_NOT_FOUND: ${n.workerId}` };
      }
    }

    const newPv = currentPv + 1;
    task.planVersion = newPv;
    /** 与「开始编排」API 一致：计划落盘后立刻进入执行阶段并派发可运行节点，避免主控只能让用户手动点按钮 */
    task.orchestrationState = 'executing_workers';
    await this.taskRepo.save(task);

    const nodes = new Map<string, TrackedNode>();
    for (const n of parsed.plan.nodes) {
      nodes.set(n.id, {
        id: n.id,
        workerId: n.workerId,
        dependsOn: n.dependsOn ?? [],
        parallelGroup: n.parallelGroup,
        brief: n.brief,
        status: 'pending',
        reviewAttempts: 0,
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
        await this.sendAssignWork(taskId, ap, n);
      }
    }
    await this.maybeFinalizeOrchestration(taskId, ap);
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
    const brief = formatWorkerAssignBrief(reqText, assignment);

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
        targetWorkerId: node.workerId,
        command: 'ASSIGN_WORK',
        correlationId,
        planVersion: ap.planVersion,
        body,
      },
    });

    this.mailbox.enqueue(node.workerId, {
      correlationId,
      planVersion: ap.planVersion,
      command: 'ASSIGN_WORK',
      body,
    });
    node.status = 'running';
    this.scheduleWorker(node.workerId);

    this.wsManager.broadcast(taskId, {
      type: 'worker.status',
      timestamp: new Date().toISOString(),
      data: {
        taskId,
        workerId: node.workerId,
        displayName: node.workerId,
        status: 'running',
        nodeId: node.id,
      },
    });
  }

  async onWorkerNodeDone(taskId: string, nodeId: string, success: boolean): Promise<void> {
    const ap = this.active.get(taskId);
    if (!ap) return;
    const node = ap.nodes.get(nodeId);
    if (!node) return;
    if (node.status !== 'running') return;

    node.status = success ? 'reviewing' : 'failed';

    await this.eventBus.publish({
      type: 'orch.node.completed',
      timestamp: new Date(),
      payload: {
        taskId,
        planVersion: ap.planVersion,
        nodeId,
        workerId: node.workerId,
        success,
        reviewAttempts: node.reviewAttempts,
      },
    });

    this.wsManager.broadcast(taskId, {
      type: 'worker.status',
      timestamp: new Date().toISOString(),
      data: {
        taskId,
        workerId: node.workerId,
        displayName: node.workerId,
        status: success ? 'reviewing' : 'failed',
        nodeId,
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
          workerId: node.workerId,
          passed: true,
          reviewAttempts: node.reviewAttempts,
        },
      });
      this.wsManager.broadcast(taskId, {
        type: 'worker.status',
        timestamp: new Date().toISOString(),
        data: {
          taskId,
          workerId: node.workerId,
          displayName: node.workerId,
          status: 'completed',
          nodeId,
        },
      });
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
          workerId: node.workerId,
          passed: false,
          reviewAttempts: node.reviewAttempts,
          terminal: true,
        },
      });
      this.wsManager.broadcast(taskId, {
        type: 'worker.status',
        timestamp: new Date().toISOString(),
        data: {
          taskId,
          workerId: node.workerId,
          displayName: node.workerId,
          status: 'failed',
          nodeId,
        },
      });
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
        workerId: node.workerId,
        passed: false,
        reviewAttempts: node.reviewAttempts,
      },
    });
    await this.sendAssignWork(taskId, ap, node);
    await this.tryLaunchPending(taskId, ap);
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
        workerId: string;
        status: NodeStatus;
        brief?: string;
        dependsOn: string[];
        parallelGroup?: string;
      }>;
    };
    /** 各工人信箱待处理指令（工人视角即「收件箱」） */
    inboxByWorker: Record<string, MailboxEnvelope[]>;
    mailboxDepths: Record<string, number>;
  }> {
    const task = await this.taskRepo.findById(taskId);
    const agents = await this.agentRepo.findByTaskId(taskId);
    const workerIds = agents
      .filter((a) => a.kind !== 'master' && a.id !== task?.masterAgentId)
      .map((a) => a.id);

    const ap = this.active.get(taskId);
    const mailboxDepths = this.mailbox.depthsForTask(workerIds);
    const inboxByWorker = this.mailbox.snapshotQueues(workerIds);

    return {
      taskPlanVersion: task?.planVersion ?? 0,
      orchestrationState: task?.orchestrationState,
      activePlan: ap
        ? {
            planVersion: ap.planVersion,
            layers: ap.layers.map((layer) => [...layer]),
            nodes: [...ap.nodes.values()].map((n) => ({
              id: n.id,
              workerId: n.workerId,
              status: n.status,
              brief: n.brief,
              dependsOn: n.dependsOn,
              parallelGroup: n.parallelGroup,
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
      bodyOut = {
        ...bodyOut,
        brief: formatWorkerAssignBrief(reqText, masterAssignment),
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
    this.scheduleWorker(targetWorkerId);
    return { ok: true };
  }
}
