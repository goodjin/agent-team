import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { PromptOptimizer } from '../../src/evolution/prompt-optimizer.js';
import { createTempDir } from '../helpers/fixtures.js';

describe('PromptOptimizer', () => {
  it('generateVariants creates three strategies', async () => {
    const tmp = await createTempDir();
    const opt = new PromptOptimizer({ storagePath: path.join(tmp, 'p.json'), maxVersions: 20 });
    const variants = await opt.generateVariants('developer', 'Do the task.\n\nPlease be careful.');
    expect(variants).toHaveLength(3);
    expect(new Set(variants.map((v) => v.strategy)).size).toBe(3);
  });

  it('recordUsage updates rolling avg score', async () => {
    const opt = new PromptOptimizer({ storagePath: path.join((await createTempDir()), 'p.json') });
    const v = opt.addVersion('role-a', 'content');
    await opt.recordUsage('role-a', v.id, true, 8);
    await opt.recordUsage('role-a', v.id, true, 4);
    const current = opt.getCurrentPrompt('role-a');
    expect(current?.stats.usageCount).toBe(2);
    expect(current?.stats.avgScore).toBeCloseTo(6, 5);
  });

  it('analyzeABTest compares last two versions when sample size sufficient', async () => {
    const opt = new PromptOptimizer({ storagePath: path.join((await createTempDir()), 'p.json') });
    const v1 = opt.addVersion('r', 'A');
    const v2 = opt.addVersion('r', 'B');
    for (let i = 0; i < 20; i++) {
      await opt.recordUsage('r', v1.id, true, 5);
    }
    for (let i = 0; i < 20; i++) {
      await opt.recordUsage('r', v2.id, true, 8);
    }
    const ab = opt.analyzeABTest('r');
    expect(ab.winner).toBe(v2.id);
    expect(ab.recommendation).toMatch(/效果更好/);
  });

  it('save and load restores state', async () => {
    const tmp = await createTempDir();
    const file = path.join(tmp, 'p.json');
    const a = new PromptOptimizer({ storagePath: file });
    a.addVersion('x', 'hello');
    await a.save();
    const b = new PromptOptimizer({ storagePath: file });
    await b.load();
    expect(b.getVersionHistory('x')).toHaveLength(1);
  });
});
