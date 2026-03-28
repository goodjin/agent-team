import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadContextCompressionConfig } from '../../src/config/context-compression.config.js';
import { createTempDir } from '../helpers/fixtures.js';

describe('loadContextCompressionConfig', () => {
  const keys = [
    'AGENT_CONTEXT_SOFT_MASTER_TOKENS',
    'AGENT_CONTEXT_HARD_MASTER_TOKENS',
    'AGENT_CONTEXT_KEEP_MASTER_TURNS',
    'AGENT_CONTEXT_HARD_MESSAGES_TOKENS',
    'AGENT_CONTEXT_KEEP_MESSAGES',
  ];

  beforeEach(() => {
    for (const k of keys) delete process.env[k];
  });

  afterEach(() => {
    for (const k of keys) delete process.env[k];
  });

  it('returns empty object when no file and no env', async () => {
    const dir = await createTempDir('ctx-cfg-');
    const o = loadContextCompressionConfig(dir);
    expect(o).toEqual({});
  });

  it('reads JSON file', async () => {
    const dir = await createTempDir('ctx-cfg-');
    await fs.writeFile(
      path.join(dir, 'context-compression.config.json'),
      JSON.stringify({ softTokensMaster: 111, keepLastMessages: 3 }),
      'utf-8'
    );
    const o = loadContextCompressionConfig(dir);
    expect(o.softTokensMaster).toBe(111);
    expect(o.keepLastMessages).toBe(3);
  });

  it('env overrides file', async () => {
    const dir = await createTempDir('ctx-cfg-');
    await fs.writeFile(
      path.join(dir, 'context-compression.config.json'),
      JSON.stringify({ softTokensMaster: 111 }),
      'utf-8'
    );
    process.env.AGENT_CONTEXT_SOFT_MASTER_TOKENS = '222';
    const o = loadContextCompressionConfig(dir);
    expect(o.softTokensMaster).toBe(222);
  });
});
