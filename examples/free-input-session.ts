/**
 * 自由输入交互式会话示例
 * 演示如何使用自然语言与 Project Agent 交互
 */

import { ProjectAgent, createHybridModeManager } from '../src/index.js';
import { config } from 'dotenv';

// 加载环境变量
config();

async function freeInputSession() {
  console.log('\n🚀 启动自由输入交互式会话\n');

  // 创建 Project Agent
  const agent = new ProjectAgent(
    {
      projectName: 'free-input-demo',
      projectPath: process.cwd(),
    },
    {
      llm: './llm.config.json',
    }
  );

  // 加载配置
  await agent.loadConfig();

  // 创建混合模式管理器（默认交互式）
  const hybrid = createHybridModeManager(agent, {
    showProgress: true,
    showLLMThought: false,
    colorOutput: true,
  });

  try {
    // 启动自由输入会话
    await hybrid.startInteractiveSession();
  } finally {
    await hybrid.shutdown();
  }
}

// 运行
freeInputSession().catch(console.error);
