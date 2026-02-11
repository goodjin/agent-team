/**
 * SearchAdapter 接口定义
 * Task 02: WebSearchTool - Web 搜索工具适配器层
 */

export interface WebSearchParams {
  query: string;
  limit?: number;       // 默认 10，最大 50
  language?: string;    // 默认 'zh-CN'
  region?: string;      // 默认 'CN'
  freshness?: 'day' | 'week' | 'month' | 'any';
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  source?: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  totalEstimated: number;
  query: string;
  searchEngine: string;
}

export interface SearchAdapter {
  name: string;
  search(params: WebSearchParams): Promise<WebSearchResponse>;
  isAvailable(): Promise<boolean>;
}
