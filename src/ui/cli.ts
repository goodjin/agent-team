#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import { startCollaborationInterface } from './index.js';
import { CollaborationController } from './controller.js';
import { ProjectAgent } from '../core/project-agent.js';

/**
 * AI协作界面CLI入口
 */
program
  .name('agent-team-ui')
  .description('AI协作系统 - 多智能体协作控制界面')
  .version('1.0.0')
  .option('-m, --mode <mode>', '协作模式 (auto|interactive|hybrid)', 'hybrid')
  .option('-p, --project <path>', '项目路径', process.cwd())
  .option('-n, --name <name>', '项目名称', 'ai-collaboration')
  .option('--auto-confirm', '自动确认模式', false)
  .option('--no-monitoring', '禁用监控', false)
  .option('--update-interval <ms>', '更新间隔(毫秒)', '1000')
  .option('--theme <theme>', '界面主题 (dark|light|professional|neon)', 'dark')
  .option('--demo', '运行演示模式', false)
  .option('--config <file>', '配置文件路径')
  .parse();

const options = program.opts();

/**
 * 主函数
 */
async function main() {
  try {
    console.clear();
    console.log(chalk.cyan.bold('\n🤖 AI协作系统 - 多智能体控制界面\n'));
    
    // 创建项目智能体
    const projectAgent = new ProjectAgent({
      projectName: options.name,
      projectPath: options.project
    });
    
    if (options.config) {
      // 加载自定义配置
      // await projectAgent.loadConfig(options.config);
    } else {
      // 加载默认配置
      await projectAgent.loadConfig();
    }
    
    // 创建控制器
    const controller = new CollaborationController(projectAgent, {
      mode: options.mode as any,
      autoConfirm: options.autoConfirm,
      enableMonitoring: options.monitoring,
      updateInterval: parseInt(options.updateInterval)
    });
    
    // 设置主题
    if (options.theme) {
      const themeManager = (await import('./themes.js')).themeManager;
      themeManager.setTheme(options.theme);
    }
    
    // 设置事件监听
    setupEventListeners(controller);
    
    // 启动控制器
    await controller.start();
    
    // 如果是演示模式，创建一些示例任务
    if (options.demo) {
      await runDemo(controller);
    }
    
    console.log(chalk.green('\n✅ AI协作系统已启动'));
    console.log(chalk.white(`模式: ${options.mode}`));
    console.log(chalk.white(`主题: ${options.theme}`));
    console.log(chalk.white(`项目: ${options.name}`));
    console.log(chalk.yellow('\n按 ? 显示帮助，按 q 退出\n'));
    
    // 保持进程运行
    process.stdin.resume();
    
  } catch (error) {
    console.error(chalk.red('❌ 启动失败:'), error);
    process.exit(1);
  }
}

/**
 * 设置事件监听器
 */
function setupEventListeners(controller: CollaborationController): void {
  // 优雅退出
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n\n正在关闭AI协作系统...'));
    await controller.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log(chalk.yellow('\n\n正在关闭AI协作系统...'));
    await controller.stop();
    process.exit(0);
  });

  // 错误处理
  process.on('uncaughtException', (error) => {
    console.error(chalk.red('未捕获的异常:'), error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('未处理的拒绝:'), reason);
  });

  // 系统事件
  controller.on('started', () => {
    console.log(chalk.green('🚀 系统已启动'));
  });

  controller.on('stopped', () => {
    console.log(chalk.yellow('👋 系统已停止'));
  });

  // 任务事件
  controller.on('taskCreated', (task) => {
    console.log(chalk.blue(`📋 任务创建: ${task.title}`));
  });

  controller.on('taskCompleted', (task) => {
    console.log(chalk.green(`✅ 任务完成: ${task.title}`));
  });

  controller.on('taskFailed', ({ task, error }) => {
    console.log(chalk.red(`❌ 任务失败: ${task.title} - ${error.message}`));
  });
}

/**
 * 运行演示
 */
async function runDemo(controller: CollaborationController): Promise<void> {
  console.log(chalk.blue('\n🎭 运行演示模式...'));
  
  // 创建演示任务
  const demoTasks = [
    {
      title: '系统初始化',
      type: 'setup',
      priority: 'high' as const,
      description: '初始化AI协作系统环境'
    },
    {
      title: '需求分析',
      type: 'analysis',
      priority: 'high' as const,
      description: '分析演示需求和目标'
    },
    {
      title: '界面设计',
      type: 'design',
      priority: 'medium' as const,
      description: '设计用户界面和交互流程'
    }
  ];

  for (const task of demoTasks) {
    await controller.createTask(task.description, {
      type: task.type,
      priority: task.priority
    });
    await sleep(1500);
  }

  console.log(chalk.green('✨ 演示任务已创建'));
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 显示使用帮助
 */
function showUsageHelp(): void {
  console.log(chalk.cyan.bold('\n使用说明:\n'));
  console.log(chalk.white('基本命令:'));
  console.log(chalk.gray('  agent-team-ui                    # 启动默认界面'));
  console.log(chalk.gray('  agent-team-ui --mode auto        # 自动模式'));
  console.log(chalk.gray('  agent-team-ui --mode interactive # 交互模式'));
  console.log(chalk.gray('  agent-team-ui --demo             # 演示模式'));
  console.log(chalk.gray('  agent-team-ui --theme light      # 亮色主题'));
  console.log(chalk.gray('  agent-team-ui --config config.js # 自定义配置'));
  
  console.log(chalk.white('\n界面操作:'));
  console.log(chalk.gray('  1-4     切换面板 (智能体/任务/日志/认知)'));
  console.log(chalk.gray('  ↑↓      导航选择'));
  console.log(chalk.gray('  p       暂停选中项'));
  console.log(chalk.gray('  r       恢复选中项'));
  console.log(chalk.gray('  s       停止选中项'));
  console.log(chalk.gray('  d       删除选中项'));
  console.log(chalk.gray('  c       清除日志'));
  console.log(chalk.gray('  ?/h     显示帮助'));
  console.log(chalk.gray('  q       退出'));
  
  console.log(chalk.white('\n命令模式:'));
  console.log(chalk.gray('  :quit   退出'));
  console.log(chalk.gray('  :help   显示帮助'));
  console.log(chalk.gray('  :clear  清除日志'));
  console.log(chalk.gray('  :status 显示状态'));
  console.log(chalk.gray('  :theme <name> 切换主题'));
  console.log(chalk.gray('  :mode <mode>  切换模式'));
}

// 如果请求帮助，显示使用说明
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showUsageHelp();
  process.exit(0);
}

// 运行主函数
main().catch(error => {
  console.error(chalk.red('运行失败:'), error);
  process.exit(1);
});