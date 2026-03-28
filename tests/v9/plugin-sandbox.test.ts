import { describe, expect, it, vi } from 'vitest';
import { PluginSandbox, PluginSandboxError } from '../../src/plugins/sandbox.js';
import type { PluginManifest } from '../../src/plugins/types.js';

describe('PluginSandbox', () => {
  it('validateImports flags child_process', () => {
    const code = `import { exec } from 'child_process';\nconsole.log(exec);`;
    const { safe, violations } = PluginSandbox.validateImports(code);
    expect(safe).toBe(false);
    expect(violations).toContain('child_process');
  });

  it('validateImports allows safe code', () => {
    const { safe, violations } = PluginSandbox.validateImports("export default { name: 'x', execute: async () => 1 }");
    expect(safe).toBe(true);
    expect(violations).toHaveLength(0);
  });

  it('runWithTimeout rejects slow init', async () => {
    const p = PluginSandbox.runWithTimeout(async () => {
      await new Promise((r) => setTimeout(r, 2000));
      return 1;
    }, 50);
    await expect(p).rejects.toThrow(/timed out/);
  });

  it('safeExecute isolates thrown errors', async () => {
    const r = await PluginSandbox.safeExecute(async () => {
      throw new Error('boom');
    }, 'p');
    expect(r.success).toBe(false);
    expect(r.error).toBe('boom');
  });

  it('createRestrictedImport blocks forbidden modules', async () => {
    const manifest: PluginManifest = {
      name: 't',
      version: '1.0.0',
      type: 'tool',
      description: 'd',
      entry: 'index.js',
    };
    const ri = PluginSandbox.createRestrictedImport(manifest);
    await expect(ri('child_process')).rejects.toMatchObject({
      name: 'PluginSandboxError',
    });
  });

  it('createSafeEnv hides sensitive keys', () => {
    const prev = process.env.OPENAI_API_KEY;
    vi.stubEnv('OPENAI_API_KEY', 'secret-key');
    try {
      const env = PluginSandbox.createSafeEnv();
      expect(env.OPENAI_API_KEY).toBeUndefined();
    } finally {
      if (prev === undefined) vi.unstubAllEnvs();
      else vi.stubEnv('OPENAI_API_KEY', prev);
    }
  });

  it('PluginSandboxError carries metadata', () => {
    const err = new PluginSandboxError({
      type: 'blocked-module',
      pluginName: 'x',
      blockedModule: 'vm',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.type).toBe('blocked-module');
    expect(err.blockedModule).toBe('vm');
  });
});
