// 知识分类
export type KnowledgeCategory =
  | 'code'
  | 'error-solution'
  | 'best-practice'
  | 'decision'
  | 'context'
  | 'other';

// 版本快照
export interface VersionSnapshot {
  version: number;
  timestamp: string;      // ISO 8601
  content: string;
  title: string;
  changedBy: string;      // agentId 或 'manual'
}

// 知识条目（完整结构）
export interface KnowledgeEntry {
  id: string;             // UUID v4
  namespace: string;      // 默认 'global'
  title: string;          // <= 100 字符
  content: string;        // Markdown 格式
  summary: string;        // <= 200 字符
  category: KnowledgeCategory;
  tags: string[];
  embedding: number[];    // TF-IDF 向量
  embeddingModel: string; // 'tfidf-v1' 或 'none'
  source: {
    taskId?: string;
    agentId?: string;
    tool?: string;
    manual?: boolean;
  };
  quality: {
    confidence: number;   // 0-1
    verified: boolean;
    usageCount: number;
    successRate: number;  // 0-1
  };
  version: number;        // 从 1 开始
  versions: VersionSnapshot[];  // 最多 20 个
  status: 'active' | 'deleted' | 'archived';
  createdAt: string;
  updatedAt: string;
  accessedAt: string;
}

// 情景记录
export interface EpisodeRecord {
  id: string;
  taskId: string;
  agentId: string;
  taskDescription: string;   // <= 500 字符
  executionSummary: string;  // <= 500 字符
  outcome: 'success' | 'failure' | 'partial';
  duration: number;          // 毫秒
  toolsUsed: string[];
  knowledgeUsed: string[];
  startedAt: string;
  completedAt: string;
}

// 搜索查询
export interface SearchQuery {
  text: string;
  category?: KnowledgeCategory;
  tags?: string[];
  namespace?: string;
  topK?: number;          // 默认 5，1-50
  threshold?: number;     // 默认 0.3
  searchMode?: 'semantic' | 'keyword' | 'hybrid';
  semanticWeight?: number; // hybrid 模式，默认 0.7
  dateRange?: { from?: string; to?: string };
}

// 搜索结果
export interface SearchResult {
  entry: KnowledgeEntry;
  score: number;          // 0-1
  matchType: 'semantic' | 'keyword' | 'hybrid';
}

// 列表过滤
export interface ListFilter {
  category?: KnowledgeCategory;
  tags?: string[];
  namespace?: string;
  status?: 'active' | 'deleted' | 'archived';
  dateRange?: { from?: string; to?: string };
  page?: number;          // 从 1 开始
  pageSize?: number;      // 默认 20，1-100
}

// 统计信息
export interface StoreStats {
  total: number;
  active: number;
  byCategory: Partial<Record<KnowledgeCategory, number>>;
  storageSizeBytes: number;
  lastUpdated: string;
}

// VectorStore 配置
export interface VectorStoreOptions {
  storagePath: string;
  maxVocabSize?: number;   // TF-IDF 词汇表上限，默认 10000
  debounceMs?: number;     // 写入防抖，默认 500
}

// 情景记忆过滤
export interface EpisodeFilter {
  agentId?: string;
  outcome?: 'success' | 'failure' | 'partial';
  dateRange?: { from?: string; to?: string };
  keyword?: string;
  limit?: number;
}

// 知识库配置选项
export interface KBOptions {
  namespace?: string;
  semanticWeight?: number;
  maxVocabSize?: number;
  episodeCapacity?: number;
  tokenBudget?: number;
  debounceMs?: number;
}

// 任务完成事件 payload
export interface TaskCompletedEvent {
  taskId: string;
  agentId: string;
  input: string;          // 任务原始输入
  output: string;         // 任务最终输出
  toolsUsed: string[];    // 使用的工具列表
  duration: number;       // 执行时长（ms）
  success: boolean;
}

// 任务失败事件 payload
export interface TaskFailedEvent {
  taskId: string;
  agentId: string;
  input: string;
  error: Error | string;
  toolsUsed: string[];
  duration: number;
}

// 工具错误事件 payload
export interface ToolErrorEvent {
  taskId: string;
  agentId: string;
  toolName: string;
  input: Record<string, unknown>;
  error: Error | string;
}
