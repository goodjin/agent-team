import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { ToolExecutor } from '../../src/tools/tool-executor.js';
import { ToolSchemaBuilder } from '../../src/tools/tool-schema.js';

describe('ToolExecutor', () => {
  let executor: ToolExecutor;

  beforeEach(() => {
    vi.useRealTimers();
    executor = new ToolExecutor({
      maxRetries: 3,
      initialDelay: 10,
      confirmDangerous: false, // 测试时禁用确认
    });
  });

  describe('register', () => {
    it('should register a tool', () => {
      const tool = {
        name: 'test_tool',
        description: 'A test tool',
        parameters: [],
        schema: z.object({}),
        handler: async () => 'result',
      };

      executor.register(tool);

      const definitions = executor.getToolDefinitions();
      expect(definitions).toHaveLength(1);
      expect(definitions[0].function.name).toBe('test_tool');
    });

    it('should register multiple tools via registerBatch', () => {
      const tools = [
        {
          name: 'tool1',
          description: 'Tool 1',
          parameters: [],
          schema: z.object({}),
          handler: async () => 'result1',
        },
        {
          name: 'tool2',
          description: 'Tool 2',
          parameters: [],
          schema: z.object({}),
          handler: async () => 'result2',
        },
      ];

      executor.registerBatch(tools);

      const definitions = executor.getToolDefinitions();
      expect(definitions).toHaveLength(2);
    });

    it('should emit tool:registered event', () => {
      const listener = vi.fn();
      executor.on('tool:registered', listener);

      executor.register({
        name: 'event_tool',
        description: 'Event tool',
        parameters: [],
        schema: z.object({}),
        handler: async () => 'ok',
      });

      expect(listener).toHaveBeenCalledWith({ name: 'event_tool' });
    });
  });

  describe('execute', () => {
    it('should execute a tool successfully', async () => {
      executor.register({
        name: 'add',
        description: 'Add two numbers',
        parameters: [
          { name: 'a', type: 'number', description: 'First number', required: true },
          { name: 'b', type: 'number', description: 'Second number', required: true },
        ],
        schema: z.object({
          a: z.number(),
          b: z.number(),
        }),
        handler: async (params) => params.a + params.b,
      });

      const result = await executor.execute({
        id: '1',
        name: 'add',
        arguments: JSON.stringify({ a: 2, b: 3 }),
      });

      expect(result.success).toBe(true);
      expect(result.result).toContain('5');
    });

    it('should return error for unknown tool', async () => {
      const result = await executor.execute({
        id: '1',
        name: 'unknown',
        arguments: '{}',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error for invalid JSON arguments', async () => {
      executor.register({
        name: 'simple',
        description: 'Simple tool',
        parameters: [],
        schema: z.object({}),
        handler: async () => 'ok',
      });

      const result = await executor.execute({
        id: '1',
        name: 'simple',
        arguments: 'invalid json',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
    });

    it('should validate parameters', async () => {
      executor.register({
        name: 'greet',
        description: 'Greet someone',
        parameters: [
          { name: 'name', type: 'string', description: 'Name', required: true },
        ],
        schema: z.object({
          name: z.string(),
        }),
        handler: async (params) => `Hello, ${params.name}!`,
      });

      const result = await executor.execute({
        id: '1',
        name: 'greet',
        arguments: JSON.stringify({ name: 123 }), // 错误类型
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should retry on failure', async () => {
      let attempts = 0;

      executor.register({
        name: 'flaky',
        description: 'A flaky tool',
        parameters: [],
        schema: z.object({}),
        handler: async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Temporary failure');
          }
          return 'success';
        },
      });

      const result = await executor.execute({
        id: '1',
        name: 'flaky',
        arguments: '{}',
      });

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);
    }, 10000);

    it('should fail after max retries exceeded', async () => {
      let attempts = 0;

      executor.register({
        name: 'always_fails',
        description: 'Always fails',
        parameters: [],
        schema: z.object({}),
        handler: async () => {
          attempts++;
          throw new Error('Permanent failure');
        },
      });

      const result = await executor.execute({
        id: '1',
        name: 'always_fails',
        arguments: '{}',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permanent failure');
      expect(attempts).toBe(4); // initial attempt + 3 retries
    }, 10000);

    it('should include duration in result', async () => {
      executor.register({
        name: 'timed',
        description: 'Timed tool',
        parameters: [],
        schema: z.object({}),
        handler: async () => 'ok',
      });

      const result = await executor.execute({
        id: '1',
        name: 'timed',
        arguments: '{}',
      });

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('executeBatch', () => {
    it('should execute multiple tool calls', async () => {
      executor.register({
        name: 'echo',
        description: 'Echo input',
        parameters: [
          { name: 'msg', type: 'string', description: 'Message', required: true },
        ],
        schema: z.object({ msg: z.string() }),
        handler: async (params) => params.msg,
      });

      const results = await executor.executeBatch([
        { id: '1', name: 'echo', arguments: JSON.stringify({ msg: 'hello' }) },
        { id: '2', name: 'echo', arguments: JSON.stringify({ msg: 'world' }) },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });
  });

  describe('postProcess', () => {
    it('should sanitize API keys', async () => {
      executor.register({
        name: 'leak',
        description: 'Leak secrets',
        parameters: [],
        schema: z.object({}),
        handler: async () => ({
          apiKey: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef',
        }),
      });

      const result = await executor.execute({
        id: '1',
        name: 'leak',
        arguments: '{}',
      });

      expect(result.result).toContain('sk-***');
      expect(result.result).not.toContain('sk-1234');
    });

    it('should sanitize passwords', async () => {
      executor.register({
        name: 'pass_leak',
        description: 'Leak password',
        parameters: [],
        schema: z.object({}),
        handler: async () => ({ password: 'supersecret123' }),
      });

      const result = await executor.execute({
        id: '1',
        name: 'pass_leak',
        arguments: '{}',
      });

      expect(result.result).toContain('"password": "***"');
      expect(result.result).not.toContain('supersecret123');
    });

    it('should sanitize email addresses', async () => {
      executor.register({
        name: 'email_leak',
        description: 'Leak email',
        parameters: [],
        schema: z.object({}),
        handler: async () => 'Contact us at john.doe@example.com for help',
      });

      const result = await executor.execute({
        id: '1',
        name: 'email_leak',
        arguments: '{}',
      });

      expect(result.result).toContain('jo***@example.com');
      expect(result.result).not.toContain('john.doe@example.com');
    });

    it('should truncate long results', async () => {
      const longText = 'a'.repeat(20000);

      executor.register({
        name: 'long',
        description: 'Return long text',
        parameters: [],
        schema: z.object({}),
        handler: async () => longText,
      });

      const result = await executor.execute({
        id: '1',
        name: 'long',
        arguments: '{}',
      });

      expect(result.result.length).toBeLessThan(11000);
      expect(result.result).toContain('truncated');
    });
  });

  describe('ToolSchemaBuilder', () => {
    it('should build schema from parameters', () => {
      const schema = ToolSchemaBuilder.build([
        { name: 'name', type: 'string', description: 'Name', required: true },
        { name: 'age', type: 'number', description: 'Age', required: false },
      ]);

      const valid = schema.safeParse({ name: 'Alice' });
      expect(valid.success).toBe(true);

      const invalid = schema.safeParse({ name: 123 });
      expect(invalid.success).toBe(false);
    });

    it('should handle all parameter types', () => {
      const schema = ToolSchemaBuilder.build([
        { name: 's', type: 'string', description: 'str', required: true },
        { name: 'n', type: 'number', description: 'num', required: true },
        { name: 'b', type: 'boolean', description: 'bool', required: true },
        { name: 'a', type: 'array', description: 'arr', required: true },
        { name: 'o', type: 'object', description: 'obj', required: true },
      ]);

      const valid = schema.safeParse({
        s: 'hello',
        n: 42,
        b: true,
        a: [1, 2, 3],
        o: { key: 'value' },
      });
      expect(valid.success).toBe(true);
    });
  });

  describe('getToolDefinitions', () => {
    it('should return LLM-compatible tool definitions', () => {
      executor.register({
        name: 'search',
        description: 'Search the web',
        parameters: [
          { name: 'query', type: 'string', description: 'Search query', required: true },
        ],
        schema: z.object({ query: z.string() }),
        handler: async (params) => `Results for: ${params.query}`,
      });

      const defs = executor.getToolDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0].type).toBe('function');
      expect(defs[0].function.name).toBe('search');
      expect(defs[0].function.parameters.required).toContain('query');
    });
  });
});
