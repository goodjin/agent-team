import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import Handlebars from 'handlebars';

export interface PromptMetadata {
  role?: string;
  version?: string;
  [key: string]: unknown;
}

export interface LoadedPrompt {
  content: string;
  metadata: PromptMetadata;
  template?: HandlebarsTemplateDelegate;
}

export class PromptLoader {
  private cache: Map<string, LoadedPrompt> = new Map();
  private promptsDir: string;
  private hotReload: boolean;

  constructor(promptsDir: string = 'prompts', hotReload: boolean = true) {
    this.promptsDir = promptsDir;
    this.hotReload = hotReload;
  }

  /**
   * 加载提示词
   */
  async load(promptPath: string): Promise<LoadedPrompt> {
    // 检查缓存
    if (!this.hotReload && this.cache.has(promptPath)) {
      return this.cache.get(promptPath)!;
    }

    const fullPath = path.join(this.promptsDir, promptPath);

    // 读取文件
    const content = await fs.readFile(fullPath, 'utf-8');

    // 解析 Front Matter
    const { data: metadata, content: promptContent } = matter(content);

    // 编译 Handlebars 模板
    const template = Handlebars.compile(promptContent);

    const prompt: LoadedPrompt = {
      content: promptContent,
      metadata,
      template,
    };

    // 缓存
    this.cache.set(promptPath, prompt);

    return prompt;
  }

  /**
   * 加载角色提示词
   */
  async loadRole(role: string): Promise<LoadedPrompt> {
    return this.load(`roles/${role}.md`);
  }

  /**
   * 渲染提示词（替换变量）
   */
  async render(promptPath: string, variables: Record<string, unknown> = {}): Promise<string> {
    const prompt = await this.load(promptPath);

    if (!prompt.template) {
      return prompt.content;
    }

    return prompt.template(variables);
  }

  /**
   * 渲染角色提示词
   */
  async renderRole(role: string, variables: Record<string, unknown> = {}): Promise<string> {
    return this.render(`roles/${role}.md`, variables);
  }

  /**
   * 列出所有提示词
   */
  async list(category?: string): Promise<string[]> {
    const dir = category ? path.join(this.promptsDir, category) : this.promptsDir;

    const files: string[] = [];

    const readDir = async (currentDir: string, prefix: string = '') => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          await readDir(
            path.join(currentDir, entry.name),
            path.join(prefix, entry.name)
          );
        } else if (entry.name.endsWith('.md')) {
          files.push(path.join(prefix, entry.name));
        }
      }
    };

    await readDir(dir);

    return files;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 重新加载提示词
   */
  async reload(promptPath: string): Promise<LoadedPrompt> {
    this.cache.delete(promptPath);
    return this.load(promptPath);
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
