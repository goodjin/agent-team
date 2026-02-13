import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { PluginLoader } from './loader.js';
import type { LoadedPlugin, ToolPlugin } from './types.js';

interface VersionedTool {
  version: string;
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
  registeredAt: string;
}

/**
 * Compare semver strings. Returns positive if a > b, negative if a < b, 0 if equal.
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export class DynamicToolLoader extends EventEmitter {
  private versionedTools = new Map<string, VersionedTool[]>(); // name -> [newest, ..., oldest]
  private maxVersions: number;
  private watcher?: fs.FSWatcher;
  private pluginLoader: PluginLoader;
  private debounceTimer?: ReturnType<typeof setTimeout>;

  constructor(pluginLoader: PluginLoader, options?: { maxVersions?: number }) {
    super();
    this.pluginLoader = pluginLoader;
    this.maxVersions = options?.maxVersions ?? 3;
  }

  /**
   * Register a tool, maintaining version history.
   */
  registerTool(tool: VersionedTool): void {
    const existing = this.versionedTools.get(tool.name) ?? [];

    // Add new version
    existing.push({ ...tool, registeredAt: new Date().toISOString() });

    // Sort descending by semver (newest first)
    existing.sort((a, b) => compareSemver(b.version, a.version));

    // Trim to maxVersions
    if (existing.length > this.maxVersions) {
      existing.splice(this.maxVersions);
    }

    this.versionedTools.set(tool.name, existing);
    this.emit('tool:registered', { name: tool.name, version: tool.version });
  }

  /**
   * Execute a tool by name (latest version) or name@version.
   */
  async executeTool(nameOrVersioned: string, args: Record<string, unknown>): Promise<unknown> {
    const atIndex = nameOrVersioned.lastIndexOf('@');
    let tool: VersionedTool | undefined;

    if (atIndex === -1) {
      // No version specified - use latest
      tool = this.versionedTools.get(nameOrVersioned)?.[0];
    } else {
      const toolName = nameOrVersioned.slice(0, atIndex);
      const version = nameOrVersioned.slice(atIndex + 1);
      const history = this.versionedTools.get(toolName) ?? [];
      tool = history.find(t => t.version === version);
    }

    if (!tool) {
      throw new Error(`Tool not found: ${nameOrVersioned}`);
    }

    return tool.execute(args);
  }

  /**
   * Get the latest version of a tool.
   */
  getTool(name: string): VersionedTool | undefined {
    return this.versionedTools.get(name)?.[0];
  }

  /**
   * Roll back to the previous version of a tool.
   * Returns true if rollback succeeded, false if no previous version exists.
   */
  rollback(name: string): boolean {
    const versions = this.versionedTools.get(name);
    if (!versions || versions.length <= 1) {
      return false;
    }

    // Remove the current (newest) version
    const removed = versions.shift()!;
    this.versionedTools.set(name, versions);
    this.emit('tool:rolledback', { name, removedVersion: removed.version, currentVersion: versions[0]?.version });
    return true;
  }

  /**
   * Start watching the plugins directory for hot-reload.
   */
  startWatching(pluginsDir: string): void {
    if (this.watcher) {
      this.stopWatching();
    }

    try {
      this.watcher = fs.watch(pluginsDir, { recursive: true }, (event, filename) => {
        if (!filename) return;

        // Only watch .ts and .js files
        if (!filename.endsWith('.ts') && !filename.endsWith('.js')) return;

        // Debounce: coalesce multiple rapid changes
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(async () => {
          this.debounceTimer = undefined;
          const pluginName = filename.split(path.sep)[0];
          const pluginDir = path.join(pluginsDir, pluginName);
          await this.hotReload(pluginDir);
        }, 300);
      });

      this.watcher.on('error', (err) => {
        console.error('[DynamicToolLoader] Watch error:', err);
      });
    } catch (err) {
      console.warn('[DynamicToolLoader] Cannot watch directory:', pluginsDir, err);
    }
  }

  /**
   * Stop watching for hot-reload.
   */
  stopWatching(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
  }

  /**
   * Hot-reload a plugin from the given directory.
   */
  private async hotReload(pluginDir: string): Promise<void> {
    try {
      const plugin = await this.pluginLoader.loadPlugin(pluginDir);
      if (plugin.status === 'loaded') {
        this.registerPluginTools(plugin);
        this.emit('tool:hot-reloaded', { pluginDir });
      }
    } catch (err) {
      console.error('[DynamicToolLoader] Hot-reload failed:', pluginDir, err);
      this.emit('tool:hot-reload-failed', { pluginDir, error: err });
    }
  }

  /**
   * Load all tools from currently loaded plugins.
   */
  async loadToolsFromPlugins(): Promise<void> {
    const plugins = this.pluginLoader.list();
    for (const plugin of plugins) {
      if (plugin.status === 'loaded' && plugin.manifest.type === 'tool') {
        this.registerPluginTools(plugin);
      }
    }
  }

  /**
   * Extract and register tools from a loaded plugin.
   */
  private registerPluginTools(plugin: LoadedPlugin): void {
    if (plugin.manifest.type !== 'tool' || !plugin.module) return;

    const mod = plugin.module as Record<string, unknown>;

    // Support two export styles:
    // 1. Named exports: export const name, export const description, export async function execute
    // 2. Default export: export default { name, description, execute }
    let toolName: string | undefined;
    let toolDescription: string | undefined;
    let toolExecute: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;

    if (typeof mod['name'] === 'string' && typeof mod['execute'] === 'function') {
      toolName = mod['name'] as string;
      toolDescription = (mod['description'] as string) ?? '';
      toolExecute = mod['execute'] as (args: Record<string, unknown>) => Promise<unknown>;
    } else if (mod['default'] && typeof mod['default'] === 'object') {
      const def = mod['default'] as ToolPlugin;
      if (typeof def.name === 'string' && typeof def.execute === 'function') {
        toolName = def.name;
        toolDescription = def.description ?? '';
        toolExecute = def.execute as (args: Record<string, unknown>) => Promise<unknown>;
      }
    }

    if (!toolName || !toolExecute) {
      console.warn(`[DynamicToolLoader] Plugin ${plugin.manifest.name} does not export a valid tool`);
      return;
    }

    this.registerTool({
      name: toolName,
      version: plugin.manifest.version,
      description: toolDescription ?? '',
      execute: toolExecute,
      registeredAt: new Date().toISOString(),
    });
  }

  /**
   * List all registered tools with version info.
   */
  listTools(): Array<{ name: string; version: string; versions: number }> {
    const result: Array<{ name: string; version: string; versions: number }> = [];
    for (const [name, versions] of this.versionedTools) {
      if (versions.length > 0) {
        result.push({
          name,
          version: versions[0].version,
          versions: versions.length,
        });
      }
    }
    return result;
  }
}
