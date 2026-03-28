import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { SelfEvaluator } from '../../src/evolution/evaluator.js';
import { createTempDir } from '../helpers/fixtures.js';

describe('SelfEvaluator', () => {
  it('computes weighted overall score', async () => {
    const tmp = await createTempDir();
    const store = path.join(tmp, 'eval.jsonl');
    const ev = new SelfEvaluator({ storagePath: store });
    const report = await ev.evaluate(
      {
        toolCallCount: 2,
        tokenUsed: 500,
        duration: 100,
        iterationCount: 0,
        success: true,
      },
      'task-1'
    );
    expect(report.scores.overall).toBeGreaterThan(0);
    expect(report.insights.length).toBeGreaterThan(0);
  });

  it('getTrend aggregates recent evaluations', async () => {
    const tmp = await createTempDir();
    const ev = new SelfEvaluator({ storagePath: path.join(tmp, 'e.jsonl') });
    await ev.evaluate(
      { toolCallCount: 2, tokenUsed: 100, duration: 1, iterationCount: 0, success: true },
      'a'
    );
    await ev.evaluate(
      { toolCallCount: 2, tokenUsed: 100, duration: 1, iterationCount: 0, success: true },
      'b'
    );
    const trend = ev.getTrend(7);
    expect(trend.totalTasks).toBe(2);
    expect(trend.avgOverall).toBeGreaterThan(0);
  });

  it('attachTo reacts to task:completed', async () => {
    const tmp = await createTempDir();
    const ev = new SelfEvaluator({ storagePath: path.join(tmp, 'e.jsonl') });
    const bus = new EventEmitter();
    ev.attachTo(bus);
    const done = new Promise<void>((resolve) => {
      ev.once('evaluation:completed', () => resolve());
    });
    bus.emit('task:completed', {
      taskId: 'x',
      toolCallCount: 1,
      tokenUsed: 100,
      duration: 10,
      iterationCount: 0,
    });
    await done;
    expect(ev.getHistory(1)).toHaveLength(1);
  });

  it('emits evaluation:declining when scores monotonically drop below threshold', async () => {
    const tmp = await createTempDir();
    const ev = new SelfEvaluator({
      storagePath: path.join(tmp, 'e.jsonl'),
      decliningStreakMin: 3,
      decliningThreshold: 6,
    });
    const declined = new Promise<void>((resolve) => {
      ev.once('evaluation:declining', () => resolve());
    });
    const tid = 'same-task';
    await ev.evaluate(
      { toolCallCount: 2, tokenUsed: 500, duration: 1, iterationCount: 0, success: false },
      tid
    );
    await ev.evaluate(
      { toolCallCount: 5, tokenUsed: 5000, duration: 1, iterationCount: 0, success: false },
      tid
    );
    await ev.evaluate(
      { toolCallCount: 10, tokenUsed: 10000, duration: 1, iterationCount: 0, success: false },
      tid
    );
    await declined;
  });

  it('persists and loads jsonl', async () => {
    const tmp = await createTempDir();
    const p = path.join(tmp, 'e.jsonl');
    const a = new SelfEvaluator({ storagePath: p });
    await a.evaluate(
      { toolCallCount: 1, tokenUsed: 100, duration: 1, iterationCount: 0, success: true },
      'z'
    );
    await a.save();
    const b = new SelfEvaluator({ storagePath: p });
    await b.load();
    expect(b.getHistory(10)).toHaveLength(1);
  });
});
