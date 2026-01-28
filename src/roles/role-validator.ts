/**
 * 角色验证器
 */

import type { RoleDefinition, RoleValidationResult } from './types.js';

const BUILT_IN_ROLE_IDS = [
  'product-manager',
  'architect',
  'developer',
  'tester',
  'doc-writer',
];

/**
 * 验证角色定义
 */
export function validateRole(role: RoleDefinition): RoleValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 验证必需字段
  if (!role.id) {
    errors.push('缺少角色 ID (id)');
  }

  if (!role.name) {
    errors.push('缺少角色名称 (name)');
  }

  if (!role.description) {
    errors.push('缺少角色描述 (description)');
  }

  if (!role.type) {
    errors.push('缺少角色类型 (type)');
  } else if (!['built-in', 'custom', 'extends'].includes(role.type)) {
    errors.push(`无效的角色类型: ${role.type}，应为 built-in、custom 或 extends`);
  }

  // 验证继承
  if (role.type === 'extends' && !role.extends) {
    errors.push('继承类型角色必须指定基础角色 (extends)');
  }

  // 验证属性
  if (!role.properties) {
    warnings.push('缺少角色属性，将使用默认值');
  } else {
    if (typeof role.properties.canDelete !== 'boolean') {
      warnings.push('canDelete 应为布尔值');
    }
    if (typeof role.properties.canDisable !== 'boolean') {
      warnings.push('canDisable 应为布尔值');
    }
    if (typeof role.properties.hidden !== 'boolean') {
      warnings.push('hidden 应为布尔值');
    }
  }

  // 验证内置角色保护
  if (BUILT_IN_ROLE_IDS.includes(role.id)) {
    if (role.type !== 'built-in') {
      errors.push(`角色 ${role.id} 是内置角色，必须设置为 built-in 类型`);
    }
    if (role.properties?.canDelete === true) {
      errors.push(`内置角色 ${role.id} 不能设置为可删除`);
    }
    if (role.properties?.canDisable === true) {
      errors.push(`内置角色 ${role.id} 不能设置为可禁用`);
    }
  }

  // 验证能力列表
  if (!role.capabilities || !Array.isArray(role.capabilities)) {
    warnings.push('缺少角色能力列表 (capabilities)');
  }

  // 验证职责列表
  if (!role.responsibilities || !Array.isArray(role.responsibilities)) {
    warnings.push('缺少角色职责列表 (responsibilities)');
  }

  // 验证约束列表
  if (!role.constraints || !Array.isArray(role.constraints)) {
    warnings.push('缺少角色约束列表 (constraints)');
  }

  // 验证 LLM 配置
  if (!role.llm) {
    errors.push('缺少 LLM 配置 (llm)');
  } else {
    if (!role.llm.provider) {
      errors.push('缺少 LLM 提供商 (llm.provider)');
    }
    if (!role.llm.model) {
      errors.push('缺少 LLM 模型 (llm.model)');
    }
    if (role.llm.temperature !== undefined) {
      if (typeof role.llm.temperature !== 'number' || role.llm.temperature < 0 || role.llm.temperature > 1) {
        errors.push('llm.temperature 必须在 0-1 之间');
      }
    }
    if (role.llm.maxTokens !== undefined) {
      if (typeof role.llm.maxTokens !== 'number' || role.llm.maxTokens < 1) {
        errors.push('llm.maxTokens 必须为大于 0 的数字');
      }
    }
  }

  // 验证标签
  if (!role.tags || !Array.isArray(role.tags)) {
    warnings.push('缺少角色标签 (tags)');
  }

  // 验证提示词文件路径
  if (role.promptFile && typeof role.promptFile !== 'string') {
    errors.push('promptFile 必须是字符串');
  }

  // 验证元数据
  if (role.version && typeof role.version !== 'string') {
    warnings.push('version 应该是字符串');
  }

  if (role.lastUpdated && typeof role.lastUpdated !== 'string') {
    warnings.push('lastUpdated 应该是字符串');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 快速验证（仅检查必需字段）
 */
export function validateRoleQuick(role: RoleDefinition): boolean {
  return !!(
    role.id &&
    role.name &&
    role.description &&
    role.type &&
    role.llm?.provider &&
    role.llm?.model
  );
}

/**
 * 验证角色 ID 格式
 */
export function validateRoleId(id: string): boolean {
  // 角色 ID 必须以字母开头，只能包含字母、数字、短横线和下划线
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id);
}

/**
 * 验证角色名称格式
 */
export function validateRoleName(name: string): boolean {
  // 角色名称长度在 1-50 之间
  return name.length >= 1 && name.length <= 50;
}

/**
 * 验证标签格式
 */
export function validateTags(tags: string[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    if (typeof tag !== 'string') {
      errors.push(`标签 ${i} 必须是字符串`);
      continue;
    }
    if (tag.length < 1 || tag.length > 30) {
      errors.push(`标签 "${tag}" 长度必须在 1-30 之间`);
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(tag)) {
      errors.push(`标签 "${tag}" 格式无效，只能包含字母、数字、下划线和短横线`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 批量验证角色
 */
export function validateRoles(roles: RoleDefinition[]): {
  valid: RoleDefinition[];
  invalid: { role: RoleDefinition; errors: string[] }[];
} {
  const valid: RoleDefinition[] = [];
  const invalid: { role: RoleDefinition; errors: string[] }[] = [];

  for (const role of roles) {
    const result = validateRole(role);
    if (result.isValid) {
      valid.push(role);
    } else {
      invalid.push({ role, errors: result.errors });
    }
  }

  return { valid, invalid };
}
