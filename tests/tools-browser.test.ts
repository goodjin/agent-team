import { describe, it, expect, beforeEach } from 'vitest';
import {
  BrowseTool,
  SearchTool,
  ClickTool,
  InputTool,
  SubmitTool,
  ScreenshotTool,
  ExecuteJSTool,
  getBrowserStates,
  clearBrowserStates,
} from '../src/tools/browser.js';

describe('Browser Tools', () => {
  beforeEach(() => {
    clearBrowserStates();
  });

  describe('BrowseTool', () => {
    it('should fetch page content from URL', async () => {
      const tool = new BrowseTool();
      const result = await tool.execute({
        url: 'https://example.com/page',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('url');
      expect(result.data).toHaveProperty('title');
      expect(result.data).toHaveProperty('content');
      expect(result.data).toHaveProperty('pageId');
      expect(result.data.url).toBe('https://example.com/page');
    });

    it('should validate URL format', async () => {
      const tool = new BrowseTool();
      const result = await tool.execute({
        url: 'not-a-valid-url',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid URL');
    });

    it('should require URL parameter', async () => {
      const tool = new BrowseTool();
      const result = await tool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('SearchTool', () => {
    it('should return search results', async () => {
      const tool = new SearchTool();
      const result = await tool.execute({
        query: 'TypeScript tutorials',
        engine: 'google',
        numResults: 5,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('query');
      expect(result.data).toHaveProperty('results');
      expect(result.data.results.length).toBe(5);
      expect(result.data.engine).toBe('google');
    });

    it('should validate search query', async () => {
      const tool = new SearchTool();
      const result = await tool.execute({
        query: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should support different search engines', async () => {
      const tool = new SearchTool();
      const engines = ['google', 'bing', 'duckduckgo'];

      for (const engine of engines) {
        const result = await tool.execute({
          query: 'test',
          engine,
        });
        expect(result.success).toBe(true);
        expect(result.data.engine).toBe(engine);
      }
    });
  });

  describe('ClickTool', () => {
    it('should click on element by selector', async () => {
      const tool = new ClickTool();
      const result = await tool.execute({
        selector: '#submit-button',
        pageId: 'page_123',
      });

      expect(result.success).toBe(true);
      expect(result.data.selector).toBe('#submit-button');
      expect(result.data.clicked).toBe(true);
    });

    it('should require selector', async () => {
      const tool = new ClickTool();
      const result = await tool.execute({ selector: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('InputTool', () => {
    it('should input text into element', async () => {
      const tool = new InputTool();
      const result = await tool.execute({
        selector: '#username',
        text: 'testuser',
        pageId: 'page_123',
      });

      expect(result.success).toBe(true);
      expect(result.data.selector).toBe('#username');
      expect(result.data.text).toBe('testuser');
      expect(result.data.input).toBe(true);
    });

    it('should validate selector and text', async () => {
      const tool = new InputTool();

      const result = await tool.execute({
        selector: '',
        text: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('SubmitTool', () => {
    it('should submit form', async () => {
      const tool = new SubmitTool();
      const result = await tool.execute({
        selector: 'form#login-form',
        pageId: 'page_123',
      });

      expect(result.success).toBe(true);
      expect(result.data.selector).toBe('form#login-form');
      expect(result.data.submitted).toBe(true);
    });
  });

  describe('ScreenshotTool', () => {
    it('should take screenshot', async () => {
      const tool = new ScreenshotTool();
      const result = await tool.execute({
        url: 'https://example.com',
        selector: '#main-content',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('screenshot');
      expect(result.data).toHaveProperty('format');
      expect(result.data).toHaveProperty('dimensions');
      expect(result.data.format).toBe('png');
    });

    it('should return base64 encoded image', async () => {
      const tool = new ScreenshotTool();
      const result = await tool.execute({
        url: 'https://example.com',
      });

      expect(result.success).toBe(true);
      expect(result.data.screenshot.length).toBeGreaterThan(0);
    });
  });

  describe('ExecuteJSTool', () => {
    it('should execute JavaScript code', async () => {
      const tool = new ExecuteJSTool();
      const result = await tool.execute({
        code: 'document.querySelectorAll(".item")',
        pageId: 'page_123',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('result');
      expect(result.data.pageId).toBe('page_123');
    });

    it('should require code parameter', async () => {
      const tool = new ExecuteJSTool();
      const result = await tool.execute({ code: '' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('JavaScript code cannot be empty');
    });

    it('should be marked as dangerous operation', () => {
      const tool = new ExecuteJSTool();
      expect(tool.getDefinition().dangerous).toBe(true);
    });
  });

  describe('Tool Definitions', () => {
    it('should have correct category', () => {
      expect(new BrowseTool().getDefinition().category).toBe('browser');
      expect(new SearchTool().getDefinition().category).toBe('browser');
      expect(new ClickTool().getDefinition().category).toBe('browser');
      expect(new InputTool().getDefinition().category).toBe('browser');
      expect(new SubmitTool().getDefinition().category).toBe('browser');
      expect(new ScreenshotTool().getDefinition().category).toBe('browser');
      expect(new ExecuteJSTool().getDefinition().category).toBe('browser');
    });
  });
});
