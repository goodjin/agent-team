import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PluginValidator } from '../../src/plugins/validator.js';

describe('PluginValidator', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('validate() - valid manifests', () => {
    it('validates a valid tool plugin manifest', () => {
      const manifest = {
        name: 'http-request',
        version: '1.2.0',
        type: 'tool',
        description: 'Sends HTTP requests',
        entry: 'index.js',
        tool: { toolName: 'http-request' },
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates a valid role plugin manifest', () => {
      const manifest = {
        name: 'code-reviewer',
        version: '1.0.0',
        type: 'role',
        description: 'Reviews code',
        entry: 'index.js',
        role: { roleName: 'CodeReviewer' },
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates a valid hook plugin manifest', () => {
      const manifest = {
        name: 'audit-logger',
        version: '1.0.0',
        type: 'hook',
        description: 'Logs audit events',
        entry: 'index.js',
        hook: { events: ['tool:before', 'tool:after'] },
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts "main" field as alternative to "entry"', () => {
      const manifest = {
        name: 'logger-hook',
        version: '1.0.0',
        type: 'hook',
        description: 'Logger hook',
        main: 'index.js',
        hook: { events: ['tool:before'] },
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - name validation (kebab-case)', () => {
    it('rejects name starting with number', () => {
      const manifest = {
        name: '1invalid',
        version: '1.0.0',
        type: 'hook',
        description: 'test',
        entry: 'index.js',
        hook: { events: ['tool:before'] },
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('rejects name with uppercase letters', () => {
      const manifest = {
        name: 'MyPlugin',
        version: '1.0.0',
        type: 'hook',
        description: 'test',
        entry: 'index.js',
        hook: { events: ['tool:before'] },
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('rejects name with spaces', () => {
      const manifest = {
        name: 'my plugin',
        version: '1.0.0',
        type: 'hook',
        description: 'test',
        entry: 'index.js',
        hook: { events: ['tool:before'] },
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('accepts valid kebab-case names', () => {
      const validNames = ['my-plugin', 'http-request', 'plugin123', 'a', 'abc-123-def'];
      for (const name of validNames) {
        const manifest = {
          name,
          version: '1.0.0',
          type: 'hook',
          description: 'test',
          entry: 'index.js',
          hook: { events: ['tool:before'] },
        };
        const result = PluginValidator.validate(manifest);
        const nameError = result.errors.find((e) => e.field === 'name');
        expect(nameError).toBeUndefined();
      }
    });
  });

  describe('validate() - version validation (semver)', () => {
    it('rejects non-semver version', () => {
      const manifest = {
        name: 'test-plugin',
        version: '1.0',
        type: 'hook',
        description: 'test',
        entry: 'index.js',
        hook: { events: ['tool:before'] },
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'version')).toBe(true);
    });

    it('rejects version with text', () => {
      const manifest = {
        name: 'test-plugin',
        version: 'latest',
        type: 'hook',
        description: 'test',
        entry: 'index.js',
        hook: { events: ['tool:before'] },
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'version')).toBe(true);
    });

    it('accepts valid semver versions', () => {
      const validVersions = ['1.0.0', '0.0.1', '2.3.4', '1.0.0-alpha', '1.0.0+build.1'];
      for (const version of validVersions) {
        const manifest = {
          name: 'test-plugin',
          version,
          type: 'hook',
          description: 'test',
          entry: 'index.js',
          hook: { events: ['tool:before'] },
        };
        const result = PluginValidator.validate(manifest);
        const versionError = result.errors.find((e) => e.field === 'version');
        expect(versionError).toBeUndefined();
      }
    });
  });

  describe('validate() - type validation', () => {
    it('rejects invalid type', () => {
      const manifest = {
        name: 'test-plugin',
        version: '1.0.0',
        type: 'invalid-type',
        description: 'test',
        entry: 'index.js',
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'type')).toBe(true);
    });

    it('accepts all three valid types', () => {
      for (const type of ['tool', 'role', 'hook']) {
        const manifest: Record<string, unknown> = {
          name: 'test-plugin',
          version: '1.0.0',
          type,
          description: 'test',
          entry: 'index.js',
        };
        if (type === 'tool') manifest['tool'] = { toolName: 'test' };
        if (type === 'role') manifest['role'] = { roleName: 'TestRole' };
        if (type === 'hook') manifest['hook'] = { events: ['tool:before'] };

        const result = PluginValidator.validate(manifest);
        const typeError = result.errors.find((e) => e.field === 'type');
        expect(typeError).toBeUndefined();
      }
    });
  });

  describe('validate() - type-specific validation', () => {
    it('rejects tool plugin without tool.toolName', () => {
      const manifest = {
        name: 'test-tool',
        version: '1.0.0',
        type: 'tool',
        description: 'test',
        entry: 'index.js',
        // no tool.toolName
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'tool.toolName')).toBe(true);
    });

    it('rejects role plugin without role.roleName', () => {
      const manifest = {
        name: 'test-role',
        version: '1.0.0',
        type: 'role',
        description: 'test',
        entry: 'index.js',
        // no role.roleName
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'role.roleName')).toBe(true);
    });

    it('rejects hook plugin without hook.events', () => {
      const manifest = {
        name: 'test-hook',
        version: '1.0.0',
        type: 'hook',
        description: 'test',
        entry: 'index.js',
        // no hook.events
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'hook.events')).toBe(true);
    });

    it('rejects hook plugin with empty hook.events array', () => {
      const manifest = {
        name: 'test-hook',
        version: '1.0.0',
        type: 'hook',
        description: 'test',
        entry: 'index.js',
        hook: { events: [] },
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'hook.events')).toBe(true);
    });
  });

  describe('validate() - description validation', () => {
    it('adds warning for missing description', () => {
      const manifest = {
        name: 'test-hook',
        version: '1.0.0',
        type: 'hook',
        entry: 'index.js',
        hook: { events: ['tool:before'] },
      };
      const result = PluginValidator.validate(manifest);
      // Missing description: should be a warning, not necessarily an error
      // (per task spec: "description: 建议：非空（警告不报错）")
      expect(result.warnings).toBeDefined();
      expect((result.warnings ?? []).length).toBeGreaterThan(0);
    });

    it('rejects description longer than 200 chars', () => {
      const manifest = {
        name: 'test-hook',
        version: '1.0.0',
        type: 'hook',
        description: 'a'.repeat(201),
        entry: 'index.js',
        hook: { events: ['tool:before'] },
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'description')).toBe(true);
    });
  });

  describe('validate() - empty object', () => {
    it('returns errors for all required fields on empty object', () => {
      const result = PluginValidator.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // Should have errors for name, version, type, entry
      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain('name');
      expect(fields).toContain('version');
      expect(fields).toContain('type');
      expect(fields).toContain('entry');
    });

    it('returns error for non-object input', () => {
      const result = PluginValidator.validate('invalid');
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('root');
    });

    it('returns error for null input', () => {
      const result = PluginValidator.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('root');
    });
  });

  describe('validateEntry()', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validator-test-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('validates entry file existence', async () => {
      await fs.writeFile(path.join(tmpDir, 'index.js'), 'export default {};', 'utf-8');

      const manifest = {
        name: 'test',
        version: '1.0.0',
        type: 'hook' as const,
        description: 'test',
        entry: 'index.js',
        hook: { events: ['tool:before'] },
      };

      const result = await PluginValidator.validateEntry(manifest, tmpDir);
      expect(result.valid).toBe(true);
    });

    it('returns error when entry file does not exist', async () => {
      const manifest = {
        name: 'test',
        version: '1.0.0',
        type: 'hook' as const,
        description: 'test',
        entry: 'non-existent.js',
        hook: { events: ['tool:before'] },
      };

      const result = await PluginValidator.validateEntry(manifest, tmpDir);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'entry')).toBe(true);
    });
  });

  describe('validatePlugin()', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validator-plugin-test-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('validates a complete valid plugin directory', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'plugin.json'),
        JSON.stringify({
          name: 'my-hook',
          version: '1.0.0',
          type: 'hook',
          description: 'test hook',
          entry: 'index.js',
          hook: { events: ['tool:before'] },
        }),
        'utf-8'
      );
      await fs.writeFile(path.join(tmpDir, 'index.js'), 'export default {};', 'utf-8');

      const result = await PluginValidator.validatePlugin(tmpDir);
      expect(result.valid).toBe(true);
    });

    it('returns error when plugin.json does not exist', async () => {
      const result = await PluginValidator.validatePlugin(tmpDir);
      expect(result.valid).toBe(false);
    });

    it('returns error when plugin.json is invalid JSON', async () => {
      await fs.writeFile(path.join(tmpDir, 'plugin.json'), 'not-json', 'utf-8');
      const result = await PluginValidator.validatePlugin(tmpDir);
      expect(result.valid).toBe(false);
    });
  });

  describe('example plugin manifests validation', () => {
    it('validates logger-hook plugin.json', async () => {
      const manifest = {
        name: 'logger-hook',
        version: '1.0.0',
        type: 'hook',
        description: '记录所有工具调用的 Hook 插件',
        entry: 'index.js',
        permissions: [],
        hook: { events: ['tool:before', 'tool:after'], priority: 5 },
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(true);
    });

    it('validates http-request plugin.json', async () => {
      const manifest = {
        name: 'http-request',
        version: '1.2.0',
        type: 'tool',
        description: '发送 HTTP 请求并返回响应结果，支持 GET/POST/PUT/DELETE',
        entry: 'index.js',
        permissions: [],
        tool: { toolName: 'http-request', category: 'network' },
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(true);
    });

    it('validates code-reviewer plugin.json', async () => {
      const manifest = {
        name: 'code-reviewer',
        version: '1.0.0',
        type: 'role',
        description: '专注于代码质量审查的 SubAgent 角色，覆盖安全、性能、可读性三个维度',
        entry: 'index.js',
        permissions: [],
        role: { roleName: 'CodeReviewer', agentTypes: ['sub'] },
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(true);
    });

    it('validates audit-logger plugin.json', async () => {
      const manifest = {
        name: 'audit-logger',
        version: '1.0.0',
        type: 'hook',
        description: '在每次工具调用前后记录审计日志，用于合规审查',
        entry: 'index.js',
        permissions: [],
        hook: { events: ['tool:before', 'tool:after'], priority: 10 },
      };
      const result = PluginValidator.validate(manifest);
      expect(result.valid).toBe(true);
    });
  });
});
