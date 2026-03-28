import type { IAgentRepository } from '../../domain/agent/agent.repository.js';
import { NamespaceMemoryService } from './namespace-memory.service.js';
import type { ContextCompressor } from './context-compressor.js';

export interface MemoryToolRunContext {
  taskId: string;
  agentId: string;
}

export class MemoryToolHandlers {
  constructor(
    private namespaceMemory: NamespaceMemoryService,
    private agentRepo: IAgentRepository,
    private contextCompressor: ContextCompressor
  ) {}

  async search(
    ctx: MemoryToolRunContext,
    params: { query: string; topK?: number; targetAgentId?: string }
  ): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
    const targetId = params.targetAgentId?.trim() || ctx.agentId;
    if (targetId !== ctx.agentId) {
      const other = await this.agentRepo.findById(targetId);
      if (!other || other.taskId !== ctx.taskId) {
        return { ok: false, error: 'targetAgentId 无效或不属于本任务' };
      }
    }
    const results = await this.namespaceMemory.search({
      taskId: ctx.taskId,
      agentId: targetId,
      query: params.query,
      topK: params.topK,
    });
    return {
      ok: true,
      data: results.map((r) => ({
        id: r.entry.id,
        title: r.entry.title,
        summary: r.entry.summary,
        score: r.score,
        tags: r.entry.tags,
        track: r.entry.tags.find((t) => t.startsWith('track:'))?.replace('track:', ''),
      })),
    };
  }

  async append(
    ctx: MemoryToolRunContext,
    params: {
      content: string;
      title?: string;
      tags?: string[];
      track?: string;
    }
  ): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
    const track =
      params.track === 'userFacing' || params.track === 'internal'
        ? params.track
        : undefined;
    const r = await this.namespaceMemory.append({
      taskId: ctx.taskId,
      agentId: ctx.agentId,
      content: params.content,
      title: params.title,
      tags: params.tags,
      track,
    });
    return { ok: true, data: r };
  }

  async summarize(
    ctx: MemoryToolRunContext,
    params: {
      scope?: string;
      targetAgentId?: string;
      writeToVariables?: boolean;
      appendMemory?: boolean;
    }
  ): Promise<
    | { ok: true; data: { userFacing: string; internal: string } }
    | { ok: false; error: string }
  > {
    const targetId = params.targetAgentId?.trim() || ctx.agentId;
    const agent = await this.agentRepo.findById(targetId);
    if (!agent || agent.taskId !== ctx.taskId) {
      return { ok: false, error: 'agent 无效' };
    }

    let transcript = '';
    const useNs = params.scope === 'namespace';
    if (!useNs && agent.context.history.length > 0) {
      transcript = agent.context.history.map((h) => `${h.role}: ${h.content}`).join('\n');
    } else {
      const entries = await this.namespaceMemory.listRecent({
        taskId: ctx.taskId,
        agentId: targetId,
        limit: 18,
      });
      transcript = entries
        .map((e) => `${e.title}\n${e.content.slice(0, 800)}`)
        .join('\n---\n');
    }

    if (!transcript.trim()) {
      return { ok: false, error: '无可摘要内容' };
    }

    const sum = await this.contextCompressor.summarizeTranscript(transcript);

    if (params.writeToVariables !== false) {
      agent.context.variables.memorySummaryUserFacing = sum.userFacing;
      agent.context.variables.memorySummaryInternal = sum.internal;
      await this.agentRepo.save(agent);
    }

    if (params.appendMemory !== false) {
      await this.namespaceMemory.append({
        taskId: ctx.taskId,
        agentId: targetId,
        content: sum.userFacing,
        title: 'memory_summarize:userFacing',
        tags: ['memory_summarize'],
        track: 'userFacing',
      });
      await this.namespaceMemory.append({
        taskId: ctx.taskId,
        agentId: targetId,
        content: sum.internal,
        title: 'memory_summarize:internal',
        tags: ['memory_summarize'],
        track: 'internal',
      });
    }

    return { ok: true, data: sum };
  }
}
