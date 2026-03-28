import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { PluginLoader } from '../../src/plugins/loader.js';
import { createTempDir, v9FixturesDir } from '../helpers/fixtures.js';

async function installFixture(destRoot: string, name: string): Promise<void> {
  const src = path.join(v9FixturesDir(), name);
  await fs.cp(src, path.join(destRoot, name), { recursive: true });
}

describe('PluginLoader', () => {
  it('loads a valid tool plugin from disk', async () => {
    const root = await createTempDir();
    await installFixture(root, 'minimal-tool');
    const loader = new PluginLoader(root);
    const loaded = await loader.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.status).toBe('loaded');
    expect(loaded[0]?.manifest.name).toBe('minimal-tool');
  });

  it('orders dependencies before dependents', async () => {
    const root = await createTempDir();
    await installFixture(root, 'dep-base');
    await installFixture(root, 'dep-consumer');
    const loader = new PluginLoader(root);
    const loaded = await loader.loadAll();
    expect(loaded.map((p) => p.manifest.name)).toEqual(['dep-base', 'dep-consumer']);
    expect(loaded.every((p) => p.status === 'loaded')).toBe(true);
  });

  it('loads nothing when a dependency cycle exists', async () => {
    const root = await createTempDir();
    await installFixture(root, 'cycle-a');
    await installFixture(root, 'cycle-b');
    const loader = new PluginLoader(root);
    const loaded = await loader.loadAll();
    expect(loaded).toHaveLength(0);
  });

  it('marks plugin error when forbidden imports are detected', async () => {
    const loader = new PluginLoader(v9FixturesDir());
    const pluginDir = path.join(v9FixturesDir(), 'forbidden-import');
    const result = await loader.loadPlugin(pluginDir);
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/Forbidden module imports/);
  });

  it('rejects invalid plugin.json', async () => {
    const root = await createTempDir();
    const badDir = path.join(root, 'bad');
    await fs.mkdir(badDir, { recursive: true });
    await fs.writeFile(path.join(badDir, 'plugin.json'), JSON.stringify({ name: 'BAD_NAME' }), 'utf-8');
    const loader = new PluginLoader(root);
    await expect(loader.loadPlugin(badDir)).rejects.toThrow(/kebab-case/);
  });
});
