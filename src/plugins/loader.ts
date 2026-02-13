import * as fs from 'fs/promises';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { PluginManifest, LoadedPlugin, PluginContext } from './types.js';
import { PluginSandbox } from './sandbox.js';

function makeLogger(name: string) {
  return {
    info: (msg: string) => console.log(`[plugin:${name}] INFO: ${msg}`),
    warn: (msg: string) => console.warn(`[plugin:${name}] WARN: ${msg}`),
    error: (msg: string) => console.error(`[plugin:${name}] ERROR: ${msg}`),
  };
}

export class PluginLoader {
  private plugins = new Map<string, LoadedPlugin>();
  private pluginsDir: string;

  constructor(pluginsDir?: string) {
    this.pluginsDir = pluginsDir ?? path.join(process.cwd(), 'plugins');
  }

  /**
   * Scan and load all plugins from pluginsDir.
   */
  async loadAll(): Promise<LoadedPlugin[]> {
    let entries: string[];
    try {
      const dirEntries = await fs.readdir(this.pluginsDir, { withFileTypes: true });
      entries = dirEntries
        .filter(e => e.isDirectory())
        .map(e => path.join(this.pluginsDir, e.name));
    } catch {
      return [];
    }

    // Read manifests first for dependency sorting
    const manifests: Array<{ dir: string; manifest: PluginManifest }> = [];
    const failed: Array<{ dir: string; error: string }> = [];

    for (const dir of entries) {
      try {
        const manifest = await this.readManifest(dir);
        manifests.push({ dir, manifest });
      } catch (err) {
        failed.push({ dir, error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Topological sort by dependencies
    let sortedManifests: PluginManifest[];
    try {
      sortedManifests = this.topologicalSort(manifests.map(m => m.manifest));
    } catch (err) {
      // Cycle detected - skip all plugins involved
      console.error(`[PluginLoader] Dependency cycle detected: ${err instanceof Error ? err.message : String(err)}`);
      sortedManifests = [];
    }

    // Load in sorted order
    const loaded: LoadedPlugin[] = [];
    for (const manifest of sortedManifests) {
      const entry = manifests.find(m => m.manifest.name === manifest.name);
      if (!entry) continue;
      try {
        const plugin = await this.loadPlugin(entry.dir);
        loaded.push(plugin);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorPlugin: LoadedPlugin = {
          manifest,
          module: null,
          context: this.makeContext(manifest, entry.dir),
          status: 'error',
          error: errorMsg,
          loadedAt: new Date().toISOString(),
        };
        this.plugins.set(manifest.name, errorPlugin);
        loaded.push(errorPlugin);
      }
    }

    return loaded;
  }

  /**
   * Load a single plugin from a directory.
   */
  async loadPlugin(pluginDir: string): Promise<LoadedPlugin> {
    const manifest = await this.readManifest(pluginDir);

    const entryPath = path.resolve(pluginDir, manifest.entry);

    // Check for forbidden imports via static analysis
    try {
      const code = await fs.readFile(entryPath, 'utf-8');
      const { safe, violations } = PluginSandbox.validateImports(code);
      if (!safe) {
        const context = this.makeContext(manifest, pluginDir);
        const errorPlugin: LoadedPlugin = {
          manifest,
          module: null,
          context,
          status: 'error',
          error: `Forbidden module imports detected: ${violations.join(', ')}`,
          loadedAt: new Date().toISOString(),
        };
        this.plugins.set(manifest.name, errorPlugin);
        return errorPlugin;
      }
    } catch {
      // If we can't read the file, we'll let the import fail naturally
    }

    // Dynamic ESM import with cache busting
    const url = pathToFileURL(entryPath).href + `?t=${Date.now()}`;
    const mod = await import(url);

    const context = this.makeContext(manifest, pluginDir);

    const loaded: LoadedPlugin = {
      manifest,
      module: mod,
      context,
      status: 'loaded',
      loadedAt: new Date().toISOString(),
    };

    this.plugins.set(manifest.name, loaded);
    return loaded;
  }

  /**
   * Read and validate plugin.json from a plugin directory.
   */
  private async readManifest(pluginDir: string): Promise<PluginManifest> {
    const manifestPath = path.join(pluginDir, 'plugin.json');
    let raw: string;
    try {
      raw = await fs.readFile(manifestPath, 'utf-8');
    } catch {
      throw new Error(`Cannot read plugin.json in ${pluginDir}`);
    }

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON in plugin.json: ${pluginDir}`);
    }

    return this.validateManifest(data, pluginDir);
  }

  /**
   * Validate manifest data against the PluginManifest schema.
   */
  private validateManifest(data: unknown, pluginDir: string): PluginManifest {
    if (!data || typeof data !== 'object') {
      throw new Error(`plugin.json must be an object in ${pluginDir}`);
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj['name'] !== 'string' || !obj['name']) {
      throw new Error(`plugin.json missing required field 'name' in ${pluginDir}`);
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(obj['name'] as string)) {
      throw new Error(`plugin.json 'name' must be kebab-case in ${pluginDir}`);
    }
    if (typeof obj['version'] !== 'string' || !obj['version']) {
      throw new Error(`plugin.json missing required field 'version' in ${pluginDir}`);
    }
    if (!/^\d+\.\d+\.\d+/.test(obj['version'] as string)) {
      throw new Error(`plugin.json 'version' must be semver in ${pluginDir}`);
    }
    const validTypes = ['tool', 'role', 'hook'];
    if (typeof obj['type'] !== 'string' || !validTypes.includes(obj['type'] as string)) {
      throw new Error(`plugin.json 'type' must be one of: ${validTypes.join(', ')} in ${pluginDir}`);
    }
    if (typeof obj['description'] !== 'string' || !obj['description']) {
      throw new Error(`plugin.json missing required field 'description' in ${pluginDir}`);
    }
    if (typeof obj['entry'] !== 'string' || !obj['entry']) {
      throw new Error(`plugin.json missing required field 'entry' in ${pluginDir}`);
    }

    return {
      name: obj['name'] as string,
      version: obj['version'] as string,
      type: obj['type'] as 'tool' | 'role' | 'hook',
      description: obj['description'] as string,
      entry: obj['entry'] as string,
      dependencies: Array.isArray(obj['dependencies']) ? (obj['dependencies'] as string[]) : [],
      permissions: Array.isArray(obj['permissions']) ? (obj['permissions'] as string[]) : [],
      config: (obj['config'] as Record<string, unknown>) ?? {},
    };
  }

  /**
   * Topological sort using Kahn's algorithm.
   * Throws if a cycle is detected.
   */
  private topologicalSort(manifests: PluginManifest[]): PluginManifest[] {
    const nameToManifest = new Map<string, PluginManifest>();
    for (const m of manifests) {
      nameToManifest.set(m.name, m);
    }

    // Build adjacency list: name -> dependents (who depends on this plugin)
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>(); // dependency -> plugins that depend on it

    for (const m of manifests) {
      if (!inDegree.has(m.name)) inDegree.set(m.name, 0);
      if (!dependents.has(m.name)) dependents.set(m.name, []);

      for (const dep of m.dependencies ?? []) {
        if (!inDegree.has(dep)) inDegree.set(dep, 0);
        if (!dependents.has(dep)) dependents.set(dep, []);

        inDegree.set(m.name, (inDegree.get(m.name) ?? 0) + 1);
        dependents.get(dep)!.push(m.name);
      }
    }

    // BFS: start with nodes that have no dependencies
    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0 && nameToManifest.has(name)) {
        queue.push(name);
      }
    }

    const result: PluginManifest[] = [];
    while (queue.length > 0) {
      const name = queue.shift()!;
      const manifest = nameToManifest.get(name);
      if (manifest) result.push(manifest);

      for (const dependent of dependents.get(name) ?? []) {
        const newDegree = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    // Check for cycles
    const cycleNodes = manifests.filter(m => !result.find(r => r.name === m.name));
    if (cycleNodes.length > 0) {
      throw new Error(`Circular dependency detected involving: ${cycleNodes.map(m => m.name).join(', ')}`);
    }

    return result;
  }

  private makeContext(manifest: PluginManifest, pluginDir: string): PluginContext {
    return {
      manifest,
      pluginDir,
      config: manifest.config ?? {},
      logger: makeLogger(manifest.name),
    };
  }

  /**
   * Get a loaded plugin by name.
   */
  get(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * List all loaded plugins.
   */
  list(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Unload a plugin.
   */
  unload(name: string): void {
    this.plugins.delete(name);
  }
}
