/**
 * 测试重试逻辑
 * 演示配置错误时的用户提示和重试机制
 */

import { ProjectAgent } from './src/index.js';
import { config } from 'dotenv';

// 加载环境变量
config();

async function testRetry() {
  console.log('🧪 测试 LLM 配置重试机制\n');
  console.log('这个测试会故意使用无效的 API key 来演示重试逻辑\n');

  // 创建一个使用 MiniMax 的 agent（配置文件中有硬编码的 key）
  const agent = new ProjectAgent(
    {
      projectName: 'test-retry',
      projectPath: process.cwd(),
      // 不提供默认配置，让它从 llm.config.json 加载
    },
    {
      llm: './llm.config.json',
    }
  );

  // 加载配置
  await agent.loadConfig();

  console.log('✓ 配置已加载');
  console.log('✓ 默认服务商:', agent.getCurrentLLMProvider?.() || 'unknown');
  console.log('\n尝试执行一个简单任务...\n');

  try {
    // 尝试执行一个简单任务
    const result = await agent.execute({
      type: 'requirement-analysis',
      title: '测试任务',
      description: '这是一个测试任务，验证 LLM 连接',
      assignedRole: 'product-manager',
    });

    if (result.success) {
      console.log('\n✅ 任务执行成功！');
      console.log('结果:', result.data);
    } else {
      console.log('\n❌ 任务执行失败');
      console.log('错误:', result.error);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.log('\n❌ 发生错误:', error.message);
    }
  }

  await agent.shutdown();
}

/**
 * 运行测试并支持重试
 */
async function runWithRetry(): Promise<void> {
  while (true) {
    try {
      await testRetry();
      break; // 成功完成
    } catch (error) {
      if (error instanceof Error && error.message === 'USER_RETRY') {
        console.log('\n🔄 重新加载配置...\n');
        config(); // 重新加载 .env
        continue; // 重试
      }
      throw error;
    }
  }
}

// 运行测试
runWithRetry().catch(console.error);
