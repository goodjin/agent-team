import type { TaskService } from '../task/task.service.js';
import type { OrchestratorService } from '../orchestration/orchestrator.service.js';
import type { LogService } from '../log/log.service.js';
import type { ArtifactService } from '../artifact/artifact.service.js';
import type { AgentService } from '../agent/agent.service.js';

export interface TaskPostmortemDto {
  generatedAt: string;
  task: {
    id: string;
    title: string;
    status: string;
    orchestrationMode?: string;
    orchestrationState?: string;
    planVersion?: number;
    masterAgentId?: string;
  };
  workers: Array<{ id: string; displayName: string; roleId: string; status: string }>;
  artifactCount: number;
  plan?: {
    planVersion: number;
    totalNodes: number;
    byStatus: Record<string, number>;
    failedNodes: Array<{
      id: string;
      executorType: string;
      executorId: string;
      nodeKind: string;
      brief?: string;
      workerId?: string;
    }>;
  };
  /** 供操作台快速阅读的中文要点 */
  bullets: string[];
  recentErrors: Array<{
    timestamp: Date;
    agentId?: string;
    content: string;
  }>;
}

/**
 * 任务级「复盘摘要」：聚合编排快照、成员、成品与近期错误日志（非持久化报告，每次现算）
 */
export class PostmortemService {
  constructor(
    private taskService: TaskService,
    private orchestratorService: OrchestratorService,
    private logService: LogService,
    private artifactService: ArtifactService,
    private agentService: AgentService
  ) {}

  async build(taskId: string): Promise<TaskPostmortemDto> {
    const task = await this.taskService.get(taskId);
    const [snapshot, artifacts, agents, logs] = await Promise.all([
      this.orchestratorService.getSnapshot(taskId),
      this.artifactService.getByTaskId(taskId),
      this.agentService.getAgentsByTask(taskId),
      this.logService.query(taskId, { order: 'desc', limit: 120 }),
    ]);

    const workers = agents
      .filter((a) => a.kind !== 'master' && a.id !== task.masterAgentId)
      .map((a) => ({
        id: a.id,
        displayName: a.displayName ?? a.roleId ?? a.id,
        roleId: a.roleId,
        status: a.status,
      }));

    const recentErrors = logs
      .filter((l) => l.type === 'error' || l.level === 'error')
      .slice(0, 10)
      .map((l) => ({
        timestamp: l.timestamp,
        agentId: l.agentId,
        content: l.content.slice(0, 500),
      }));

    const bullets: string[] = [];
    bullets.push(`任务「${task.title}」当前执行状态为 ${task.status}。`);

    bullets.push(
      `编排模式为主控；任务 planVersion=${task.planVersion ?? 0}，编排阶段：${task.orchestrationState ?? '（未设置）'}。`
    );

    let plan: TaskPostmortemDto['plan'];
    if (snapshot.activePlan) {
      const nodes = snapshot.activePlan.nodes;
      const byStatus: Record<string, number> = {};
      for (const n of nodes) {
        byStatus[n.status] = (byStatus[n.status] ?? 0) + 1;
      }
      const failedNodes = nodes
        .filter((n) => n.status === 'failed')
        .map((n) => ({
          id: n.id,
          executorType: n.executorType,
          executorId: n.executorId,
          nodeKind: n.nodeKind,
          brief: n.brief,
          workerId: n.workerId,
        }));
      plan = {
        planVersion: snapshot.activePlan.planVersion,
        totalNodes: nodes.length,
        byStatus,
        failedNodes,
      };
      bullets.push(
        `内存中激活计划 v${snapshot.activePlan.planVersion}：共 ${nodes.length} 个节点；` +
          `完成 ${byStatus.completed ?? 0}，失败 ${byStatus.failed ?? 0}，运行中 ${byStatus.running ?? 0}，待处理 ${byStatus.pending ?? 0}。`
      );
      if (failedNodes.length) {
        bullets.push(`失败节点：${failedNodes.map((f) => f.id).join('、')}（请结合日志排查）。`);
      }
    } else {
      bullets.push('当前无内存激活计划（尚未 submit_plan、计划已结束或服务重启后未恢复）。');
    }

    const pendingMail = Object.keys(snapshot.inboxByWorker).length;
    if (pendingMail > 0) {
      const total = Object.values(snapshot.inboxByWorker).reduce((s, q) => s + q.length, 0);
      bullets.push(`工人信箱中仍有 ${total} 条待处理指令，分布在 ${pendingMail} 个工人队列。`);
    }

    bullets.push(`已登记成品 ${artifacts.length} 件；组织成员（工人）${workers.length} 名。`);

    if (recentErrors.length) {
      bullets.push(`近期捕获 ${recentErrors.length} 条错误级日志，可在「日志」Tab 筛选查看详情。`);
    }

    return {
      generatedAt: new Date().toISOString(),
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        orchestrationMode: task.orchestrationMode,
        orchestrationState: task.orchestrationState,
        planVersion: task.planVersion,
        masterAgentId: task.masterAgentId,
      },
      workers,
      artifactCount: artifacts.length,
      plan,
      bullets,
      recentErrors,
    };
  }
}
