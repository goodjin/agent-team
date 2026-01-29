/**
 * 增强的交互式会话示例
 * 演示如何使用新的EnhancedCLI和EnhancedChatUI
 */

import { ProjectAgent } from '../src/core/project-agent.js';
import { EnhancedCLI } from '../src/cli/enhanced-cli.js';
import { EnhancedChatUI } from '../src/cli/enhanced-chat-ui.js';
import { config } from 'dotenv';

// 加载环境变量
config();

async function enhancedInteractive() {
  const cli = new EnhancedCLI();
  
  // 显示欢迎信息
  cli.welcome(
    'Agent Team - 增强交互模式',
    '使用更强大的交互组件和更好的可视化体验'
  );

  // 创建 Project Agent
  const agent = new ProjectAgent(
    {
      projectName: 'enhanced-demo',
      projectPath: process.cwd(),
    },
    {
      llm: './llm.config.json',
    }
  );

  // 加载配置
  await cli.withLoading('加载配置中...', async () => {
    await agent.loadConfig();
  });

  // 显示配置信息
  cli.blank();
  cli.section('配置信息');
  
  const configInfo = [
    { key: '项目名称', value: 'enhanced-demo' },
    { key: '项目路径', value: process.cwd() },
  ];
  
  cli.table(configInfo);

  // 询问用户是否继续
  cli.blank();
  const continueSession = await cli.confirm('是否启动交互式会话？', true);
  
  if (!continueSession) {
    cli.info('已取消');
    cli.close();
    return;
  }

  // 创建增强的ChatUI
  const chatUI = new EnhancedChatUI({
    inputPrompt: 'You: ',
    showTimestamps: true,
    colorizeRoles: true,
  });

  chatUI.start();
  chatUI.appendSystem('🚀 Agent Team - 增强交互模式已启动\n');
  chatUI.appendSystem('输入你的任务或问题，输入 "help" 查看帮助，输入 "exit" 退出\n\n');

  // 简单的交互循环
  while (true) {
    const input = await chatUI.readLine('You: ');
    
    if (!input.trim()) {
      continue;
    }

    chatUI.appendRole('user', input + '\n');

    // 处理退出
    if (/^(exit|quit|bye|再见|退出)$/i.test(input.trim())) {
      chatUI.appendSystem('再见！\n');
      break;
    }

    // 处理帮助
    if (/^(help|\?|帮助)$/i.test(input.trim())) {
      chatUI.appendSystem('可用命令：\n');
      chatUI.appendSystem('  - help: 显示帮助\n');
      chatUI.appendSystem('  - exit: 退出程序\n');
      chatUI.appendSystem('  - 其他: 直接描述任务，AI会自动处理\n');
      continue;
    }

    // 模拟AI响应
    chatUI.appendRole('assistant', `我理解你的需求: ${input}\n`);
    chatUI.appendRole('assistant', '正在处理中...\n');
    
    // 模拟流式输出
    await chatUI.streamRole('assistant', '这是一个示例响应，展示流式输出效果。在实际使用中，这里会是AI的实际响应内容。\n');
  }

  chatUI.close();
  cli.close();
}

// 运行
enhancedInteractive().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
