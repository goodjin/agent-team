import type { ToolDefinition } from '../types/index.js';
import { z } from 'zod';

/**
 * 工具执行结果
 */
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: any;
}

/**
 * 基础工具类
 * 所有工具都应该继承这个类
 */
export abstract class BaseTool {
  protected definition: ToolDefinition;

  constructor(definition: ToolDefinition) {
    this.definition = definition;
  }

  /**
   * 获取工具定义
   */
  getDefinition(): ToolDefinition {
    return this.definition;
  }

  /**
   * 执行工具
   */
  async execute(params: any): Promise<ToolResult> {
    try {
      // 验证参数
      if (this.definition.schema) {
        const validated = this.definition.schema.parse(params);
        return await this.executeImpl(validated);
      }

      return await this.executeImpl(params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: `参数验证失败: ${error.errors.map(e => e.message).join(', ')}`,
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 实际执行逻辑，由子类实现
   */
  protected abstract executeImpl(params: any): Promise<ToolResult>;

  /**
   * 检查工具是否可用
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * 获取工具帮助信息
   */
  getHelp(): string {
    const { name, description, category, dangerous } = this.definition;

    let help = `## ${name}\n\n`;
    help += `${description}\n\n`;
    help += `**类别**: ${category}\n`;
    help += `**危险操作**: ${dangerous ? '是' : '否'}\n`;

    if (this.definition.schema) {
      help += `\n**参数**:\n`;
      // 这里可以生成更详细的参数说明
    }

    return help;
  }
}
