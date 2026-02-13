export type PluginType = 'tool' | 'role' | 'hook';

export interface PluginManifest {
  name: string;           // unique identifier, kebab-case
  version: string;        // semver
  type: PluginType;
  description: string;
  entry: string;          // entry file path relative to plugin.json
  dependencies?: string[];  // names of other plugins this depends on
  permissions?: string[];   // declared required permissions
  config?: Record<string, unknown>;  // plugin config
}

export interface PluginContext {
  manifest: PluginManifest;
  pluginDir: string;
  config: Record<string, unknown>;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  module: unknown;  // ESM module
  context: PluginContext;
  status: 'loaded' | 'error' | 'disabled';
  error?: string;
  loadedAt: string;
}

export interface ToolPlugin {
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: string[];
}
