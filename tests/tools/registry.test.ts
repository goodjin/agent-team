/**
 * ToolRegistry v6 增强测试
 * Task 01: 权限控制、多维查询、调用统计、健康检查
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolRegistry, ToolPermission, ToolCategory } from '../../src/tools/tool-registry.js';
import { BaseTool } from '../../src/tools/base.js';
import type { V6ToolDefinition, ToolRegistryQuery } from '../../src/tools/tool-registry.js';
import type { ToolResult } from '../../src/tools/base.js';
import { z } from 'zod';
import { WorkDirManager } from '../../src/core/work-dir-manager.js';

// ============ 测试工具工厂 ============

function createMockTool(overrides: Partial<V6ToolDefinition> & { name: string; category?: string }): BaseTool {
  const definition: V6ToolDefinition = {
    name: overrides.name,
    description: overrides.description ?? `Description for ${overrides.name}`,
    category: (overrides.category ?? 'custom') as V6ToolDefinition['category'],
    execute: overrides.execute ?? (async () => ({ success: true, data: 'ok' })),
    schema: overrides.schema,
    permissions: overrides.permissions,
    tags: overrides.tags,
    version: overrides.version,
    healthCheck: overrides.healthCheck,
  };

  class MockTool extends BaseTool {
    constructor() {
      super(definition);
    }
    protected async executeImpl(_params: unknown): Promise<ToolResult> {
      if (definition.execute) {
        return definition.execute(_params as Record<string, unknown>) as Promise<ToolResult>;
      }
      return { success: true, data: 'mock result' };
    }
  }

  return new MockTool();
}

// 最小化 WorkDirManager mock
function createMockWorkDirManager(): WorkDirManager {
  return {
    getWorkDir: vi.fn().mockReturnValue('/tmp/test'),
    ensureWorkDir: vi.fn(),
  } as unknown as WorkDirManager;
}

// ============ 测试套件 ============

describe('ToolRegistry v6', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry(createMockWorkDirManager());
    // 清空默认注册的工具，专注测试 v6 功能
    registry.clear();
  });

  afterEach(() => {
    registry.stopHealthChecks();
  });

  // ============================
  // 基础功能（向后兼容）
  // ============================

  describe('基础功能', () => {
    it('register + has + get', () => {
      const tool = createMockTool({ name: 'test_tool' });
      registry.register(tool);

      expect(registry.has('test_tool')).toBe(true);
      expect(registry.get('test_tool')).toBe(tool);
    });

    it('unregister 移除工具', () => {
      const tool = createMockTool({ name: 'test_tool' });
      registry.register(tool);
      registry.unregister('test_tool');

      expect(registry.has('test_tool')).toBe(false);
    });

    it('unregister 不存在的工具抛出异常', () => {
      expect(() => registry.unregister('nonexistent')).toThrow('Tool not found');
    });

    it('execute 工具不存在返回错误', async () => {
      const result = await registry.execute('nonexistent', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool not found');
    });
  });

  // ============================
  // 权限检查
  // ============================

  describe('权限检查', () => {
    it('agentPermissions=undefined 时跳过权限检查（向后兼容）', async () => {
      const tool = createMockTool({
        name: 'network_tool',
        permissions: [ToolPermission.NETWORK],
        execute: async () => ({ success: true, data: 'ok' }),
      });
      registry.register(tool);

      const result = await registry.execute('network_tool', {});
      expect(result.success).toBe(true);
    });

    it('agentPermissions=[] 时，有权限要求的工具返回 Permission denied', async () => {
      const tool = createMockTool({
        name: 'network_tool',
        permissions: [ToolPermission.NETWORK],
        execute: async () => ({ success: true, data: 'ok' }),
      });
      registry.register(tool);

      const result = await registry.execute('network_tool', {}, []);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
      expect(result.error).toContain('network_tool');
    });

    it('agentPermissions 包含所需权限时，正常执行', async () => {
      const tool = createMockTool({
        name: 'network_tool',
        permissions: [ToolPermission.NETWORK],
        execute: async () => ({ success: true, data: 'network ok' }),
      });
      registry.register(tool);

      const result = await registry.execute('network_tool', {}, [ToolPermission.NETWORK]);
      expect(result.success).toBe(true);
    });

    it('多权限：缺少其中一个返回 Permission denied', async () => {
      const tool = createMockTool({
        name: 'shell_tool',
        permissions: [ToolPermission.SHELL, ToolPermission.SYSTEM],
        execute: async () => ({ success: true, data: 'shell ok' }),
      });
      registry.register(tool);

      const result = await registry.execute('shell_tool', {}, [ToolPermission.SHELL]);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
      expect(result.error).toContain('system');
    });

    it('多权限：全部满足时正常执行', async () => {
      const tool = createMockTool({
        name: 'shell_tool',
        permissions: [ToolPermission.SHELL, ToolPermission.SYSTEM],
        execute: async () => ({ success: true, data: 'shell ok' }),
      });
      registry.register(tool);

      const result = await registry.execute('shell_tool', {}, [
        ToolPermission.SHELL,
        ToolPermission.SYSTEM,
      ]);
      expect(result.success).toBe(true);
    });

    it('无 permissions 字段的工具：任何 agentPermissions 都可执行', async () => {
      const tool = createMockTool({
        name: 'open_tool',
        execute: async () => ({ success: true, data: 'open' }),
      });
      registry.register(tool);

      const result = await registry.execute('open_tool', {}, []);
      expect(result.success).toBe(true);
    });
  });

  // ============================
  // query() 多维查询
  // ============================

  describe('query() 多维查询', () => {
    beforeEach(() => {
      registry.register(
        createMockTool({
          name: 'web_search',
          description: '搜索互联网',
          category: 'web',
          tags: ['search', 'internet'],
          permissions: [ToolPermission.NETWORK],
        })
      );
      registry.register(
        createMockTool({
          name: 'read_file',
          description: '读取文件内容',
          category: 'file',
          tags: ['file', 'read'],
          permissions: [ToolPermission.READ_ONLY],
        })
      );
      registry.register(
        createMockTool({
          name: 'write_file',
          description: '写入文件内容',
          category: 'file',
          tags: ['file', 'write'],
          permissions: [ToolPermission.WRITE],
        })
      );
      registry.register(
        createMockTool({
          name: 'run_shell',
          description: '执行 shell 命令',
          category: 'shell',
          tags: ['shell', 'exec'],
          permissions: [ToolPermission.SHELL],
        })
      );
    });

    it('keyword 按名称搜索（不区分大小写）', () => {
      const results = registry.query({ keyword: 'WEB' });
      expect(results.map(t => t.getDefinition().name)).toContain('web_search');
      expect(results.length).toBe(1);
    });

    it('keyword 按描述搜索', () => {
      const results = registry.query({ keyword: '文件' });
      const names = results.map(t => t.getDefinition().name);
      expect(names).toContain('read_file');
      expect(names).toContain('write_file');
    });

    it('keyword 按标签搜索', () => {
      const results = registry.query({ keyword: 'internet' });
      expect(results.map(t => t.getDefinition().name)).toContain('web_search');
    });

    it('category 精确匹配', () => {
      const results = registry.query({ category: 'file' });
      const names = results.map(t => t.getDefinition().name);
      expect(names).toContain('read_file');
      expect(names).toContain('write_file');
      expect(names).not.toContain('web_search');
    });

    it('tags 包含匹配', () => {
      const results = registry.query({ tags: ['file', 'read'] });
      const names = results.map(t => t.getDefinition().name);
      expect(names).toContain('read_file');
      expect(names).not.toContain('write_file');
    });

    it('permissions 过滤：传入 [NETWORK] 只返回有 NETWORK 权限的工具', () => {
      const results = registry.query({ permissions: [ToolPermission.NETWORK] });
      expect(results.map(t => t.getDefinition().name)).toEqual(['web_search']);
    });

    it('permissions 过滤：传入 [READ_ONLY] 只返回有 READ_ONLY 权限的工具', () => {
      const results = registry.query({ permissions: [ToolPermission.READ_ONLY] });
      expect(results.map(t => t.getDefinition().name)).toEqual(['read_file']);
    });

    it('空查询返回所有工具', () => {
      const results = registry.query({});
      expect(results.length).toBe(4);
    });

    it('无匹配返回空数组', () => {
      const results = registry.query({ keyword: 'nonexistent_xyz_abc' });
      expect(results).toHaveLength(0);
    });
  });

  // ============================
  // 调用统计
  // ============================

  describe('调用统计', () => {
    it('register 时初始化统计条目', () => {
      const tool = createMockTool({ name: 'stat_tool' });
      registry.register(tool);

      const stats = registry.getToolStats('stat_tool');
      expect(stats).toBeDefined();
      expect(stats!.totalCalls).toBe(0);
      expect(stats!.successCalls).toBe(0);
      expect(stats!.failedCalls).toBe(0);
    });

    it('成功执行增加 successCalls', async () => {
      const tool = createMockTool({
        name: 'stat_tool',
        execute: async () => ({ success: true, data: 'ok' }),
      });
      registry.register(tool);

      await registry.execute('stat_tool', {});
      await registry.execute('stat_tool', {});

      const stats = registry.getToolStats('stat_tool');
      expect(stats!.totalCalls).toBe(2);
      expect(stats!.successCalls).toBe(2);
      expect(stats!.failedCalls).toBe(0);
    });

    it('失败执行增加 failedCalls', async () => {
      const tool = createMockTool({
        name: 'fail_tool',
        execute: async () => ({ success: false, error: 'some error' }),
      });
      registry.register(tool);

      await registry.execute('fail_tool', {});
      await registry.execute('fail_tool', {});

      const stats = registry.getToolStats('fail_tool');
      expect(stats!.totalCalls).toBe(2);
      expect(stats!.successCalls).toBe(0);
      expect(stats!.failedCalls).toBe(2);
    });

    it('avgDurationMs 为非负数', async () => {
      const tool = createMockTool({
        name: 'stat_tool',
        execute: async () => ({ success: true, data: 'ok' }),
      });
      registry.register(tool);

      await registry.execute('stat_tool', {});

      const stats = registry.getToolStats('stat_tool');
      expect(stats!.avgDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('lastCalledAt 更新', async () => {
      const tool = createMockTool({
        name: 'stat_tool',
        execute: async () => ({ success: true, data: 'ok' }),
      });
      registry.register(tool);

      const before = new Date();
      await registry.execute('stat_tool', {});
      const after = new Date();

      const stats = registry.getToolStats('stat_tool');
      expect(stats!.lastCalledAt).toBeDefined();
      expect(stats!.lastCalledAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(stats!.lastCalledAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('getAllToolStats 返回所有统计', () => {
      registry.register(createMockTool({ name: 'tool_a' }));
      registry.register(createMockTool({ name: 'tool_b' }));

      const all = registry.getAllToolStats();
      const names = all.map(s => s.name);
      expect(names).toContain('tool_a');
      expect(names).toContain('tool_b');
    });
  });

  // ============================
  // 健康检查
  // ============================

  describe('健康检查', () => {
    it('健康工具正常执行', async () => {
      vi.useRealTimers();
      try {
        const tool = createMockTool({
          name: 'healthy_tool',
          healthCheck: async () => true,
          execute: async () => ({ success: true, data: 'healthy' }),
        });
        registry.register(tool);

        registry.startHealthChecks(50);
        // 等待健康检查至少运行一次（立即执行的首次 runChecks）
        await new Promise(resolve => setTimeout(resolve, 80));

        const result = await registry.execute('healthy_tool', {});
        expect(result.success).toBe(true);
      } finally {
        registry.stopHealthChecks();
        vi.useFakeTimers();
      }
    }, 10000);

    it('不健康工具被标记为不可用', async () => {
      vi.useRealTimers();
      try {
        const healthCheck = vi.fn().mockResolvedValue(false);
        const tool = createMockTool({
          name: 'sick_tool',
          healthCheck,
          execute: async () => ({ success: true, data: 'should not reach' }),
        });
        registry.register(tool);

        registry.startHealthChecks(50);
        await new Promise(resolve => setTimeout(resolve, 80));

        const result = await registry.execute('sick_tool', {});
        expect(result.success).toBe(false);
        expect(result.error).toContain('not available');
      } finally {
        registry.stopHealthChecks();
        vi.useFakeTimers();
      }
    }, 10000);

    it('stopHealthChecks 停止定时器', () => {
      registry.startHealthChecks(100);
      registry.stopHealthChecks();
      // 不应抛出异常
      expect(true).toBe(true);
    });

    it('无 healthCheck 函数的工具不受健康检查影响', async () => {
      vi.useRealTimers();
      try {
        const tool = createMockTool({
          name: 'normal_tool',
          execute: async () => ({ success: true, data: 'ok' }),
        });
        registry.register(tool);

        registry.startHealthChecks(50);
        await new Promise(resolve => setTimeout(resolve, 80));

        const result = await registry.execute('normal_tool', {});
        expect(result.success).toBe(true);
      } finally {
        registry.stopHealthChecks();
        vi.useFakeTimers();
      }
    }, 10000);
  });

  // ============================
  // clear() 重置
  // ============================

  describe('clear()', () => {
    it('清空工具和统计', async () => {
      registry.register(createMockTool({ name: 'tool_a' }));
      await registry.execute('tool_a', {});

      registry.clear();

      expect(registry.has('tool_a')).toBe(false);
      expect(registry.getToolStats('tool_a')).toBeUndefined();
    });
  });
});
