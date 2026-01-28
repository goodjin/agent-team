/**
 * 角色管理模块
 */

// 类型导出
export type {
  RoleType,
  RoleDefinition,
  RoleConfigFile,
  RoleProperties,
  RoleCapability,
  RoleConstraint,
  RoleLLMConfig,
  RoleInheritanceConfig,
  RoleValidationResult,
  RoleLoadOptions,
  RoleFindOptions,
} from './types.js';

// 角色加载器
export {
  loadRoles,
  loadBuiltInRoles,
  loadCustomRoles,
  loadRole,
  findCustomRolesDir,
  getAllRoleIds,
  getRoleType,
  roleExists,
  canDeleteRole,
  canDisableRole,
} from './role-loader.js';

// 角色管理器
export {
  RoleManager,
  getRoleManager,
  resetRoleManager,
} from './role-manager.js';

// 角色继承
export {
  parseInheritanceConfig,
  parseExtendsYaml,
  resolveInheritance,
  getInheritanceChain,
  hasCircularInheritance,
  checkCircularInheritance,
} from './role-inheritance.js';

// 角色验证器
export {
  validateRole,
  validateRoleQuick,
  validateRoleId,
  validateRoleName,
  validateTags,
  validateRoles,
} from './role-validator.js';

// 基础角色类
export { BaseRole } from './base.js';

// 具体角色类
export { ProductManager } from './product-manager.js';
export { Architect } from './architect.js';
export { Developer } from './developer.js';
export { Tester } from './tester.js';
export { DocWriter } from './doc-writer.js';

// 角色工厂
export { RoleFactory } from './factory.js';

// 内置角色 ID 常量
export const BUILT_IN_ROLE_IDS = [
  'product-manager',
  'architect',
  'developer',
  'tester',
  'doc-writer',
] as const;

// 所有内置角色 ID 类型
export type BuiltInRoleId = typeof BUILT_IN_ROLE_IDS[number];
