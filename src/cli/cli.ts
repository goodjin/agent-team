#!/usr/bin/env node
/**
 * Project Agent CLI 入口
 */

import { handleConfigCommand } from './commands/config.js';
import { handleRoleCommand } from './commands/role.js';
import { handleRuleCommand } from './commands/rule.js';
import { CLIUtils, showHelp, showVersion } from './index.js';
import { ProjectAgent } from '../core/project-agent.js';
import { createHybridModeManager, ExecutionMode } from './hybrid-mode.js';
import { getLogger } from '../utils/logger.js';
import os from 'os';

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // 处理命令
  switch (command) {
    case 'config':
      await handleConfigCommand(args.slice(1));
      break;

    case 'role':
      await handleRoleCommand(args.slice(1));
      break;

    case 'rule':
      await handleRuleCommand(args.slice(1));
      break;

    case 'chat':
    case 'ai':
      await startChat();
      break;

    case 'init':
      await initConfig();
      break;

    case 'version':
    case '-v':
    case '--version':
      showVersion();
      break;

    case 'help':
    case '-h':
    case '--help':
    case undefined:
      showHelp();
      break;

    default:
      CLIUtils.error(`未知命令: ${command}`);
      showHelp();
      process.exit(1);
  }
}

/**
 * 启动聊天模式
 */
async function startChat() {
  try {
    CLIUtils.title('Project Agent - AI 对话模式');
    
    const agent = new ProjectAgent({
      projectName: process.cwd().split('/').pop() || 'project',
      projectPath: process.cwd(),
    });

    await agent.loadConfig();

    // 初始化日志系统
    const { loadConfig: loadUnifiedConfig } = await import('../config/config-loader.js');
    try {
      const { config } = await loadUnifiedConfig();
      if (config.logging) {
        const logger = getLogger({
          enabled: config.logging.enabled,
          level: config.logging.level === 'debug' ? 0
            : config.logging.level === 'info' ? 1
            : config.logging.level === 'warn' ? 2
            : 3,
          logDir: config.logging.logDir?.replace('~', os.homedir()) || '~/.agent-team/logs',
          logToFile: config.logging.logToFile,
          logToConsole: config.logging.logToConsole,
          maxFileSize: config.logging.maxFileSize,
          maxFiles: config.logging.maxFiles,
        });
        logger.info('Project Agent 启动', { projectName: process.cwd().split('/').pop() || 'project' });
      }
    } catch (error) {
      // 如果加载配置失败，使用默认日志配置
      const logger = getLogger();
      logger.warn('无法加载日志配置，使用默认配置', { error });
    }

    // 检查 LLM 配置是否可用
    const { getLLMConfigManager } = await import('../services/llm-config.js');
    const { DEFAULT_CONFIG_PATHS } = await import('../config/defaults.js');
    const { expandPath } = await import('../config/config-loader.js');
    const configManager = getLLMConfigManager();
    
    // 如果配置管理器没有加载配置，尝试从统一配置文件加载
    if (!configManager.getSettings()) {
      try {
        // 尝试加载统一配置文件
        const configPath = expandPath(DEFAULT_CONFIG_PATHS[0]);
        await configManager.loadFromFile(configPath);
      } catch (error) {
        // 如果加载失败，继续使用空的配置管理器
        console.warn(`无法加载统一配置文件 ${DEFAULT_CONFIG_PATHS[0]}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    const validation = await configManager.validateConfig();

    if (validation.summary.readyToUse === 0) {
      CLIUtils.blank();
      CLIUtils.warning('⚠️  LLM 配置未就绪');
      CLIUtils.blank();
      console.log('当前配置状态：');
      console.log(`  • 已配置提供商: ${validation.summary.configuredProviders}`);
      console.log(`  • 已启用提供商: ${validation.summary.enabledProviders}`);
      console.log(`  • 可用提供商: ${validation.summary.readyToUse}`);
      CLIUtils.blank();
      
      if (validation.recommendations.length > 0) {
        console.log('建议：');
        validation.recommendations.forEach((rec: string) => {
          console.log(`  • ${rec}`);
        });
        CLIUtils.blank();
      }

      console.log('💡 请先配置 LLM 提供商：');
      console.log('  1. 运行 "project-agent config show" 查看配置');
      console.log('  2. 运行 "project-agent config test" 测试配置');
      console.log('  3. 编辑 ~/.agent-team/config.yaml 启用提供商');
      CLIUtils.blank();
      
      const { default: readline } = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question('是否继续启动？（可能会在首次使用时出错）(y/n): ', (ans) => {
          rl.close();
          resolve(ans.trim().toLowerCase());
        });
      });

      if (answer !== 'y' && answer !== 'yes' && answer !== '是') {
        CLIUtils.info('已取消启动');
        process.exit(0);
      }
      CLIUtils.blank();
    }

    const hybridManager = createHybridModeManager(agent, {
      mode: ExecutionMode.INTERACTIVE,
      showProgress: true,
      autoConfirm: false,
    });

    CLIUtils.success('AI 对话模式已启动');
    CLIUtils.info('输入你的任务或问题，输入 "help" 查看帮助，输入 "exit" 退出\n');

    // 启动交互式会话
    await hybridManager.startInteractiveSession();
  } catch (error) {
    CLIUtils.blank();
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // 如果错误信息已经格式化过，直接显示
    if (errorMessage.includes('❌') || errorMessage.includes('\n')) {
      console.log(errorMessage);
    } else {
      CLIUtils.error(`启动失败: ${errorMessage}`);
      CLIUtils.info('💡 请检查配置文件或运行 "project-agent config test" 诊断问题');
    }
    
    CLIUtils.blank();
    process.exit(1);
  }
}

/**
 * 初始化配置
 */
async function initConfig() {
  CLIUtils.title('Project Agent 初始化配置');

  try {
    const { loadConfig, configExists } = await import('../config/config-loader.js');
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const os = await import('os');

    const configPath = path.join(os.homedir(), '.agent-team', 'config.yaml');

    if (await configExists(configPath)) {
      const overwrite = await CLIUtils.confirm('配置文件已存在，是否覆盖？', false);
      if (!overwrite) {
        CLIUtils.info('已取消初始化');
        return;
      }
    }

    // 创建配置目录
    const configDir = path.dirname(configPath);
    await fs.mkdir(configDir, { recursive: true });

    // 创建默认配置
    const defaultConfig = `# Project Agent 配置文件
# 位置: ${configPath}

llm:
  defaultProvider: anthropic-primary
  providers:
    anthropic-primary:
      name: Anthropic Claude
      enabled: false
      apiKey: \${ANTHROPIC_API_KEY}
      models:
        claude-3-5-sonnet-20241022: Claude 3.5 Sonnet
        claude-3-opus-20240229: Claude 3 Opus
        claude-3-sonnet-20240229: Claude 3 Sonnet
        claude-3-haiku-20240307: Claude 3 Haiku

    openai-primary:
      name: OpenAI GPT
      enabled: false
      apiKey: \${OPENAI_API_KEY}
      models:
        gpt-4-turbo-preview: GPT-4 Turbo
        gpt-4: GPT-4
        gpt-3.5-turbo: GPT-3.5 Turbo

    zhipu-primary:
      name: 智谱 GLM
      enabled: false
      apiKey: \${ZHIPU_API_KEY}
      models:
        glm-4: GLM-4
        glm-3-turbo: GLM-3 Turbo

project:
  name: ${process.cwd().split('/').pop() || 'project'}
  path: ${process.cwd()}

agent:
  maxConcurrentTasks: 3
  retryAttempts: 3
  timeout: 300000
`;

    await fs.writeFile(configPath, defaultConfig, 'utf-8');

    CLIUtils.success(`配置文件已创建: ${configPath}`);
    CLIUtils.info('请编辑配置文件并设置 API Key，或使用环境变量');
    CLIUtils.info('示例: export ANTHROPIC_API_KEY=sk-ant-xxx');
  } catch (error) {
    CLIUtils.error(`初始化失败: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// 运行主函数
main().catch((error) => {
  CLIUtils.error(`执行失败: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
