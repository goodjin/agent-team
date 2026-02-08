# Task 5: 实现工具执行器

**优先级**: P0
**预计工时**: 8 小时
**依赖**: 无
**状态**: 待执行

---

## 目标

1. 完善 ToolExecutor 类
2. 实现参数验证（Zod）
3. 实现工具调用重试（指数退避）
4. 实现危险操作确认
5. 实现结果后处理（脱敏、截断）

---

## 输入

- 现有代码：`src/tools/tool-registry.ts`
- 架构设计：`docs/v5/02-architecture.md`

---

## 输出

- `src/tools/tool-executor.ts`
- `src/tools/tool-schema.ts`
- 单元测试：`tests/tools/tool-executor.test.ts`

---

## 实现步骤

### 步骤 1: 定义工具接口和 Schema

创建 `src/tools/tool-schema.ts`：

```typescript
import { z } from 'zod';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  schema?: z.ZodSchema;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  schema: z.ZodSchema;
  dangerous?: boolean;
  handler: (params: any) => Promise<any>;
}

export class ToolSchemaBuilder {
  static build(parameters: ToolParameter[]): z.ZodSchema {
    const shape: Record<string, z.ZodSchema> = {};

    for (const param of parameters) {
      let schema: z.ZodSchema;

      switch (param.type) {
        case 'string':
          schema = z.string();
          break;
        case 'number':
          schema = z.number();
          break;
        case 'boolean':
          schema = z.boolean();
          break;
        case 'array':
          schema = z.array(z.any());
          break;
        case 'object':
          schema = z.object({}).passthrough();
          break;
        default:
          schema = z.any();
      }

      if (param.schema) {
        schema = param.schema;
      }

      if (!param.required) {
        schema = schema.optional();
      }

      shape[param.name] = schema;
    }

    return z.object(shape);
  }
}
```

### 步骤 2: 实现 ToolExecutor

创建 `src/tools/tool-executor.ts`：

```typescript
import { EventEmitter } from 'events';
import type { ToolDefinition } from './tool-schema.js';

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  id: string;
  name: string;
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
}

export interface ToolExecutorOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  confirmDangerous?: boolean;
  sanitizeResults?: boolean;
  maxResultLength?: number;
}

export class ToolExecutor extends EventEmitter {
  private tools: Map<string, ToolDefinition> = new Map();
  private options: Required<ToolExecutorOptions>;

  constructor(options: ToolExecutorOptions = {}) {
    super();

    this.options = {
      maxRetries: options.maxRetries ?? 3,
      initialDelay: options.initialDelay ?? 1000,
      maxDelay: options.maxDelay ?? 10000,
      confirmDangerous: options.confirmDangerous ?? true,
      sanitizeResults: options.sanitizeResults ?? true,
      maxResultLength: options.maxResultLength ?? 10000,
    };
  }

  /**
   * 注册工具
   */
  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    this.emit('tool:registered', { name: tool.name });
  }

  /**
   * 批量注册工具
   */
  registerBatch(tools: ToolDefinition[]): void {
    tools.forEach((tool) => this.register(tool));
  }

  /**
   * 执行工具调用
   */
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      const tool = this.tools.get(toolCall.name);

      if (!tool) {
        return {
          id: toolCall.id,
          name: toolCall.name,
          success: false,
          error: `Tool "${toolCall.name}" not found`,
          duration: Date.now() - startTime,
        };
      }

      // 解析参数
      let params: any;
      try {
        params = JSON.parse(toolCall.arguments);
      } catch (error) {
        return {
          id: toolCall.id,
          name: toolCall.name,
          success: false,
          error: `Invalid arguments: ${error}`,
          duration: Date.now() - startTime,
        };
      }

      // 验证参数
      const validation = tool.schema.safeParse(params);
      if (!validation.success) {
        return {
          id: toolCall.id,
          name: toolCall.name,
          success: false,
          error: `Parameter validation failed: ${validation.error.message}`,
          duration: Date.now() - startTime,
        };
      }

      // 危险操作确认
      if (tool.dangerous && this.options.confirmDangerous) {
        const confirmed = await this.confirmDangerousOperation(
          tool.name,
          validation.data
        );

        if (!confirmed) {
          return {
            id: toolCall.id,
            name: toolCall.name,
            success: false,
            error: 'Dangerous operation cancelled by user',
            duration: Date.now() - startTime,
          };
        }
      }

      // 执行工具（带重试）
      const result = await this.executeWithRetry(tool, validation.data);

      // 后处理结果
      const processedResult = this.postProcess(result);

      this.emit('tool:executed', {
        id: toolCall.id,
        name: toolCall.name,
        duration: Date.now() - startTime,
      });

      return {
        id: toolCall.id,
        name: toolCall.name,
        success: true,
        result: processedResult,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      this.emit('tool:error', {
        id: toolCall.id,
        name: toolCall.name,
        error: error.message,
      });

      return {
        id: toolCall.id,
        name: toolCall.name,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 带重试的执行
   */
  private async executeWithRetry(
    tool: ToolDefinition,
    params: any,
    attempt: number = 0
  ): Promise<any> {
    try {
      return await tool.handler(params);
    } catch (error: any) {
      if (attempt >= this.options.maxRetries) {
        throw error;
      }

      // 计算延迟（指数退避）
      const delay = Math.min(
        this.options.initialDelay * Math.pow(2, attempt),
        this.options.maxDelay
      );

      this.emit('tool:retry', {
        name: tool.name,
        attempt: attempt + 1,
        delay,
      });

      await this.sleep(delay);

      return this.executeWithRetry(tool, params, attempt + 1);
    }
  }

  /**
   * 危险操作确认
   */
  private async confirmDangerousOperation(
    toolName: string,
    params: any
  ): Promise<boolean> {
    // 触发确认事件，由外部处理
    return new Promise((resolve) => {
      this.emit('tool:confirm', {
        toolName,
        params,
        confirm: (confirmed: boolean) => resolve(confirmed),
      });

      // 默认 30 秒超时，自动拒绝
      setTimeout(() => resolve(false), 30000);
    });
  }

  /**
   * 后处理结果
   */
  private postProcess(result: any): any {
    if (!this.options.sanitizeResults) {
      return result;
    }

    // 转换为字符串
    let str = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

    // 脱敏处理
    str = this.sanitize(str);

    // 截断
    if (str.length > this.options.maxResultLength) {
      str = str.substring(0, this.options.maxResultLength) + '\n... (truncated)';
    }

    return str;
  }

  /**
   * 脱敏处理
   */
  private sanitize(text: string): string {
    // API Key 脱敏
    text = text.replace(/sk-[a-zA-Z0-9]{48}/g, 'sk-***');
    text = text.replace(/sk-ant-[a-zA-Z0-9-]{95}/g, 'sk-ant-***');

    // 密码脱敏
    text = text.replace(/"password"\s*:\s*"[^"]+"/g, '"password": "***"');
    text = text.replace(/"token"\s*:\s*"[^"]+"/g, '"token": "***"');

    // 电子邮件部分脱敏
    text = text.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, (match, user, domain) => {
      const maskedUser = user.substring(0, 2) + '***';
      return `${maskedUser}@${domain}`;
    });

    return text;
  }

  /**
   * 批量执行工具调用
   */
  async executeBatch(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    return Promise.all(toolCalls.map((tc) => this.execute(tc)));
  }

  /**
   * 获取工具定义（用于 LLM）
   */
  getToolDefinitions(): any[] {
    return Array.from(this.tools.values()).map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters.reduce((acc, param) => {
            acc[param.name] = {
              type: param.type,
              description: param.description,
            };
            return acc;
          }, {} as Record<string, any>),
          required: tool.parameters
            .filter((p) => p.required)
            .map((p) => p.name),
        },
      },
    }));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

### 步骤 3: 创建单元测试

创建 `tests/tools/tool-executor.test.ts`：

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { ToolExecutor } from '../../src/tools/tool-executor.js';
import { ToolSchemaBuilder } from '../../src/tools/tool-schema.js';

describe('ToolExecutor', () => {
  let executor: ToolExecutor;

  beforeEach(() => {
    executor = new ToolExecutor({
      maxRetries: 3,
      initialDelay: 100,
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
});
```

---

## 验收标准

- ✅ 参数验证正确（Schema 验证）
- ✅ 重试机制正常（最多 3 次，指数退避）
- ✅ 危险操作需要确认
- ✅ 结果自动脱敏
- ✅ 结果超过 10,000 字符时截断
- ✅ 单元测试覆盖率 > 80%

---

## 依赖安装

```bash
npm install zod
```

---

## 相关文档

- 架构设计：`docs/v5/02-architecture.md`
- 任务拆分：`docs/v5/04-task-breakdown.md`

---

**任务完成标志**：

- [ ] ToolExecutor 类实现完成
- [ ] 参数验证实现完成
- [ ] 重试机制实现完成
- [ ] 危险操作确认实现完成
- [ ] 结果后处理实现完成
- [ ] 单元测试通过
- [ ] 测试覆盖率 > 80%
