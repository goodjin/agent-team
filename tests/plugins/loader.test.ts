import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { PluginLoader } from '../../src/plugins/loader.js';

async function createTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'plugin-loader-test-'));
}

async function writePlugin(
  dir: string,
  name: string,
  manifest: Record<string, unknown>,
  entryContent: string = 'export const name = "test"; export async function execute(args) { return args; }'
): Promise<string> {
  const pluginDir = path.join(dir, name);
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(pluginDir, 'index.mjs'), entryContent);
  return pluginDir;
}

describe('PluginLoader', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loadAll returns empty array for empty directory', async () => {
    const tmpDir = await createTempDir();
    const loader = new PluginLoader(tmpDir);
    const result = await loader.loadAll();
    expect(result).toEqual([]);
    await fs.rm(tmpDir, { recursive: true });
  });

  it('loadAll returns empty array for non-existent directory', async () => {
    const loader = new PluginLoader('/nonexistent/path/that/does/not/exist');
    const result = await loader.loadAll();
    expect(result).toEqual([]);
  });

  it('readManifest throws for missing plugin.json', async () => {
    const tmpDir = await createTempDir();
    const loader = new PluginLoader(tmpDir);
    const pluginDir = path.join(tmpDir, 'no-manifest');
    await fs.mkdir(pluginDir);
    await expect(loader.loadPlugin(pluginDir)).rejects.toThrow();
    await fs.rm(tmpDir, { recursive: true });
  });

  it('readManifest throws for invalid JSON', async () => {
    const tmpDir = await createTempDir();
    const loader = new PluginLoader(tmpDir);
    const pluginDir = path.join(tmpDir, 'bad-json');
    await fs.mkdir(pluginDir);
    await fs.writeFile(path.join(pluginDir, 'plugin.json'), 'not json');
    await expect(loader.loadPlugin(pluginDir)).rejects.toThrow();
    await fs.rm(tmpDir, { recursive: true });
  });

  it('readManifest throws for missing required fields', async () => {
    const tmpDir = await createTempDir();
    const loader = new PluginLoader(tmpDir);
    const pluginDir = path.join(tmpDir, 'bad-manifest');
    await fs.mkdir(pluginDir);
    await fs.writeFile(path.join(pluginDir, 'plugin.json'), JSON.stringify({ name: 'test' }));
    await expect(loader.loadPlugin(pluginDir)).rejects.toThrow();
    await fs.rm(tmpDir, { recursive: true });
  });

  it('readManifest throws for non-kebab-case name', async () => {
    const tmpDir = await createTempDir();
    const loader = new PluginLoader(tmpDir);
    const pluginDir = path.join(tmpDir, 'BadName');
    await fs.mkdir(pluginDir);
    await fs.writeFile(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        name: 'BadName',
        version: '1.0.0',
        type: 'tool',
        description: 'test',
        entry: 'index.mjs',
      })
    );
    await expect(loader.loadPlugin(pluginDir)).rejects.toThrow();
    await fs.rm(tmpDir, { recursive: true });
  });

  it('loadPlugin loads a valid tool plugin', async () => {
    const tmpDir = await createTempDir();
    const pluginDir = await writePlugin(
      tmpDir,
      'my-tool',
      {
        name: 'my-tool',
        version: '1.0.0',
        type: 'tool',
        description: 'A test tool',
        entry: 'index.mjs',
        permissions: [],
      },
      'export const name = "my_tool"; export async function execute(args) { return { result: "ok" }; }'
    );

    const loader = new PluginLoader(tmpDir);
    const plugin = await loader.loadPlugin(pluginDir);

    expect(plugin.status).toBe('loaded');
    expect(plugin.manifest.name).toBe('my-tool');
    expect(plugin.manifest.version).toBe('1.0.0');
    expect(plugin.manifest.type).toBe('tool');
    await fs.rm(tmpDir, { recursive: true });
  });

  it('loadPlugin returns error status for forbidden imports', async () => {
    const tmpDir = await createTempDir();
    const pluginDir = await writePlugin(
      tmpDir,
      'bad-plugin',
      {
        name: 'bad-plugin',
        version: '1.0.0',
        type: 'hook',
        description: 'A bad plugin',
        entry: 'index.mjs',
      },
      "import { exec } from 'child_process';"
    );

    const loader = new PluginLoader(tmpDir);
    const plugin = await loader.loadPlugin(pluginDir);

    expect(plugin.status).toBe('error');
    expect(plugin.error).toContain('child_process');
    await fs.rm(tmpDir, { recursive: true });
  });

  it('loadAll skips invalid plugins and loads valid ones', async () => {
    const tmpDir = await createTempDir();

    // Valid plugin
    await writePlugin(
      tmpDir,
      'good-plugin',
      {
        name: 'good-plugin',
        version: '1.0.0',
        type: 'hook',
        description: 'Good plugin',
        entry: 'index.mjs',
      },
      'export function activate() {}'
    );

    // Invalid plugin (bad manifest)
    const badPluginDir = path.join(tmpDir, 'bad-plugin');
    await fs.mkdir(badPluginDir);
    await fs.writeFile(path.join(badPluginDir, 'plugin.json'), '{}');

    const loader = new PluginLoader(tmpDir);
    const results = await loader.loadAll();

    // Good plugin loaded, bad plugin skipped
    const goodPlugin = results.find(p => p.manifest?.name === 'good-plugin');
    expect(goodPlugin).toBeDefined();
    expect(goodPlugin?.status).toBe('loaded');
    await fs.rm(tmpDir, { recursive: true });
  });

  it('topologicalSort: dependency loaded before dependent', async () => {
    const tmpDir = await createTempDir();

    // Plugin B (no deps)
    await writePlugin(
      tmpDir,
      'plugin-b',
      {
        name: 'plugin-b',
        version: '1.0.0',
        type: 'hook',
        description: 'Plugin B',
        entry: 'index.mjs',
        dependencies: [],
      },
      'export function activate() {}'
    );

    // Plugin A (depends on B)
    await writePlugin(
      tmpDir,
      'plugin-a',
      {
        name: 'plugin-a',
        version: '1.0.0',
        type: 'hook',
        description: 'Plugin A depends on B',
        entry: 'index.mjs',
        dependencies: ['plugin-b'],
      },
      'export function activate() {}'
    );

    const loader = new PluginLoader(tmpDir);
    const results = await loader.loadAll();

    const names = results.map(p => p.manifest?.name).filter(Boolean);
    const indexA = names.indexOf('plugin-a');
    const indexB = names.indexOf('plugin-b');

    // B must come before A
    expect(indexB).toBeGreaterThanOrEqual(0);
    expect(indexA).toBeGreaterThanOrEqual(0);
    expect(indexB).toBeLessThan(indexA);
    await fs.rm(tmpDir, { recursive: true });
  });

  it('topologicalSort: circular dependency results in error', async () => {
    const tmpDir = await createTempDir();

    // Plugin A depends on B
    await writePlugin(
      tmpDir,
      'circ-a',
      {
        name: 'circ-a',
        version: '1.0.0',
        type: 'hook',
        description: 'Circular A',
        entry: 'index.mjs',
        dependencies: ['circ-b'],
      },
      'export function activate() {}'
    );

    // Plugin B depends on A (cycle!)
    await writePlugin(
      tmpDir,
      'circ-b',
      {
        name: 'circ-b',
        version: '1.0.0',
        type: 'hook',
        description: 'Circular B',
        entry: 'index.mjs',
        dependencies: ['circ-a'],
      },
      'export function activate() {}'
    );

    const loader = new PluginLoader(tmpDir);
    const results = await loader.loadAll();

    // Both should be absent (circular dependency detected)
    const circA = results.find(p => p.manifest?.name === 'circ-a');
    const circB = results.find(p => p.manifest?.name === 'circ-b');
    expect(circA).toBeUndefined();
    expect(circB).toBeUndefined();
    await fs.rm(tmpDir, { recursive: true });
  });

  it('get() returns loaded plugin', async () => {
    const tmpDir = await createTempDir();
    const pluginDir = await writePlugin(
      tmpDir,
      'get-test',
      {
        name: 'get-test',
        version: '1.0.0',
        type: 'hook',
        description: 'Get test',
        entry: 'index.mjs',
      },
      'export function activate() {}'
    );

    const loader = new PluginLoader(tmpDir);
    await loader.loadPlugin(pluginDir);

    const plugin = loader.get('get-test');
    expect(plugin).toBeDefined();
    expect(plugin?.manifest.name).toBe('get-test');
    await fs.rm(tmpDir, { recursive: true });
  });

  it('unload() removes plugin', async () => {
    const tmpDir = await createTempDir();
    const pluginDir = await writePlugin(
      tmpDir,
      'unload-test',
      {
        name: 'unload-test',
        version: '1.0.0',
        type: 'hook',
        description: 'Unload test',
        entry: 'index.mjs',
      },
      'export function activate() {}'
    );

    const loader = new PluginLoader(tmpDir);
    await loader.loadPlugin(pluginDir);

    expect(loader.get('unload-test')).toBeDefined();
    loader.unload('unload-test');
    expect(loader.get('unload-test')).toBeUndefined();
    await fs.rm(tmpDir, { recursive: true });
  });

  it('list() returns all loaded plugins', async () => {
    const tmpDir = await createTempDir();
    await writePlugin(
      tmpDir,
      'list-a',
      { name: 'list-a', version: '1.0.0', type: 'hook', description: 'A', entry: 'index.mjs' },
      'export function activate() {}'
    );
    await writePlugin(
      tmpDir,
      'list-b',
      { name: 'list-b', version: '1.0.0', type: 'hook', description: 'B', entry: 'index.mjs' },
      'export function activate() {}'
    );

    const loader = new PluginLoader(tmpDir);
    await loader.loadAll();

    const list = loader.list();
    expect(list.length).toBeGreaterThanOrEqual(2);
    await fs.rm(tmpDir, { recursive: true });
  });
});
