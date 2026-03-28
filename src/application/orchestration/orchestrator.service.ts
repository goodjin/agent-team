import type { ITaskRepository } from '../../domain/task/task.repository.js';
import type { IAgentRepository } from '../../domain/agent/agent.repository.js';
import type { IEventBus } from '../../infrastructure/event-bus/index.js';
import { WebSocketManager } from '../../infrastructure/websocket/index.js';
import { parsePlanPayload, topologicalLayers } from '../../domain/orchestration/plan-dag.js';
import { generateId } from '../../infrastructure/utils/id.js';
import { WorkerMailbox } from './mailbox.js';

type NodeStatus = 'pending' | 'running' | 'completed' | 'failed';

interface TrackedNode {
  id: string;
  workerId: string;
  dependsOn: string[];
  parallelGroup?: string;
  brief?: string;
  status: NodeStatus;
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
    task.orchestrationState = 'planning';
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
      });
    }

    const layers = topologicalLayers(parsed.plan.nodes);
    this.active.set(taskId, { planVersion: newPv, nodes, layers });

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

  private classifyPending(n: TrackedNode, nodes: Map<string, TrackedNode>): 'wait' | 'runnable' | 'blocked' {
    for (const d of n.dependsOn) {
      const dn = nodes.get(d);
      if (!dn) return 'blocked';
      if (dn.status === 'pending' || dn.status === 'running') return 'wait';
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
    await this.eventBus.publish({
      type: 'orch.node.ready',
      timestamp: new Date(),
      payload: { taskId, planVersion: ap.planVersion, nodeId: node.id },
    });

    const correlationId = generateId();
    const body: Record<string, unknown> = {
      op: 'ASSIGN_WORK',
      brief: node.brief ?? `执行节点 ${node.id}`,
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

    node.status = success ? 'completed' : 'failed';

    await this.eventBus.publish({
      type: 'orch.node.completed',
      timestamp: new Date(),
      payload: {
        taskId,
        planVersion: ap.planVersion,
        nodeId,
        workerId: node.workerId,
      },
    });

    this.wsManager.broadcast(taskId, {
      type: 'worker.status',
      timestamp: new Date().toISOString(),
      data: {
        taskId,
        workerId: node.workerId,
        displayName: node.workerId,
        status: success ? 'completed' : 'failed',
        nodeId,
      },
    });

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
      nodes: Array<{
        id: string;
        workerId: string;
        status: NodeStatus;
        brief?: string;
        dependsOn: string[];
      }>;
    };
    mailboxDepths: Record<string, number>;
  }> {
    const task = await this.taskRepo.findById(taskId);
    const agents = await this.agentRepo.findByTaskId(taskId);
    const workerIds = agents
      .filter((a) => a.kind !== 'master' && a.id !== task?.masterAgentId)
      .map((a) => a.id);

    const ap = this.active.get(taskId);
    const mailboxDepths = this.mailbox.depthsForTask(workerIds);

    return {
      taskPlanVersion: task?.planVersion ?? 0,
      orchestrationState: task?.orchestrationState,
      activePlan: ap
        ? {
            planVersion: ap.planVersion,
            nodes: [...ap.nodes.values()].map((n) => ({
              id: n.id,
              workerId: n.workerId,
              status: n.status,
              brief: n.brief,
              dependsOn: n.dependsOn,
            })),
          }
        : undefined,
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

    await this.eventBus.publish({
      type: 'master.to.worker.command',
      timestamp: new Date(),
      payload: {
        taskId,
        targetWorkerId,
        command,
        correlationId,
        planVersion,
        body,
      },
    });

    this.mailbox.enqueue(targetWorkerId, {
      correlationId,
      planVersion,
      command,
      body: { ...body, op: body.op ?? command },
    });
    this.scheduleWorker(targetWorkerId);
    return { ok: true };
  }
}
