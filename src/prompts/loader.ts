import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';

/**
 * 提示词配置接口
 */
export interface PromptConfig {
  version: string;
  defaults: {
    language?: string;
    temperature?: number;
    maxTokens?: number;
  };
  roles: Record<string, RolePromptConfig>;
}

export interface RolePromptConfig {
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  contexts?: Record<string, string>; // 不同场景的提示词变体
  templates?: Record<string, string>; // 任务模板
}

/**
 * 提示词加载器
 * 支持从单个文件或目录加载提示词配置
 */
export class PromptLoader {
  private cache: Map<string, PromptConfig> = new Map();
  private cacheRoles: Map<string, RolePromptConfig> = new Map();

  /**
   * 从单个 JSON 配置文件加载
   */
  async loadFromFile(filePath: string): Promise<PromptConfig> {
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)!;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const config = JSON.parse(content) as PromptConfig;

    this.cache.set(filePath, config);

    // 缓存角色提示词
    for (const [roleName, roleConfig] of Object.entries(config.roles)) {
      this.cacheRoles.set(roleName, roleConfig);
    }

    return config;
  }

  /**
   * 从目录加载（支持多个文件）
   *
   * 目录结构可以是：
   * prompts/
   * ├── config.json           # 主配置文件
   * ├── roles/                # 角色提示词目录
   * │   ├── product-manager.json
   * │   ├── architect.json
   * │   └── developer.json
   * └── templates/            # 任务模板目录
   *     ├── requirement-analysis.md
   *     └── code-review.md
   *
   * 或者简化的结构：
   * prompts/
   * ├── product-manager.md
   * ├── architect.md
   * └── developer.md
   */
  async loadFromDirectory(dirPath: string): Promise<PromptConfig> {
    const configPath = path.join(dirPath, 'config.json');
    const rolesDir = path.join(dirPath, 'roles');
    const templatesDir = path.join(dirPath, 'templates');

    let config: PromptConfig = {
      version: '1.0.0',
      defaults: {},
      roles: {},
    };

    // 1. 尝试加载主配置文件
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      config = JSON.parse(content);
    } catch {
      // 没有 config.json，使用默认配置
    }

    // 2. 从 roles/ 目录加载角色提示词
    try {
      const roleFiles = await glob('**/*.json', {
        cwd: rolesDir,
        absolute: true,
      });

      for (const filePath of roleFiles) {
        const roleName = path.basename(filePath, '.json');
        const content = await fs.readFile(filePath, 'utf-8');
        const roleConfig = JSON.parse(content);

        config.roles[roleName] = {
          systemPrompt: roleConfig.systemPrompt || roleConfig.prompt || '',
          temperature: roleConfig.temperature,
          maxTokens: roleConfig.maxTokens,
          contexts: roleConfig.contexts,
          templates: roleConfig.templates,
        };

        this.cacheRoles.set(roleName, config.roles[roleName]);
      }
    } catch {
      // roles/ 目录不存在或为空
    }

    // 3. 尝试从根目录加载 .md 文件作为角色提示词
    try {
      const mdFiles = await glob('*.md', {
        cwd: dirPath,
        absolute: true,
      });

      for (const filePath of mdFiles) {
        const roleName = path.basename(filePath, '.md');
        const content = await fs.readFile(filePath, 'utf-8');

        // 如果角色不存在，添加它
        if (!config.roles[roleName]) {
          config.roles[roleName] = {
            systemPrompt: content,
          };
          this.cacheRoles.set(roleName, config.roles[roleName]);
        }
      }
    } catch {
      // 没有 .md 文件
    }

    // 4. 加载模板
    try {
      const templateFiles = await glob('**/*.{md,txt}', {
        cwd: templatesDir,
        absolute: true,
      });

      for (const filePath of templateFiles) {
        const templateName = path.basename(filePath, path.extname(filePath));
        const content = await fs.readFile(filePath, 'utf-8');

        // 将模板添加到相关角色
        // 这里可以根据文件名前缀匹配角色
        const [roleName] = templateName.split('-');
        if (config.roles[roleName]) {
          if (!config.roles[roleName].templates) {
            config.roles[roleName].templates = {};
          }
          config.roles[roleName].templates![templateName] = content;
        }
      }
    } catch {
      // templates/ 目录不存在
    }

    this.cache.set(dirPath, config);
    return config;
  }

  /**
   * 获取角色提示词配置
   */
  getRolePrompt(roleName: string): RolePromptConfig | undefined {
    return this.cacheRoles.get(roleName);
  }

  /**
   * 获取角色的系统提示词
   */
  getSystemPrompt(roleName: string, context?: string): string {
    const roleConfig = this.cacheRoles.get(roleName);
    if (!roleConfig) {
      return '';
    }

    // 如果指定了上下文，使用上下文变体
    if (context && roleConfig.contexts && roleConfig.contexts[context]) {
      return roleConfig.contexts[context];
    }

    return roleConfig.systemPrompt;
  }

  /**
   * 获取任务模板
   */
  getTemplate(roleName: string, templateName: string): string | undefined {
    const roleConfig = this.cacheRoles.get(roleName);
    return roleConfig?.templates?.[templateName];
  }

  /**
   * 渲染模板（替换变量）
   */
  renderTemplate(template: string, variables: Record<string, any>): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      result = result.replace(regex, String(value));
    }

    return result;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheRoles.clear();
  }

  /**
   * 预热缓存（提前加载所有配置）
   */
  async warmup(configPaths: string[]): Promise<void> {
    for (const configPath of configPaths) {
      try {
        const stats = await fs.stat(configPath);

        if (stats.isFile()) {
          await this.loadFromFile(configPath);
        } else if (stats.isDirectory()) {
          await this.loadFromDirectory(configPath);
        }
      } catch (error) {
        console.warn(`Failed to load config from ${configPath}:`, error);
      }
    }
  }
}

/**
 * 单例实例
 */
let globalLoader: PromptLoader | null = null;

export function getPromptLoader(): PromptLoader {
  if (!globalLoader) {
    globalLoader = new PromptLoader();
  }
  return globalLoader;
}

export function setPromptLoader(loader: PromptLoader): void {
  globalLoader = loader;
}
