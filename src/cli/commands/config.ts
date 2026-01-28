/**
 * 配置命令
 */

import { promises as fs } from 'fs';
import path from 'path';
import { loadConfig, configExists, expandPath } from '../../config/config-loader.js';
import { validateSync } from '../../config/config-validator.js';
import { CLIUtils } from '../index.js';

/**
 * 配置命令处理
 */
export async function handleConfigCommand(args: string[]): Promise<void> {
  const subcommand = args[0] || 'show';

  switch (subcommand) {
    case 'show':
      await showConfig();
      break;
    case 'test':
      await testConfig();
      break;
    case 'edit':
      await editConfig();
      break;
    case 'reset':
      await resetConfig();
      break;
    case 'path':
      await showConfigPath();
      break;
    default:
      CLIUtils.error(`未知配置命令: ${subcommand}`);
      console.log('可用命令: show, test, edit, reset, path');
  }
}

/**
 * 显示配置
 */
async function showConfig(): Promise<void> {
  CLIUtils.title('Project Agent 配置');

  try {
    const { config, configPath } = await loadConfig();

    console.log(`配置文件: ${configPath}\n`);

    // LLM 配置
    CLIUtils.info('大模型配置:');
    CLIUtils.blank();
    console.log(`  默认提供商: ${config.llm.defaultProvider}`);
    console.log(`  提供商数量: ${Object.keys(config.llm.providers).length}`);

    const enabledProviders = Object.entries(config.llm.providers)
      .filter(([, p]: [string, any]) => p.enabled)
      .map(([name, p]: [string, any]) => `${p.name} (${p.models ? Object.keys(p.models).join(', ') : 'N/A'})`);

    console.log(`  已启用: ${enabledProviders.join(', ') || '无'}`);
    CLIUtils.blank();

    // 角色映射
    CLIUtils.info('角色提供商映射:');
    CLIUtils.blank();
    for (const [role, mapping] of Object.entries(config.llm.roleMapping || {})) {
      const mappings = Array.isArray(mapping) ? mapping : [mapping];
      const formatted = mappings
        .filter(Boolean)
        .map((m: any) => `${m.providerName}/${m.modelName || '默认'}`)
        .join(' -> ');
      console.log(`  ${role}: ${formatted || '未配置'}`);
    }
    CLIUtils.blank();

    // 项目配置
    CLIUtils.info('项目配置:');
    CLIUtils.blank();
    console.log(`  名称: ${config.project.name}`);
    console.log(`  路径: ${config.project.path}`);
    console.log(`  自动分析: ${config.project.autoAnalyze}`);
    CLIUtils.blank();

    // Agent 配置
    CLIUtils.info('Agent 配置:');
    CLIUtils.blank();
    console.log(`  最大迭代: ${config.agent.maxIterations}`);
    console.log(`  历史长度: ${config.agent.maxHistory}`);
    console.log(`  自动确认: ${config.agent.autoConfirm}`);
    console.log(`  显示思考: ${config.agent.showThoughts}`);
    CLIUtils.blank();

    // 工具配置
    CLIUtils.info('工具配置:');
    CLIUtils.blank();
    console.log(`  文件删除: ${config.tools.file.allowDelete}`);
    console.log(`  文件覆盖: ${config.tools.file.allowOverwrite}`);
    console.log(`  Git 自动提交: ${config.tools.git.autoCommit}`);
    console.log(`  代码执行: ${config.tools.code.enabled}`);
    CLIUtils.blank();

    // 验证配置
    const validation = validateSync(config);
    if (validation.isValid) {
      CLIUtils.success('配置验证通过');
    } else {
      CLIUtils.warning('配置存在问题:');
      validation.errors.forEach((e) => console.log(`  - ${e}`));
      validation.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
    }
  } catch (error) {
    CLIUtils.error(`加载配置失败: ${error}`);
  }
}

/**
 * 测试配置
 */
async function testConfig(): Promise<void> {
  CLIUtils.title('测试配置');

  await CLIUtils.loading('测试配置...', async () => {
    try {
      const { config } = await loadConfig();
      const validation = validateSync(config);

      if (validation.isValid) {
        CLIUtils.success('配置有效');
      } else {
        CLIUtils.error('配置无效');
        validation.errors.forEach((e) => console.log(`  ✗ ${e}`));
      }

      // 测试提供商
      const providers = validation.providers;
      console.log(`\n提供商状态:`);

      for (const provider of providers as any[]) {
        const status = provider.enabled
          ? provider.hasValidKey
            ? '✓ 就绪'
            : '⚠ 需配置 API Key'
          : '○ 已禁用';
        console.log(`  ${provider.name}: ${status}`);
      }

      return validation;
    } catch (error) {
      throw error;
    }
  });
}

/**
 * 编辑配置
 */
async function editConfig(): Promise<void> {
  CLIUtils.info('编辑配置...');

  const editor = process.env.EDITOR || 'vi';
  const configPath = expandPath('~/.agent-team/config.yaml');

  try {
    await fs.access(configPath);
  } catch {
    CLIUtils.warning(`配置文件不存在: ${configPath}`);
    return;
  }

  const { spawn } = require('child_process');
  const child = spawn(editor, [configPath], {
    stdio: 'inherit',
  });

  await new Promise((resolve, reject) => {
    child.on('exit', resolve);
    child.on('error', reject);
  });

  CLIUtils.success('配置已更新');
}

/**
 * 重置配置
 */
async function resetConfig(): Promise<void> {
  const confirmed = await CLIUtils.confirm('确定要重置配置吗？这将删除所有自定义配置。', false);

  if (confirmed) {
    const configPath = expandPath('~/.agent-team/config.yaml');
    try {
      await fs.unlink(configPath);
      CLIUtils.success('配置已重置');
    } catch (error) {
      CLIUtils.error(`重置配置失败: ${error}`);
    }
  } else {
    CLIUtils.info('已取消');
  }
}

/**
 * 显示配置路径
 */
async function showConfigPath(): Promise<void> {
  const exists = await configExists();

  if (exists) {
    const configPath = expandPath('~/.agent-team/config.yaml');
    CLIUtils.info(`配置文件路径: ${configPath}`);
  } else {
    CLIUtils.warning('未找到配置文件');
    console.log('使用默认配置或运行 "npx agent-team init" 初始化');
  }
}
