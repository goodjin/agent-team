import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { PluginValidator } from '../../src/plugins/validator.js';
import { v9FixturesDir } from '../helpers/fixtures.js';

describe('PluginValidator', () => {
  it('accepts a valid tool manifest', () => {
    const r = PluginValidator.validate({
      name: 'nice-tool',
      version: '1.0.0',
      type: 'tool',
      description: 'ok',
      entry: 'index.js',
      tool: { toolName: 'nice-tool' },
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('reports invalid name and version', () => {
    const r = PluginValidator.validate({
      name: 'BadName',
      version: 'v1',
      type: 'tool',
      description: 'x',
      entry: 'index.js',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'name')).toBe(true);
    expect(r.errors.some((e) => e.field === 'version')).toBe(true);
  });

  it('validatePlugin checks entry file exists', async () => {
    const dir = path.join(v9FixturesDir(), 'minimal-tool');
    const r = await PluginValidator.validatePlugin(dir);
    expect(r.valid).toBe(true);
  });
});
