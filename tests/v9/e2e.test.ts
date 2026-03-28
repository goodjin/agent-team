import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { SelfEvaluator } from '../../src/evolution/evaluator.js';
import { PromptOptimizer } from '../../src/evolution/prompt-optimizer.js';
import { DynamicToolLoader } from '../../src/plugins/dynamic-tool-loader.js';
import { PluginLoader } from '../../src/plugins/loader.js';
import { createTempDir, v9FixturesDir } from '../helpers/fixtures.js';

describe('v9 E2E integration', () => {
  it('load plugin → register tool → execute', async () => {
    const root = await createTempDir();
    await fs.cp(path.join(v9FixturesDir(), 'minimal-tool'), path.join(root, 'minimal-tool'), {
      recursive: true,
    });
    const loader = new PluginLoader(root);
    await loader.loadAll();
    const dtl = new DynamicToolLoader(loader);
    await dtl.loadToolsFromPlugins();
    const result = await dtl.executeTool('minimal-calc', { a: 10, b: 20 });
    expect(result).toEqual({ sum: 30 });
  });

  it('evaluation declining wires to prompt variant generation', async () => {
    const tmp = await createTempDir();
    const evalPath = path.join(tmp, 'eval.jsonl');
    const promptPath = path.join(tmp, 'prompt.json');
    const evaluator = new SelfEvaluator({
      storagePath: evalPath,
      decliningStreakMin: 3,
      decliningThreshold: 6,
    });
    const optimizer = new PromptOptimizer({ storagePath: promptPath, maxVersions: 20 });

    const ready = new Promise<string>((resolve) => {
      optimizer.once('variants:generated', (payload: { roleName: string }) =>
        resolve(payload.roleName)
      );
    });

    evaluator.on('evaluation:declining', async () => {
      await optimizer.generateVariants('auto-role', 'baseline prompt for task.');
    });

    const tid = 'e2e-task';
    await evaluator.evaluate(
      { toolCallCount: 2, tokenUsed: 500, duration: 1, iterationCount: 0, success: false },
      tid
    );
    await evaluator.evaluate(
      { toolCallCount: 5, tokenUsed: 5000, duration: 1, iterationCount: 0, success: false },
      tid
    );
    await evaluator.evaluate(
      { toolCallCount: 10, tokenUsed: 10000, duration: 1, iterationCount: 0, success: false },
      tid
    );

    const role = await ready;
    expect(role).toBe('auto-role');
    expect(optimizer.getVersionHistory('auto-role').length).toBeGreaterThan(0);
  });

  it('real repo plugins dir loads http-request tool shape', async () => {
    const pluginsDir = path.join(process.cwd(), 'plugins');
    const loader = new PluginLoader(pluginsDir);
    const loaded = await loader.loadAll();
    const http = loaded.find((p) => p.manifest.name === 'http-request');
    expect(http).toBeDefined();
    if (http?.status === 'loaded') {
      const dtl = new DynamicToolLoader(loader);
      await dtl.loadToolsFromPlugins();
      const tool = dtl.getTool('http-request');
      expect(tool?.version).toBeTruthy();
    }
  });
});

describe('v9 E2E hot reload', () => {
  it('re-applies tool after disk update via loadPlugin + loadToolsFromPlugins', async () => {
    const root = await createTempDir();
    const pluginHome = path.join(root, 'minimal-tool');
    await fs.cp(path.join(v9FixturesDir(), 'minimal-tool'), pluginHome, { recursive: true });

    const loader = new PluginLoader(root);
    await loader.loadAll();
    const dtl = new DynamicToolLoader(loader);
    await dtl.loadToolsFromPlugins();
    expect(await dtl.executeTool('minimal-calc', { a: 1, b: 1 })).toEqual({ sum: 2 });

    const manifestPath = path.join(pluginHome, 'plugin.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as Record<string, unknown>;
    manifest['version'] = '1.0.1';
    manifest['entry'] = 'index.hot.js';
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    await fs.writeFile(
      path.join(pluginHome, 'index.hot.js'),
      `export default {
  name: 'minimal-calc',
  description: 'adds',
  async execute(args) {
    return { sum: Number(args.a ?? 0) + Number(args.b ?? 0), hot: true };
  },
};
`,
      'utf-8'
    );

    await loader.loadPlugin(pluginHome);
    await dtl.loadToolsFromPlugins();
    await expect(dtl.executeTool('minimal-calc', { a: 1, b: 1 })).resolves.toMatchObject({
      sum: 2,
      hot: true,
    });
  });

  it('startWatching / stopWatching does not throw', async () => {
    const root = await createTempDir();
    const dtl = new DynamicToolLoader(new PluginLoader(root));
    dtl.startWatching(root);
    dtl.stopWatching();
    dtl.stopWatching();
  });
});
