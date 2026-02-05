export { DashboardUI, type AgentStatus, type TaskStatus, type CognitiveLoad, type LogEntry } from './dashboard-ui.js';
export { AgentManager, type AgentConfig } from './agent-manager-ui.js';
export { TaskManager, type TaskConfig } from './task-manager-ui.js';
export { CollaborationController, type ControllerConfig, type CollaborationMode } from './controller.js';
export { ResultsUI, type ResultsUIConfig, type FileTreeNode, type PreviewResult } from './results-ui.js';
export { FileTree, type FileTreeOptions, type FileTreeRenderOptions } from './file-tree.js';
export { FilePreview, type PreviewConfig, type ImagePreviewOptions, type CodePreviewOptions } from './file-preview.js';

import { CollaborationController } from './controller.js';
import { ProjectAgent } from '../core/project-agent.js';
import chalk from 'chalk';

/**
 * 启动多智能体协作界面
 */
export async function startCollaborationInterface(
  projectAgent?: ProjectAgent,
  options?: {
    mode?: 'auto' | 'interactive' | 'hybrid';
    autoConfirm?: boolean;
    enableMonitoring?: boolean;
  }
): Promise<CollaborationController> {
  // 创建项目智能体（如果没有提供）
  if (!projectAgent) {
    projectAgent = new ProjectAgent({
      projectName: 'ai-collaboration',
      projectPath: process.cwd()
    });
    await projectAgent.loadConfig();
  }
  
  // 创建控制器
  const controller = new CollaborationController(projectAgent, {
    mode: options?.mode || 'hybrid',
    autoConfirm: options?.autoConfirm || false,
    enableMonitoring: options?.enableMonitoring !== false
  });
  
  // 启动控制器
  await controller.start();
  
  return controller;
}

/**
 * 运行协作界面（CLI入口）
 */
export async function runCollaborationCLI(): Promise<void> {
  try {
    console.log(chalk.cyan.bold('\n🤖 启动AI协作系统...\n'));
    
    const controller = await startCollaborationInterface();
    
    // 处理进程退出
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\n正在关闭AI协作系统...'));
      await controller.stop();
    });
    
    process.on('SIGTERM', async () => {
      console.log(chalk.yellow('\n\n正在关闭AI协作系统...'));
      await controller.stop();
    });
    
    // 保持进程运行
    process.stdin.resume();
    
  } catch (error) {
    console.error(chalk.red('启动AI协作系统失败:'), error);
    process.exit(1);
  }
}