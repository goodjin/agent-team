/**
 * ToolPipeline - 工具流水线编排器
 *
 * 将多个工具调用串联为有向流水线，支持：
 * - 步骤间数据传递（模板变量 {{stepId.field}}）
 * - 条件跳过（condition）
 * - forEach fan-out（并行处理数组）
 * - 错误处理策略（fail / skip / retry）
 */

import type { ToolRegistry } from './tool-registry.js';

// ============ 类型定义 ============

export interface PipelineStep {
  id: string;
  tool: string;                             // 工具名（对应 ToolRegistry 中的 name）
  params: Record<string, unknown>;          // 参数，支持模板变量 {{stepId.field}}
  forEach?: string;                         // fan-out：对数组每个元素执行，元素通过 {{item}} 引用
  condition?: string;                       // 简单条件表达式（字符串/布尔判断）
  onError?: 'skip' | 'retry' | 'fail';     // 默认 'fail'
  maxRetries?: number;                      // 仅 onError='retry' 有效，默认 3
}

export interface PipelineDefinition {
  name: string;
  description?: string;
  steps: PipelineStep[];
}

export interface StepExecuteResult {
  stepId: string;
  tool: string;
  skipped: boolean;
  input: unknown;
  output: unknown;
  success: boolean;
  error?: string;
  duration: number;
  retryCount?: number;
}

export interface PipelineExecuteResult {
  success: boolean;
  pipelineName: string;
  steps: StepExecuteResult[];
  output: unknown;        // 最后一步成功的输出
  totalTime: number;
  error?: string;
  context: Record<string, unknown>;  // 每步结果的累积上下文（方便调用方检查）
}

// ============ 内部执行上下文 ============

interface ExecutionContext {
  input: unknown;
  steps: Record<string, unknown>;  // key: stepId, value: step 输出
}

// ============ 模板变量解析 ============

/**
 * 将 ExecutionContext 展平为模板解析用的根对象
 * { input: ..., step1: ..., step2: ..., item: ... }
 */
function flattenContext(context: ExecutionContext): Record<string, unknown> {
  return { input: context.input, ...context.steps };
}

/**
 * 递归替换值中的 {{...}} 模板变量
 */
function resolveTemplate(value: unknown, context: ExecutionContext): unknown {
  const flat = flattenContext(context);
  if (typeof value === 'string') {
    // 整段是单个模板变量时，返回其原始值（而非字符串化）
    const exactMatch = value.match(/^\{\{([^}]+)\}\}$/);
    if (exactMatch) {
      return resolvePath(flat, exactMatch[1].trim());
    }
    // 否则进行字符串插值
    return value.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
      const resolved = resolvePath(flat, path.trim());
      return resolved !== undefined && resolved !== null ? String(resolved) : '';
    });
  }
  if (Array.isArray(value)) {
    return value.map(v => resolveTemplate(v, context));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = resolveTemplate(v, context);
    }
    return result;
  }
  return value;
}

/**
 * 按点路径取值，支持数组索引
 * 路径格式：input.field / stepId.results[0].url / stepId[*].content
 */
function resolvePath(obj: unknown, path: string): unknown {
  const root = obj as Record<string, unknown>;

  const parts = path.split('.');
  let current: unknown = root;

  for (const part of parts) {
    if (current === undefined || current === null) {
      return '';
    }

    // 处理 word[0] 或 word[*]
    const arrayMatch = part.match(/^(\w+)\[(\d+|\*)\]$/);
    if (arrayMatch) {
      const fieldName = arrayMatch[1];
      const indexStr = arrayMatch[2];
      const parent = (current as Record<string, unknown>)[fieldName];
      if (indexStr === '*') {
        current = parent;  // [*] 保留整个数组
      } else {
        current = Array.isArray(parent) ? parent[parseInt(indexStr, 10)] : undefined;
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current ?? '';
}

// ============ ToolPipeline 主类 ============

export class ToolPipeline {
  constructor(private registry: ToolRegistry) {}

  /**
   * 顺序执行流水线
   */
  async execute(
    definition: PipelineDefinition,
    input: unknown = {},
  ): Promise<PipelineExecuteResult> {
    const startTime = Date.now();
    const stepResults: StepExecuteResult[] = [];
    const context: ExecutionContext = { input, steps: {} };

    for (const step of definition.steps) {
      const stepResult = await this.executeStep(step, context);
      stepResults.push(stepResult);

      if (!stepResult.skipped && stepResult.success) {
        context.steps[step.id] = stepResult.output;
      }

      // 失败处理
      if (!stepResult.success && !stepResult.skipped) {
        const strategy = step.onError ?? 'fail';
        if (strategy === 'fail' || strategy === 'retry') {
          // 'fail'：直接终止
          // 'retry'：重试耗尽后同样终止（executeWithRetry 已经完成全部重试）
          return {
            success: false,
            pipelineName: definition.name,
            steps: stepResults,
            output: null,
            totalTime: Date.now() - startTime,
            error: `Step "${step.id}" failed: ${stepResult.error}`,
            context: context.steps,
          };
        }
        // 'skip' 策略：继续下一步
      }
    }

    const lastSuccessful = [...stepResults].reverse().find(r => r.success && !r.skipped);
    return {
      success: true,
      pipelineName: definition.name,
      steps: stepResults,
      output: lastSuccessful?.output ?? null,
      totalTime: Date.now() - startTime,
      context: context.steps,
    };
  }

  /**
   * 并行执行（无数据依赖的步骤同时运行）
   * 注意：并行模式下步骤间无法引用彼此的输出（模板变量只能引用 input）
   */
  async executeParallel(
    steps: PipelineStep[],
    input: unknown = {},
  ): Promise<PipelineExecuteResult> {
    const startTime = Date.now();
    const definition: PipelineDefinition = { name: 'parallel', steps };
    const context: ExecutionContext = { input, steps: {} };

    // 并行执行所有步骤
    const stepResults = await Promise.all(
      steps.map(step => this.executeStep(step, context)),
    );

    const allSuccess = stepResults.every(r => r.success || r.skipped);
    const lastSuccessful = [...stepResults].reverse().find(r => r.success && !r.skipped);

    // 构建结果 context
    const resultContext: Record<string, unknown> = {};
    for (const r of stepResults) {
      if (!r.skipped && r.success) {
        resultContext[r.stepId] = r.output;
      }
    }

    return {
      success: allSuccess,
      pipelineName: definition.name,
      steps: stepResults,
      output: lastSuccessful?.output ?? null,
      totalTime: Date.now() - startTime,
      context: resultContext,
    };
  }

  // ============ 私有方法 ============

  private async executeStep(
    step: PipelineStep,
    context: ExecutionContext,
  ): Promise<StepExecuteResult> {
    const startTime = Date.now();

    // 条件检查
    if (step.condition !== undefined) {
      const conditionMet = this.evaluateCondition(step.condition, context);
      if (!conditionMet) {
        return {
          stepId: step.id,
          tool: step.tool,
          skipped: true,
          input: null,
          output: null,
          success: true,
          duration: 0,
        };
      }
    }

    // forEach fan-out
    if (step.forEach !== undefined) {
      return this.executeForEach(step, context, startTime);
    }

    // 正常执行（含重试）
    const resolvedParams = resolveTemplate(step.params, context) as Record<string, unknown>;
    return this.executeWithRetry(step, resolvedParams, startTime);
  }

  private async executeForEach(
    step: PipelineStep,
    context: ExecutionContext,
    startTime: number,
  ): Promise<StepExecuteResult> {
    // 解析 forEach 引用的数组，支持 {{stepId.field}} 格式
    const forEachRef = step.forEach!.replace(/^\{\{|\}\}$/g, '').trim();
    const items = resolvePath(
      { input: context.input, ...context.steps },
      forEachRef,
    );

    if (!Array.isArray(items)) {
      return {
        stepId: step.id,
        tool: step.tool,
        skipped: false,
        input: items,
        output: [],
        success: false,
        error: `forEach 目标不是数组: ${step.forEach}（解析值类型: ${typeof items}）`,
        duration: Date.now() - startTime,
      };
    }

    // 并行对每个元素执行工具
    const results = await Promise.all(
      items.map(async (item: unknown) => {
        const itemContext: ExecutionContext = {
          input: context.input,
          steps: { ...context.steps, item },
        };
        const resolvedParams = resolveTemplate(step.params, itemContext) as Record<string, unknown>;
        const result = await this.registry.execute(step.tool, resolvedParams);
        return result.success ? (result.data ?? result) : { error: result.error };
      }),
    );

    return {
      stepId: step.id,
      tool: step.tool,
      skipped: false,
      input: items,
      output: results,
      success: true,
      duration: Date.now() - startTime,
    };
  }

  private async executeWithRetry(
    step: PipelineStep,
    params: Record<string, unknown>,
    startTime: number,
    retryCount = 0,
  ): Promise<StepExecuteResult> {
    const result = await this.registry.execute(step.tool, params);
    const success = result.success;

    if (!success && step.onError === 'retry' && retryCount < (step.maxRetries ?? 3)) {
      // 指数退避：200ms, 400ms, 600ms ...
      await new Promise(r => setTimeout(r, 200 * (retryCount + 1)));
      return this.executeWithRetry(step, params, startTime, retryCount + 1);
    }

    return {
      stepId: step.id,
      tool: step.tool,
      skipped: false,
      input: params,
      output: success ? (result.data ?? result) : null,
      success,
      error: result.error,
      duration: Date.now() - startTime,
      retryCount,
    };
  }

  /**
   * 条件判断
   * 支持：模板变量解析后的字符串/布尔值判断
   */
  private evaluateCondition(condition: string, context: ExecutionContext): boolean {
    const resolved = resolveTemplate(condition, context);
    if (resolved === true || resolved === 'true') return true;
    if (resolved === false || resolved === 'false' || resolved === '' || resolved === null || resolved === undefined) {
      return false;
    }
    return Boolean(resolved);
  }
}
