import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { MetricSummary } from './types.js';

export type { MetricSummary };

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MAX_POINTS = 1000;

interface DataPoint {
  value: number;
  timestamp: number;
}

interface MetricBucket {
  name: string;
  labels: Record<string, string>;
  points: DataPoint[];
}

export interface MetricSnapshot {
  timestamp: number;
  counters: Record<string, number>;
  histograms: Record<
    string,
    { count: number; sum: number; min: number; max: number; p50?: number; p95?: number }
  >;
  gauges: Record<string, number>;
}

export class MetricsCollector {
  private static _instance: MetricsCollector | undefined;

  private buckets = new Map<string, MetricBucket>();
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private persistTimer: NodeJS.Timeout | null = null;
  private readonly metricsDir: string;

  constructor(metricsDir?: string) {
    this.metricsDir = metricsDir ?? 'workspace/metrics';
    mkdirSync(this.metricsDir, { recursive: true });
    this.schedulePersist();
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector._instance) {
      MetricsCollector._instance = new MetricsCollector();
    }
    return MetricsCollector._instance;
  }

  // ─── Counter ──────────────────────────────────────────────────

  /** Increment a counter (only increases). */
  increment(name: string, value = 1, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
    this.addPoint(name, value, labels);
  }

  // ─── Histogram ────────────────────────────────────────────────

  /** Record a value in a histogram. */
  observe(name: string, value: number, labels?: Record<string, string>): void {
    this.addPoint(name, value, labels);
  }

  /** Alias: record a timing value (ms). */
  timing(name: string, durationMs: number, labels?: Record<string, string>): void {
    this.observe(name, durationMs, labels);
  }

  // ─── Gauge ────────────────────────────────────────────────────

  /** Set a gauge value (can increase or decrease). */
  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
    this.addPoint(name, value, labels);
  }

  // ─── Snapshot ─────────────────────────────────────────────────

  getSnapshot(): MetricSnapshot {
    const now = Date.now();
    const countersObj: Record<string, number> = {};
    const histogramsObj: Record<
      string,
      { count: number; sum: number; min: number; max: number; p50?: number; p95?: number }
    > = {};
    const gaugesObj: Record<string, number> = {};

    for (const [key, val] of this.counters) {
      countersObj[key] = val;
    }

    for (const [key, val] of this.gauges) {
      gaugesObj[key] = val;
    }

    for (const [key, bucket] of this.buckets) {
      const windowStart = now - 60 * 60 * 1000; // 1-hour window for snapshot
      const values = bucket.points
        .filter((p) => p.timestamp >= windowStart)
        .map((p) => p.value);

      if (values.length > 0) {
        const sorted = [...values].sort((a, b) => a - b);
        const sum = sorted.reduce((a, b) => a + b, 0);
        histogramsObj[key] = {
          count: sorted.length,
          sum,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          p50: this.percentile(sorted, 0.5),
          p95: this.percentile(sorted, 0.95),
        };
      }
    }

    return {
      timestamp: now,
      counters: countersObj,
      histograms: histogramsObj,
      gauges: gaugesObj,
    };
  }

  getSummary(
    name: string,
    windowMinutes = 60,
    labels?: Record<string, string>
  ): MetricSummary {
    const key = this.makeKey(name, labels);
    const bucket = this.buckets.get(key);
    const windowMs = windowMinutes * 60 * 1000;
    const now = Date.now();
    const windowStart = now - windowMs;

    const points = bucket
      ? bucket.points.filter((p) => p.timestamp >= windowStart).map((p) => p.value)
      : [];

    return this.calcSummary(name, points, labels, windowStart, now);
  }

  reset(): void {
    this.buckets.clear();
    this.counters.clear();
    this.gauges.clear();
  }

  close(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
  }

  // ─── Internals ────────────────────────────────────────────────

  private addPoint(
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    const key = this.makeKey(name, labels);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { name, labels: labels ?? {}, points: [] };
      this.buckets.set(key, bucket);
    }

    const now = Date.now();
    bucket.points.push({ value, timestamp: now });

    // Rolling window: evict old points when buffer too large
    if (bucket.points.length > MAX_POINTS) {
      const cutoff = now - TWO_HOURS_MS;
      bucket.points = bucket.points.filter((p) => p.timestamp > cutoff);
      // If still over limit after time-based eviction, keep latest MAX_POINTS
      if (bucket.points.length > MAX_POINTS) {
        bucket.points = bucket.points.slice(-MAX_POINTS);
      }
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
      return {
        name,
        count: 0,
        sum: 0,
        min: 0,
        max: 0,
        avg: 0,
        labels,
        windowStart: new Date(windowStart).toISOString(),
        windowEnd: new Date(windowEnd).toISOString(),
      };
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
    if (!labels || Object.keys(labels).length === 0) return name;
    // Prometheus-style: name{key="value",...}
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  private persist(): void {
    try {
      const snapshot = {
        snapshotTime: new Date().toISOString(),
        metrics: this.getSnapshot(),
      };
      const date = new Date().toISOString().slice(0, 10);
      const filePath = join(this.metricsDir, `metrics-${date}.jsonl`);
      appendFileSync(filePath, JSON.stringify(snapshot) + '\n');
    } catch {
      // persistence failure should not affect main flow
    }
  }

  private schedulePersist(): void {
    this.persistTimer = setInterval(() => this.persist(), 60_000);
    this.persistTimer.unref();
  }
}

export function startSystemMetrics(metrics: MetricsCollector): NodeJS.Timeout {
  const timer = setInterval(() => {
    const mem = process.memoryUsage();
    metrics.gauge('system.memory_mb', Math.round(mem.heapUsed / 1024 / 1024));
    metrics.gauge('system.uptime_seconds', Math.floor(process.uptime()));
  }, 10_000);
  timer.unref();
  return timer;
}
