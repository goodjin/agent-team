/**
 * Bing Web Search 适配器（备用）
 * Task 02: WebSearchTool - Bing Search API v7
 */

import type { SearchAdapter, WebSearchParams, WebSearchResponse, WebSearchResult } from './search-adapter.js';

interface BingWebPage {
  name?: string;
  url?: string;
  snippet?: string;
  dateLastCrawled?: string;
  displayUrl?: string;
}

interface BingResponse {
  webPages?: {
    value?: BingWebPage[];
    totalEstimatedMatches?: number;
  };
}

export class BingSearchAdapter implements SearchAdapter {
  readonly name = 'bing';
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.bing.microsoft.com/v7.0/search';
  private readonly timeoutMs = 10_000;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async search(params: WebSearchParams): Promise<WebSearchResponse> {
    const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);
    const mkt = params.language ?? 'zh-CN';

    const url = new URL(this.baseUrl);
    url.searchParams.set('q', params.query);
    url.searchParams.set('count', String(limit));
    url.searchParams.set('mkt', mkt);

    if (params.freshness && params.freshness !== 'any') {
      const freshnessMap: Record<string, string> = {
        day: 'Day',
        week: 'Week',
        month: 'Month',
      };
      url.searchParams.set('freshness', freshnessMap[params.freshness] ?? 'Month');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let resp: Response;
    try {
      resp = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      throw new Error(`Bing API error: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as BingResponse;
    const pages = data.webPages?.value ?? [];
    const totalEstimated = data.webPages?.totalEstimatedMatches ?? pages.length;

    const results: WebSearchResult[] = pages
      .map((page, index) => ({
        title: page.name ?? '',
        url: page.url ?? '',
        snippet: page.snippet ?? '',
        publishedDate: page.dateLastCrawled,
        source: page.displayUrl,
        position: index + 1,
      }))
      .filter(r => r.url.startsWith('http://') || r.url.startsWith('https://'));

    return {
      results,
      totalEstimated,
      query: params.query,
      searchEngine: 'bing',
    };
  }
}
