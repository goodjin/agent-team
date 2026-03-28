import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { DynamicToolLoader } from '../../src/plugins/dynamic-tool-loader.js';
import { PluginLoader } from '../../src/plugins/loader.js';
import { createTempDir, v9FixturesDir } from '../helpers/fixtures.js';

describe('DynamicToolLoader', () => {
  it('registers tools from loaded plugins and executes latest semver', async () => {
    const root = await createTempDir();
    await fs.cp(path.join(v9FixturesDir(), 'minimal-tool'), path.join(root, 'minimal-tool'), {
      recursive: true,
    });
    const loader = new PluginLoader(root);
    await loader.loadAll();
    const dtl = new DynamicToolLoader(loader);
    await dtl.loadToolsFromPlugins();
    const out = await dtl.executeTool('minimal-calc', { a: 2, b: 3 });
    expect(out).toEqual({ sum: 5 });
    expect(dtl.getTool('minimal-calc')?.version).toBe('1.0.0');
  });

  it('keeps version history and resolves name@version', async () => {
    const dtl = new DynamicToolLoader(new PluginLoader(await createTempDir()));
    dtl.registerTool({
      name: 'echo',
      version: '1.0.0',
      description: 'a',
      execute: async () => 'a',
      registeredAt: new Date().toISOString(),
    });
    dtl.registerTool({
      name: 'echo',
      version: '2.0.0',
      description: 'b',
      execute: async () => 'b',
      registeredAt: new Date().toISOString(),
    });
    await expect(dtl.executeTool('echo', {})).resolves.toBe('b');
    await expect(dtl.executeTool('echo@1.0.0', {})).resolves.toBe('a');
    const list = dtl.listTools();
    expect(list.find((t) => t.name === 'echo')?.versions).toBe(2);
  });

  it('rollback removes newest version', () => {
    const dtl = new DynamicToolLoader(new PluginLoader());
    dtl.registerTool({
      name: 't',
      version: '2.0.0',
      description: '',
      execute: async () => 2,
      registeredAt: '',
    });
    dtl.registerTool({
      name: 't',
      version: '1.0.0',
      description: '',
      execute: async () => 1,
      registeredAt: '',
    });
    expect(dtl.rollback('t')).toBe(true);
    expect(dtl.getTool('t')?.version).toBe('1.0.0');
  });

  it('throws when tool is missing', async () => {
    const dtl = new DynamicToolLoader(new PluginLoader());
    await expect(dtl.executeTool('missing', {})).rejects.toThrow(/not found/);
  });
});
