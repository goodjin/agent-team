/**
 * Serper.dev 搜索适配器
 * Task 02: WebSearchTool - Serper.dev API 调用
 */

import type { SearchAdapter, WebSearchParams, WebSearchResponse, WebSearchResult } from './search-adapter.js';

interface SerperOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
  source?: string;
  position?: number;
}

interface SerperResponse {
  organic?: SerperOrganicResult[];
  searchParameters?: {
    q?: string;
    num?: number;
  };
}

export class SerperSearchAdapter implements SearchAdapter {
  readonly name = 'serper';
  private readonly apiKey: string;
  private readonly baseUrl = 'https://google.serper.dev/search';
  private readonly timeoutMs = 10_000;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async search(params: WebSearchParams): Promise<WebSearchResponse> {
    const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);
    const language = params.language ?? 'zh-CN';
    const region = params.region ?? 'CN';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let resp: Response;
    try {
      resp = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: params.query,
          num: limit,
          gl: region,
          hl: language,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      throw new Error(`Serper API error: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as SerperResponse;
    const organic = data.organic ?? [];

    const results: WebSearchResult[] = organic
      .map((item, index) => ({
        title: item.title ?? '',
        url: item.link ?? '',
        snippet: item.snippet ?? '',
        publishedDate: item.date,
        source: item.source,
        position: item.position ?? index + 1,
      }))
      .filter(r => r.url.startsWith('http://') || r.url.startsWith('https://'));

    return {
      results,
      totalEstimated: results.length,
      query: params.query,
      searchEngine: 'serper',
    };
  }
}
