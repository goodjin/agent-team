/**
 * 规则命令
 */

import { getRuleManager } from '../../rules/index.js';
import { loadRules } from '../../rules/rule-loader.js';
import { CLIUtils } from '../index.js';

/**
 * 规则命令处理
 */
export async function handleRuleCommand(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  switch (subcommand) {
    case 'list':
      await listRules();
      break;
    case 'show':
      await showRule(args[1]);
      break;
    case 'enable':
      await enableRule(args[1]);
      break;
    case 'disable':
      await disableRule(args[1]);
      break;
    case 'create':
      await createRule(args[1]);
      break;
    case 'delete':
      await deleteRule(args[1]);
      break;
    case 'test':
      await testRule(args[1], args[2]);
      break;
    default:
      CLIUtils.error(`未知规则命令: ${subcommand}`);
      console.log('可用命令: list, show, enable, disable, create, delete, test');
  }
}

/**
 * 列出所有规则
 */
async function listRules(): Promise<void> {
  CLIUtils.title('规则列表');

  const manager = getRuleManager();
  const rules = manager.getAllRules();

  console.log(`共 ${rules.length} 个规则\n`);

  // 按类别分组显示
  const byCategory: { [key: string]: any[] } = {
    security: [],
    coding: [],
    'best-practices': [],
    project: [],
    custom: [],
  };

  for (const rule of rules) {
    if (!byCategory[rule.category]) {
      byCategory[rule.category] = [];
    }
    byCategory[rule.category].push(rule);
  }

  const categoryNames: { [key: string]: string } = {
    security: '安全规则',
    coding: '编码规范',
    'best-practices': '最佳实践',
    project: '项目规则',
    custom: '自定义规则',
  };

  for (const [category, categoryRules] of Object.entries(byCategory)) {
    if (categoryRules.length > 0) {
      const name = categoryNames[category] || category;
      const enabled = categoryRules.filter((r) => r.enabled).length;
      CLIUtils.info(`${name} (${enabled}/${categoryRules.length} 启用)`);
      CLIUtils.blank();

      for (const rule of categoryRules) {
        const status = rule.enabled ? '✓' : '○';
        const severity = rule.rules[0]?.severity || 'info';
        CLIUtils.print(`  ${status} ${rule.name}`, severity === 'critical' ? 'red' : 'blue');
        console.log(`     ID: ${rule.id}`);
      }
      CLIUtils.blank();
    }
  }

  // 显示统计
  const stats = manager.getStats();
  CLIUtils.separator();
  console.log(`统计: ${stats.total} 规则, ${stats.enabled} 启用`);
}

/**
 * 显示规则详情
 */
async function showRule(ruleId: string): Promise<void> {
  if (!ruleId) {
    CLIUtils.error('请指定规则 ID');
    return;
  }

  const manager = getRuleManager();
  const rule = manager.getRuleById(ruleId);

  if (!rule) {
    CLIUtils.error(`规则 ${ruleId} 不存在`);
    return;
  }

  CLIUtils.title(`规则: ${rule.name}`);

  console.log(`ID: ${rule.id}`);
  console.log(`类别: ${rule.category}`);
  console.log(`优先级: ${rule.priority}`);
  console.log(`启用: ${rule.enabled ? '是' : '否'}`);
  console.log(`描述: ${rule.description}`);
  CLIUtils.blank();

  console.log('适用范围:');
  for (const role of rule.appliesTo) {
    console.log(`  • ${role}`);
  }
  CLIUtils.blank();

  console.log('规则:');
  for (const subRule of rule.rules) {
      const severity = subRule.severity || 'info';
      const severityIcon =
        severity === 'error'
          ? '🔴'
          : severity === 'warning'
          ? '🟠'
          : '🟡';
      CLIUtils.print(
        `  ${severityIcon} ${subRule.name}`,
        severity === 'error' ? 'red' : severity === 'warning' ? 'yellow' : 'blue'
      );
    console.log(`     ${subRule.description}`);
  }
  CLIUtils.blank();

  if (rule.exceptions && rule.exceptions.length > 0) {
    console.log('例外:');
    for (const exception of rule.exceptions) {
      console.log(`  • ${exception.description}`);
    }
  }
}

/**
 * 启用规则
 */
async function enableRule(ruleId: string): Promise<void> {
  if (!ruleId) {
    CLIUtils.error('请指定规则 ID');
    return;
  }

  const manager = getRuleManager();
  const result = await manager.enableRule(ruleId);

  if (result.success) {
    CLIUtils.success(`规则 ${ruleId} 已启用`);
  } else {
    CLIUtils.error(`操作失败: ${result.errors.join(', ')}`);
  }
}

/**
 * 禁用规则
 */
async function disableRule(ruleId: string): Promise<void> {
  if (!ruleId) {
    CLIUtils.error('请指定规则 ID');
    return;
  }

  const manager = getRuleManager();
  const result = await manager.disableRule(ruleId);

  if (result.success) {
    CLIUtils.success(`规则 ${ruleId} 已禁用`);
  } else {
    CLIUtils.error(`操作失败: ${result.errors.join(', ')}`);
  }
}

/**
 * 创建规则
 */
async function createRule(ruleId: string): Promise<void> {
  CLIUtils.info('创建自定义规则...');

  const manager = getRuleManager();
  const result = await manager.createRule({
    name: ruleId || '自定义规则',
    description: '用户自定义的规则',
    category: 'custom',
    enabled: true,
    appliesTo: ['developer'],
    priority: 20,
    rules: [
      {
        id: `${ruleId}-rule`,
        name: '自定义检查',
        description: '自定义规则检查',
        severity: 'warning',
        pattern: '',
      },
    ],
  });

  if (result.success) {
    CLIUtils.success('规则创建成功');
    console.log(`请编辑 ~/.agent-team/rules/${result.newRule?.id}.yaml 来完善规则配置`);
  } else {
    CLIUtils.error(`创建失败: ${result.errors.join(', ')}`);
  }
}

/**
 * 删除规则
 */
async function deleteRule(ruleId: string): Promise<void> {
  if (!ruleId) {
    CLIUtils.error('请指定规则 ID');
    return;
  }

  const manager = getRuleManager();
  const rule = manager.getRuleById(ruleId);

  if (!rule) {
    CLIUtils.error(`规则 ${ruleId} 不存在`);
    return;
  }

  const confirmed = await CLIUtils.confirm(
    `确定要删除规则 "${rule.name}" 吗？`,
    false
  );

  if (confirmed) {
    const result = await manager.deleteRule(ruleId);
    if (result.success) {
      CLIUtils.success('规则已删除');
    } else {
      CLIUtils.error(`删除失败: ${result.errors.join(', ')}`);
    }
  } else {
    CLIUtils.info('已取消');
  }
}

/**
 * 测试规则
 */
async function testRule(ruleId: string, filePath: string): Promise<void> {
  if (!ruleId || !filePath) {
    CLIUtils.error('请指定规则 ID 和文件路径');
    return;
  }

  CLIUtils.info(`测试规则 ${ruleId} 在文件 ${filePath}`);
  console.log('(此功能需要完整实现代码分析引擎)');
}
