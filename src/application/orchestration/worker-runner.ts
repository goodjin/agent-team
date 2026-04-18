import type { AgentService } from '../agent/agent.service.js';
import type { ITaskRepository } from '../../domain/task/task.repository.js';
import type { IAgentRepository } from '../../domain/agent/agent.repository.js';
import type { IEventBus } from '../../infrastructure/event-bus/index.js';
import type { ILogger } from '../../infrastructure/logger/index.js';
import { WorkerMailbox, type MailboxEnvelope } from './mailbox.js';
import type { OrchestratorService } from './orchestrator.service.js';
import { normalizeProgressReport } from './progress-report.js';

/**
 * v10：按 workerId 串行消费信箱，ASSIGN_WORK 触发 AgentService.execute（可 Abort）
 */
export class WorkerRunner {
  private tails = new Map<string, Promise<void>>();
  private abortByWorker = new Map<string, AbortController>();

  constructor(
    private mailbox: WorkerMailbox,
    private agentRepo: IAgentRepository,
    private taskRepo: ITaskRepository,
    private agentService: AgentService,
    private orchestrator: OrchestratorService,
    private eventBus: IEventBus,
    private logger: ILogger
  ) {}

  scheduleProcess(workerId: string): void {
    const prev = this.tails.get(workerId) ?? Promise.resolve();
    const next = prev
      .then(() => this.drainWorker(workerId))
      .catch((e) => console.error('[WorkerRunner]', workerId, e));
    this.tails.set(workerId, next);
  }

  private async drainWorker(workerId: string): Promise<void> {
    while (true) {
      const item = this.mailbox.dequeue(workerId);
      if (!item) break;
      await this.dispatchItem(workerId, item);
    }
  }

  private async dispatchItem(workerId: string, item: MailboxEnvelope): Promise<void> {
    const agent = await this.agentRepo.findById(workerId);
    if (!agent) {
      await this.eventBus.publish({
        type: 'worker.mailbox.deadletter',
        timestamp: new Date(),
        payload: { taskId: '', workerId, reason: 'agent_not_found' },
      });
      return;
    }

    const task = await this.taskRepo.findById(agent.taskId);
    if (!task) return;

    if (item.planVersion !== (task.planVersion ?? 0)) {
      await this.logger.log({
        timestamp: new Date(),
        level: 'warn',
        taskId: task.id,
        agentId: workerId,
        type: 'error',
        content: `Mailbox stale planVersion (envelope ${item.planVersion}, task ${task.planVersion ?? 0})`,
        metadata: { correlationId: item.correlationId },
      });
      return;
    }

    const op = String(item.body.op ?? item.command);

    if (op === 'CANCEL') {
      this.abortByWorker.get(workerId)?.abort();
      await this.eventBus.publish({
        type: 'worker.to.master.progress',
        timestamp: new Date(),
        payload: {
          taskId: task.id,
          workerId,
          kind: 'PROGRESS',
          correlationId: item.correlationId,
          detail: { op: 'CANCEL' },
        },
      });
      return;
    }

    if (op === 'PATCH_BRIEF') {
      const brief = typeof item.body.brief === 'string' ? item.body.brief : '';
      agent.context.variables.workerBrief = brief;
      await this.agentRepo.save(agent);
      await this.eventBus.publish({
        type: 'worker.to.master.progress',
        timestamp: new Date(),
        payload: {
          taskId: task.id,
          workerId,
          kind: 'PROGRESS',
          correlationId: item.correlationId,
          detail: { op: 'PATCH_BRIEF' },
        },
      });
      return;
    }

    if (op === 'QUERY_STATUS') {
      await this.eventBus.publish({
        type: 'worker.to.master.progress',
        timestamp: new Date(),
        payload: {
          taskId: task.id,
          workerId,
          kind: 'PROGRESS',
          correlationId: item.correlationId,
          detail: { op: 'QUERY_STATUS', status: agent.status },
        },
      });
      return;
    }

    if (op === 'ASSIGN_WORK') {
      const brief = typeof item.body.brief === 'string' ? item.body.brief : '';
      const nodeId = typeof item.body.nodeId === 'string' ? item.body.nodeId : '';
      agent.context.variables.workerBrief = brief;
      if (nodeId) agent.context.variables.currentNodeId = nodeId;
      await this.agentRepo.save(agent);

      const ac = new AbortController();
      this.abortByWorker.set(workerId, ac);
      try {
        await this.eventBus.publish({
          type: 'worker.to.master.progress',
          timestamp: new Date(),
          payload: {
            taskId: task.id,
            workerId,
            kind: 'PROGRESS',
            correlationId: item.correlationId,
            detail: { phase: 'execute_start', nodeId },
          },
        });

        try {
          await this.agentService.execute(workerId, task, { signal: ac.signal });
        } catch (execErr) {
          const agentErr = await this.agentRepo.findById(workerId);
          await this.eventBus.publish({
            type: 'worker.to.master.progress',
            timestamp: new Date(),
            payload: {
              taskId: task.id,
              workerId,
              kind: 'FAILED' as const,
              correlationId: item.correlationId,
              detail: {
                nodeId,
                phase: 'execute_error',
                error: agentErr?.error ?? (execErr instanceof Error ? execErr.message : String(execErr)),
              },
            },
          });
          await this.resetWorkerAgent(workerId);
          if (nodeId) {
            await this.orchestrator.onWorkerNodeDone(task.id, nodeId, false);
          }
          return;
        }

        const agentAfter = await this.agentRepo.findById(workerId);
        const ok = agentAfter?.status === 'completed';
        const rawSummary =
          typeof agentAfter?.context.variables?.lastRunSummary === 'string'
            ? agentAfter.context.variables.lastRunSummary
            : '';
        const errorMessage = agentAfter?.error ?? (!ok ? rawSummary || 'worker status not completed' : '');
        const report = normalizeProgressReport({
          statusHint: ok ? 'done' : 'blocked',
          scopeHint: nodeId ? `原子节点 ${nodeId}` : '原子任务执行',
          summary: ok ? rawSummary : errorMessage,
          nextStepHint: ok
            ? '等待直属上级审查当前节点结果。'
            : '等待直属上级决定返工、重派或升级处理。',
        });

        await this.resetWorkerAgent(workerId);

        if (nodeId) {
          await this.orchestrator.onWorkerNodeDone(task.id, nodeId, ok, report);
        }

        await this.eventBus.publish({
          type: 'worker.to.master.progress',
          timestamp: new Date(),
          payload: {
            taskId: task.id,
            workerId,
            kind: ok ? 'COMPLETED' : 'FAILED',
            correlationId: item.correlationId,
            detail: {
              nodeId,
              summary: rawSummary || undefined,
              report,
              ...(ok ? {} : { error: errorMessage }),
            },
          },
        });
      } finally {
        this.abortByWorker.delete(workerId);
      }
    }
  }

  private async resetWorkerAgent(workerId: string): Promise<void> {
    const a = await this.agentRepo.findById(workerId);
    if (!a) return;
    a.status = 'idle';
    a.startedAt = undefined;
    a.completedAt = undefined;
    a.error = undefined;
    await this.agentRepo.save(a);
  }
}
