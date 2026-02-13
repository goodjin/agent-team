import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SelfEvaluator } from '../../src/evolution/evaluator.js';
import { EventEmitter } from 'events';

async function makeTempStorage(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'evaluator-test-'));
  return path.join(tmpDir, 'evaluations.jsonl');
}

function makeMetrics(overrides: Partial<{
  toolCallCount: number;
  tokenUsed: number;
  duration: number;
  iterationCount: number;
  success: boolean;
}> = {}) {
  return {
    toolCallCount: 2,
    tokenUsed: 500,
    duration: 1000,
    iterationCount: 1,
    success: true,
    ...overrides,
  };
}

describe('SelfEvaluator', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('evaluate returns a valid EvaluationReport', async () => {
    const storagePath = await makeTempStorage();
    const evaluator = new SelfEvaluator({ storagePath });

    const report = await evaluator.evaluate(makeMetrics(), 'task-1');

    expect(report).toBeDefined();
    expect(report.taskId).toBe('task-1');
    expect(report.id).toBeTruthy();
    expect(report.timestamp).toBeTruthy();
    expect(report.scores.efficiency).toBeGreaterThanOrEqual(1);
    expect(report.scores.efficiency).toBeLessThanOrEqual(10);
    expect(report.scores.quality).toBeGreaterThanOrEqual(1);
    expect(report.scores.quality).toBeLessThanOrEqual(10);
    expect(report.scores.resource).toBeGreaterThanOrEqual(1);
    expect(report.scores.resource).toBeLessThanOrEqual(10);
    expect(report.scores.overall).toBeGreaterThanOrEqual(1);
    expect(report.scores.overall).toBeLessThanOrEqual(10);
    expect(Array.isArray(report.insights)).toBe(true);

    await fs.rm(path.dirname(storagePath), { recursive: true });
  });

  it('failed task gets quality score of 1', async () => {
    const storagePath = await makeTempStorage();
    const evaluator = new SelfEvaluator({ storagePath });

    const report = await evaluator.evaluate(makeMetrics({ success: false }), 'task-fail');
    expect(report.scores.quality).toBe(1);

    await fs.rm(path.dirname(storagePath), { recursive: true });
  });

  it('high tool call count yields low efficiency score', async () => {
    const storagePath = await makeTempStorage();
    const evaluator = new SelfEvaluator({ storagePath });

    const lowCallReport = await evaluator.evaluate(makeMetrics({ toolCallCount: 1 }), 't1');
    const highCallReport = await evaluator.evaluate(makeMetrics({ toolCallCount: 25 }), 't2');

    expect(lowCallReport.scores.efficiency).toBeGreaterThan(highCallReport.scores.efficiency);
    await fs.rm(path.dirname(storagePath), { recursive: true });
  });

  it('high token usage yields low resource score', async () => {
    const storagePath = await makeTempStorage();
    const evaluator = new SelfEvaluator({ storagePath });

    const lowTokenReport = await evaluator.evaluate(makeMetrics({ tokenUsed: 100 }), 't1');
    const highTokenReport = await evaluator.evaluate(makeMetrics({ tokenUsed: 100000 }), 't2');

    expect(lowTokenReport.scores.resource).toBeGreaterThan(highTokenReport.scores.resource);
    await fs.rm(path.dirname(storagePath), { recursive: true });
  });

  it('overall score matches weighted formula', async () => {
    const storagePath = await makeTempStorage();
    const evaluator = new SelfEvaluator({ storagePath });

    const report = await evaluator.evaluate(makeMetrics(), 'formula-test');
    const expected = Math.round(
      (report.scores.efficiency * 0.3 + report.scores.quality * 0.5 + report.scores.resource * 0.2) * 10
    ) / 10;
    expect(report.scores.overall).toBe(expected);

    await fs.rm(path.dirname(storagePath), { recursive: true });
  });

  it('insights are non-empty array of strings', async () => {
    const storagePath = await makeTempStorage();
    const evaluator = new SelfEvaluator({ storagePath });

    const report = await evaluator.evaluate(makeMetrics(), 'insights-test');
    expect(Array.isArray(report.insights)).toBe(true);
    for (const insight of report.insights) {
      expect(typeof insight).toBe('string');
    }

    await fs.rm(path.dirname(storagePath), { recursive: true });
  });

  it('save and load persists evaluations', async () => {
    const storagePath = await makeTempStorage();
    const evaluator1 = new SelfEvaluator({ storagePath });
    await evaluator1.evaluate(makeMetrics(), 'persist-1');
    await evaluator1.evaluate(makeMetrics(), 'persist-2');

    const evaluator2 = new SelfEvaluator({ storagePath });
    await evaluator2.load();

    const history = evaluator2.getHistory(10);
    expect(history.length).toBe(2);
    expect(history[0].taskId).toBe('persist-1');
    expect(history[1].taskId).toBe('persist-2');

    await fs.rm(path.dirname(storagePath), { recursive: true });
  });

  it('load from non-existent file results in empty history', async () => {
    const storagePath = await makeTempStorage();
    await fs.rm(path.dirname(storagePath), { recursive: true }); // Remove dir

    const evaluator = new SelfEvaluator({ storagePath });
    await evaluator.load();
    expect(evaluator.getHistory()).toEqual([]);
  });

  it('getTrend returns zero values when no evaluations', () => {
    const evaluator = new SelfEvaluator({ storagePath: '/tmp/nope.jsonl' });
    const trend = evaluator.getTrend(7);
    expect(trend.totalTasks).toBe(0);
    expect(trend.avgOverall).toBe(0);
  });

  it('getTrend returns correct averages', async () => {
    const storagePath = await makeTempStorage();
    const evaluator = new SelfEvaluator({ storagePath });

    await evaluator.evaluate(makeMetrics({ toolCallCount: 2, tokenUsed: 500, success: true }), 't1');
    await evaluator.evaluate(makeMetrics({ toolCallCount: 3, tokenUsed: 1000, success: true }), 't2');

    const trend = evaluator.getTrend(7);
    expect(trend.totalTasks).toBe(2);
    expect(trend.avgOverall).toBeGreaterThan(0);
    expect(trend.avgEfficiency).toBeGreaterThan(0);
    expect(trend.period).toBe('7d');

    await fs.rm(path.dirname(storagePath), { recursive: true });
  });

  it('getHistory respects limit parameter', async () => {
    const storagePath = await makeTempStorage();
    const evaluator = new SelfEvaluator({ storagePath });

    for (let i = 0; i < 5; i++) {
      await evaluator.evaluate(makeMetrics(), `task-${i}`);
    }

    const history3 = evaluator.getHistory(3);
    expect(history3.length).toBe(3);

    await fs.rm(path.dirname(storagePath), { recursive: true });
  });

  it('emits evaluation:completed event after evaluate', async () => {
    const storagePath = await makeTempStorage();
    const evaluator = new SelfEvaluator({ storagePath });
    const events: unknown[] = [];
    evaluator.on('evaluation:completed', (e) => events.push(e));

    await evaluator.evaluate(makeMetrics(), 'event-task');
    expect(events.length).toBe(1);

    await fs.rm(path.dirname(storagePath), { recursive: true });
  });

  it('attachTo listens to task:completed event', async () => {
    const storagePath = await makeTempStorage();
    const evaluator = new SelfEvaluator({ storagePath });
    const emitter = new EventEmitter();
    evaluator.attachTo(emitter);

    const reports: unknown[] = [];
    evaluator.on('evaluation:completed', (r) => reports.push(r));

    emitter.emit('task:completed', {
      taskId: 'attached-task',
      toolCallCount: 2,
      tokenUsed: 500,
      duration: 1000,
      iterationCount: 1,
    });

    // Wait for async handler
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(reports.length).toBe(1);

    await fs.rm(path.dirname(storagePath), { recursive: true });
  });

  it('attachTo listens to task:failed event', async () => {
    const storagePath = await makeTempStorage();
    const evaluator = new SelfEvaluator({ storagePath });
    const emitter = new EventEmitter();
    evaluator.attachTo(emitter);

    const reports: unknown[] = [];
    evaluator.on('evaluation:completed', (r) => reports.push(r));

    emitter.emit('task:failed', {
      taskId: 'failed-task',
      toolCallCount: 5,
      tokenUsed: 2000,
      duration: 5000,
      iterationCount: 3,
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(reports.length).toBe(1);
    const report = reports[0] as { scores: { quality: number } };
    expect(report.scores.quality).toBe(1);

    await fs.rm(path.dirname(storagePath), { recursive: true });
  });
});
