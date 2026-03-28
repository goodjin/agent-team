import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { PluginRegistry } from '../../src/plugins/registry.js';
import { createTempDir, v9FixturesDir } from '../helpers/fixtures.js';

describe('PluginRegistry', () => {
  it('installs a valid plugin and prevents duplicates', async () => {
    const tmp = await createTempDir();
    const indexPath = path.join(tmp, 'registry.json');
    const reg = new PluginRegistry({ indexPath });
    await reg.load();
    const pluginDir = path.join(v9FixturesDir(), 'minimal-tool');
    const entry = await reg.install(pluginDir);
    expect(entry.name).toBe('minimal-tool');
    await expect(reg.install(pluginDir)).rejects.toThrow(/已安装/);
  });

  it('lists, updates stats, and uninstalls', async () => {
    const tmp = await createTempDir();
    const reg = new PluginRegistry({ indexPath: path.join(tmp, 'r.json') });
    await reg.load();
    await reg.install(path.join(v9FixturesDir(), 'minimal-tool'));
    await reg.updateStats('minimal-tool', 7);
    await reg.updateStats('minimal-tool', 9);
    const listed = reg.list();
    expect(listed[0]?.usageCount).toBe(2);
    expect(listed[0]?.avgScore).toBeGreaterThan(0);
    await reg.uninstall('minimal-tool');
    expect(reg.list()).toHaveLength(0);
  });

  it('search filters by keyword', async () => {
    const tmp = await createTempDir();
    const reg = new PluginRegistry({ indexPath: path.join(tmp, 'r.json') });
    await reg.load();
    await reg.install(path.join(v9FixturesDir(), 'minimal-tool'));
    expect(reg.search('minimal').length).toBe(1);
    expect(reg.getStats().total).toBe(1);
  });
});
