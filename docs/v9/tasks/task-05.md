# Task 05：PromptOptimizer - 提示词优化

**优先级**: P1
**预计工时**: 5h
**阶段**: Phase 2
**依赖**: Task 04（SelfEvaluator，`evaluation:declining` 事件和评估数据）

---

## 目标

实现基于历史评估数据的 Prompt 自动优化器。订阅评分下降事件，生成优化变体，通过 A/B 测试框架验证效果，在统计显著时推荐采纳最优版本（人工确认后生效）。

---

## 输入

- `docs/v9/01-requirements.md` §3.4（PromptOptimizer 需求）
- `docs/v9/02-architecture.md`（PromptOptimizer 设计，架构决策 4）
- `src/knowledge/project-kb.ts`（v8 ProjectKnowledgeBase 接口）
- `src/knowledge/vector-store.ts`（v8 VectorStore，检索高分历史任务）
- `src/evolution/evaluator.ts`（Task 04 输出，订阅 `evaluation:declining` 事件）

---

## 输出文件

| 文件 | 说明 |
|------|------|
| `src/evolution/prompt-optimizer.ts` | PromptOptimizer 主类 |
| `tests/v9/prompt-optimizer.test.ts` | 单元测试 |

---

## 实现步骤

### 步骤 1：定义 Prompt 版本相关类型

在 `src/types/plugin.ts` 或新建 `src/types/prompt.ts`：

```typescript
interface PromptVersion {
  versionId: string             // UUID
  agentId: string
  versionNumber: number         // 单调递增，从 1 开始
  content: string               // Prompt 完整内容
  createdAt: Date
  source: 'manual' | 'auto-optimized'
  strategy?: 'simplify' | 'reinforce' | 'few-shot'
  parentVersionId?: string      // 来源版本
  isActive: boolean             // 是否为当前生效版本
  isArchived: boolean           // 采纳新版本后旧版本进入存档
}

interface PromptVariant {
  variantId: string             // UUID
  baseVersionId: string
  strategy: 'simplify' | 'reinforce' | 'few-shot'
  content: string
  createdAt: Date
  rationale: string             // 选择此策略的原因（记录到日志）
}

interface ABTestSample {
  taskId: string
  versionId: string             // 使用的 Prompt 版本
  compositeScore: number        // SelfEvaluator 综合分
  timestamp: Date
}

interface ABTestSession {
  sessionId: string
  agentId: string
  controlVersionId: string      // A 组（当前版本）
  variantVersionId: string      // B 组（优化变体）
  trafficSplit: { a: number; b: number }  // { a: 0.6, b: 0.4 }
  samples: ABTestSample[]
  status: 'collecting' | 'completed' | 'insufficient'
  minSamples: number            // 默认 20
  result?: ABTestResult
}

interface ABTestResult {
  pValue: number
  effectSize: number            // Cohen's d
  winner: 'a' | 'b' | 'no-difference'
  conclusion: string            // 人类可读的统计结论
}
```

### 步骤 2：实现 PromptOptimizer 主类

```typescript
class PromptOptimizer extends EventEmitter {
  // 活跃的 A/B 测试会话（按 agentId）
  private activeSessions = new Map<string, ABTestSession>()
  // 任务分配计数器（决定用 A/B 哪个版本）
  private taskCounters = new Map<string, number>()

  constructor(
    private knowledgeBase: ProjectKnowledgeBase,
    private vectorStore: VectorStore,
    private logger: StructuredLogger
  ) {
    super()
  }

  // Prompt 版本管理
  async getVersionHistory(agentId: string): Promise<PromptVersion[]>
  async getCurrentVersion(agentId: string): Promise<PromptVersion | undefined>
  async saveVersion(version: Omit<PromptVersion, 'versionId' | 'versionNumber' | 'createdAt'>): Promise<PromptVersion>
  async adoptVersion(agentId: string, versionId: string): Promise<void>

  // 变体生成
  async generateVariants(agentId: string, reason: DecliningReason): Promise<PromptVariant[]>

  // A/B 测试
  async startABTest(agentId: string, variantId: string): Promise<ABTestSession>
  recordABSample(agentId: string, taskId: string, score: number): void
  async analyzeABTest(agentId: string): Promise<ABTestResult | null>

  // 任务分配：决定该任务使用哪个 Prompt 版本
  selectPromptForTask(agentId: string, taskId: string): string

  // 订阅 SelfEvaluator 事件
  attachToEvaluator(evaluator: SelfEvaluator): void
}
```

### 步骤 3：实现 Prompt 版本存储（v8 ProjectKnowledgeBase）

```typescript
async saveVersion(partialVersion: object): Promise<PromptVersion> {
  const history = await this.getVersionHistory(partialVersion.agentId)

  // 版本数限制：最多 20 个版本
  if (history.length >= 20) {
    // 淘汰最旧的存档版本
    const archived = history.filter(v => v.isArchived)
    if (archived.length > 0) {
      await this.knowledgeBase.delete(`prompt-version:${archived[0].versionId}`)
    }
  }

  const version: PromptVersion = {
    ...partialVersion,
    versionId: crypto.randomUUID(),
    versionNumber: (history.at(-1)?.versionNumber ?? 0) + 1,
    createdAt: new Date(),
    isActive: false,
    isArchived: false
  } as PromptVersion

  await this.knowledgeBase.set(
    `prompt-version:${version.versionId}`,
    JSON.stringify(version),
    { category: 'prompt-version', agentId: version.agentId }
  )

  return version
}

async getVersionHistory(agentId: string): Promise<PromptVersion[]> {
  const entries = await this.knowledgeBase.query({
    category: 'prompt-version',
    filter: { agentId }
  })
  return entries
    .map(e => JSON.parse(e.content) as PromptVersion)
    .sort((a, b) => a.versionNumber - b.versionNumber)
}
```

### 步骤 4：实现三种优化策略

```typescript
// 策略 1：精简（删除冗余，减少长度 10-20%）
private applySimplify(prompt: string): string {
  return prompt
    // 删除连续空行（保留最多一个空行）
    .replace(/\n{3,}/g, '\n\n')
    // 删除行尾空格
    .replace(/ +$/gm, '')
    // 删除重复的注意事项（相似度高的相邻段落）
    .replace(/注意[：:].+\n注意[：:].+/g, match => match.split('\n')[0])
    // 删除冗余的"请"字开头的重复说明
    .replace(/(请.{5,50})\n\1/g, '$1')
    .trim()
}

// 策略 2：强化约束（在低分维度对应位置增加显式约束）
private applyReinforce(prompt: string, lowDimensions: string[]): string {
  const constraints: Record<string, string> = {
    efficiency: '\n\n**效率约束**：每个步骤必须直接推进任务目标，避免重复验证和冗余工具调用。',
    quality: '\n\n**质量约束**：输出必须明确说明完成了什么、产生了什么结果，使用结构化格式。',
    resource: '\n\n**资源约束**：保持回复简洁，只包含必要信息，避免不必要的背景描述。'
  }

  let result = prompt
  for (const dim of lowDimensions) {
    if (constraints[dim]) {
      result += constraints[dim]
    }
  }
  return result
}

// 策略 3：示例注入（从 VectorStore 检索高分任务注入 few-shot）
private async applyFewShot(prompt: string, agentId: string): Promise<string> {
  // 从 VectorStore 检索该 Agent 最近评分 >= 8 的任务
  const highScoreTasks = await this.vectorStore.search({
    query: `agent ${agentId} high quality task evaluation`,
    filter: { category: 'evaluation', agentId, 'scores.composite': { $gte: 8 } },
    limit: 2
  })

  if (highScoreTasks.length === 0) return prompt  // 无历史高分，跳过

  const examples = highScoreTasks.map((task, i) =>
    `**示例 ${i + 1}**：${task.metadata.taskDescription ?? '高质量任务执行'}`
  ).join('\n')

  return prompt + `\n\n**成功案例参考**：\n${examples}`
}
```

### 步骤 5：实现 A/B 测试框架

```typescript
selectPromptForTask(agentId: string, taskId: string): string {
  const session = this.activeSessions.get(agentId)
  if (!session || session.status !== 'collecting') {
    // 无 A/B 测试，使用当前活跃版本
    return this.getCurrentVersionSync(agentId)
  }

  // 60/40 分流：每 10 次任务中，前 6 次用 A，后 4 次用 B
  const count = (this.taskCounters.get(agentId) ?? 0) + 1
  this.taskCounters.set(agentId, count)
  const slot = count % 10

  return slot < 6 ? session.controlVersionId : session.variantVersionId
}

// Welch t-test 实现（不引入外部统计库）
private welchTTest(a: number[], b: number[]): { tStat: number; pValue: number; effectSize: number } {
  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length
  const variance = (arr: number[], m: number) => arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1)

  const meanA = mean(a), meanB = mean(b)
  const varA = variance(a, meanA), varB = variance(b, meanB)
  const nA = a.length, nB = b.length

  const se = Math.sqrt(varA / nA + varB / nB)
  const tStat = (meanB - meanA) / se

  // 自由度（Welch-Satterthwaite 方程近似）
  const df = (varA / nA + varB / nB) ** 2 /
    ((varA / nA) ** 2 / (nA - 1) + (varB / nB) ** 2 / (nB - 1))

  // p-value 近似（使用 t 分布 CDF 近似，适合 df > 5）
  const pValue = this.approximatePValue(Math.abs(tStat), df)

  // Cohen's d 效果量
  const pooledStd = Math.sqrt((varA * (nA - 1) + varB * (nB - 1)) / (nA + nB - 2))
  const effectSize = Math.abs(meanB - meanA) / pooledStd

  return { tStat, pValue, effectSize }
}
```

### 步骤 6：采纳新版本（人工确认门控）

```typescript
async adoptVersion(agentId: string, versionId: string): Promise<void> {
  const history = await this.getVersionHistory(agentId)
  const target = history.find(v => v.versionId === versionId)
  if (!target) throw new Error(`版本 ${versionId} 不存在`)

  // 归档当前活跃版本
  const current = history.find(v => v.isActive)
  if (current) {
    current.isActive = false
    current.isArchived = true
    await this.knowledgeBase.set(`prompt-version:${current.versionId}`, JSON.stringify(current), {})
  }

  // 激活新版本
  target.isActive = true
  await this.knowledgeBase.set(`prompt-version:${target.versionId}`, JSON.stringify(target), {})

  // 结束 A/B 测试会话
  this.activeSessions.delete(agentId)

  this.logger.info('prompt-optimizer', `Agent ${agentId} Prompt 版本已更新: ${versionId}`)
  this.emit('prompt:version-adopted', { agentId, versionId })
}
```

### 步骤 7：接入 SelfEvaluator

```typescript
attachToEvaluator(evaluator: SelfEvaluator): void {
  // 订阅下降事件，10 秒内生成变体
  evaluator.on('evaluation:declining', async ({ agentId, decliningStreak }) => {
    this.logger.info('prompt-optimizer', `检测到 Agent ${agentId} 评分下降，开始生成优化变体`)

    setTimeout(async () => {
      try {
        const variants = await this.generateVariants(agentId, { reason: 'declining', decliningStreak })
        this.logger.info('prompt-optimizer', `生成 ${variants.length} 个优化变体`, {
          agentId, strategies: variants.map(v => v.strategy)
        })

        if (variants.length > 0) {
          await this.startABTest(agentId, variants[0].variantId)
        }
      } catch (err) {
        this.logger.error('prompt-optimizer', '变体生成失败', { error: String(err) })
      }
    }, 0)  // 异步执行，不阻塞事件处理
  })
}
```

### 步骤 8：编写单元测试（`tests/v9/prompt-optimizer.test.ts`）

测试覆盖：
- `getVersionHistory` 返回按版本号排序的历史列表
- 版本历史上限 20 个版本（第 21 个加入时淘汰最旧存档版本）
- 收到 `evaluation:declining` 事件 10 秒内生成变体
- 生成变体与原 prompt 有实质性差异
- 变体生成日志记录选择的策略和原因
- A/B 测试流量分配：60/40（10 次中 6 次 A、4 次 B）
- 样本数 < 20 时不做统计结论
- Welch t-test：p < 0.05 且 B 更优时触发 `prompt:improvement-ready`
- `adoptVersion` 归档旧版本，激活新版本
- 采纳新版本后旧版本仍在历史中（未删除）

---

## 验收标准

- [ ] `getVersionHistory(agentId)` 返回版本列表
- [ ] 每次 Prompt 变更自动创建新版本，版本号单调递增
- [ ] 版本历史最多保留 20 个版本
- [ ] 收到 `evaluation:declining` 事件后 10 秒内生成变体
- [ ] 生成的变体与原 prompt 有实质性差异（非空格变化）
- [ ] 变体生成过程记录到日志（选用了哪种策略，为什么）
- [ ] A/B 测试流量分配比例误差 <= 5%（统计意义上）
- [ ] 每个任务的 Prompt 版本与评估结果正确关联
- [ ] 样本数 < 20 时，不做统计结论，继续收集数据
- [ ] 统计检验结果（p-value、效果大小）记录在推荐报告中
- [ ] `adoptVersion` 需人工调用确认，不自动替换
- [ ] 采纳新版本后，旧版本进入历史存档（不删除）
- [ ] 单元测试覆盖率 >= 80%

---

## 技术注意事项

1. **Welch t-test p-value 近似**：需要实现 t 分布 CDF 近似。可使用 Abramowitz and Stegun 近似公式，或简化为：df >= 30 时用正态分布近似（p ≈ 2 * (1 - Φ(|t|))）
2. **A/B 测试计数器**：`taskCounters` 基于内存，重启后重置。v9.0 可接受，v9.1 可考虑持久化
3. **策略选择优先级**：当多个维度低分时，优先使用"强化约束"策略（针对性最强）；历史数据充足时考虑 few-shot 策略
4. **ProjectKnowledgeBase 接口**：需查看 `src/knowledge/project-kb.ts` 确认 `set`/`query`/`delete` 的实际签名
