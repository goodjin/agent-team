# Task 04：SelfEvaluator - 任务自评估

**优先级**: P1
**预计工时**: 4h
**阶段**: Phase 2
**依赖**: Task 01（`src/types/plugin.ts`，`EvaluationReport` 等接口）

---

## 目标

实现任务完成后的自动多维度质量评估。在每次任务结束时，从三个维度（效率、质量、资源）自动评分，持久化评估数据，并分析历史趋势，在检测到下降时触发优化建议流程。

---

## 输入

- `docs/v9/01-requirements.md` §3.3（SelfEvaluator 需求）
- `docs/v9/02-architecture.md`（SelfEvaluator 设计）
- `src/knowledge/vector-store.ts`（v8 VectorStore 接口）
- `src/observability/` 或 `src/observability`（v7 TracingSystem、StructuredLogger）
- `src/core/events.ts`（v5 事件系统）

---

## 输出文件

| 文件 | 说明 |
|------|------|
| `src/evolution/evaluator.ts` | SelfEvaluator 主类 |
| `src/evolution/index.ts` | evolution 模块统一导出 |
| `tests/v9/self-evaluator.test.ts` | 单元测试 |

**运行时生成**：
- `.agent-memory/evaluations.jsonl` — 评估历史（JSONL 格式，追加写入）

---

## 实现步骤

### 步骤 1：定义评估相关类型

在 `src/types/plugin.ts` 补充（或新建 `src/types/evaluation.ts`）：

```typescript
interface TaskResult {
  taskId: string
  agentId: string
  status: 'completed' | 'failed'
  startTime: Date
  endTime: Date
  // 来自 v7 TracingSystem
  trace: {
    toolCallCount: number
    llmCallCount: number
    totalTokens: number
    spans: TraceSpan[]
  }
  // 任务输出（用于质量评分）
  output?: string
  // 任务描述（用于确定基准）
  taskDescription: string
}

interface EvaluationReport {
  taskId: string
  agentId: string
  timestamp: Date
  scores: {
    efficiency: number      // 1-10
    quality: number         // 1-10（失败任务固定为 0）
    resource: number        // 1-10
    composite: number       // 加权综合分
  }
  breakdown: {
    toolCallCount: number
    expectedToolCalls: number
    tokenUsed: number
    avgHistoricalTokens: number
    outputKeywordsMatched: string[]
  }
  suggestions?: OptimizationSuggestion[]
}

interface TrendData {
  agentId: string
  period: { start: Date; end: Date }
  dailyScores: Array<{ date: string; avgComposite: number; sampleCount: number }>
  trend: 'improving' | 'stable' | 'declining'
  decliningStreak: number   // 连续下降天数
}
```

### 步骤 2：实现 SelfEvaluator 主类

```typescript
class SelfEvaluator extends EventEmitter {
  // 本地评估历史缓存（按 agentId 分组）
  private cache = new Map<string, EvaluationReport[]>()
  // 历史 token 均值（按 agentId）
  private avgTokens = new Map<string, number>()

  constructor(
    private vectorStore: VectorStore,
    private logger: StructuredLogger,
    private memoryDir: string = '.agent-memory'
  ) {
    super()
    this.ensureMemoryDir()
  }

  // 核心评估方法：任务完成后调用
  async evaluate(taskResult: TaskResult): Promise<EvaluationReport>

  // 趋势分析
  async getTrend(agentId: string, days: number): Promise<TrendData>

  // 获取优化建议（连续低分维度）
  async getSuggestions(agentId: string): Promise<OptimizationSuggestion[]>

  // 注册事件监听（接入 AgentLoop）
  attachToAgentLoop(agentLoop: EventEmitter): void
}
```

### 步骤 3：实现三维度评分算法

```typescript
private scoreEfficiency(result: TaskResult): { score: number; breakdown: object } {
  const actual = result.trace.toolCallCount
  // 基准：根据任务描述长度粗估（简单启发式）
  const expected = Math.max(2, Math.ceil(result.taskDescription.length / 100))
  const overhead = Math.max(0, actual - expected)
  const score = Math.max(1, 10 - overhead * 1.5)
  return { score: Math.round(score * 10) / 10, breakdown: { actual, expected, overhead } }
}

private scoreQuality(result: TaskResult): { score: number; breakdown: object } {
  if (result.status === 'failed') return { score: 0, breakdown: { reason: 'task-failed' } }

  const output = result.output ?? ''
  // 关键词匹配：检测输出是否包含有意义的内容标志
  const positiveKeywords = ['完成', '成功', '已创建', '已更新', 'done', 'created', 'updated', 'success']
  const negativeKeywords = ['错误', '失败', 'error', 'failed', 'exception']
  const matched = positiveKeywords.filter(k => output.toLowerCase().includes(k))
  const negMatched = negativeKeywords.filter(k => output.toLowerCase().includes(k))

  let score = 5 + matched.length * 0.5 - negMatched.length * 2
  score = Math.max(1, Math.min(10, score))

  return { score: Math.round(score * 10) / 10, breakdown: { matched, negMatched } }
}

private scoreResource(result: TaskResult, agentId: string): { score: number; breakdown: object } {
  const actual = result.trace.totalTokens
  const avg = this.avgTokens.get(agentId) ?? actual  // 首次无历史，不扣分

  const ratio = actual / Math.max(1, avg)
  const score = Math.max(1, 10 - (ratio - 1) * 5)

  // 更新滚动均值（指数移动平均，α=0.1）
  const newAvg = avg === actual ? actual : avg * 0.9 + actual * 0.1
  this.avgTokens.set(agentId, newAvg)

  return {
    score: Math.round(score * 10) / 10,
    breakdown: { actual, avgHistoricalTokens: Math.round(avg), ratio: Math.round(ratio * 100) / 100 }
  }
}

// 综合分：效率 0.3 + 质量 0.5 + 资源 0.2
private composite(efficiency: number, quality: number, resource: number): number {
  return Math.round((efficiency * 0.3 + quality * 0.5 + resource * 0.2) * 10) / 10
}
```

### 步骤 4：持久化到 JSONL + VectorStore

```typescript
private async persist(report: EvaluationReport): Promise<void> {
  // 1. 追加到 JSONL 文件
  const jsonlPath = path.join(this.memoryDir, 'evaluations.jsonl')
  await fs.appendFile(jsonlPath, JSON.stringify(report) + '\n', 'utf-8')

  // 2. 存入 v8 VectorStore
  await this.vectorStore.upsert({
    id: `eval-${report.taskId}`,
    content: `任务 ${report.taskId} 评估结果: 综合分 ${report.scores.composite}`,
    metadata: {
      category: 'evaluation',
      agentId: report.agentId,
      timestamp: report.timestamp.toISOString(),
      scores: report.scores
    }
  })

  // 3. 更新内存缓存
  if (!this.cache.has(report.agentId)) {
    this.cache.set(report.agentId, [])
  }
  this.cache.get(report.agentId)!.push(report)
}
```

### 步骤 5：实现趋势分析和下降检测

```typescript
async getTrend(agentId: string, days: number): Promise<TrendData> {
  const reports = await this.loadReports(agentId, days)

  // 按天聚合平均分
  const byDay = new Map<string, number[]>()
  for (const r of reports) {
    const day = r.timestamp.toISOString().slice(0, 10)
    const arr = byDay.get(day) ?? []
    arr.push(r.scores.composite)
    byDay.set(day, arr)
  }

  const dailyScores = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, scores]) => ({
      date,
      avgComposite: scores.reduce((s, v) => s + v, 0) / scores.length,
      sampleCount: scores.length
    }))

  // 检测连续下降（连续 3 天，每天下降超 10%）
  let decliningStreak = 0
  for (let i = dailyScores.length - 1; i >= 1; i--) {
    const drop = (dailyScores[i-1].avgComposite - dailyScores[i].avgComposite) / dailyScores[i-1].avgComposite
    if (drop > 0.1) {
      decliningStreak++
    } else {
      break
    }
  }

  const trend = decliningStreak >= 3 ? 'declining' : decliningStreak > 0 ? 'stable' : 'improving'

  if (trend === 'declining') {
    this.emit('evaluation:declining', { agentId, decliningStreak, latestScore: dailyScores.at(-1) })
  }

  return { agentId, period: { ... }, dailyScores, trend, decliningStreak }
}
```

### 步骤 6：实现优化建议生成

```typescript
async getSuggestions(agentId: string): Promise<OptimizationSuggestion[]> {
  const recent = (this.cache.get(agentId) ?? []).slice(-10)
  const suggestions: OptimizationSuggestion[] = []

  // 检查连续 3 次低于 5 分的维度
  const dims: Array<'efficiency' | 'quality' | 'resource'> = ['efficiency', 'quality', 'resource']
  for (const dim of dims) {
    const last3 = recent.slice(-3).map(r => r.scores[dim])
    if (last3.length === 3 && last3.every(s => s < 5)) {
      suggestions.push(this.buildSuggestion(dim, last3))
    }
  }

  return suggestions
}

private buildSuggestion(dim: string, scores: number[]): OptimizationSuggestion {
  const avgScore = scores.reduce((s, v) => s + v, 0) / scores.length
  const severity = avgScore < 3 ? 'critical' : 'warning'

  const actionsByDim = {
    efficiency: ['减少工具调用步骤（合并相似查询）', '避免重复验证步骤', '使用批量工具调用代替循环单次调用'],
    quality: ['细化任务拆分，确保每个子任务有明确输出', '增加输出验证步骤', '在提示词中明确期望输出格式'],
    resource: ['压缩 prompt 长度（删除冗余说明）', '减少对话轮次', '避免在 context 中携带大量历史数据']
  }

  return {
    dimension: dim as any,
    severity,
    message: `${dim} 维度连续 3 次评分低于 5（均值 ${avgScore.toFixed(1)}），建议优化`,
    actionable: actionsByDim[dim as keyof typeof actionsByDim]
  }
}
```

### 步骤 7：接入 AgentLoop 事件

```typescript
attachToAgentLoop(agentLoop: EventEmitter): void {
  agentLoop.on('task:completed', async (taskResult: TaskResult) => {
    try {
      const report = await this.evaluate(taskResult)
      this.logger.info('self-evaluator', `任务 ${taskResult.taskId} 评估完成: 综合分 ${report.scores.composite}`)
    } catch (err) {
      this.logger.error('self-evaluator', '评估过程失败', { error: String(err) })
    }
  })

  agentLoop.on('task:failed', async (taskResult: TaskResult) => {
    try {
      await this.evaluate({ ...taskResult, status: 'failed' })
    } catch (err) {
      this.logger.error('self-evaluator', '评估过程失败（任务失败情形）', { error: String(err) })
    }
  })
}
```

### 步骤 8：编写单元测试（`tests/v9/self-evaluator.test.ts`）

测试覆盖：
- 任务完成后 3 秒内生成评估报告
- 三维度分数计算正确（正常完成 vs 失败任务）
- 失败任务质量分固定为 0，其他维度正常评估
- 评估结果写入 JSONL 文件
- 评估结果存入 VectorStore（category: `evaluation`）
- `getTrend` 返回按天聚合的评分数据
- 连续 3 天下降 > 10%：触发 `evaluation:declining` 事件
- 单维度连续 3 次低于 5：生成对应优化建议
- 优化建议包含具体可操作内容

---

## 验收标准

- [ ] 任务完成后 3 秒内生成评估报告
- [ ] 评估报告包含三个维度分数及其计算依据
- [ ] 评估结果自动存入 v8 `VectorStore`（category: `evaluation`）
- [ ] 评估结果追加到 `.agent-memory/evaluations.jsonl`（重启后保留）
- [ ] 任务失败时，质量分自动为 0，其他维度正常评估
- [ ] 执行 10 次任务后，`getTrend` 返回有意义的趋势数据
- [ ] 连续下降检测逻辑与评估结果数据一致
- [ ] 趋势数据可按 Agent 维度独立查询
- [ ] 效率分连续 3 次低于 5 时，生成效率优化建议（包含具体调整方向）
- [ ] 优化建议记录到可观测性日志
- [ ] 单元测试覆盖率 >= 80%

---

## 技术注意事项

1. **质量评分启发式**：当前实现使用关键词匹配，v9.1 可以接入 LLM 进行语义质量评估
2. **JSONL 文件并发**：多个 Agent 同时评估时可能出现写入竞争，可使用队列或文件锁（v9.0 简单追加，接受偶发并发风险）
3. **趋势分析冷启动**：历史数据不足时（< 3 天）`getTrend` 返回 `stable`，不触发下降事件
4. **VectorStore 接口**：需查看 `src/knowledge/vector-store.ts` 确认 `upsert` 方法的实际签名
