import * as fs from 'fs/promises';
import * as path from 'path';
import { PluginValidator } from './validator.js';
import type { PluginManifest } from './types.js';

export interface RegistryEntry {
  name: string;
  version: string;
  description: string;
  type: string;
  localPath?: string;
  installedAt?: string;
  usageCount: number;
  avgScore: number;
  enabled: boolean;
}

export interface PluginRegistryIndex {
  version: '1.0.0';
  updatedAt: string;
  plugins: RegistryEntry[];
}

export class PluginRegistry {
  private indexPath: string;
  private index: PluginRegistryIndex = {
    version: '1.0.0',
    updatedAt: '',
    plugins: [],
  };
  private scoreHistory = new Map<string, number[]>();

  constructor(options?: { indexPath?: string }) {
    this.indexPath =
      options?.indexPath ?? path.join(process.cwd(), 'plugins', 'registry.json');
  }

  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.indexPath, 'utf-8');
      const data = JSON.parse(content) as PluginRegistryIndex;
      this.index = data;
      // Rebuild score history from existing avgScore and usageCount
      // (approximate, since we don't store full history)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
      // File doesn't exist - start fresh
      this.index = {
        version: '1.0.0',
        updatedAt: new Date().toISOString(),
        plugins: [],
      };
    }
  }

  async save(): Promise<void> {
    this.index.updatedAt = new Date().toISOString();

    // Ensure directory exists
    await fs.mkdir(path.dirname(this.indexPath), { recursive: true });

    // Atomic write: tmp file + rename
    const tmpPath = this.indexPath + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify(this.index, null, 2), 'utf-8');
    await fs.rename(tmpPath, this.indexPath);
  }

  /**
   * Install a plugin from a local directory path.
   */
  async install(localPath: string): Promise<RegistryEntry> {
    const absPath = path.resolve(localPath);

    // Check directory exists
    try {
      await fs.access(absPath);
    } catch {
      throw new Error(`插件目录不存在: ${localPath}`);
    }

    // Read and validate plugin.json
    const manifestPath = path.join(absPath, 'plugin.json');
    let raw: string;
    try {
      raw = await fs.readFile(manifestPath, 'utf-8');
    } catch {
      throw new Error(`无法读取 plugin.json: ${absPath}`);
    }

    let manifest: unknown;
    try {
      manifest = JSON.parse(raw);
    } catch {
      throw new Error(`plugin.json JSON 格式无效: ${absPath}`);
    }

    const validation = PluginValidator.validate(manifest);
    if (!validation.valid) {
      const errMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join(', ');
      throw new Error(`plugin.json 验证失败: ${errMsg}`);
    }

    const m = manifest as PluginManifest;
    const entryField = (manifest as Record<string, unknown>)['main'] ?? m.entry;

    // Check if already installed
    const existing = this.index.plugins.find((p) => p.name === m.name);
    if (existing) {
      throw new Error(`插件 "${m.name}" 已安装（版本 ${existing.version}）`);
    }

    const entry: RegistryEntry = {
      name: m.name,
      version: m.version,
      description: m.description,
      type: m.type,
      localPath: absPath,
      installedAt: new Date().toISOString(),
      usageCount: 0,
      avgScore: 0,
      enabled: true,
    };

    this.index.plugins.push(entry);
    await this.save();

    return entry;
  }

  /**
   * Uninstall a plugin by name.
   */
  async uninstall(name: string): Promise<void> {
    const idx = this.index.plugins.findIndex((p) => p.name === name);
    if (idx === -1) {
      throw new Error(`插件 "${name}" 未安装`);
    }
    this.index.plugins.splice(idx, 1);
    this.scoreHistory.delete(name);
    await this.save();
  }

  /**
   * Update usage statistics for a plugin.
   */
  async updateStats(name: string, score?: number): Promise<void> {
    const entry = this.index.plugins.find((p) => p.name === name);
    if (!entry) return;

    entry.usageCount++;

    if (score !== undefined) {
      const history = this.scoreHistory.get(name) ?? [];
      history.push(score);
      if (history.length > 100) history.shift();
      this.scoreHistory.set(name, history);

      // Rolling average
      entry.avgScore =
        Math.round(
          (history.reduce((s, v) => s + v, 0) / history.length) * 10
        ) / 10;
    }

    await this.save();
  }

  /**
   * List all plugins, optionally filtered.
   */
  list(filter?: { type?: string; enabled?: boolean }): RegistryEntry[] {
    let result = this.index.plugins;
    if (filter?.type !== undefined) {
      result = result.filter((p) => p.type === filter.type);
    }
    if (filter?.enabled !== undefined) {
      result = result.filter((p) => p.enabled === filter.enabled);
    }
    return result;
  }

  /**
   * Search plugins by keyword in name or description.
   */
  search(keyword: string): RegistryEntry[] {
    const kw = keyword.toLowerCase();
    return this.index.plugins.filter(
      (p) =>
        p.name.toLowerCase().includes(kw) ||
        p.description.toLowerCase().includes(kw)
    );
  }

  /**
   * Get aggregate statistics about installed plugins.
   */
  getStats(): { total: number; enabled: number; byType: Record<string, number> } {
    const total = this.index.plugins.length;
    const enabled = this.index.plugins.filter((p) => p.enabled).length;
    const byType: Record<string, number> = {};
    for (const p of this.index.plugins) {
      byType[p.type] = (byType[p.type] ?? 0) + 1;
    }
    return { total, enabled, byType };
  }
}
