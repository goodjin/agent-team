import type { Message } from '../infrastructure/llm/types.js';

/**
 * 近似 token 估算：与 AgentMemory 内策略一致（约 4 字符/token），
 * 可与 LLM usage 对照；不替代服务端计费。
 */
export class TokenEstimator {
  static estimateText(text: string): number {
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4));
  }

  static estimateMessages(messages: Message[]): number {
    let n = 0;
    for (const m of messages) {
      n += this.estimateText(m.content || '');
      if (m.toolCalls?.length) {
        for (const tc of m.toolCalls) {
          n += this.estimateText(tc.name);
          n += this.estimateText(JSON.stringify(tc.arguments ?? {}));
        }
      }
    }
    return n;
  }

  static estimateChatHistory(history: Array<{ role: string; content: string }>): number {
    return history.reduce((s, h) => s + this.estimateText(h.content || ''), 0);
  }

  /** 将最近一次 completion usage 与估算差值记入 metadata（可选日志用） */
  static compareWithUsage(estimatedPromptTokens: number, usagePrompt: number): number {
    return usagePrompt > 0 ? usagePrompt - estimatedPromptTokens : 0;
  }
}
