import type { Message } from '../../infrastructure/llm/types.js';
import type { LLMService } from '../../infrastructure/llm/service.js';
import type { Agent } from '../../domain/agent/agent.entity.js';
import { TokenEstimator } from '../../knowledge/token-estimator.js';

export interface DualSummary {
  userFacing: string;
  internal: string;
}

export interface ContextCompressorOptions {
  /** 主会话历史：超过则触发摘要 */
  softTokensMaster?: number;
  hardTokensMaster?: number;
  keepLastMasterTurns?: number;
  /** ReAct 消息列表：超过则压缩 */
  hardTokensMessages?: number;
  keepLastMessages?: number;
}

/**
 * 软/硬阈值摘要；双轨 userFacing / internal（内部可进 variables，对用户可见部分单独成句）
 */
export class ContextCompressor {
  private softMaster: number;
  private hardMaster: number;
  private keepMaster: number;
  private hardMessages: number;
  private keepMessages: number;

  constructor(
    private llmService: LLMService,
    opts: ContextCompressorOptions = {}
  ) {
    this.softMaster = opts.softTokensMaster ?? 4800;
    this.hardMaster = opts.hardTokensMaster ?? 8000;
    this.keepMaster = opts.keepLastMasterTurns ?? 8;
    this.hardMessages = opts.hardTokensMessages ?? 10000;
    this.keepMessages = opts.keepLastMessages ?? 12;
  }

  async summarizeTranscript(transcript: string): Promise<DualSummary> {
    const response = await this.llmService.chatDefault({
      messages: [
        {
          role: 'system',
          content: `你是上下文压缩器。仅输出一个 JSON 对象，不要 markdown 围栏，格式：
{"userFacing":"给最终用户看的简短摘要（中文）","internal":"团队内部用的状态、约束、DAG、工具结果要点（中文）"}
要求：userFacing 不含敏感内部细节；internal 可含技术细节。`,
        },
        {
          role: 'user',
          content: `请压缩以下对话/日志：\n\n${transcript.slice(0, 24000)}`,
        },
      ],
      temperature: 0.2,
      maxTokens: 1200,
    });
    return parseDualSummary(response.message.content || '');
  }

  /**
   * 主控 history：超软阈值则摘要头部，internal 写入 variables，可见摘要以 user 消息形式保留
   */
  async maybeCompressMasterHistory(agent: Agent): Promise<void> {
    const h = agent.context.history;
    const est = TokenEstimator.estimateChatHistory(h);
    if (est < this.softMaster || h.length <= this.keepMaster) return;

    const head = h.slice(0, -this.keepMaster);
    const tail = h.slice(-this.keepMaster);
    const text = head.map((x) => `${x.role}: ${x.content}`).join('\n');
    const sum = await this.summarizeTranscript(text);

    agent.context.variables.internalDigest = [
      agent.context.variables?.internalDigest
        ? String(agent.context.variables.internalDigest) + '\n---\n'
        : '',
      sum.internal,
    ].join('');

    agent.context.history = [
      {
        role: 'user',
        content: `[较早对话已压缩] ${sum.userFacing}`,
      },
      ...tail,
    ];
  }

  /**
   * Worker ReAct：超硬阈值则把前段压成一条 user 说明（含双轨摘要文本，供模型续写）
   */
  async maybeCompressMessages(messages: Message[]): Promise<Message[]> {
    const est = TokenEstimator.estimateMessages(messages);
    if (est < this.hardMessages) return messages;

    const system = messages[0]?.role === 'system' ? [messages[0]!] : [];
    const rest =
      messages[0]?.role === 'system' ? messages.slice(1) : [...messages];
    if (rest.length <= this.keepMessages) return messages;

    const head = rest.slice(0, -this.keepMessages);
    const tail = rest.slice(-this.keepMessages);
    const transcript = head
      .map((m) => `${m.role}: ${(m.content || '').slice(0, 4000)}`)
      .join('\n\n');
    const sum = await this.summarizeTranscript(transcript);

    const block: Message = {
      role: 'user',
      content: `[上下文已压缩 — 用户可见摘要] ${sum.userFacing}\n\n[内部续写要点] ${sum.internal}`,
    };

    return [...system, block, ...tail];
  }
}

function parseDualSummary(text: string): DualSummary {
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  try {
    const o = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      userFacing: String(o.userFacing ?? o.user_facing ?? '').slice(0, 2000),
      internal: String(o.internal ?? '').slice(0, 4000),
    };
  } catch {
    const half = Math.floor(text.length / 2);
    return {
      userFacing: text.slice(0, half).slice(0, 2000),
      internal: text.slice(half).slice(0, 4000),
    };
  }
}
