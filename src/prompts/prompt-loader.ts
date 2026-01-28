/**
 * 提示词加载器
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { PromptDefinition, PromptLoadOptions } from './types.js';

const BUILT_IN_PROMPTS_DIR = 'built-in';
const CUSTOM_PROMPTS_DIR = 'custom';
const SNAPSHOTS_DIR = 'snapshots';

const DEFAULT_PROMPTS_PATHS = [
  '~/.agent-team/prompts',
  './.agent-team/prompts',
  './prompts',
];

/**
 * 加载所有提示词
 */
export async function loadPrompts(
  options: PromptLoadOptions = {}
): Promise<{
  prompts: Map<string, PromptDefinition>;
  loaded: string[];
  errors: string[];
}> {
  const { roleId, includeBuiltIn = true, includeCustom = true } = options;

  const prompts = new Map<string, PromptDefinition>();
  const loaded: string[] = [];
  const errors: string[] = [];

  // 加载内置提示词
  if (includeBuiltIn) {
    try {
      const builtInPrompts = await loadBuiltInPrompts();
      for (const [id, prompt] of builtInPrompts) {
        if (!roleId || prompt.roleId === roleId) {
          prompts.set(id, prompt);
          loaded.push(id);
        }
      }
    } catch (error) {
      errors.push(`加载内置提示词失败: ${error}`);
    }
  }

  // 加载自定义提示词
  if (includeCustom) {
    try {
      const customPrompts = await loadCustomPrompts();
      for (const [id, prompt] of customPrompts) {
        if (!roleId || prompt.roleId === roleId) {
          prompts.set(id, prompt);
          loaded.push(id);
        }
      }
    } catch (error) {
      errors.push(`加载自定义提示词失败: ${error}`);
    }
  }

  return { prompts, loaded, errors };
}

/**
 * 加载内置提示词
 */
export async function loadBuiltInPrompts(): Promise<Map<string, PromptDefinition>> {
  const prompts = new Map<string, PromptDefinition>();

  const builtInDir = path.join(process.cwd(), 'src', 'prompts', BUILT_IN_PROMPTS_DIR);

  try {
    const files = await fs.readdir(builtInDir);
    const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of yamlFiles) {
      try {
        const filePath = path.join(builtInDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const prompt = parsePromptYaml(content);

        if (prompt) {
          prompts.set(prompt.roleId, prompt);
        }
      } catch (error) {
        console.warn(`加载提示词文件 ${file} 失败: ${error}`);
      }
    }
  } catch (error) {
    console.warn(`内置提示词目录不存在: ${builtInDir}`);
  }

  return prompts;
}

/**
 * 加载自定义提示词
 */
export async function loadCustomPrompts(): Promise<Map<string, PromptDefinition>> {
  const prompts = new Map<string, PromptDefinition>();

  const customDir = await findCustomPromptsDir();

  if (!customDir) {
    return prompts;
  }

  try {
    const files = await fs.readdir(customDir);
    const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of yamlFiles) {
      try {
        const filePath = path.join(customDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const prompt = parsePromptYaml(content);

        if (prompt) {
          prompts.set(prompt.roleId, prompt);
        }
      } catch (error) {
        console.warn(`加载自定义提示词文件 ${file} 失败: ${error}`);
      }
    }
  } catch (error) {
    console.warn(`自定义提示词目录不存在: ${customDir}`);
  }

  return prompts;
}

/**
 * 查找自定义提示词目录
 */
export async function findCustomPromptsDir(): Promise<string | null> {
  for (const defaultPath of DEFAULT_PROMPTS_PATHS) {
    const expanded = expandPath(defaultPath);
    try {
      await fs.access(expanded);
      return expanded;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * 加载单个提示词
 */
export async function loadPrompt(roleId: string): Promise<PromptDefinition | null> {
  // 先尝试从内置提示词加载
  const builtInPrompts = await loadBuiltInPrompts();
  if (builtInPrompts.has(roleId)) {
    return builtInPrompts.get(roleId)!;
  }

  // 再尝试从自定义提示词加载
  const customPrompts = await loadCustomPrompts();
  if (customPrompts.has(roleId)) {
    return customPrompts.get(roleId)!;
  }

  return null;
}

/**
 * 解析提示词 YAML
 */
function parsePromptYaml(content: string): PromptDefinition | null {
  const lines = content.split('\n');
  const prompt: any = {
    taskTemplates: {},
    contexts: {},
    outputFormat: {
      code: { language: 'typescript', style: 'pretty' },
      tests: { framework: 'jest', coverage: true },
      documentation: { style: 'markdown' },
    },
    tags: [],
  };

  let currentSection: string | null = null;
  let currentTemplate: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过注释和空行
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // 检测节
    if (trimmed.endsWith(':') && !trimmed.startsWith('- ')) {
      const sectionName = trimmed.slice(0, -1).trim();

      // 保存之前的模板
      if (currentTemplate.length > 0 && currentSection) {
        if (currentSection.startsWith('taskTemplates.')) {
          const templateName = currentSection.split('.')[1];
          prompt.taskTemplates[templateName] = {
            template: currentTemplate.join('\n').trim(),
          };
        }
        currentTemplate = [];
      }

      currentSection = sectionName;
      continue;
    }

    // 处理列表项
    if (trimmed.startsWith('- ')) {
      const item = trimmed.slice(2).trim();
      if (item) {
        if (currentSection === 'tags') {
          prompt.tags.push(item);
        } else if (currentSection?.startsWith('taskTemplates.')) {
          // 在模板中处理列表
          currentTemplate.push(line);
        }
      }
      continue;
    }

    // 处理键值对
    if (trimmed.includes(':') && !trimmed.startsWith('- ')) {
      const [key, value] = trimmed.split(':').map((s) => s.trim());

      // 保存之前的模板
      if (currentTemplate.length > 0 && currentSection) {
        if (currentSection.startsWith('taskTemplates.')) {
          const templateName = currentSection.split('.')[1];
          prompt.taskTemplates[templateName] = {
            template: currentTemplate.join('\n').trim(),
          };
        }
        currentTemplate = [];
        currentSection = null;
      }

      // 处理简单字段
      if (['roleId', 'version', 'lastUpdated', 'author', 'systemPrompt'].includes(key)) {
        prompt[key] = value;
      }

      // 处理输出格式
      if (currentSection === 'outputFormat') {
        if (!prompt.outputFormat[key]) {
          prompt.outputFormat[key] = {};
        }
        if (value) {
          if (key === 'coverage') {
            prompt.outputFormat[key] = value === 'true';
          } else {
            prompt.outputFormat[key] = value;
          }
        }
      }
    }

    // 收集多行模板内容
    if (currentSection?.startsWith('taskTemplates.')) {
      currentTemplate.push(line);
    } else if (currentSection === 'systemPrompt') {
      prompt.systemPrompt += line + '\n';
    }
  }

  // 保存最后的模板
  if (currentTemplate.length > 0 && currentSection) {
    if (currentSection.startsWith('taskTemplates.')) {
      const templateName = currentSection.split('.')[1];
      prompt.taskTemplates[templateName] = {
        template: currentTemplate.join('\n').trim(),
      };
    }
  }

  // 清理 systemPrompt
  if (prompt.systemPrompt) {
    prompt.systemPrompt = prompt.systemPrompt.trim();
  }

  // 验证必需字段
  if (!prompt.roleId || !prompt.version) {
    return null;
  }

  return prompt as PromptDefinition;
}

/**
 * 展开路径
 */
function expandPath(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  if (!path.isAbsolute(filePath)) {
    return path.resolve(filePath);
  }
  return filePath;
}

/**
 * 获取所有提示词角色 ID
 */
export async function getAllPromptRoleIds(): Promise<string[]> {
  const { prompts } = await loadPrompts();
  return Array.from(prompts.keys());
}

/**
 * 检查提示词是否存在
 */
export async function promptExists(roleId: string): Promise<boolean> {
  const prompt = await loadPrompt(roleId);
  return prompt !== null;
}

/**
 * 获取提示词路径
 */
export async function getPromptPath(roleId: string): Promise<string | null> {
  // 检查内置提示词
  const builtInDir = path.join(process.cwd(), 'src', 'prompts', BUILT_IN_PROMPTS_DIR);
  const builtInPath = path.join(builtInDir, `${roleId}.yaml`);
  try {
    await fs.access(builtInPath);
    return builtInPath;
  } catch {
    // 检查自定义提示词
  }

  const customDir = await findCustomPromptsDir();
  if (customDir) {
    const customPath = path.join(customDir, `${roleId}.yaml`);
    try {
      await fs.access(customPath);
      return customPath;
    } catch {
      return null;
    }
  }

  return null;
}
