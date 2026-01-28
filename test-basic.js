/**
 * 调试 basic-usage.ts
 */

import { ProjectAgent } from './dist/index.js';
import { config } from 'dotenv';
import { getLLMConfigManager } from './dist/services/llm-config.js';

config();

async function debugTest() {
  console.log('🔍 调试配置加载\n');

  // 检查配置管理器状态
  const manager = getLLMConfigManager();
  console.log('1. 配置管理器状态:');
  console.log('   设置:', manager.getSettings() ? '已加载' : '未加载');

  // 创建 agent
  console.log('\n2. 创建 Project Agent');
  const agent = new ProjectAgent(
    {
      projectName: 'test',
      projectPath: process.cwd(),
    },
    {
      llm: './llm.config.json',
    }
  );

  console.log('   ✓ Agent 已创建');

  // 加载配置
  console.log('\n3. 加载配置');
  await agent.loadConfig();
  console.log('   ✓ 配置已加载');

  // 再次检查配置管理器
  console.log('\n4. 加载后配置管理器状态:');
  console.log('   设置:', manager.getSettings() ? '已加载' : '未加载');
  const defaultProvider = manager.getDefaultProvider();
  console.log('   默认服务商:', defaultProvider?.name || '无');
  const firstAvailable = manager.getFirstAvailableProvider();
  console.log('   第一个可用:', firstAvailable || '无');

  // 尝试获取角色配置
  console.log('\n5. 获取角色配置:');
  const pmConfig = manager.getRoleLLMConfig('product-manager');
  if (pmConfig) {
    console.log('   product-manager:');
    console.log('     Provider:', pmConfig.provider);
    console.log('     Model:', pmConfig.model);
    console.log('     API Key:', pmConfig.apiKey.substring(0, 20) + '...');
  } else {
    console.log('   ✗ product-manager: 无配置');
  }

  await agent.shutdown();
}

debugTest().catch(console.error);
