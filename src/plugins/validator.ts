import * as fs from 'fs/promises';
import * as path from 'path';
import type { PluginManifest, ValidationResult, ValidationError } from './types.js';

export class PluginValidator {
  /**
   * Validate a plugin.json manifest object.
   */
  static validate(raw: unknown): ValidationResult {
    if (!raw || typeof raw !== 'object') {
      return {
        valid: false,
        errors: [{ field: 'root', message: '必须是 JSON 对象' }],
        warnings: [],
      };
    }

    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    const manifest = raw as Record<string, unknown>;

    // name: required, kebab-case
    if (!manifest['name'] || typeof manifest['name'] !== 'string') {
      errors.push({ field: 'name', message: '字段 "name" 是必填项' });
    } else if (!/^[a-z][a-z0-9-]*$/.test(manifest['name'] as string)) {
      errors.push({ field: 'name', message: '必须是 kebab-case 格式（以小写字母开头，只含小写字母、数字、连字符）' });
    }

    // version: required, semver
    if (!manifest['version'] || typeof manifest['version'] !== 'string') {
      errors.push({ field: 'version', message: '字段 "version" 是必填项' });
    } else if (!PluginValidator.isValidSemver(manifest['version'] as string)) {
      errors.push({ field: 'version', message: '必须是有效的 semver 版本号，如 "1.0.0"' });
    }

    // type: required, enum
    if (!manifest['type'] || typeof manifest['type'] !== 'string') {
      errors.push({ field: 'type', message: '字段 "type" 是必填项' });
    } else if (!['tool', 'role', 'hook'].includes(manifest['type'] as string)) {
      errors.push({ field: 'type', message: '必须是 "tool"、"role" 或 "hook" 之一' });
    }

    // entry: required, non-empty string (support both 'entry' and 'main')
    const entryValue = manifest['entry'] ?? manifest['main'];
    if (!entryValue || typeof entryValue !== 'string') {
      errors.push({ field: 'entry', message: '字段 "entry"（或 "main"）是必填项' });
    }

    // description: warning if empty
    if (!manifest['description'] || typeof manifest['description'] !== 'string') {
      warnings.push('建议填写 "description" 字段以说明插件功能');
    } else if ((manifest['description'] as string).length > 200) {
      errors.push({ field: 'description', message: '不能超过 200 字符' });
    }

    // dependencies: optional, string array
    if (manifest['dependencies'] !== undefined) {
      if (Array.isArray(manifest['dependencies'])) {
        for (const dep of manifest['dependencies'] as unknown[]) {
          if (typeof dep !== 'string') {
            errors.push({ field: 'dependencies', message: 'dependencies 必须是字符串数组' });
            break;
          }
        }
      } else if (typeof manifest['dependencies'] === 'object') {
        // Object format: { "dep-name": "^1.0.0" } - validate semver ranges
        for (const [dep, constraint] of Object.entries(
          manifest['dependencies'] as Record<string, unknown>
        )) {
          if (typeof constraint !== 'string' || !PluginValidator.isValidSemverRange(constraint)) {
            errors.push({
              field: `dependencies.${dep}`,
              message: `版本约束格式无效: "${String(constraint)}"（应为 semver range，如 ">=1.0.0 <2.0.0"）`,
            });
          }
        }
      }
    }

    // Type-specific validation (only if type is valid and no errors on type)
    const typeValue = manifest['type'] as string;
    if (errors.find((e) => e.field === 'type') === undefined && typeValue) {
      if (typeValue === 'tool') {
        const tool = manifest['tool'] as Record<string, unknown> | undefined;
        if (!tool?.['toolName'] || typeof tool['toolName'] !== 'string') {
          errors.push({ field: 'tool.toolName', message: 'type=tool 时 tool.toolName 是必填项' });
        }
      } else if (typeValue === 'role') {
        const role = manifest['role'] as Record<string, unknown> | undefined;
        if (!role?.['roleName'] || typeof role['roleName'] !== 'string') {
          errors.push({ field: 'role.roleName', message: 'type=role 时 role.roleName 是必填项' });
        }
      } else if (typeValue === 'hook') {
        const hook = manifest['hook'] as Record<string, unknown> | undefined;
        if (!hook?.['events'] || !Array.isArray(hook['events']) || hook['events'].length === 0) {
          errors.push({
            field: 'hook.events',
            message: 'type=hook 时 hook.events 是必填项且不能为空',
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate that the plugin entry file exists.
   */
  static async validateEntry(
    manifest: PluginManifest,
    pluginDir: string
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    const entryFile = manifest.entry;
    if (!entryFile) {
      return {
        valid: false,
        errors: [{ field: 'entry', message: '插件入口文件未指定' }],
        warnings,
      };
    }

    const entryPath = path.resolve(pluginDir, entryFile);
    try {
      await fs.access(entryPath);
    } catch {
      errors.push({
        field: 'entry',
        message: `入口文件不存在: ${entryPath}`,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Full validation: manifest + entry file existence.
   */
  static async validatePlugin(pluginDir: string): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Read and parse plugin.json
    const manifestPath = path.join(pluginDir, 'plugin.json');
    let manifest: unknown;
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      manifest = JSON.parse(content);
    } catch (err) {
      return {
        valid: false,
        errors: [{ field: 'plugin.json', message: `无法读取 plugin.json: ${String(err)}` }],
        warnings,
      };
    }

    // Validate manifest schema
    const schemaResult = PluginValidator.validate(manifest);
    errors.push(...schemaResult.errors);
    if (schemaResult.warnings && schemaResult.warnings.length > 0) {
      for (const w of schemaResult.warnings) warnings.push(w);
    }

    if (schemaResult.valid) {
      // Validate entry file exists
      const entryResult = await PluginValidator.validateEntry(
        manifest as PluginManifest,
        pluginDir
      );
      errors.push(...entryResult.errors);
      if (entryResult.warnings && entryResult.warnings.length > 0) {
        for (const w of entryResult.warnings) warnings.push(w);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private static isValidSemver(version: string): boolean {
    return /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(version);
  }

  private static isValidSemverRange(range: string): boolean {
    const trimmed = range.trim();
    // Support: *, ~1.0.0, ^1.0.0, >=1.0.0, >=1.0.0 <2.0.0, 1.0.0
    return /^(\*|[~^]?\d+\.\d+\.\d+(-[\w.]+)?|[><]=?\d+\.\d+\.\d+(-[\w.]+)?(\s+[><]=?\d+\.\d+\.\d+(-[\w.]+)?)?)$/.test(
      trimmed
    );
  }
}

// Re-export ValidationResult with warnings for external use
export type { ValidationResult, ValidationError } from './types.js';
