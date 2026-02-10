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
