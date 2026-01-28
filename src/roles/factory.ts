/**
 * 角色工厂
 */

import type { RoleDefinition } from './types.js';
import { BaseRole } from './base.js';
import type { LLMService } from '../services/llm.service.js';
import { loadRole } from './role-loader.js';
import { ProductManager } from './product-manager.js';
import { Architect } from './architect.js';
import { Developer } from './developer.js';
import { Tester } from './tester.js';
import { DocWriter } from './doc-writer.js';

/**
 * 角色工厂
 */
export class RoleFactory {
  private static promptConfigPaths: string[] = [];

  /**
   * 设置提示词配置路径
   */
  static setPromptConfigPaths(paths: string[]): void {
    this.promptConfigPaths = paths;
  }

  /**
   * 添加提示词配置路径
   */
  static addPromptConfigPath(path: string): void {
    this.promptConfigPaths.push(path);
  }

  /**
   * 加载提示词
   */
  static async loadPrompts(): Promise<void> {
    // 提示词加载逻辑在 prompts 模块中
    // 这里只是占位符
  }

  /**
   * 创建角色实例
   */
  static createRole(
    roleType: string,
    llmService: LLMService
  ): BaseRole {
    switch (roleType) {
      case 'product-manager':
        return new ProductManager(llmService);
      case 'architect':
        return new Architect(llmService);
      case 'developer':
        return new Developer(llmService);
      case 'tester':
        return new Tester(llmService);
      case 'doc-writer':
        return new DocWriter(llmService);
      default:
        throw new Error(`未知的角色类型: ${roleType}`);
    }
  }

  /**
   * 获取可用角色列表
   */
  static getAvailableRoles(): string[] {
    return [
      'product-manager',
      'architect',
      'developer',
      'tester',
      'doc-writer',
    ];
  }

  /**
   * 注册自定义角色
   */
  static registerRole(id: string, roleClass: typeof BaseRole): void {
    // 自定义角色注册逻辑
  }
}
