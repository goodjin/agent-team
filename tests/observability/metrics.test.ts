import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MetricsCollector } from '../../src/observability/metrics.js';

describe('MetricsCollector', () => {
  let tmpDir: string;
  let metrics: MetricsCollector;

  beforeEach(() => {
    vi.useRealTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-test-'));
    metrics = new MetricsCollector(tmpDir);
  });

  afterEach(() => {
    metrics.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── increment ───────────────────────────────────────────────

  it('increment increases counter by 1 by default', () => {
    metrics.increment('requests');
    metrics.increment('requests');
    metrics.increment('requests');
    const snap = metrics.getSnapshot();
    expect(snap.counters['requests']).toBe(3);
  });

  it('increment supports custom value', () => {
    metrics.increment('bytes', 100);
    metrics.increment('bytes', 50);
    const snap = metrics.getSnapshot();
    expect(snap.counters['bytes']).toBe(150);
  });

  it('increment with labels creates separate counters', () => {
    metrics.increment('requests', 1, { method: 'GET' });
    metrics.increment('requests', 2, { method: 'POST' });
    metrics.increment('requests', 1, { method: 'GET' });
    const snap = metrics.getSnapshot();
    expect(snap.counters['requests{method="GET"}']).toBe(2);
    expect(snap.counters['requests{method="POST"}']).toBe(2);
  });

  it('counter starts at 0 and only increases', () => {
    const snap1 = metrics.getSnapshot();
    expect(snap1.counters['new_counter']).toBeUndefined();

    metrics.increment('new_counter');
    const snap2 = metrics.getSnapshot();
    expect(snap2.counters['new_counter']).toBe(1);
  });

  // ─── observe (histogram) ─────────────────────────────────────

  it('observe records values in histogram', () => {
    metrics.observe('latency', 10);
    metrics.observe('latency', 20);
    metrics.observe('latency', 30);

    const snap = metrics.getSnapshot();
    expect(snap.histograms['latency']).toBeDefined();
    expect(snap.histograms['latency'].count).toBe(3);
    expect(snap.histograms['latency'].sum).toBe(60);
    expect(snap.histograms['latency'].min).toBe(10);
    expect(snap.histograms['latency'].max).toBe(30);
  });

  it('observe computes p50 and p95 correctly', () => {
    // 10 values: 1..10
    for (let i = 1; i <= 10; i++) {
      metrics.observe('vals', i);
    }
    const snap = metrics.getSnapshot();
    const h = snap.histograms['vals'];
    // p50 = median of 1..10 → 5
    expect(h.p50).toBe(5);
    // p95 of 10 values → ceil(10*0.95)-1 = 9-1 = idx 8 → value 9
    expect(h.p95).toBe(10);
  });

  it('getSummary calculates stats correctly', () => {
    metrics.observe('req_time', 100);
    metrics.observe('req_time', 200);
    metrics.observe('req_time', 300);

    const summary = metrics.getSummary('req_time');
    expect(summary.count).toBe(3);
    expect(summary.sum).toBe(600);
    expect(summary.min).toBe(100);
    expect(summary.max).toBe(300);
    expect(summary.avg).toBeCloseTo(200);
    expect(summary.p50).toBe(200);
  });

  it('getSummary returns zeros when no data', () => {
    const summary = metrics.getSummary('nonexistent');
    expect(summary.count).toBe(0);
    expect(summary.sum).toBe(0);
    expect(summary.min).toBe(0);
    expect(summary.max).toBe(0);
  });

  // ─── gauge ───────────────────────────────────────────────────

  it('gauge sets and overwrites value', () => {
    metrics.gauge('active_conns', 5);
    let snap = metrics.getSnapshot();
    expect(snap.gauges['active_conns']).toBe(5);

    metrics.gauge('active_conns', 3);
    snap = metrics.getSnapshot();
    expect(snap.gauges['active_conns']).toBe(3);
  });

  it('gauge with labels', () => {
    metrics.gauge('cpu', 75, { host: 'server-1' });
    metrics.gauge('cpu', 60, { host: 'server-2' });
    const snap = metrics.getSnapshot();
    expect(snap.gauges['cpu{host="server-1"}']).toBe(75);
    expect(snap.gauges['cpu{host="server-2"}']).toBe(60);
  });

  // ─── getSnapshot ─────────────────────────────────────────────

  it('getSnapshot returns all three metric types', () => {
    metrics.increment('total_tasks');
    metrics.observe('duration_ms', 500);
    metrics.gauge('active', 1);

    const snap = metrics.getSnapshot();
    expect(snap.counters).toBeDefined();
    expect(snap.histograms).toBeDefined();
    expect(snap.gauges).toBeDefined();
    expect(snap.timestamp).toBeGreaterThan(0);
    expect(snap.counters['total_tasks']).toBe(1);
    expect(snap.gauges['active']).toBe(1);
  });

  // ─── reset ───────────────────────────────────────────────────

  it('reset clears all metrics', () => {
    metrics.increment('tasks', 5);
    metrics.observe('latency', 100);
    metrics.gauge('workers', 4);
    metrics.reset();

    const snap = metrics.getSnapshot();
    expect(Object.keys(snap.counters).length).toBe(0);
    expect(Object.keys(snap.histograms).length).toBe(0);
    expect(Object.keys(snap.gauges).length).toBe(0);
  });

  // ─── getInstance ─────────────────────────────────────────────

  it('getInstance returns the same singleton', () => {
    const a = MetricsCollector.getInstance();
    const b = MetricsCollector.getInstance();
    expect(a).toBe(b);
  });

  // ─── label key format ────────────────────────────────────────

  it('label key uses Prometheus format name{k="v"}', () => {
    metrics.increment('http_requests', 1, { status: '200', method: 'GET' });
    const snap = metrics.getSnapshot();
    const keys = Object.keys(snap.counters);
    const labelKey = keys.find((k) => k.startsWith('http_requests{'));
    expect(labelKey).toBeDefined();
    expect(labelKey).toContain('method="GET"');
    expect(labelKey).toContain('status="200"');
  });

  // ─── performance ────────────────────────────────────────────

  it('increment 10000 times completes in < 1 second', () => {
    const start = Date.now();
    for (let i = 0; i < 10_000; i++) {
      metrics.increment('perf_test');
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(metrics.getSnapshot().counters['perf_test']).toBe(10_000);
  });

  // ─── p99 via getSummary ───────────────────────────────────────

  it('getSummary p99 is calculated', () => {
    for (let i = 1; i <= 100; i++) {
      metrics.observe('p99_test', i);
    }
    const summary = metrics.getSummary('p99_test');
    expect(summary.p99).toBeDefined();
    expect(summary.p99!).toBeGreaterThanOrEqual(99);
  });
});
