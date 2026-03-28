/**
 * v10 工人信箱：同 workerId FIFO；priority 数值越小越优先（默认 0）
 */

export interface MailboxEnvelope {
  correlationId: string;
  planVersion: number;
  command: string;
  body: Record<string, unknown>;
  priority?: number;
  enqueuedAt: number;
}

export class WorkerMailbox {
  private queues = new Map<string, MailboxEnvelope[]>();

  enqueue(workerId: string, item: Omit<MailboxEnvelope, 'enqueuedAt'>): void {
    const full: MailboxEnvelope = { ...item, enqueuedAt: Date.now() };
    const q = this.queues.get(workerId) ?? [];
    q.push(full);
    q.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.enqueuedAt - b.enqueuedAt);
    this.queues.set(workerId, q);
  }

  dequeue(workerId: string): MailboxEnvelope | undefined {
    const q = this.queues.get(workerId);
    if (!q?.length) return undefined;
    return q.shift();
  }

  depth(workerId: string): number {
    return this.queues.get(workerId)?.length ?? 0;
  }

  depthsForTask(workerIds: Iterable<string>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const id of workerIds) {
      const d = this.depth(id);
      if (d > 0) out[id] = d;
    }
    return out;
  }
}
