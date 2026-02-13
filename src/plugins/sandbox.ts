import type { PluginManifest } from './types.js';

// Forbidden dangerous modules
const FORBIDDEN_MODULES = ['child_process', 'cluster', 'worker_threads', 'vm'];

export class PluginSandboxError extends Error {
  readonly type: 'blocked-module' | 'timeout' | 'env-access-denied';
  readonly blockedModule?: string;
  readonly pluginName: string;

  constructor(opts: {
    type: 'blocked-module' | 'timeout' | 'env-access-denied';
    pluginName: string;
    message?: string;
    blockedModule?: string;
  }) {
    super(opts.message ?? `Plugin sandbox violation [${opts.type}] in plugin ${opts.pluginName}`);
    this.type = opts.type;
    this.pluginName = opts.pluginName;
    this.blockedModule = opts.blockedModule;
    this.name = 'PluginSandboxError';
  }
}

export class PluginSandbox {
  /**
   * Check if plugin source code contains forbidden import statements.
   * Note: This is a static analysis check, not a runtime interception.
   * ESM static imports cannot be intercepted at runtime.
   */
  static validateImports(code: string): { safe: boolean; violations: string[] } {
    const violations: string[] = [];

    for (const mod of FORBIDDEN_MODULES) {
      // Match: import ... from 'child_process' or import('child_process') or require('child_process')
      const patterns = [
        new RegExp(`from\\s+['"\`]${mod}['"\`]`),
        new RegExp(`import\\s*\\(\\s*['"\`]${mod}['"\`]`),
        new RegExp(`require\\s*\\(\\s*['"\`]${mod}['"\`]`),
      ];
      if (patterns.some(p => p.test(code))) {
        violations.push(mod);
      }
    }

    return { safe: violations.length === 0, violations };
  }

  /**
   * Run plugin initialization with timeout protection.
   */
  static async runWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number = 5000
  ): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Plugin initialization timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      return result;
    } catch (err) {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      throw err;
    }
  }

  /**
   * Wrap plugin execution, catching exceptions for isolation.
   */
  static async safeExecute<T>(
    fn: () => Promise<T>,
    pluginName: string
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    try {
      const result = await fn();
      return { success: true, result };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  }

  /**
   * Create a restricted import function that blocks forbidden modules.
   */
  static createRestrictedImport(
    manifest: PluginManifest,
    allowedExtra: string[] = []
  ): (moduleName: string) => Promise<unknown> {
    const effectiveBlocked = FORBIDDEN_MODULES.filter(m => !allowedExtra.includes(m));

    return async (moduleName: string): Promise<unknown> => {
      if (effectiveBlocked.includes(moduleName)) {
        throw new PluginSandboxError({
          type: 'blocked-module',
          blockedModule: moduleName,
          pluginName: manifest.name,
          message: `Plugin ${manifest.name} attempted to access blocked module: ${moduleName}`,
        });
      }
      return import(moduleName);
    };
  }

  /**
   * Create a safe environment proxy that filters sensitive env vars.
   */
  static createSafeEnv(
    sensitiveKeys: string[] = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'AWS_SECRET']
  ): NodeJS.ProcessEnv {
    return new Proxy(process.env, {
      get(target, prop: string) {
        if (sensitiveKeys.some(k => prop === k || prop.startsWith(k + '_'))) {
          return undefined;
        }
        return target[prop];
      },
      set() {
        return false;
      },
    });
  }
}
