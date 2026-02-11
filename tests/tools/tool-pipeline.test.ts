/**
 * ToolPipeline 单元测试
 * 使用 Mock ToolRegistry，不依赖真实工具
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolPipeline } from '../../src/tools/tool-pipeline.js';
import type { PipelineDefinition } from '../../src/tools/tool-pipeline.js';

beforeEach(() => {
  vi.useRealTimers();
});

// ============ Mock ToolRegistry ============

function makeMockRegistry(
  toolResponses: Record<string, (params: any) => { success: boolean; data?: any; error?: string }>
) {
  return {
    execute: vi.fn(async (name: string, params: any) => {
      const handler = toolResponses[name];
      if (!handler) {
        return { success: false, error: `Tool not found: ${name}` };
      }
      return handler(params);
    }),
  } as any;
}

// ============ 测试套件 ============

describe('ToolPipeline', () => {
  // ---------------------------------------------------------------
  // 顺序执行 - 数据传递
  // ---------------------------------------------------------------
  describe('顺序执行与数据传递', () => {
    it('两步流水线：step2 能读取 step1 的输出', async () => {
      const registry = makeMockRegistry({
        tool_a: () => ({ success: true, data: { value: 42 } }),
        tool_b: (params: any) => ({ success: true, data: { received: params.input } }),
      });

      const pipeline = new ToolPipeline(registry);
      const definition: PipelineDefinition = {
        name: 'test',
        steps: [
          { id: 'step1', tool: 'tool_a', params: {} },
          { id: 'step2', tool: 'tool_b', params: { input: '{{step1.value}}' } },
        ],
      };

      const result = await pipeline.execute(definition);

      expect(result.success).toBe(true);
      expect(registry.execute).toHaveBeenCalledTimes(2);
      // step2 应该接收到 step1 输出的 value: 42（整段模板变量保留原始数字类型）
      const step2Call = registry.execute.mock.calls[1];
      expect(step2Call[1].input).toBe(42);
    });

    it('模板变量整段引用时应保留原始类型（非字符串）', async () => {
      const registry = makeMockRegistry({
        tool_a: () => ({ success: true, data: { list: [1, 2, 3] } }),
        tool_b: (params: any) => ({ success: true, data: { items: params.items } }),
      });

      const pipeline = new ToolPipeline(registry);
      const definition: PipelineDefinition = {
        name: 'test',
        steps: [
          { id: 'step1', tool: 'tool_a', params: {} },
          { id: 'step2', tool: 'tool_b', params: { items: '{{step1.list}}' } },
        ],
      };

      const result = await pipeline.execute(definition);

      expect(result.success).toBe(true);
      const step2Call = registry.execute.mock.calls[1];
      // 整段模板变量应保留原始数组类型
      expect(Array.isArray(step2Call[1].items)).toBe(true);
      expect(step2Call[1].items).toEqual([1, 2, 3]);
    });

    it('三步流水线全部成功，返回最后一步的 output', async () => {
      const registry = makeMockRegistry({
        step_tool: (_params: any) => ({ success: true, data: { done: true } }),
      });

      const pipeline = new ToolPipeline(registry);
      const definition: PipelineDefinition = {
        name: 'three-steps',
        steps: [
          { id: 's1', tool: 'step_tool', params: {} },
          { id: 's2', tool: 'step_tool', params: {} },
          { id: 's3', tool: 'step_tool', params: {} },
        ],
      };

      const result = await pipeline.execute(definition);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(3);
      expect(result.steps.every(s => s.success)).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // 条件跳过
  // ---------------------------------------------------------------
  describe('条件跳过', () => {
    it('condition 为 false 时步骤应被跳过，skipped = true', async () => {
      const registry = makeMockRegistry({
        tool_a: () => ({ success: true, data: {} }),
        tool_b: () => ({ success: true, data: {} }),
      });

      const pipeline = new ToolPipeline(registry);
      const definition: PipelineDefinition = {
        name: 'conditional',
        steps: [
          { id: 'step1', tool: 'tool_a', params: {} },
          { id: 'step2', tool: 'tool_b', params: {}, condition: 'false' },
          { id: 'step3', tool: 'tool_a', params: {} },
        ],
      };

      const result = await pipeline.execute(definition);

      expect(result.success).toBe(true);
      expect(result.steps[1].skipped).toBe(true);
      expect(result.steps[1].success).toBe(true);
      // tool_b 不应被调用
      expect(registry.execute).toHaveBeenCalledTimes(2);
    });

    it('condition 为 true 时步骤正常执行', async () => {
      const registry = makeMockRegistry({
        tool_a: () => ({ success: true, data: { ok: true } }),
      });

      const pipeline = new ToolPipeline(registry);
      const definition: PipelineDefinition = {
        name: 'conditional-true',
        steps: [
          { id: 'step1', tool: 'tool_a', params: {}, condition: 'true' },
        ],
      };

      const result = await pipeline.execute(definition);

      expect(result.success).toBe(true);
      expect(result.steps[0].skipped).toBe(false);
      expect(registry.execute).toHaveBeenCalledTimes(1);
    });

    it('condition 为空字符串时步骤应被跳过', async () => {
      const registry = makeMockRegistry({
        tool_a: () => ({ success: true, data: {} }),
      });

      const pipeline = new ToolPipeline(registry);
      const definition: PipelineDefinition = {
        name: 'empty-condition',
        steps: [
          { id: 'step1', tool: 'tool_a', params: {}, condition: '' },
        ],
      };

      const result = await pipeline.execute(definition);

      expect(result.steps[0].skipped).toBe(true);
      expect(registry.execute).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // 错误处理策略
  // ---------------------------------------------------------------
  describe('错误处理 - fail（默认）', () => {
    it('步骤失败时流水线立即终止，success = false', async () => {
      const registry = makeMockRegistry({
        tool_ok: () => ({ success: true, data: {} }),
        tool_fail: () => ({ success: false, error: 'Something went wrong' }),
      });

      const pipeline = new ToolPipeline(registry);
      const definition: PipelineDefinition = {
        name: 'fail-test',
        steps: [
          { id: 'step1', tool: 'tool_ok', params: {} },
          { id: 'step2', tool: 'tool_fail', params: {}, onError: 'fail' },
          { id: 'step3', tool: 'tool_ok', params: {} },  // 不应执行
        ],
      };

      const result = await pipeline.execute(definition);

      expect(result.success).toBe(false);
      expect(result.error).toContain('step2');
      expect(result.steps).toHaveLength(2);  // step3 未执行
      expect(registry.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('错误处理 - skip', () => {
    it('onError=skip：失败步骤被跳过，后续步骤继续执行', async () => {
      const registry = makeMockRegistry({
        tool_ok: () => ({ success: true, data: { ok: true } }),
        tool_fail: () => ({ success: false, error: 'Transient error' }),
      });

      const pipeline = new ToolPipeline(registry);
      const definition: PipelineDefinition = {
        name: 'skip-test',
        steps: [
          { id: 'step1', tool: 'tool_ok', params: {} },
          { id: 'step2', tool: 'tool_fail', params: {}, onError: 'skip' },
          { id: 'step3', tool: 'tool_ok', params: {} },
        ],
      };

      const result = await pipeline.execute(definition);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(3);
      expect(result.steps[1].success).toBe(false);   // step2 失败
      expect(result.steps[2].success).toBe(true);    // step3 仍执行
      expect(registry.execute).toHaveBeenCalledTimes(3);
    });
  });

  describe('错误处理 - retry', () => {
    it('onError=retry：失败后自动重试直到成功', async () => {
      let callCount = 0;
      const registry = {
        execute: vi.fn(async (_name: string, _params: any) => {
          callCount++;
          if (callCount < 3) {
            return { success: false, error: 'Temporary failure' };
          }
          return { success: true, data: { done: true } };
        }),
      } as any;

      const pipeline = new ToolPipeline(registry);
      const definition: PipelineDefinition = {
        name: 'retry-test',
        steps: [
          // maxRetries=2: 最多 2 次重试（3 次总调用），延迟 200ms + 400ms = 600ms
          { id: 'step1', tool: 'tool_retry', params: {}, onError: 'retry', maxRetries: 2 },
        ],
      };

      const result = await pipeline.execute(definition);

      expect(result.success).toBe(true);
      expect(result.steps[0].retryCount).toBeGreaterThan(0);
      expect(registry.execute).toHaveBeenCalledTimes(3);
    }, 5000);  // 重试延迟约 600ms，5s 足够

    it('onError=retry：超过 maxRetries 后返回失败', async () => {
      const registry = makeMockRegistry({
        always_fail: () => ({ success: false, error: 'Always fails' }),
      });

      const pipeline = new ToolPipeline(registry);
      const definition: PipelineDefinition = {
        name: 'retry-exhaust',
        steps: [
          // maxRetries=1: 最多 1 次重试（2 次总调用），延迟 200ms
          { id: 'step1', tool: 'always_fail', params: {}, onError: 'retry', maxRetries: 1 },
        ],
      };

      const result = await pipeline.execute(definition);

      expect(result.success).toBe(false);
      // 总调用次数：1 次初始 + 1 次重试 = 2 次
      expect(registry.execute).toHaveBeenCalledTimes(2);
    }, 5000);
  });

  // ---------------------------------------------------------------
  // forEach fan-out
  // ---------------------------------------------------------------
  describe('forEach fan-out', () => {
    it('对数组每个元素并行执行，返回结果数组', async () => {
      const registry = makeMockRegistry({
        tool_process: (params: any) => ({
          success: true,
          data: { processed: params.item },
        }),
      });

      const pipeline = new ToolPipeline(registry);
      const definition: PipelineDefinition = {
        name: 'foreach-test',
        steps: [
          {
            id: 'step1',
            tool: 'tool_process',
            params: { item: '{{item}}' },
            forEach: '{{input.items}}',
          },
        ],
      };

      const result = await pipeline.execute(definition, { items: ['a', 'b', 'c'] });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.steps[0].output)).toBe(true);
      expect((result.steps[0].output as unknown[]).length).toBe(3);
      expect(registry.execute).toHaveBeenCalledTimes(3);
    });

    it('forEach 目标非数组时返回错误', async () => {
      const registry = makeMockRegistry({
        tool_a: () => ({ success: true, data: {} }),
      });

      const pipeline = new ToolPipeline(registry);
      const definition: PipelineDefinition = {
        name: 'foreach-invalid',
        steps: [
          {
            id: 'step1',
            tool: 'tool_a',
            params: {},
            forEach: '{{input.notAnArray}}',
          },
        ],
      };

      const result = await pipeline.execute(definition, { notAnArray: 'string' });

      expect(result.steps[0].success).toBe(false);
      expect(result.steps[0].error).toMatch(/数组/);
    });
  });

  // ---------------------------------------------------------------
  // 并行执行
  // ---------------------------------------------------------------
  describe('并行执行 executeParallel', () => {
    it('所有步骤并行执行，全部成功时返回 success = true', async () => {
      const callOrder: string[] = [];
      const registry = {
        execute: vi.fn(async (name: string, _params: any) => {
          callOrder.push(name);
          return { success: true, data: { tool: name } };
        }),
      } as any;

      const pipeline = new ToolPipeline(registry);
      const steps = [
        { id: 's1', tool: 'tool_1', params: {} },
        { id: 's2', tool: 'tool_2', params: {} },
        { id: 's3', tool: 'tool_3', params: {} },
      ];

      const result = await pipeline.executeParallel(steps);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(3);
      expect(registry.execute).toHaveBeenCalledTimes(3);
    });
  });

  // ---------------------------------------------------------------
  // 执行轨迹记录
  // ---------------------------------------------------------------
  describe('执行轨迹记录', () => {
    it('每步的 input/output/duration 均被记录', async () => {
      const registry = makeMockRegistry({
        tool_a: (params: any) => ({ success: true, data: { echo: params.msg } }),
      });

      const pipeline = new ToolPipeline(registry);
      const definition: PipelineDefinition = {
        name: 'trace-test',
        steps: [
          { id: 'step1', tool: 'tool_a', params: { msg: 'hello' } },
        ],
      };

      const result = await pipeline.execute(definition);

      expect(result.steps[0].input).toEqual({ msg: 'hello' });
      expect(result.steps[0].output).toBeDefined();
      expect(result.steps[0].duration).toBeGreaterThanOrEqual(0);
    });

    it('totalTime 大于等于 0', async () => {
      const registry = makeMockRegistry({
        tool_a: () => ({ success: true, data: {} }),
      });

      const pipeline = new ToolPipeline(registry);
      const result = await pipeline.execute({
        name: 'timing',
        steps: [{ id: 's1', tool: 'tool_a', params: {} }],
      });

      expect(result.totalTime).toBeGreaterThanOrEqual(0);
    });

    it('context 包含各步骤的输出', async () => {
      const registry = makeMockRegistry({
        tool_a: () => ({ success: true, data: { x: 1 } }),
        tool_b: () => ({ success: true, data: { y: 2 } }),
      });

      const pipeline = new ToolPipeline(registry);
      const result = await pipeline.execute({
        name: 'context-check',
        steps: [
          { id: 'step1', tool: 'tool_a', params: {} },
          { id: 'step2', tool: 'tool_b', params: {} },
        ],
      });

      expect(result.context).toHaveProperty('step1');
      expect(result.context).toHaveProperty('step2');
    });
  });

  // ---------------------------------------------------------------
  // 空流水线
  // ---------------------------------------------------------------
  describe('边界情况', () => {
    it('空步骤列表应返回 success = true，output = null', async () => {
      const registry = makeMockRegistry({});
      const pipeline = new ToolPipeline(registry);

      const result = await pipeline.execute({ name: 'empty', steps: [] });

      expect(result.success).toBe(true);
      expect(result.output).toBeNull();
      expect(result.steps).toHaveLength(0);
    });
  });
});
