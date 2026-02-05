#!/usr/bin/env node

import { CollaborationController } from '../src/ui/index.js';
import { ProjectAgent } from '../src/core/project-agent.js';
import chalk from 'chalk';

/**
 * AI协作界面演示
 * 展示多智能体协作控制界面的完整功能
 */
async function main() {
  console.log(chalk.cyan.bold('\n🤖 AI协作系统界面演示\n'));
  
  try {
    // 创建项目智能体
    const projectAgent = new ProjectAgent({
      projectName: 'demo-project',
      projectPath: process.cwd()
    });
    
    await projectAgent.loadConfig();
    
    // 创建协作控制器
    const controller = new CollaborationController(projectAgent, {
      mode: 'hybrid',
      enableMonitoring: true,
      updateInterval: 1000
    });
    
    // 设置事件监听
    setupEventListeners(controller);
    
    // 启动控制器
    await controller.start();
    
    // 演示一些基本操作
    await demonstrateBasicFeatures(controller);
    
    console.log(chalk.green('\n✓ 演示开始！使用快捷键控制界面\n'));
    console.log(chalk.yellow('按 ? 显示帮助，按 q 退出\n'));
    
    // 保持运行直到用户退出
    process.stdin.resume();
    
  } catch (error) {
    console.error(chalk.red('演示失败:'), error);
    process.exit(1);
  }
}

/**
 * 设置事件监听器
 */
function setupEventListeners(controller: CollaborationController): void {
  // 任务事件
  controller.on('taskCreated', (task) => {
    console.log(chalk.blue(`📋 任务创建: ${task.title}`));
  });
  
  controller.on('taskStarted', (task) => {
    console.log(chalk.yellow(`▶️ 任务开始: ${task.title}`));
  });
  
  controller.on('taskCompleted', (task) => {
    console.log(chalk.green(`✅ 任务完成: ${task.title}`));
  });
  
  controller.on('taskFailed', ({ task, error }) => {
    console.log(chalk.red(`❌ 任务失败: ${task.title} - ${error.message}`));
  });
  
  // 智能体事件
  controller.on('agentTaskAssigned', ({ agentId, task }) => {
    console.log(chalk.cyan(`🤖 智能体 ${agentId} 被分配任务: ${task.title}`));
  });
  
  controller.on('agentTaskCompleted', ({ agentId, taskId, result }) => {
    console.log(chalk.green(`🎉 智能体 ${agentId} 完成任务: ${taskId}`));
  });
  
  controller.on('agentTaskFailed', ({ agentId, taskId, error }) => {
    console.log(chalk.red(`💥 智能体 ${agentId} 任务失败: ${taskId} - ${error.message}`));
  });
  
  // 系统事件
  controller.on('started', () => {
    console.log(chalk.green('🚀 AI协作系统已启动'));
  });
  
  controller.on('stopped', () => {
    console.log(chalk.yellow('👋 AI协作系统已停止'));
  });
}

/**
 * 演示基本功能
 */
async function demonstrateBasicFeatures(controller: CollaborationController): Promise<void> {
  // 等待界面完全加载
  await sleep(2000);
  
  // 创建一些示例任务
  const taskConfigs = [
    {
      title: '分析用户需求',
      type: 'analysis',
      priority: 'high' as const,
      description: '分析用户的功能需求和业务逻辑'
    },
    {
      title: '设计系统架构',
      type: 'design',
      priority: 'high' as const,
      description: '设计系统的整体架构和技术选型'
    },
    {
      title: '实现核心功能',
      type: 'development',
      priority: 'medium' as const,
      description: '开发核心业务功能模块'
    },
    {
      title: '编写单元测试',
      type: 'testing',
      priority: 'medium' as const,
      description: '为核心功能编写单元测试'
    },
    {
      title: '生成API文档',
      type: 'documentation',
      priority: 'low' as const,
      description: '生成详细的API文档'
    }
  ];
  
  // 批量创建任务
  console.log(chalk.blue('\n📝 创建示例任务...'));
  
  for (const config of taskConfigs) {
    await controller.createTask(config.description, {
      type: config.type,
      priority: config.priority
    });
    await sleep(1000); // 间隔创建任务
  }
  
  // 创建工作流
  console.log(chalk.blue('\n🔄 创建工作流...'));
  
  const workflowSteps = [
    { title: '项目初始化', type: 'setup', priority: 'high' as const },
    { title: '需求分析', type: 'analysis', priority: 'high' as const },
    { title: '架构设计', type: 'design', priority: 'high' as const },
    { title: '功能开发', type: 'development', priority: 'medium' as const },
    { title: '质量测试', type: 'testing', priority: 'medium' as const },
    { title: '文档编写', type: 'documentation', priority: 'low' as const }
  ];
  
  await controller.createWorkflow(workflowSteps);
  
  // 显示系统状态
  setInterval(() => {
    const status = controller.getSystemStatus();
    console.log(chalk.gray(`\n📊 系统状态 - 智能体: ${status.agents.total} | 任务: ${status.tasks.total} | 认知负荷: ${status.cognitiveLoad.overall}%`));
  }, 10000); // 每10秒显示一次状态
  
  console.log(chalk.green('\n✨ 演示任务已创建完成！'));
  console.log(chalk.white('你可以：'));
  console.log(chalk.white('  • 使用数字键 1-4 切换不同面板'));
  console.log(chalk.white('  • 使用方向键 ↑↓ 选择项目'));
  console.log(chalk.white('  • 使用 p/r/s/d 控制任务状态'));
  console.log(chalk.white('  • 使用 ? 查看所有快捷键'));
  console.log(chalk.white('  • 观察智能体如何协作完成任务'));
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 处理进程退出
 */
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\n正在关闭演示...'));
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(chalk.yellow('\n\n正在关闭演示...'));
  process.exit(0);
});

// 运行演示
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('演示运行失败:'), error);
    process.exit(1);
  });
}