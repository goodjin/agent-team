# Task 06：ToolPipeline - 工具流水线

**优先级**: P1
**预估工时**: 4h
**依赖**: Task 01、Task 02、Task 03（ToolRegistry + WebSearchTool + WebFetchTool）
**状态**: 待开发

---

## 目标

实现 ToolPipeline，将多个工具组合为有向流水线，支持步骤间数据传递（模板变量）、条件分支、forEach fan-out 和错误处理策略。

---

## 输入

- 架构文档：`docs/v6/02-architecture.md`（ToolPipeline 章节）
- PRD：`docs/v6/01-requirements.md`（3.2.3 节）
- Task 01 产出：`src/tools/tool-registry.ts`（ToolRegistry 实例）
- Task 02、03 产出：WebSearchTool、WebFetchTool（用于集成验证）

---

## 输出

**新增文件**：
- `src/tools/tool-pipeline.ts` - ToolPipeline 类
- `tests/tools/tool-pipeline.test.ts` - 单元测试

---

## 实现步骤

### Step 1：接口与类型定义（0.5h）

在 `src/tools/tool-pipeline.ts` 顶部定义：

```typescript
export interface PipelineStep {
  id: string;
  tool: string;                       // 工具名称（对应 ToolRegistry 中的 name）
  params: Record<string, any>;        // 参数，支持模板变量 {{stepId.field}}
  forEach?: string;                   // fan-out：对数组每个元素执行，元素通过 {{item}} 引用
  condition?: string;                 // 简单条件表达式（仅支持比较和布尔运算）
  onError?: 'skip' | 'retry' | 'fail'; // 默认 'fail'
  maxRetries?: number;                // 仅 onError = 'retry' 有效，默认 3
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
  input: any;
  output: any;
  success: boolean;
  error?: string;
  duration: number;
  retryCount?: number;
}

export interface PipelineExecuteResult {
  success: boolean;
  pipelineName: string;
  steps: StepExecuteResult[];
  output: any;           // 最后一步成功的输出
  totalTime: number;
  error?: string;
}
```

### Step 2：模板变量解析器（1h）

实现模板变量解析逻辑，替换参数中的 `{{...}}` 占位符：

```typescript
interface ExecutionContext {
  input: any;             // Pipeline 的初始输入
  steps: Record<string, any>;  // 各步骤的输出，key 为 stepId
}

function resolveTemplate(value: any, context: ExecutionContext): any {
  if (typeof value === 'string') {
    // 替换 {{input.field}}
    return value.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      return resolvePath(context, path.trim());
    });
  }
  if (Array.isArray(value)) {
    return value.map(v => resolveTemplate(v, context));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = resolveTemplate(v, context);
    }
    return result;
  }
  return value;
}

function resolvePath(obj: any, path: string): any {
  // 支持 "input.field"、"stepId.results[0].url"、"stepId[*].content"
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return '';
    // 处理数组索引 [0] 或 [*]（[*] 返回整个数组）
    const arrayMatch = part.match(/^(\w+)\[(\d+|\*)\]$/);
    if (arrayMatch) {
      current = current[arrayMatch[1]];
      if (arrayMatch[2] === '*') {
        // [*] 展开为数组
      } else {
        current = current?.[parseInt(arrayMatch[2])];
      }
    } else {
      current = current[part];
    }
  }
  return current ?? '';
}
```

### Step 3：ToolPipeline 主类（1.5h）

```typescript
export class ToolPipeline {
  constructor(private registry: ToolRegistry) {}

  async execute(
    definition: PipelineDefinition,
    input: any = {}
  ): Promise<PipelineExecuteResult> {
    const startTime = Date.now();
    const stepResults: StepExecuteResult[] = [];
    const context: ExecutionContext = { input, steps: {} };

    for (const step of definition.steps) {
      const stepResult = await this.executeStep(step, context);
      stepResults.push(stepResult);

      if (!stepResult.skipped) {
        context.steps[step.id] = stepResult.output;
      }

      // 失败处理
      if (!stepResult.success && !stepResult.skipped) {
        const strategy = step.onError ?? 'fail';
        if (strategy === 'fail') {
          return {
            success: false,
            pipelineName: definition.name,
            steps: stepResults,
            output: null,
            totalTime: Date.now() - startTime,
            error: `Step "${step.id}" failed: ${stepResult.error}`,
          };
        }
        // 'skip' 策略：继续下一步
      }
    }

    const lastSuccessful = [...stepResults].reverse().find(r => r.success);
    return {
      success: true,
      pipelineName: definition.name,
      steps: stepResults,
      output: lastSuccessful?.output ?? null,
      totalTime: Date.now() - startTime,
    };
  }

  private async executeStep(
    step: PipelineStep,
    context: ExecutionContext
  ): Promise<StepExecuteResult> {
    const startTime = Date.now();

    // 条件检查
    if (step.condition) {
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
    if (step.forEach) {
      return this.executeForEach(step, context, startTime);
    }

    // 正常执行
    const resolvedParams = resolveTemplate(step.params, context);
    return this.executeWithRetry(step, resolvedParams, startTime);
  }

  private async executeForEach(
    step: PipelineStep,
    context: ExecutionContext,
    startTime: number
  ): Promise<StepExecuteResult> {
    const items = resolvePath(
      { input: context.input, ...context.steps },
      step.forEach!.replace(/^\{\{|\}\}$/g, '')
    );

    if (!Array.isArray(items)) {
      return {
        stepId: step.id,
        tool: step.tool,
        skipped: false,
        input: items,
        output: [],
        success: false,
        error: `forEach target is not an array: ${step.forEach}`,
        duration: Date.now() - startTime,
      };
    }

    // 并行执行
    const results = await Promise.all(
      items.map(async (item) => {
        const itemContext = { ...context, steps: { ...context.steps, item } };
        const resolvedParams = resolveTemplate(step.params, itemContext);
        const result = await this.registry.execute(step.tool, resolvedParams);
        return result.data ?? result;
      })
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
    params: any,
    startTime: number,
    retryCount = 0
  ): Promise<StepExecuteResult> {
    const result = await this.registry.execute(step.tool, params);
    const success = result.success;

    if (!success && step.onError === 'retry' && retryCount < (step.maxRetries ?? 3)) {
      await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));  // 指数退避
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

  private evaluateCondition(condition: string, context: ExecutionContext): boolean {
    // 简单实现：仅支持检查步骤输出是否存在
    const resolved = resolveTemplate(condition, context);
    if (resolved === 'true' || resolved === true) return true;
    if (resolved === 'false' || resolved === false || resolved === '') return false;
    return Boolean(resolved);
  }
}
```

### Step 4：单元测试（1h）

在 `tests/tools/tool-pipeline.test.ts` 覆盖：
- 两步顺序流水线：step2 能读取 step1 的输出
- 模板变量解析：`{{step1.results[0].url}}` 正确解析
- forEach fan-out：对 3 个 URL 并行执行，返回长度为 3 的数组
- 条件跳过：condition 为 false 时步骤被跳过
- 错误处理 skip：step2 失败时跳过继续执行 step3
- 错误处理 retry：step 失败后自动重试
- 错误处理 fail：步骤失败时流水线终止并返回错误

---

## 验收标准

- [ ] 两步顺序 Pipeline 能正确传递数据（step2 参数中引用 step1 的输出）
- [ ] `forEach` 对数组每个元素并行执行工具，返回结果数组
- [ ] 步骤失败时 `onError: 'skip'` 正确跳过继续执行
- [ ] 步骤失败时 `onError: 'retry'` 自动重试（最多 maxRetries 次）
- [ ] 步骤失败时 `onError: 'fail'`（默认）停止执行并返回错误
- [ ] 执行轨迹记录完整（每步的 input、output、duration）
- [ ] 条件为 false 的步骤被跳过，skipped = true
- [ ] 单元测试覆盖率 > 80%

---

## 注意事项

- 模板变量解析仅处理字符串类型的参数值，非字符串类型原样传递
- `{{item}}` 是 forEach 的特殊变量，引用当前迭代的元素
- forEach 步骤的输出是数组，后续步骤可通过 `{{stepId[*].field}}` 引用所有元素的字段
- 条件表达式当前版本只支持简单的字符串/布尔判断，不支持复杂表达式（v7 可引入 JSONPath 或简单表达式引擎）
