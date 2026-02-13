import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DynamicToolLoader } from '../../src/plugins/dynamic-tool-loader.js';
import { PluginLoader } from '../../src/plugins/loader.js';
import type { LoadedPlugin } from '../../src/plugins/types.js';

function makeMockLoader(plugins: LoadedPlugin[] = []): PluginLoader {
  const loader = {
    list: () => plugins,
    loadPlugin: vi.fn(),
    get: vi.fn(),
    loadAll: vi.fn(),
    unload: vi.fn(),
  } as unknown as PluginLoader;
  return loader;
}

function makeVersionedTool(name: string, version: string) {
  return {
    name,
    version,
    description: `Tool ${name} v${version}`,
    execute: async (args: Record<string, unknown>) => ({ result: `${name}@${version}`, args }),
    registeredAt: new Date().toISOString(),
  };
}

describe('DynamicToolLoader', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('registerTool registers a new tool', () => {
    const loader = new DynamicToolLoader(makeMockLoader());
    loader.registerTool(makeVersionedTool('my-tool', '1.0.0'));

    const tool = loader.getTool('my-tool');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('my-tool');
    expect(tool?.version).toBe('1.0.0');
  });

  it('listTools returns registered tools', () => {
    const loader = new DynamicToolLoader(makeMockLoader());
    loader.registerTool(makeVersionedTool('tool-a', '1.0.0'));
    loader.registerTool(makeVersionedTool('tool-b', '2.0.0'));

    const list = loader.listTools();
    expect(list.length).toBe(2);
    const names = list.map(t => t.name);
    expect(names).toContain('tool-a');
    expect(names).toContain('tool-b');
  });

  it('executeTool executes the latest version by default', async () => {
    const loader = new DynamicToolLoader(makeMockLoader());
    loader.registerTool(makeVersionedTool('exec-tool', '1.0.0'));
    loader.registerTool(makeVersionedTool('exec-tool', '2.0.0'));

    const result = await loader.executeTool('exec-tool', { x: 1 });
    expect((result as { result: string }).result).toBe('exec-tool@2.0.0');
  });

  it('executeTool with @version executes specific version', async () => {
    const loader = new DynamicToolLoader(makeMockLoader());
    loader.registerTool(makeVersionedTool('versioned-tool', '1.0.0'));
    loader.registerTool(makeVersionedTool('versioned-tool', '2.0.0'));

    const result = await loader.executeTool('versioned-tool@1.0.0', { x: 1 });
    expect((result as { result: string }).result).toBe('versioned-tool@1.0.0');
  });

  it('executeTool throws for unknown tool', async () => {
    const loader = new DynamicToolLoader(makeMockLoader());
    await expect(loader.executeTool('nonexistent', {})).rejects.toThrow('Tool not found');
  });

  it('newer version replaces as latest, older kept in history', () => {
    const loader = new DynamicToolLoader(makeMockLoader());
    loader.registerTool(makeVersionedTool('multi', '1.0.0'));
    loader.registerTool(makeVersionedTool('multi', '1.1.0'));

    const list = loader.listTools();
    const multiEntry = list.find(t => t.name === 'multi');
    expect(multiEntry?.version).toBe('1.1.0');
    expect(multiEntry?.versions).toBe(2);
  });

  it('maxVersions: 4th version evicts oldest', () => {
    const loader = new DynamicToolLoader(makeMockLoader(), { maxVersions: 3 });
    loader.registerTool(makeVersionedTool('evict-tool', '1.0.0'));
    loader.registerTool(makeVersionedTool('evict-tool', '1.1.0'));
    loader.registerTool(makeVersionedTool('evict-tool', '1.2.0'));
    loader.registerTool(makeVersionedTool('evict-tool', '1.3.0'));

    const list = loader.listTools();
    const entry = list.find(t => t.name === 'evict-tool');
    expect(entry?.versions).toBe(3);
    expect(entry?.version).toBe('1.3.0');
  });

  it('rollback removes current version and returns to previous', async () => {
    const loader = new DynamicToolLoader(makeMockLoader());
    loader.registerTool(makeVersionedTool('rollback-tool', '1.0.0'));
    loader.registerTool(makeVersionedTool('rollback-tool', '2.0.0'));

    const success = loader.rollback('rollback-tool');
    expect(success).toBe(true);

    const result = await loader.executeTool('rollback-tool', {});
    expect((result as { result: string }).result).toBe('rollback-tool@1.0.0');
  });

  it('rollback returns false when no previous version', () => {
    const loader = new DynamicToolLoader(makeMockLoader());
    loader.registerTool(makeVersionedTool('single', '1.0.0'));

    const success = loader.rollback('single');
    expect(success).toBe(false);
  });

  it('rollback returns false for nonexistent tool', () => {
    const loader = new DynamicToolLoader(makeMockLoader());
    const success = loader.rollback('does-not-exist');
    expect(success).toBe(false);
  });

  it('emits tool:registered event on registerTool', () => {
    const loader = new DynamicToolLoader(makeMockLoader());
    const events: unknown[] = [];
    loader.on('tool:registered', (e) => events.push(e));

    loader.registerTool(makeVersionedTool('event-tool', '1.0.0'));

    expect(events.length).toBe(1);
    expect((events[0] as { name: string }).name).toBe('event-tool');
  });

  it('emits tool:rolledback event on rollback', () => {
    const loader = new DynamicToolLoader(makeMockLoader());
    const events: unknown[] = [];
    loader.on('tool:rolledback', (e) => events.push(e));

    loader.registerTool(makeVersionedTool('rollback-event', '1.0.0'));
    loader.registerTool(makeVersionedTool('rollback-event', '2.0.0'));
    loader.rollback('rollback-event');

    expect(events.length).toBe(1);
  });

  it('loadToolsFromPlugins registers tools from loaded tool plugins', async () => {
    const fakePlugin: LoadedPlugin = {
      manifest: {
        name: 'plugin-tool',
        version: '1.0.0',
        type: 'tool',
        description: 'Plugin tool',
        entry: 'index.mjs',
        dependencies: [],
        permissions: [],
        config: {},
      },
      module: {
        name: 'plugin_tool_fn',
        description: 'Plugin tool function',
        execute: async (args: Record<string, unknown>) => ({ args }),
      },
      context: {
        manifest: {} as never,
        pluginDir: '/tmp',
        config: {},
        logger: { info: () => {}, warn: () => {}, error: () => {} },
      },
      status: 'loaded',
      loadedAt: new Date().toISOString(),
    };

    const mockLoader = makeMockLoader([fakePlugin]);
    const dynLoader = new DynamicToolLoader(mockLoader);
    await dynLoader.loadToolsFromPlugins();

    const tool = dynLoader.getTool('plugin_tool_fn');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('plugin_tool_fn');
  });

  it('startWatching and stopWatching do not throw', () => {
    const loader = new DynamicToolLoader(makeMockLoader());
    // Should not throw even if directory doesn't exist
    expect(() => {
      loader.startWatching('/tmp/nonexistent-dir-12345');
      loader.stopWatching();
    }).not.toThrow();
  });
});
