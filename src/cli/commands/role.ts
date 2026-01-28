/**
 * 角色命令
 */

import { getRoleManager } from '../../roles/index.js';
import { CLIUtils } from '../index.js';

/**
 * 角色命令处理
 */
export async function handleRoleCommand(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  switch (subcommand) {
    case 'list':
      await listRoles();
      break;
    case 'show':
      await showRole(args[1]);
      break;
    case 'create':
      await createRole(args[1]);
      break;
    case 'edit':
      await editRole(args[1]);
      break;
    case 'delete':
      await deleteRole(args[1]);
      break;
    case 'enable':
      await enableRole(args[1]);
      break;
    case 'disable':
      await disableRole(args[1]);
      break;
    default:
      CLIUtils.error(`未知角色命令: ${subcommand}`);
      console.log('可用命令: list, show, create, edit, delete, enable, disable');
  }
}

/**
 * 列出所有角色
 */
async function listRoles(): Promise<void> {
  CLIUtils.title('角色列表');

  const manager = getRoleManager();
  const roles = manager.getAllRoles();

  console.log(`共 ${roles.length} 个角色\n`);

  // 按类型分组显示
  const builtIn = roles.filter((r) => r.type === 'built-in');
  const custom = roles.filter((r) => r.type === 'custom');
  const extended = roles.filter((r) => r.type === 'extends');

  if (builtIn.length > 0) {
    CLIUtils.info('内置角色:');
    for (const role of builtIn) {
      const status = role.properties?.canDelete === false ? '(不可删除)' : '';
      console.log(`  ✓ ${role.name} ${status}`);
      console.log(`    ID: ${role.id}`);
      console.log(`    LLM: ${role.llm.provider}/${role.llm.model}`);
      console.log('');
    }
  }

  if (custom.length > 0) {
    CLIUtils.info('自定义角色:');
    for (const role of custom) {
      const status = role.properties?.hidden ? '(已禁用)' : '';
      console.log(`  ${status} ${role.name}`);
      console.log(`    ID: ${role.id}`);
      console.log(`    LLM: ${role.llm.provider}/${role.llm.model}`);
      console.log('');
    }
  }

  if (extended.length > 0) {
    CLIUtils.info('继承角色:');
    for (const role of extended) {
      console.log(`  ↗ ${role.name} (继承自 ${role.extends})`);
      console.log(`    ID: ${role.id}`);
      console.log('');
    }
  }

  // 显示统计
  const stats = manager.getStats();
  CLIUtils.separator();
  console.log(`统计: ${stats.builtIn} 内置, ${stats.custom} 自定义`);
}

/**
 * 显示角色详情
 */
async function showRole(roleId: string): Promise<void> {
  if (!roleId) {
    CLIUtils.error('请指定角色 ID');
    return;
  }

  const manager = getRoleManager();
  const role = manager.getRoleById(roleId);

  if (!role) {
    CLIUtils.error(`角色 ${roleId} 不存在`);
    return;
  }

  CLIUtils.title(`角色: ${role.name}`);

  console.log(`ID: ${role.id}`);
  console.log(`类型: ${role.type}`);
  if (role.extends) {
    console.log(`继承自: ${role.extends}`);
  }
  console.log(`描述: ${role.description}`);
  CLIUtils.blank();

  console.log('能力:');
  for (const capability of role.capabilities) {
    console.log(`  • ${capability}`);
  }
  CLIUtils.blank();

  console.log('职责:');
  for (const responsibility of role.responsibilities) {
    console.log(`  • ${responsibility}`);
  }
  CLIUtils.blank();

  console.log('LLM 配置:');
  console.log(`  提供商: ${role.llm.provider}`);
  console.log(`  模型: ${role.llm.model}`);
  if (role.llm.temperature) {
    console.log(`  温度: ${role.llm.temperature}`);
  }
  CLIUtils.blank();

  console.log('标签:', role.tags.join(', ') || '无');
  CLIUtils.blank();

  const canDelete = role.properties?.canDelete === false ? '否' : '是';
  const canDisable = role.properties?.canDisable === false ? '否' : '是';
  console.log(`可删除: ${canDelete}`);
  console.log(`可禁用: ${canDisable}`);
}

/**
 * 创建角色
 */
async function createRole(roleId: string): Promise<void> {
  if (!roleId) {
    CLIUtils.error('请指定角色 ID');
    return;
  }

  CLIUtils.info(`创建角色: ${roleId}`);

  // 交互式创建
  const name = await CLIUtils.question('角色名称: ');
  const description = await CLIUtils.question('角色描述: ');

  const manager = getRoleManager();
  const result = await manager.createRole({
    name,
    description,
    type: 'custom',
    properties: {
      canDelete: true,
      canDisable: true,
      hidden: false,
    },
    capabilities: [],
    responsibilities: [],
    constraints: [],
    llm: {
      provider: 'zhipu-primary',
      model: 'glm-4',
    },
    tags: [],
  });

  if (result.success) {
    CLIUtils.success(`角色 ${roleId} 创建成功`);
  } else {
    CLIUtils.error(`创建失败: ${result.errors.join(', ')}`);
  }
}

/**
 * 编辑角色
 */
async function editRole(roleId: string): Promise<void> {
  if (!roleId) {
    CLIUtils.error('请指定角色 ID');
    return;
  }

  const manager = getRoleManager();
  const role = manager.getRoleById(roleId);

  if (!role) {
    CLIUtils.error(`角色 ${roleId} 不存在`);
    return;
  }

  CLIUtils.info(`编辑角色: ${role.name}`);

  const name = await CLIUtils.question(`名称 [${role.name}]: `);
  const description = await CLIUtils.question(`描述 [${role.description}]: `);

  const updates: any = {};
  if (name) updates.name = name;
  if (description) updates.description = description;

  const result = await manager.updateRole(roleId, updates);

  if (result.success) {
    CLIUtils.success('角色已更新');
  } else {
    CLIUtils.error(`更新失败: ${result.errors.join(', ')}`);
  }
}

/**
 * 删除角色
 */
async function deleteRole(roleId: string): Promise<void> {
  if (!roleId) {
    CLIUtils.error('请指定角色 ID');
    return;
  }

  const manager = getRoleManager();
  const role = manager.getRoleById(roleId);

  if (!role) {
    CLIUtils.error(`角色 ${roleId} 不存在`);
    return;
  }

  const confirmed = await CLIUtils.confirm(
    `确定要删除角色 "${role.name}" 吗？`,
    false
  );

  if (confirmed) {
    const result = await manager.deleteRole(roleId);
    if (result.success) {
      CLIUtils.success('角色已删除');
    } else {
      CLIUtils.error(`删除失败: ${result.errors.join(', ')}`);
    }
  } else {
    CLIUtils.info('已取消');
  }
}

/**
 * 启用角色
 */
async function enableRole(roleId: string): Promise<void> {
  if (!roleId) {
    CLIUtils.error('请指定角色 ID');
    return;
  }

  const manager = getRoleManager();
  const result = await manager.enableRole(roleId);

  if (result.success) {
    CLIUtils.success(`角色 ${roleId} 已启用`);
  } else {
    CLIUtils.error(`操作失败: ${result.errors.join(', ')}`);
  }
}

/**
 * 禁用角色
 */
async function disableRole(roleId: string): Promise<void> {
  if (!roleId) {
    CLIUtils.error('请指定角色 ID');
    return;
  }

  const manager = getRoleManager();
  const result = await manager.disableRole(roleId);

  if (result.success) {
    CLIUtils.success(`角色 ${roleId} 已禁用`);
  } else {
    CLIUtils.error(`操作失败: ${result.errors.join(', ')}`);
  }
}
