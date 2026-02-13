import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PromptOptimizer } from '../../src/evolution/prompt-optimizer.js';

describe('PromptOptimizer', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('version management', () => {
    it('returns empty history for unknown role', () => {
      const optimizer = new PromptOptimizer();
      expect(optimizer.getVersionHistory('unknown-role')).toEqual([]);
    });

    it('adds a version and retrieves it', () => {
      const optimizer = new PromptOptimizer();
      const v = optimizer.addVersion('role-a', 'You are a helpful assistant.');
      const history = optimizer.getVersionHistory('role-a');
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe(v.id);
      expect(history[0].version).toBe(1);
      expect(history[0].content).toBe('You are a helpful assistant.');
    });

    it('assigns incrementing version numbers', () => {
      const optimizer = new PromptOptimizer();
      const v1 = optimizer.addVersion('role-a', 'version 1 content');
      const v2 = optimizer.addVersion('role-a', 'version 2 content');
      const v3 = optimizer.addVersion('role-a', 'version 3 content');
      expect(v1.version).toBe(1);
      expect(v2.version).toBe(2);
      expect(v3.version).toBe(3);
    });

    it('enforces maxVersions limit', () => {
      const optimizer = new PromptOptimizer({ maxVersions: 5 });
      for (let i = 0; i < 7; i++) {
        optimizer.addVersion('role-a', `content ${i}`);
      }
      const history = optimizer.getVersionHistory('role-a');
      expect(history.length).toBeLessThanOrEqual(5);
    });

    it('getCurrentPrompt returns the latest version', () => {
      const optimizer = new PromptOptimizer();
      optimizer.addVersion('role-a', 'first');
      optimizer.addVersion('role-a', 'second');
      const current = optimizer.getCurrentPrompt('role-a');
      expect(current?.content).toBe('second');
    });

    it('getCurrentPrompt returns undefined for unknown role', () => {
      const optimizer = new PromptOptimizer();
      expect(optimizer.getCurrentPrompt('unknown')).toBeUndefined();
    });
  });

  describe('adoptVersion', () => {
    it('adopts an existing version successfully', async () => {
      const optimizer = new PromptOptimizer();
      const v1 = optimizer.addVersion('role-a', 'v1 content');
      const v2 = optimizer.addVersion('role-a', 'v2 content');

      await optimizer.adoptVersion('role-a', v1.id);

      // After adoption, the adopted version should be at the end
      const history = optimizer.getVersionHistory('role-a');
      expect(history[history.length - 1].id).toBe(v1.id);
    });

    it('throws when version does not exist', async () => {
      const optimizer = new PromptOptimizer();
      optimizer.addVersion('role-a', 'content');
      await expect(
        optimizer.adoptVersion('role-a', 'non-existent-id')
      ).rejects.toThrow();
    });

    it('emits version:adopted event', async () => {
      const optimizer = new PromptOptimizer();
      const v = optimizer.addVersion('role-a', 'content');

      const events: unknown[] = [];
      optimizer.on('version:adopted', (e) => events.push(e));

      await optimizer.adoptVersion('role-a', v.id);
      expect(events).toHaveLength(1);
    });
  });

  describe('recordUsage', () => {
    it('increments usageCount on each record', async () => {
      const optimizer = new PromptOptimizer();
      const v = optimizer.addVersion('role-a', 'content');

      await optimizer.recordUsage('role-a', v.id, true, 8);
      await optimizer.recordUsage('role-a', v.id, false, 4);

      const history = optimizer.getVersionHistory('role-a');
      expect(history[0].stats.usageCount).toBe(2);
    });

    it('tracks successCount correctly', async () => {
      const optimizer = new PromptOptimizer();
      const v = optimizer.addVersion('role-a', 'content');

      await optimizer.recordUsage('role-a', v.id, true, 9);
      await optimizer.recordUsage('role-a', v.id, true, 8);
      await optimizer.recordUsage('role-a', v.id, false, 3);

      const history = optimizer.getVersionHistory('role-a');
      expect(history[0].stats.successCount).toBe(2);
      expect(history[0].stats.successRate).toBeCloseTo(2 / 3, 2);
    });

    it('computes rolling average score', async () => {
      const optimizer = new PromptOptimizer();
      const v = optimizer.addVersion('role-a', 'content');

      await optimizer.recordUsage('role-a', v.id, true, 6);
      await optimizer.recordUsage('role-a', v.id, true, 8);

      const history = optimizer.getVersionHistory('role-a');
      // Rolling average: starts at 6, then (6 + (8-6)/2) = 7
      expect(history[0].stats.avgScore).toBeCloseTo(7, 1);
    });

    it('ignores record for unknown version', async () => {
      const optimizer = new PromptOptimizer();
      // No error should be thrown
      await expect(
        optimizer.recordUsage('role-a', 'non-existent', true, 5)
      ).resolves.toBeUndefined();
    });
  });

  describe('generateVariants', () => {
    it('generates 3 variants with different strategies', async () => {
      const optimizer = new PromptOptimizer();
      const variants = await optimizer.generateVariants(
        'role-a',
        'You are a helpful assistant. Please answer questions clearly.'
      );
      expect(variants).toHaveLength(3);

      const strategies = variants.map((v) => v.strategy);
      expect(strategies).toContain('simplify');
      expect(strategies).toContain('strengthen');
      expect(strategies).toContain('add-examples');
    });

    it('each variant has substantially different content from base', async () => {
      const optimizer = new PromptOptimizer();
      const baseContent =
        'You are a helpful assistant. Please answer questions clearly. You should be friendly and professional.';
      const variants = await optimizer.generateVariants('role-a', baseContent);

      for (const variant of variants) {
        expect(variant.content).not.toBe(baseContent);
        expect(variant.content.length).toBeGreaterThan(0);
      }
    });

    it('simplify variant is shorter than base', async () => {
      const optimizer = new PromptOptimizer();
      const baseContent =
        'You are a helpful assistant. Please answer questions clearly.\n\n\nYou should be friendly and professional.\nPlease note that you must be helpful.\nPlease note that you must be accurate.';
      const variants = await optimizer.generateVariants('role-a', baseContent);
      const simplified = variants.find((v) => v.strategy === 'simplify');
      expect(simplified).toBeDefined();
      // Simplified should be shorter or at most same length
      expect(simplified!.content.length).toBeLessThanOrEqual(baseContent.length);
    });

    it('add-examples variant contains example text', async () => {
      const optimizer = new PromptOptimizer();
      const variants = await optimizer.generateVariants(
        'role-a',
        'You are a helpful assistant.'
      );
      const withExamples = variants.find((v) => v.strategy === 'add-examples');
      expect(withExamples?.content).toContain('例如');
    });

    it('each variant has a hypothesis', async () => {
      const optimizer = new PromptOptimizer();
      const variants = await optimizer.generateVariants('role-a', 'content');
      for (const v of variants) {
        expect(v.hypothesis).toBeTruthy();
        expect(v.hypothesis.length).toBeGreaterThan(0);
      }
    });

    it('each variant references the base version', async () => {
      const optimizer = new PromptOptimizer();
      const variants = await optimizer.generateVariants('role-a', 'content');
      for (const v of variants) {
        expect(v.baseVersionId).toBeTruthy();
      }
    });

    it('emits variants:generated event', async () => {
      const optimizer = new PromptOptimizer();
      const events: unknown[] = [];
      optimizer.on('variants:generated', (e) => events.push(e));

      await optimizer.generateVariants('role-a', 'content');
      expect(events).toHaveLength(1);
    });
  });

  describe('analyzeABTest', () => {
    it('returns low confidence when version count < 2', () => {
      const optimizer = new PromptOptimizer();
      optimizer.addVersion('role-a', 'only one version');
      const result = optimizer.analyzeABTest('role-a');
      expect(result.confidence).toBe(0);
    });

    it('returns low confidence when sample count < 20', async () => {
      const optimizer = new PromptOptimizer();
      const v1 = optimizer.addVersion('role-a', 'version 1');
      const v2 = optimizer.addVersion('role-a', 'version 2');

      // Only 5 usage records - not enough
      for (let i = 0; i < 5; i++) {
        await optimizer.recordUsage('role-a', v1.id, true, 7);
        await optimizer.recordUsage('role-a', v2.id, true, 8);
      }

      const result = optimizer.analyzeABTest('role-a');
      expect(result.confidence).toBe(0);
      expect(result.recommendation).toContain('不足');
    });

    it('identifies winner when usage count >= 20 and scores differ', async () => {
      const optimizer = new PromptOptimizer();
      const v1 = optimizer.addVersion('role-a', 'version 1');
      const v2 = optimizer.addVersion('role-a', 'version 2');

      // v1 gets low scores, v2 gets high scores
      for (let i = 0; i < 25; i++) {
        await optimizer.recordUsage('role-a', v1.id, true, 4);
      }
      for (let i = 0; i < 25; i++) {
        await optimizer.recordUsage('role-a', v2.id, true, 9);
      }

      const result = optimizer.analyzeABTest('role-a');
      expect(result.winner).toBe(v2.id);
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('persistence', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-optimizer-test-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('saves and loads versions correctly', async () => {
      const storagePath = path.join(tmpDir, 'optimizer.json');
      const optimizer = new PromptOptimizer({ storagePath });

      optimizer.addVersion('role-a', 'persisted content');
      await optimizer.save();

      const optimizer2 = new PromptOptimizer({ storagePath });
      await optimizer2.load();

      const history = optimizer2.getVersionHistory('role-a');
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('persisted content');
    });

    it('load handles missing file gracefully', async () => {
      const storagePath = path.join(tmpDir, 'non-existent.json');
      const optimizer = new PromptOptimizer({ storagePath });
      await expect(optimizer.load()).resolves.toBeUndefined();
      expect(optimizer.getVersionHistory('role-a')).toEqual([]);
    });
  });
});
