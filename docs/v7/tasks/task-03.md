# Task 03：MetricsCollector（指标采集系统）

**优先级**: P0
**预估工时**: 4h
**依赖**: 无（独立模块）
**阶段**: Phase 1

---

## 目标

实现纯内存的指标采集系统，支持 Counter / Gauge / Histogram 三种指标类型，滑动时间窗口统计，以及定期持久化到 JSONL 文件。单次采集操作开销 < 0.1ms。

---

## 输入文件

- `docs/v7/01-requirements.md` - 第 3.2.2 节（MetricsCollector 需求）
- `docs/v7/02-architecture.md` - MetricsCollector 架构设计

---

## 输出文件

| 文件 | 说明 |
|------|------|
| `src/observability/metrics.ts` | MetricsCollector 主体实现 |
| `tests/observability/metrics.test.ts` | 单元测试 |

---

## 实现步骤

### 步骤 1：数据结构设计

```typescript
// 原始数据点（内存存储）
interface DataPoint {
  value: number;
  timestamp: number;  // Date.now()，比 ISO string 更快
  labels: string;     // JSON.stringify(labels)，作为 Map key
}

// 指标桶：按 name+labels 分组
interface MetricBucket {
  name: string;
  labels: Record<string, string>;
  points: DataPoint[];    // 最近 2 小时的原始数据点
  // Counter 类型额外维护累计值
  total?: number;
}

export interface MetricSummary {
  name: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50?: number;
  p95?: number;
  p99?: number;
  labels?: Record<string, string>;
  windowStart: string;
  windowEnd: string;
}
```

### 步骤 2：实现 MetricsCollector `src/observability/metrics.ts`

```typescript
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export class MetricsCollector {
  private static instance: MetricsCollector;
  private buckets = new Map<string, MetricBucket>(); // key: `${name}|${labelsJson}`
  private counters = new Map<string, number>();       // 累计计数器
  private gauges = new Map<string, number>();         // 当前值
  private persistTimer: NodeJS.Timeout | null = null;
  private readonly metricsDir: string;
  private startTime = Date.now();

  private constructor(metricsDir = 'workspace/metrics') {
    this.metricsDir = metricsDir;
    mkdirSync(metricsDir, { recursive: true });
    this.schedulePersist();
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  // 计数器：累加
  increment(name: string, labels?: Record<string, string>, value = 1): void {
    const key = this.makeKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
    this.addPoint(name, value, labels);
  }

  // 仪表盘：直接设置当前值
  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
    this.addPoint(name, value, labels);
  }

  // 直方图：记录分布
  histogram(name: string, value: number, labels?: Record<string, string>): void {
    this.addPoint(name, value, labels);
  }

  // 计时（直方图的特例）
  timing(name: string, durationMs: number, labels?: Record<string, string>): void {
    this.histogram(name, durationMs, labels);
  }

  getSummary(name: string, windowMinutes = 60, labels?: Record<string, string>): MetricSummary {
    const key = this.makeKey(name, labels);
    const bucket = this.buckets.get(key);
    const windowMs = windowMinutes * 60 * 1000;
    const now = Date.now();
    const windowStart = now - windowMs;

    const points = bucket
      ? bucket.points.filter(p => p.timestamp >= windowStart).map(p => p.value)
      : [];

    return this.calcSummary(name, points, labels, windowStart, now);
  }

  getSnapshot(): Record<string, MetricSummary> {
    const result: Record<string, MetricSummary> = {};
    for (const [key, bucket] of this.buckets) {
      const summary = this.getSummary(bucket.name, 60, bucket.labels);
      result[key] = summary;
    }
    return result;
  }

  exportPrometheus(): string {
    const lines: string[] = [];
    for (const [key, bucket] of this.buckets) {
      const labelStr = Object.entries(bucket.labels || {})
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      const latest = bucket.points[bucket.points.length - 1];
      if (latest) {
        lines.push(`# TYPE ${bucket.name} gauge`);
        lines.push(`${bucket.name}{${labelStr}} ${latest.value}`);
      }
    }
    return lines.join('\n');
  }

  private addPoint(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { name, labels: labels ?? {}, points: [] };
      this.buckets.set(key, bucket);
    }

    const now = Date.now();
    bucket.points.push({ value, timestamp: now, labels: JSON.stringify(labels) });

    // 淘汰 2 小时前的数据
    const cutoff = now - TWO_HOURS_MS;
    if (bucket.points.length > 1000) {
      bucket.points = bucket.points.filter(p => p.timestamp > cutoff);
    }
  }

  private calcSummary(
    name: string,
    values: number[],
    labels?: Record<string, string>,
    windowStart = 0,
    windowEnd = Date.now()
  ): MetricSummary {
    if (values.length === 0) {
      return { name, count: 0, sum: 0, min: 0, max: 0, avg: 0, labels,
               windowStart: new Date(windowStart).toISOString(),
               windowEnd: new Date(windowEnd).toISOString() };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      name,
      count: sorted.length,
      sum,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
      labels,
      windowStart: new Date(windowStart).toISOString(),
      windowEnd: new Date(windowEnd).toISOString(),
    };
  }

  private percentile(sorted: number[], p: number): number {
    const idx = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, idx)];
  }

  private makeKey(name: string, labels?: Record<string, string>): string {
    return labels && Object.keys(labels).length > 0
      ? `${name}|${JSON.stringify(labels)}`
      : name;
  }

  private persist(): void {
    try {
      const snapshot = {
        snapshotTime: new Date().toISOString(),
        metrics: Object.fromEntries(
          Object.entries(this.getSnapshot()).map(([k, v]) => [k, v])
        ),
      };
      const date = new Date().toISOString().slice(0, 10);
      const filePath = join(this.metricsDir, `metrics-${date}.jsonl`);
      appendFileSync(filePath, JSON.stringify(snapshot) + '\n');
    } catch { /* 持久化失败不影响主流程 */ }
  }

  private schedulePersist(): void {
    this.persistTimer = setInterval(() => this.persist(), 60_000); // 每分钟
    this.persistTimer.unref();
  }
}
```

### 步骤 3：预定义系统指标收集

系统启动时，定期采集基础系统指标：

```typescript
// 在 metrics.ts 中添加系统指标收集
export function startSystemMetrics(metrics: MetricsCollector): void {
  setInterval(() => {
    const mem = process.memoryUsage();
    metrics.gauge('system.memory_mb', Math.round(mem.heapUsed / 1024 / 1024));
    metrics.gauge('system.uptime_seconds', Math.floor(process.uptime()));
  }, 10_000).unref();
}
```

---

## 验收标准

- [ ] `increment('task.total')` 后 `getSummary('task.total').count` 等于调用次数
- [ ] `timing('tool.duration', 1500, { tool_name: 'web_search' })` 后按 label 查询正确
- [ ] p50/p95/p99 计算结果与手工计算一致（误差 < 1%）
- [ ] 每分钟持久化文件写入正确，格式符合 PRD 第 5.3 节
- [ ] 模拟 2 小时以前的数据点，确认自动淘汰生效
- [ ] 连续调用 10000 次 `increment()`，总耗时 < 1s（< 0.1ms/次）
- [ ] 单元测试覆盖率 > 80%
- [ ] TypeScript 编译无错误（strict 模式）
