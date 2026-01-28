/**
 * 角色继承处理
 */

import type { RoleDefinition, RoleInheritanceConfig } from './types.js';

/**
 * 解析继承配置
 */
export function parseInheritanceConfig(yaml: string): RoleInheritanceConfig | null {
  const config: RoleInheritanceConfig = {
    baseRole: '',
    additionalCapabilities: [],
    additionalConstraints: [],
    overriddenConstraints: {},
    promptEnhancement: '',
  };

  const lines = yaml.split('\n');
  let currentSection: string | null = null;
  let currentList: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // 检测节
    if (trimmed.endsWith(':')) {
      const sectionName = trimmed.slice(0, -1).trim();

      if (currentList.length > 0 && currentSection) {
        if (currentSection === 'additionalCapabilities') {
          config.additionalCapabilities = currentList;
        } else if (currentSection === 'additionalConstraints') {
          config.additionalConstraints = currentList;
        }
        currentList = [];
      }

      if (sectionName === 'baseRole') {
        currentSection = null;
      } else if (sectionName === 'additionalCapabilities') {
        currentSection = 'additionalCapabilities';
      } else if (sectionName === 'additionalConstraints') {
        currentSection = 'additionalConstraints';
      } else if (sectionName === 'overriddenConstraints') {
        currentSection = 'overriddenConstraints';
      } else if (sectionName === 'promptEnhancement') {
        currentSection = 'promptEnhancement';
      } else {
        currentSection = null;
      }
      continue;
    }

    // 处理键值对
    if (trimmed.includes(':') && !trimmed.startsWith('- ')) {
      const [key, value] = trimmed.split(':').map((s) => s.trim());

      if (currentSection === 'overriddenConstraints') {
        config.overriddenConstraints[key] = value;
      } else if (key === 'baseRole') {
        config.baseRole = value;
      }
      continue;
    }

    // 处理列表项
    if (trimmed.startsWith('- ')) {
      const item = trimmed.slice(2).trim();
      if (item) {
        if (currentSection === 'additionalCapabilities' || currentSection === 'additionalConstraints') {
          currentList.push(item);
        } else if (!currentSection) {
          if (trimmed.includes(':')) {
            const [k, v] = item.split(':').map((s) => s.trim());
            if (k === 'baseRole') {
              config.baseRole = v;
            }
          }
        }
      }
    }
  }

  // 保存最后的列表
  if (currentList.length > 0 && currentSection === 'additionalCapabilities') {
    config.additionalCapabilities = currentList;
  } else if (currentList.length > 0 && currentSection === 'additionalConstraints') {
    config.additionalConstraints = currentList;
  }

  if (!config.baseRole) {
    return null;
  }

  return config;
}

/**
 * 解析提示词增量
 */
export function parsePromptEnhancement(yaml: string): string {
  const lines = yaml.split('\n');
  let inEnhancement = false;
  const enhancement: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('promptEnhancement:')) {
      inEnhancement = true;
      continue;
    }

    if (inEnhancement) {
      if (trimmed.startsWith('#') || trimmed === '') {
        if (enhancement.length > 0) {
          enhancement.push(line);
        }
      } else if (trimmed.includes(':') && !trimmed.startsWith('- ')) {
        break;
      } else {
        enhancement.push(line);
      }
    }
  }

  return enhancement.join('\n').trim();
}

/**
 * 解析继承 YAML
 */
export function parseExtendsYaml(yaml: string): RoleInheritanceConfig {
  const config: RoleInheritanceConfig = {
    baseRole: '',
    additionalCapabilities: [],
    additionalConstraints: [],
    overriddenConstraints: {},
    promptEnhancement: '',
  };

  const lines = yaml.split('\n');
  let currentSection: string | null = null;
  let currentList: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // 检测节
    if (trimmed.endsWith(':') && !trimmed.startsWith('- ')) {
      const sectionName = trimmed.slice(0, -1).trim();

      if (currentList.length > 0 && currentSection) {
        if (currentSection === 'additionalCapabilities') {
          config.additionalCapabilities = currentList;
        } else if (currentSection === 'additionalConstraints') {
          config.additionalConstraints = currentList;
        }
        currentList = [];
      }

      currentSection = sectionName;
      continue;
    }

    // 处理列表项
    if (trimmed.startsWith('- ')) {
      const item = trimmed.slice(2).trim();

      if (currentSection === 'additionalCapabilities' || currentSection === 'additionalConstraints') {
        currentList.push(item);
      }
      continue;
    }

    // 处理键值对
    if (trimmed.includes(':') && currentSection) {
      const [key, value] = trimmed.split(':').map((s) => s.trim());

      if (currentSection === 'overriddenConstraints') {
        config.overriddenConstraints[key] = value;
      } else if (key === 'baseRole') {
        config.baseRole = value;
      } else if (key === 'promptEnhancement' && !value) {
        currentSection = 'promptEnhancement';
      } else if (currentSection === 'promptEnhancement') {
        config.promptEnhancement += line + '\n';
      }
    }
  }

  // 保存最后的列表
  if (currentList.length > 0 && currentSection === 'additionalCapabilities') {
    config.additionalCapabilities = currentList;
  } else if (currentList.length > 0 && currentSection === 'additionalConstraints') {
    config.additionalConstraints = currentList;
  }

  config.promptEnhancement = config.promptEnhancement.trim();

  return config;
}

/**
 * 解析继承 YAML 字符串
 */
export function parseExtendsString(yaml: string): RoleInheritanceConfig {
  return parseExtendsYaml(yaml);
}

/**
 * 解决角色继承
 */
export function resolveInheritance(
  role: RoleDefinition,
  allRoles: Map<string, RoleDefinition>
): RoleDefinition {
  if (role.type !== 'extends' || !role.extends) {
    return role;
  }

  // 查找基础角色
  const baseRole = allRoles.get(role.extends);
  if (!baseRole) {
    return role;
  }

  // 递归解决基础角色的继承
  const resolvedBase = resolveInheritance(baseRole, allRoles);

  // 合并角色定义
  const merged: RoleDefinition = {
    ...resolvedBase,
    id: role.id,
    name: role.name || resolvedBase.name,
    description: role.description || resolvedBase.description,
    type: 'extends',
    extends: role.extends,
    properties: {
      ...resolvedBase.properties,
      ...role.properties,
    },
    capabilities: [...new Set([...resolvedBase.capabilities, ...(role.capabilities || [])])],
    responsibilities: [...new Set([...resolvedBase.responsibilities, ...(role.responsibilities || [])])],
    constraints: [...new Set([...resolvedBase.constraints, ...(role.constraints || [])])],
    llm: role.llm || resolvedBase.llm,
    promptFile: role.promptFile || resolvedBase.promptFile,
    tags: [...new Set([...resolvedBase.tags, ...(role.tags || [])])],
    version: role.version || resolvedBase.version,
    lastUpdated: role.lastUpdated || resolvedBase.lastUpdated,
    author: role.author || resolvedBase.author,
  };

  return merged;
}

/**
 * 获取继承链
 */
export function getInheritanceChain(
  role: RoleDefinition,
  allRoles: Map<string, RoleDefinition>
): RoleDefinition[] {
  const chain: RoleDefinition[] = [role];

  if (role.type === 'extends' && role.extends) {
    const baseRole = allRoles.get(role.extends);
    if (baseRole) {
      chain.push(...getInheritanceChain(baseRole, allRoles));
    }
  }

  return chain;
}

/**
 * 检查循环继承
 */
export function hasCircularInheritance(
  role: RoleDefinition,
  allRoles: Map<string, RoleDefinition>,
  visited: Set<string> = new Set()
): boolean {
  if (visited.has(role.id)) {
    return true;
  }

  visited.add(role.id);

  if (role.type === 'extends' && role.extends) {
    const baseRole = allRoles.get(role.extends);
    if (baseRole) {
      return hasCircularInheritance(baseRole, allRoles, visited);
    }
  }

  visited.delete(role.id);
  return false;
}

/**
 * 检查是否有循环继承
 */
export function checkCircularInheritance(allRoles: Map<string, RoleDefinition>): {
  hasCircular: boolean;
  roles: string[];
} {
  for (const role of allRoles.values()) {
    if (hasCircularInheritance(role, allRoles)) {
      return { hasCircular: true, roles: [] };
    }
  }
  return { hasCircular: false, roles: [] };
}
