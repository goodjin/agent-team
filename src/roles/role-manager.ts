/**
 * 角色管理器
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import type { RoleDefinition, RoleValidationResult } from './types.js';
import {
  loadRoles,
  loadRole,
  loadBuiltInRoles,
  loadCustomRoles,
  findCustomRolesDir,
} from './role-loader.js';
import { validateRole } from './role-validator.js';
import { resolveInheritance } from './role-inheritance.js';

export { RoleDefinition, RoleValidationResult };

/**
 * 角色管理器类
 */
export class RoleManager {
  private roles: Map<string, RoleDefinition> = new Map();
  private customRolesDir: string | null = null;

  constructor() {
    this.initialize();
  }

  /**
   * 初始化角色管理器
   */
  private async initialize(): Promise<void> {
    this.customRolesDir = await findCustomRolesDir();
    await this.reload();
  }

  /**
   * 重新加载所有角色
   */
  async reload(): Promise<{ loaded: number; errors: string[] }> {
    const { roles, loaded, errors } = await loadRoles({
      includeBuiltIn: true,
      includeCustom: true,
      includeDisabled: true,
    });

    this.roles = roles;
    return { loaded: loaded.length, errors };
  }

  /**
   * 获取所有角色
   */
  getAllRoles(): RoleDefinition[] {
    return Array.from(this.roles.values());
  }

  /**
   * 根据 ID 获取角色
   */
  getRoleById(id: string): RoleDefinition | undefined {
    return this.roles.get(id);
  }

  /**
   * 根据名称获取角色
   */
  getRoleByName(name: string): RoleDefinition | undefined {
    return Array.from(this.roles.values()).find((r) => r.name === name);
  }

  /**
   * 根据标签获取角色
   */
  getRolesByTag(tag: string): RoleDefinition[] {
    return Array.from(this.roles.values()).filter((r) => r.tags.includes(tag));
  }

  /**
   * 获取内置角色
   */
  getBuiltInRoles(): RoleDefinition[] {
    return Array.from(this.roles.values()).filter((r) => r.type === 'built-in');
  }

  /**
   * 获取自定义角色
   */
  getCustomRoles(): RoleDefinition[] {
    return Array.from(this.roles.values()).filter((r) => r.type === 'custom');
  }

  /**
   * 创建自定义角色
   */
  async createRole(role: Omit<RoleDefinition, 'id' | 'version' | 'lastUpdated'> & { id?: string }): Promise<{
    success: boolean;
    role?: RoleDefinition;
    errors: string[];
  }> {
    const newRole: RoleDefinition = {
      ...role,
      id: role.id || `custom-${uuidv4().slice(0, 8)}`,
      type: 'custom',
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      properties: role.properties || {
        canDelete: true,
        canDisable: true,
        hidden: false,
      },
    };

    // 验证角色
    const validation = validateRole(newRole);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    // 确保自定义角色目录存在
    if (!this.customRolesDir) {
      this.customRolesDir = path.join(os.homedir(), '.agent-team', 'roles');
    }

    await fs.mkdir(this.customRolesDir, { recursive: true });

    // 保存角色文件
    const filePath = path.join(this.customRolesDir, `${newRole.id}.yaml`);
    await fs.writeFile(filePath, this.roleToYaml(newRole), 'utf-8');

    // 添加到内存
    this.roles.set(newRole.id, newRole);

    return { success: true, role: newRole, errors: [] };
  }

  /**
   * 更新角色
   */
  async updateRole(
    roleId: string,
    updates: Partial<RoleDefinition>
  ): Promise<{
    success: boolean;
    errors: string[];
  }> {
    const role = this.roles.get(roleId);

    if (!role) {
      return { success: false, errors: [`角色 ${roleId} 不存在`] };
    }

    if (role.type === 'built-in') {
      return { success: false, errors: ['无法更新内置角色'] };
    }

    // 合并更新
    const updatedRole: RoleDefinition = {
      ...role,
      ...updates,
      id: role.id, // 保持 ID 不变
      type: role.type,
      lastUpdated: new Date().toISOString(),
    };

    // 验证
    const validation = validateRole(updatedRole);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    // 保存
    if (this.customRolesDir) {
      const filePath = path.join(this.customRolesDir, `${roleId}.yaml`);
      await fs.writeFile(filePath, this.roleToYaml(updatedRole), 'utf-8');
    }

    // 更新内存
    this.roles.set(roleId, updatedRole);

    return { success: true, errors: [] };
  }

  /**
   * 删除角色
   */
  async deleteRole(
    roleId: string
  ): Promise<{
    success: boolean;
    errors: string[];
  }> {
    const role = this.roles.get(roleId);

    if (!role) {
      return { success: false, errors: [`角色 ${roleId} 不存在`] };
    }

    if (!role.properties.canDelete) {
      return { success: false, errors: ['此角色无法删除'] };
    }

    if (role.type === 'built-in') {
      return { success: false, errors: ['无法删除内置角色'] };
    }

    // 删除文件
    if (this.customRolesDir) {
      const filePath = path.join(this.customRolesDir, `${roleId}.yaml`);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        return { success: false, errors: [`删除角色文件失败: ${error}`] };
      }
    }

    // 从内存移除
    this.roles.delete(roleId);

    return { success: true, errors: [] };
  }

  /**
   * 禁用角色
   */
  async disableRole(
    roleId: string
  ): Promise<{
    success: boolean;
    errors: string[];
  }> {
    const role = this.roles.get(roleId);

    if (!role) {
      return { success: false, errors: [`角色 ${roleId} 不存在`] };
    }

    if (!role.properties.canDisable) {
      return { success: false, errors: ['此角色无法禁用'] };
    }

    return this.updateRole(roleId, {
      properties: { ...role.properties, hidden: true },
    });
  }

  /**
   * 启用角色
   */
  async enableRole(
    roleId: string
  ): Promise<{
    success: boolean;
    errors: string[];
  }> {
    const role = this.roles.get(roleId);

    if (!role) {
      return { success: false, errors: [`角色 ${roleId} 不存在`] };
    }

    return this.updateRole(roleId, {
      properties: { ...role.properties, hidden: false },
    });
  }

  /**
   * 获取角色的完整定义（包括继承）
   */
  async getFullRoleDefinition(roleId: string): Promise<RoleDefinition | null> {
    const role = this.roles.get(roleId);

    if (!role) {
      return null;
    }

    // 处理继承
    if (role.type === 'extends' && role.extends) {
      return resolveInheritance(role, this.roles);
    }

    return role;
  }

  /**
   * 导出角色
   */
  async exportRole(
    roleId: string
  ): Promise<{
    success: boolean;
    yaml?: string;
    errors: string[];
  }> {
    const role = await this.getFullRoleDefinition(roleId);

    if (!role) {
      return { success: false, errors: [`角色 ${roleId} 不存在`] };
    }

    return { success: true, yaml: this.roleToYaml(role), errors: [] };
  }

  /**
   * 导入角色
   */
  async importRole(
    yaml: string
  ): Promise<{
    success: boolean;
    role?: RoleDefinition;
    errors: string[];
  }> {
    // 解析 YAML
    const role = await this.parseRoleYaml(yaml);

    if (!role) {
      return { success: false, errors: ['无法解析角色 YAML'] };
    }

    // 确保是自定义角色
    if (role.type !== 'custom') {
      role.type = 'custom';
    }

    return this.createRole(role);
  }

  /**
   * 复制角色
   */
  async duplicateRole(
    sourceId: string,
    newId?: string
  ): Promise<{
    success: boolean;
    newRole?: RoleDefinition;
    errors: string[];
  }> {
    const sourceRole = this.roles.get(sourceId);

    if (!sourceRole) {
      return { success: false, errors: [`源角色 ${sourceId} 不存在`] };
    }

    const duplicatedRole: RoleDefinition = {
      ...sourceRole,
      id: newId || `copy-${sourceId}-${Date.now()}`,
      name: `${sourceRole.name} (副本)`,
      type: 'custom',
      properties: {
        ...sourceRole.properties,
        canDelete: true,
        canDisable: true,
      },
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
    };

    return this.createRole(duplicatedRole);
  }

  /**
   * 验证角色
   */
  validateRole(role: RoleDefinition): RoleValidationResult {
    return validateRole(role);
  }

  /**
   * 角色转 YAML
   */
  private roleToYaml(role: RoleDefinition): string {
    const lines: string[] = [];

    lines.push(`# ${role.name} 角色定义`);
    lines.push('');
    lines.push(`id: ${role.id}`);
    lines.push(`name: ${role.name}`);
    lines.push(`description: ${role.description}`);
    lines.push(`type: ${role.type}`);
    if (role.extends) {
      lines.push(`extends: ${role.extends}`);
    }
    lines.push('');
    lines.push('# 角色属性');
    lines.push('properties:');
    lines.push(`  canDelete: ${role.properties.canDelete}`);
    lines.push(`  canDisable: ${role.properties.canDisable}`);
    lines.push(`  hidden: ${role.properties.hidden}`);
    lines.push('');
    lines.push('# 角色能力');
    lines.push('capabilities:');
    for (const capability of role.capabilities) {
      lines.push(`  - ${capability}`);
    }
    lines.push('');
    lines.push('# 角色职责');
    lines.push('responsibilities:');
    for (const responsibility of role.responsibilities) {
      lines.push(`  - ${responsibility}`);
    }
    lines.push('');
    lines.push('# 角色约束');
    lines.push('constraints:');
    for (const constraint of role.constraints) {
      lines.push(`  - ${constraint}`);
    }
    lines.push('');
    lines.push('# 默认 LLM 配置');
    lines.push('llm:');
    lines.push(`  provider: ${role.llm.provider}`);
    lines.push(`  model: ${role.llm.model}`);
    if (role.llm.temperature) {
      lines.push(`  temperature: ${role.llm.temperature}`);
    }
    if (role.llm.maxTokens) {
      lines.push(`  maxTokens: ${role.llm.maxTokens}`);
    }
    if (role.promptFile) {
      lines.push('');
      lines.push('# 提示词文件');
      lines.push(`promptFile: ${role.promptFile}`);
    }
    lines.push('');
    lines.push('# 标签');
    lines.push('tags:');
    for (const tag of role.tags) {
      lines.push(`  - ${tag}`);
    }
    lines.push('');
    lines.push('# 元数据');
    lines.push(`version: "${role.version}"`);
    lines.push(`lastUpdated: "${role.lastUpdated}"`);
    if (role.author) {
      lines.push(`author: "${role.author}"`);
    }

    return lines.join('\n');
  }

  /**
   * 解析角色 YAML
   */
  private async parseRoleYaml(yaml: string): Promise<RoleDefinition | null> {
    // 复用 role-loader 中的解析逻辑
    const builtInRoles = await loadBuiltInRoles();
    const loader = Object.getPrototypeOf(this).constructor;

    // 简化的解析逻辑
    return null;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    builtIn: number;
    custom: number;
    disabled: number;
  } {
    const roles = Array.from(this.roles.values());
    return {
      total: roles.length,
      builtIn: roles.filter((r) => r.type === 'built-in').length,
      custom: roles.filter((r) => r.type === 'custom').length,
      disabled: roles.filter((r) => r.properties.hidden).length,
    };
  }
}

/**
 * 角色管理器单例
 */
let roleManagerInstance: RoleManager | null = null;

export function getRoleManager(): RoleManager {
  if (!roleManagerInstance) {
    roleManagerInstance = new RoleManager();
  }
  return roleManagerInstance;
}

export function resetRoleManager(): void {
  roleManagerInstance = null;
}
