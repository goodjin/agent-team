import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PluginRegistry } from '../../src/plugins/registry.js';

// Create a temporary plugin directory with a valid plugin.json
async function createTempPlugin(
  dir: string,
  name: string,
  type: 'tool' | 'role' | 'hook' = 'tool',
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const pluginDir = path.join(dir, name);
  await fs.mkdir(pluginDir, { recursive: true });

  const manifest: Record<string, unknown> = {
    name,
    version: '1.0.0',
    type,
    description: `Test plugin ${name}`,
    entry: 'index.js',
    ...overrides,
  };

  // Add type-specific required fields
  if (type === 'tool' && !overrides['tool']) {
    manifest['tool'] = { toolName: `${name}-tool` };
  } else if (type === 'role' && !overrides['role']) {
    manifest['role'] = { roleName: `${name}Role` };
  } else if (type === 'hook' && !overrides['hook']) {
    manifest['hook'] = { events: ['tool:before'] };
  }

  await fs.writeFile(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );
  await fs.writeFile(
    path.join(pluginDir, 'index.js'),
    'export default {};',
    'utf-8'
  );

  return pluginDir;
}

describe('PluginRegistry', () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.useRealTimers();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-registry-test-'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('load and save', () => {
    it('creates empty registry when file does not exist', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();
      expect(registry.list()).toEqual([]);
    });

    it('saves and loads registry correctly', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      const pluginDir = await createTempPlugin(tmpDir, 'test-plugin');
      await registry.install(pluginDir);

      const registry2 = new PluginRegistry({ indexPath });
      await registry2.load();
      const plugins = registry2.list();
      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('test-plugin');
    });
  });

  describe('install', () => {
    it('installs a plugin from a valid directory', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      const pluginDir = await createTempPlugin(tmpDir, 'my-plugin');
      const entry = await registry.install(pluginDir);

      expect(entry.name).toBe('my-plugin');
      expect(entry.version).toBe('1.0.0');
      expect(entry.enabled).toBe(true);
      expect(entry.usageCount).toBe(0);

      const plugins = registry.list();
      expect(plugins).toHaveLength(1);
    });

    it('throws when directory does not exist', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      await expect(registry.install('/non/existent/path')).rejects.toThrow();
    });

    it('throws when installing duplicate plugin name', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      const pluginDir = await createTempPlugin(tmpDir, 'dup-plugin');
      await registry.install(pluginDir);

      await expect(registry.install(pluginDir)).rejects.toThrow(/已安装/);
    });

    it('throws when plugin.json is invalid', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      // Create plugin with invalid manifest (wrong type)
      const invalidDir = path.join(tmpDir, 'invalid-plugin');
      await fs.mkdir(invalidDir, { recursive: true });
      await fs.writeFile(
        path.join(invalidDir, 'plugin.json'),
        JSON.stringify({ name: 'INVALID NAME!', version: 'not-semver', type: 'unknown' }),
        'utf-8'
      );

      await expect(registry.install(invalidDir)).rejects.toThrow();
    });

    it('correctly sets installedAt timestamp', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      const before = new Date().toISOString();
      const pluginDir = await createTempPlugin(tmpDir, 'ts-plugin');
      const entry = await registry.install(pluginDir);
      const after = new Date().toISOString();

      expect(entry.installedAt).toBeDefined();
      expect(entry.installedAt! >= before).toBe(true);
      expect(entry.installedAt! <= after).toBe(true);
    });
  });

  describe('uninstall', () => {
    it('removes a plugin from the registry', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      const pluginDir = await createTempPlugin(tmpDir, 'to-remove');
      await registry.install(pluginDir);
      expect(registry.list()).toHaveLength(1);

      await registry.uninstall('to-remove');
      expect(registry.list()).toHaveLength(0);
    });

    it('throws when plugin is not installed', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      await expect(registry.uninstall('not-installed')).rejects.toThrow(/未安装/);
    });
  });

  describe('updateStats', () => {
    it('increments usageCount', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      const pluginDir = await createTempPlugin(tmpDir, 'stats-plugin');
      await registry.install(pluginDir);

      for (let i = 0; i < 10; i++) {
        await registry.updateStats('stats-plugin');
      }

      const plugins = registry.list();
      expect(plugins[0].usageCount).toBe(10);
    });

    it('calculates rolling average score', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      const pluginDir = await createTempPlugin(tmpDir, 'score-plugin');
      await registry.install(pluginDir);

      await registry.updateStats('score-plugin', 6);
      await registry.updateStats('score-plugin', 8);
      await registry.updateStats('score-plugin', 7);

      const plugins = registry.list();
      // Average of 6, 8, 7 = 7.0
      expect(plugins[0].avgScore).toBeCloseTo(7.0, 1);
    });

    it('ignores unknown plugin name', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      // Should not throw
      await expect(registry.updateStats('unknown')).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns all plugins without filter', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      await registry.install(await createTempPlugin(tmpDir, 'tool-1', 'tool'));
      await registry.install(await createTempPlugin(tmpDir, 'hook-1', 'hook'));
      await registry.install(await createTempPlugin(tmpDir, 'role-1', 'role'));

      expect(registry.list()).toHaveLength(3);
    });

    it('filters by type', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      await registry.install(await createTempPlugin(tmpDir, 'tool-2', 'tool'));
      await registry.install(await createTempPlugin(tmpDir, 'hook-2', 'hook'));

      const tools = registry.list({ type: 'tool' });
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('tool-2');
    });

    it('filters by enabled status', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      await registry.install(await createTempPlugin(tmpDir, 'enabled-plugin'));
      const plugins = registry.list({ enabled: true });
      expect(plugins).toHaveLength(1);
    });
  });

  describe('search', () => {
    it('finds plugins by name keyword', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      await registry.install(await createTempPlugin(tmpDir, 'http-request'));
      await registry.install(await createTempPlugin(tmpDir, 'file-reader'));

      const results = registry.search('http');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('http-request');
    });

    it('finds plugins by description keyword', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      await registry.install(await createTempPlugin(tmpDir, 'network-tool'));
      const results = registry.search('Test plugin');
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns empty array when no match', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      await registry.install(await createTempPlugin(tmpDir, 'my-plugin-a'));
      const results = registry.search('zzz-nonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('returns correct stats', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      await registry.install(await createTempPlugin(tmpDir, 'stats-tool', 'tool'));
      await registry.install(await createTempPlugin(tmpDir, 'stats-hook', 'hook'));
      await registry.install(await createTempPlugin(tmpDir, 'stats-role', 'role'));

      const stats = registry.getStats();
      expect(stats.total).toBe(3);
      expect(stats.enabled).toBe(3);
      expect(stats.byType['tool']).toBe(1);
      expect(stats.byType['hook']).toBe(1);
      expect(stats.byType['role']).toBe(1);
    });

    it('returns zeros for empty registry', async () => {
      const indexPath = path.join(tmpDir, 'registry.json');
      const registry = new PluginRegistry({ indexPath });
      await registry.load();

      const stats = registry.getStats();
      expect(stats.total).toBe(0);
      expect(stats.enabled).toBe(0);
      expect(stats.byType).toEqual({});
    });
  });
});
