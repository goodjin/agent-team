/**
 * 角色加载器
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { RoleDefinition, RoleConfigFile, RoleLoadOptions } from './types.js';
import { validateRole } from './role-validator.js';

const BUILT_IN_ROLES_DIR = 'built-in';
const CUSTOM_ROLES_DIR = 'custom';

const DEFAULT_ROLES_PATHS = [
  '~/.agent-team/roles',
  './.agent-team/roles',
  './roles',
];

/**
 * 加载所有角色
 */
export async function loadRoles(
  options: RoleLoadOptions = {}
): Promise<{
  roles: Map<string, RoleDefinition>;
  loaded: string[];
  errors: string[];
}> {
  const {
    includeBuiltIn = true,
    includeCustom = true,
    includeDisabled = false,
    tags,
  } = options;

  const roles = new Map<string, RoleDefinition>();
  const loaded: string[] = [];
  const errors: string[] = [];

  // 加载内置角色
  if (includeBuiltIn) {
    try {
      const builtInRoles = await loadBuiltInRoles();
      for (const [id, role] of builtInRoles) {
        if (!includeDisabled && role.properties.canDisable === false) {
          roles.set(id, role);
          loaded.push(id);
        } else if (includeDisabled) {
          roles.set(id, role);
          loaded.push(id);
        }
      }
    } catch (error) {
      errors.push(`加载内置角色失败: ${error}`);
    }
  }

  // 加载自定义角色
  if (includeCustom) {
    try {
      const customRoles = await loadCustomRoles();
      for (const [id, role] of customRoles) {
        if (!includeDisabled && role.properties.canDisable) {
          roles.set(id, role);
          loaded.push(id);
        } else if (includeDisabled) {
          roles.set(id, role);
          loaded.push(id);
        }
      }
    } catch (error) {
      errors.push(`加载自定义角色失败: ${error}`);
    }
  }

  // 按标签过滤
  if (tags && tags.length > 0) {
    for (const [id, role] of roles.entries()) {
      const hasTag = tags.some((tag) => role.tags.includes(tag));
      if (!hasTag) {
        roles.delete(id);
      }
    }
  }

  return { roles, loaded, errors };
}

/**
 * 加载内置角色
 */
export async function loadBuiltInRoles(): Promise<Map<string, RoleDefinition>> {
  const roles = new Map<string, RoleDefinition>();

  // 从当前包加载内置角色
  const builtInDir = path.join(process.cwd(), 'src', 'roles', BUILT_IN_ROLES_DIR);

  try {
    const files = await fs.readdir(builtInDir);
    const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of yamlFiles) {
      try {
        const filePath = path.join(builtInDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const role = parseRoleYaml(content, file);

        if (role) {
          const validation = validateRole(role);
          if (validation.isValid) {
            roles.set(role.id, role);
          } else {
            console.warn(`角色 ${file} 验证失败: ${validation.errors.join(', ')}`);
          }
        }
      } catch (error) {
        console.warn(`加载角色文件 ${file} 失败: ${error}`);
      }
    }
  } catch (error) {
    console.warn(`内置角色目录不存在: ${builtInDir}`);
  }

  return roles;
}

/**
 * 加载自定义角色
 */
export async function loadCustomRoles(): Promise<Map<string, RoleDefinition>> {
  const roles = new Map<string, RoleDefinition>();

  // 查找自定义角色目录
  const customDir = await findCustomRolesDir();

  if (!customDir) {
    return roles;
  }

  try {
    const files = await fs.readdir(customDir);
    const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of yamlFiles) {
      try {
        const filePath = path.join(customDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const role = parseRoleYaml(content, file);

        if (role && role.type === 'custom') {
          const validation = validateRole(role);
          if (validation.isValid) {
            roles.set(role.id, role);
          } else {
            console.warn(`自定义角色 ${file} 验证失败: ${validation.errors.join(', ')}`);
          }
        }
      } catch (error) {
        console.warn(`加载自定义角色文件 ${file} 失败: ${error}`);
      }
    }
  } catch (error) {
    console.warn(`自定义角色目录不存在: ${customDir}`);
  }

  return roles;
}

/**
 * 查找自定义角色目录
 */
export async function findCustomRolesDir(): Promise<string | null> {
  for (const defaultPath of DEFAULT_ROLES_PATHS) {
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
 * 加载单个角色
 */
export async function loadRole(roleId: string): Promise<RoleDefinition | null> {
  // 先尝试从内置角色加载
  const builtInRoles = await loadBuiltInRoles();
  if (builtInRoles.has(roleId)) {
    return builtInRoles.get(roleId)!;
  }

  // 再尝试从自定义角色加载
  const customRoles = await loadCustomRoles();
  if (customRoles.has(roleId)) {
    return customRoles.get(roleId)!;
  }

  return null;
}

/**
 * 解析角色 YAML
 */
function parseRoleYaml(content: string, fileName: string): RoleDefinition | null {
  const lines = content.split('\n');
  const role: any = {
    capabilities: [],
    responsibilities: [],
    constraints: [],
    tags: [],
    properties: {
      canDelete: true,
      canDisable: true,
      hidden: false,
    },
  };

  let currentSection: string | null = null;
  let currentList: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过注释和空行
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // 计算缩进
    const indent = line.search(/\S/);

    // 检测节
    if (trimmed.endsWith(':') && !trimmed.startsWith('-')) {
      const sectionName = trimmed.slice(0, -1).trim();

      // 保存之前的列表
      if (currentList.length > 0 && currentSection) {
        role[currentSection] = currentList;
        currentList = [];
      }

      // 处理特殊节
      if (sectionName === 'properties') {
        currentSection = 'properties';
        role.properties = { ...role.properties };
      } else if (sectionName === 'llm') {
        currentSection = 'llm';
        role.llm = {};
      } else {
        currentSection = sectionName;
      }
      continue;
    }

    // 处理列表项
    if (trimmed.startsWith('- ')) {
      const item = trimmed.slice(2).trim();
      if (item) {
        // 处理嵌套结构
        if (item.includes(':')) {
          const [key, value] = item.split(':').map((s) => s.trim());
          if (currentSection === 'properties') {
            if (key === 'canDelete' || key === 'canDisable' || key === 'hidden') {
              role.properties[key] = value === 'true';
            } else {
              role[key] = value;
            }
          } else if (currentSection === 'llm') {
            if (key === 'provider' || key === 'model') {
              role.llm[key] = value;
            } else if (key === 'temperature' || key === 'maxTokens') {
              role.llm[key] = parseFloat(value);
            }
          } else {
            currentList.push(item);
          }
        } else {
          currentList.push(item);
        }
      }
      continue;
    }

    // 处理键值对（无缩进或缩进较小）
    if (indent <= 2 && trimmed.includes(':')) {
      const [key, value] = trimmed.split(':').map((s) => s.trim());

      // 保存之前的列表
      if (currentList.length > 0 && currentSection) {
        role[currentSection] = currentList;
        currentList = [];
        currentSection = null;
      }

      if (key === 'id' || key === 'name' || key === 'description' || key === 'type' ||
          key === 'extends' || key === 'promptFile' || key === 'version' ||
          key === 'lastUpdated' || key === 'author') {
        role[key] = value;
      }
    }
  }

  // 保存最后的列表
  if (currentList.length > 0 && currentSection) {
    role[currentSection] = currentList;
  }

  // 验证必需字段
  if (!role.id || !role.name || !role.type) {
    return null;
  }

  // 设置默认值
  if (!role.properties) {
    role.properties = { canDelete: true, canDisable: true, hidden: false };
  }
  if (!role.tags) {
    role.tags = [];
  }

  return role as RoleDefinition;
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
 * 获取所有角色 ID
 */
export async function getAllRoleIds(): Promise<string[]> {
  const { roles } = await loadRoles();
  return Array.from(roles.keys());
}

/**
 * 获取角色类型
 */
export async function getRoleType(roleId: string): Promise<'built-in' | 'custom' | 'extends' | null> {
  const role = await loadRole(roleId);
  return role?.type || null;
}

/**
 * 检查角色是否存在
 */
export async function roleExists(roleId: string): Promise<boolean> {
  const role = await loadRole(roleId);
  return role !== null;
}

/**
 * 检查角色是否可删除
 */
export async function canDeleteRole(roleId: string): Promise<boolean> {
  const role = await loadRole(roleId);
  return role?.properties.canDelete ?? false;
}

/**
 * 检查角色是否可禁用
 */
export async function canDisableRole(roleId: string): Promise<boolean> {
  const role = await loadRole(roleId);
  return role?.properties.canDisable ?? false;
}
