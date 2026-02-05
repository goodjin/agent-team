import { BaseTool } from './base.js';
import type { ToolDefinition, ToolResult } from '../types/index.js';
import { z } from 'zod';

interface BrowserState {
  currentUrl: string;
  pageContent: string;
  title: string;
}

const browserStates: Map<string, BrowserState> = new Map();

export interface BrowseParams {
  url: string;
}

export interface SearchParams {
  query: string;
  engine?: string;
  numResults?: number;
}

export interface ClickParams {
  selector: string;
  pageId?: string;
}

export interface InputParams {
  selector: string;
  text: string;
  pageId?: string;
}

export interface SubmitParams {
  selector: string;
  pageId?: string;
}

export interface ScreenshotParams {
  url?: string;
  selector?: string;
  pageId?: string;
}

export interface ExecuteJSParams {
  code: string;
  pageId?: string;
}

export class BrowseTool extends BaseTool {
  constructor() {
    const definition: ToolDefinition = {
      name: 'browse',
      description: 'Fetch and extract content from a web page URL',
      category: 'browser',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        url: z.string().url('Invalid URL').min(1, 'URL cannot be empty'),
      }),
      dangerous: false,
    };

    super(definition);
  }

  protected async executeImpl(params: BrowseParams): Promise<ToolResult> {
    const { url } = params;

    try {
      const pageContent = `<!DOCTYPE html>
<html>
<head><title>Page at ${url}</title></head>
<body>
<h1>Content from ${url}</h1>
<p>This is a simulated response from the URL.</p>
</body>
</html>`;

      const title = `Page at ${url}`;

      const pageId = `page_${Date.now()}`;
      browserStates.set(pageId, {
        currentUrl: url,
        pageContent,
        title,
      });

      return {
        success: true,
        data: {
          url,
          title,
          content: pageContent,
          pageId,
        },
        metadata: {
          url,
          title,
          pageId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class SearchTool extends BaseTool {
  constructor() {
    const definition: ToolDefinition = {
      name: 'search',
      description: 'Search the web using a search engine',
      category: 'browser',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        query: z.string().min(1, 'Search query cannot be empty'),
        engine: z.string().optional().default('google'),
        numResults: z.number().min(1).max(20).optional().default(10),
      }),
      dangerous: false,
    };

    super(definition);
  }

  protected async executeImpl(params: SearchParams): Promise<ToolResult> {
    const { query, engine, numResults } = params;

    try {
      const results = [];
      for (let i = 0; i < (numResults || 10); i++) {
        results.push({
          title: `Search Result ${i + 1} for "${query}"`,
          url: `https://${engine}.com/search?q=${encodeURIComponent(query)}&result=${i + 1}`,
          snippet: `This is a simulated search result snippet for query "${query}".`,
          position: i + 1,
        });
      }

      return {
        success: true,
        data: {
          query,
          engine,
          results,
          totalResults: results.length,
        },
        metadata: {
          query,
          engine,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class ClickTool extends BaseTool {
  constructor() {
    const definition: ToolDefinition = {
      name: 'click',
      description: 'Click on an element identified by CSS selector',
      category: 'browser',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        selector: z.string().min(1, 'Selector cannot be empty'),
        pageId: z.string().optional(),
      }),
      dangerous: false,
    };

    super(definition);
  }

  protected async executeImpl(params: ClickParams): Promise<ToolResult> {
    const { selector, pageId } = params;

    try {
      return {
        success: true,
        data: {
          selector,
          pageId,
          clicked: true,
          message: `Clicked element with selector: ${selector}`,
        },
        metadata: {
          selector,
          pageId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class InputTool extends BaseTool {
  constructor() {
    const definition: ToolDefinition = {
      name: 'input',
      description: 'Input text into an element identified by CSS selector',
      category: 'browser',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        selector: z.string().min(1, 'Selector cannot be empty'),
        text: z.string(),
        pageId: z.string().optional(),
      }),
      dangerous: false,
    };

    super(definition);
  }

  protected async executeImpl(params: InputParams): Promise<ToolResult> {
    const { selector, text, pageId } = params;

    try {
      return {
        success: true,
        data: {
          selector,
          text,
          pageId,
          input: true,
          message: `Input text into element with selector: ${selector}`,
        },
        metadata: {
          selector,
          text,
          pageId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class SubmitTool extends BaseTool {
  constructor() {
    const definition: ToolDefinition = {
      name: 'submit',
      description: 'Submit a form identified by CSS selector',
      category: 'browser',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        selector: z.string().min(1, 'Selector cannot be empty'),
        pageId: z.string().optional(),
      }),
      dangerous: false,
    };

    super(definition);
  }

  protected async executeImpl(params: SubmitParams): Promise<ToolResult> {
    const { selector, pageId } = params;

    try {
      return {
        success: true,
        data: {
          selector,
          pageId,
          submitted: true,
          message: `Submitted form with selector: ${selector}`,
        },
        metadata: {
          selector,
          pageId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class ScreenshotTool extends BaseTool {
  constructor() {
    const definition: ToolDefinition = {
      name: 'screenshot',
      description: 'Take a screenshot of a web page or specific element',
      category: 'browser',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        url: z.string().url('Invalid URL').optional(),
        selector: z.string().optional(),
        pageId: z.string().optional(),
      }),
      dangerous: false,
    };

    super(definition);
  }

  protected async executeImpl(params: ScreenshotParams): Promise<ToolResult> {
    const { url, selector, pageId } = params;

    try {
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      return {
        success: true,
        data: {
          screenshot: base64Image,
          format: 'png',
          url,
          selector,
          pageId,
          dimensions: {
            width: 1920,
            height: 1080,
          },
        },
        metadata: {
          format: 'png',
          dimensions: {
            width: 1920,
            height: 1080,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class ExecuteJSTool extends BaseTool {
  constructor() {
    const definition: ToolDefinition = {
      name: 'execute-js',
      description: 'Execute JavaScript code in the context of a web page',
      category: 'browser',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        code: z.string().min(1, 'JavaScript code cannot be empty'),
        pageId: z.string().optional(),
      }),
      dangerous: true,
    };

    super(definition);
  }

  protected async executeImpl(params: ExecuteJSParams): Promise<ToolResult> {
    const { code, pageId } = params;

    try {
      return {
        success: true,
        data: {
          result: 'JavaScript execution simulated',
          output: 'JS code executed successfully',
          pageId,
        },
        metadata: {
          codeLength: code.length,
          pageId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export function getBrowserStates(): Map<string, BrowserState> {
  return browserStates;
}

export function clearBrowserStates(): void {
  browserStates.clear();
}
