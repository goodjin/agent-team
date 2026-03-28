import type { AgentMemory } from '../../knowledge/agent-memory.js';
import type { ProjectKnowledgeBase } from '../../knowledge/project-kb.js';
import type { KnowledgeCategory } from '../../knowledge/types.js';

const DEFAULT_QUALITY = {
  confidence: 0.55,
  verified: false,
  usageCount: 0,
  successRate: 0,
} as const;

/**
 * v10 命名空间记忆：`namespace = taskId/agentId`，可选镜像到 ProjectKB（projectId = taskId）
 */
export class NamespaceMemoryService {
  constructor(
    private agentMemory: AgentMemory,
    private projectKb: ProjectKnowledgeBase | null = null
  ) {}

  static namespaceFor(taskId: string, agentId: string): string {
    return `${taskId}/${agentId}`;
  }

  async append(params: {
    taskId: string;
    agentId: string;
    content: string;
    title?: string;
    tags?: string[];
    track?: 'userFacing' | 'internal';
    category?: KnowledgeCategory;
  }): Promise<{ id: string }> {
    const ns = NamespaceMemoryService.namespaceFor(params.taskId, params.agentId);
    const tags = [...(params.tags ?? [])];
    if (params.track) tags.push(`track:${params.track}`);

    const store = this.agentMemory.getLongTermMemory();
    const entry = await store.add({
      namespace: ns,
      title: params.title?.slice(0, 100) ?? params.content.slice(0, 80),
      content: params.content,
      summary: params.content.slice(0, 200),
      category: params.category ?? 'context',
      tags,
      source: {
        taskId: params.taskId,
        agentId: params.agentId,
        tool: 'memory_append',
      },
      quality: { ...DEFAULT_QUALITY },
    });

    if (this.projectKb) {
      try {
        await this.projectKb.initializeProject(params.taskId);
        const pstore = this.projectKb.getStore(params.taskId);
        await pstore.add({
          namespace: `mirror/${params.agentId}`,
          title: entry.title,
          content: entry.content,
          summary: entry.summary,
          category: params.category ?? 'context',
          tags: [...tags, 'project-mirror'],
          source: {
            taskId: params.taskId,
            agentId: params.agentId,
            tool: 'memory_append',
          },
          quality: { ...DEFAULT_QUALITY },
        });
      } catch {
        // 镜像失败不阻断主路径
      }
    }

    return { id: entry.id };
  }

  async search(params: {
    taskId: string;
    agentId: string;
    query: string;
    topK?: number;
    threshold?: number;
  }) {
    const ns = NamespaceMemoryService.namespaceFor(params.taskId, params.agentId);
    return this.agentMemory.getLongTermMemory().search({
      text: params.query,
      namespace: ns,
      topK: params.topK ?? 8,
      threshold: params.threshold ?? 0.22,
      searchMode: 'hybrid',
    });
  }

  async listRecent(params: { taskId: string; agentId: string; limit?: number }) {
    const ns = NamespaceMemoryService.namespaceFor(params.taskId, params.agentId);
    const { entries } = await this.agentMemory.getLongTermMemory().list({
      namespace: ns,
      status: 'active',
      page: 1,
      pageSize: params.limit ?? 20,
    });
    return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
