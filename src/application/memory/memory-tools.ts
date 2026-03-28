import type { Tool, ToolContext } from '../../domain/tool/index.js';
import type { IAgentRepository } from '../../domain/agent/agent.repository.js';
import { NamespaceMemoryService } from './namespace-memory.service.js';
import type { ContextCompressor } from './context-compressor.js';
import { MemoryToolHandlers } from './memory-tool-handlers.js';

/**
 * Worker / 通用注册：memory_* 绑定当前 taskId + agentId 命名空间
 */
export function createMemoryTools(deps: {
  namespaceMemory: NamespaceMemoryService;
  agentRepo: IAgentRepository;
  contextCompressor: ContextCompressor;
}): Tool[] {
  const handlers = new MemoryToolHandlers(
    deps.namespaceMemory,
    deps.agentRepo,
    deps.contextCompressor
  );

  return [
    {
      name: 'memory_search',
      description:
        '在当前任务下按命名空间检索记忆（默认同一 agent；主控可查 targetAgentId 对应工人）',
      category: 'ai',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索查询' },
          topK: { type: 'number', description: '返回条数，默认 8' },
          targetAgentId: { type: 'string', description: '可选' },
        },
        required: ['query'],
      },
      dangerous: false,
      execute: async (
        params: { query: string; topK?: number; targetAgentId?: string },
        context: ToolContext
      ) => {
        try {
          const r = await handlers.search(
            { taskId: context.taskId, agentId: context.agentId },
            params
          );
          if (!r.ok) return { success: false, error: r.error };
          return { success: true, data: r.data };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      },
    },
    {
      name: 'memory_append',
      description: '向当前 agent 命名空间追加记忆；track=userFacing|internal 用于双轨',
      category: 'ai',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          title: { type: 'string' },
          tags: { type: 'array', description: 'string[]' },
          track: { type: 'string' },
        },
        required: ['content'],
      },
      dangerous: false,
      execute: async (
        params: {
          content: string;
          title?: string;
          tags?: string[];
          track?: string;
        },
        context: ToolContext
      ) => {
        try {
          const r = await handlers.append(
            { taskId: context.taskId, agentId: context.agentId },
            params
          );
          if (!r.ok) return { success: false, error: r.error };
          return { success: true, data: r.data };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      },
    },
    {
      name: 'memory_summarize',
      description:
        '双轨摘要：写 variables memorySummary* 并可选追加命名空间；scope=namespace 时仅根据已存条目',
      category: 'ai',
      parameters: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          targetAgentId: { type: 'string' },
          writeToVariables: { type: 'boolean' },
          appendMemory: { type: 'boolean' },
        },
      },
      dangerous: false,
      execute: async (
        params: {
          scope?: string;
          targetAgentId?: string;
          writeToVariables?: boolean;
          appendMemory?: boolean;
        },
        context: ToolContext
      ) => {
        try {
          const r = await handlers.summarize(
            { taskId: context.taskId, agentId: context.agentId },
            params
          );
          if (!r.ok) return { success: false, error: r.error };
          return { success: true, data: r.data };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      },
    },
  ];
}
