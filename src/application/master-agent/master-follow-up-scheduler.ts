import type { ITaskRepository } from '../../domain/task/task.repository.js';
import type { Task } from '../../domain/task/task.entity.js';
import type { MasterAgentService } from './master-agent.service.js';
import type { ILogger } from '../../infrastructure/logger/index.js';

/** 定时写入主会话，触发主控 LLM 盘点与跟进（与 REST/WS 用户消息同源） */
export const MASTER_FOLLOW_UP_PROMPT =
  '[系统定时跟进] 请主动盘点本任务进展：先用 query_orchestration_state 查看 DAG、节点状态与工人信箱；需要时用 read_file 查看 TASK.md 或子任务文档。若有未完成节点、待发派工、阻塞或需用户决策，请采取行动（可用 reply_user 简要同步）；若当前无需介入，也请 reply_user 用一两句话确认即可。';

export interface MasterFollowUpSchedulerOptions {
  taskRepo: ITaskRepository;
  masterAgentService: MasterAgentService;
  logger: ILogger;
  /** 扫描周期（毫秒），默认读环境变量 AGENT_MASTER_FOLLOWUP_TICK_MS 或 120000 */
  tickMs?: number;
  /** 同一任务两次跟进最小间隔（毫秒），默认读环境变量 AGENT_MASTER_FOLLOWUP_MIN_GAP_MS 或 900000 */
  minGapMs?: number;
  /** 默认 true；环境变量 AGENT_MASTER_FOLLOWUP_ENABLED=0/false/off 可关闭 */
  enabled?: boolean;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envFollowUpEnabled(): boolean {
  const v = process.env.AGENT_MASTER_FOLLOWUP_ENABLED?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return true;
}

/**
 * 在进程存活期间周期性提醒主控跟进任务，减轻「长时间无人说话主控不盘点」的问题。
 * 注意：进程退出后定时器即停止；生产环境仍需进程守护（systemd/PM2 等）。
 */
export class MasterFollowUpScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  /** 上次对该任务发起跟进的时间（含失败），用于冷却 */
  private lastAttempt = new Map<string, number>();
  private inFlight = new Set<string>();

  constructor(private readonly opts: MasterFollowUpSchedulerOptions) {}

  start(): void {
    if (this.timer) return;
    const enabled = this.opts.enabled ?? envFollowUpEnabled();
    if (!enabled) {
      console.log('[MasterFollowUp] disabled (AGENT_MASTER_FOLLOWUP_ENABLED=0/false/off)');
      return;
    }
    const tickMs = this.opts.tickMs ?? envInt('AGENT_MASTER_FOLLOWUP_TICK_MS', 120_000);
    const minGapMs = this.opts.minGapMs ?? envInt('AGENT_MASTER_FOLLOWUP_MIN_GAP_MS', 900_000);
    this.timer = setInterval(() => {
      void this.tick(minGapMs).catch((e) => console.error('[MasterFollowUp] tick:', e));
    }, tickMs);
    console.log(
      `[MasterFollowUp] enabled: tick=${tickMs}ms, minGap=${minGapMs}ms (set AGENT_MASTER_FOLLOWUP_ENABLED=0 to disable)`
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(minGapMs: number): Promise<void> {
    const tasks = await this.opts.taskRepo.findAll();
    const now = Date.now();
    for (const task of tasks) {
      if (!this.isCandidate(task)) continue;
      const last = this.lastAttempt.get(task.id);
      if (last !== undefined && now - last < minGapMs) continue;
      if (this.inFlight.has(task.id)) continue;

      this.inFlight.add(task.id);
      this.lastAttempt.set(task.id, now);
      try {
        await this.opts.masterAgentService.ensureSessionStarted(task.id);
        await this.opts.masterAgentService.handleUserMessage(task.id, MASTER_FOLLOW_UP_PROMPT);
        await this.opts.logger.log({
          timestamp: new Date(),
          level: 'info',
          taskId: task.id,
          type: 'milestone',
          content: '主控定时跟进已触发',
          metadata: { source: 'master_follow_up_scheduler' },
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        await this.opts.logger.log({
          timestamp: new Date(),
          level: 'warn',
          taskId: task.id,
          type: 'error',
          content: `主控定时跟进失败: ${msg}`,
          metadata: { source: 'master_follow_up_scheduler' },
        });
      } finally {
        this.inFlight.delete(task.id);
      }
    }
  }

  private isCandidate(task: Task): boolean {
    if (task.status !== 'running') return false;
    if (task.orchestrationMode && task.orchestrationMode !== 'v10-master') return false;
    return true;
  }
}
