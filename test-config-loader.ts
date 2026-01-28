/**
 * 测试配置加载逻辑
 */

import { getLLMConfigManager } from './src/services/llm-config.js';
import { config } from 'dotenv';

// 加载环境变量
config();

async function testConfig() {
  console.log('🧪 测试 LLM 配置加载\n');

  const manager = getLLMConfigManager();

  // 加载配置
  await manager.loadFromFile('./llm.config.json');

  console.log('✓ 配置已加载\n');

  // 测试各个角色的配置
  const roles = ['product-manager', 'architect', 'developer', 'tester', 'doc-writer'];

  for (const role of roles) {
    console.log(`\n${role}:`);
    const config = manager.getRoleLLMConfig(role);
    if (config) {
      console.log(`  ✓ Provider: ${config.provider}`);
      console.log(`  ✓ Model: ${config.model}`);
      console.log(`  ✓ API Key: ${config.apiKey.substring(0, 20)}...`);
      console.log(`  ✓ Base URL: ${config.baseURL || 'N/A'}`);
    } else {
      console.log(`  ✗ 没有找到有效配置`);
    }
  }

  console.log('\n\n默认服务商:');
  const defaultProvider = manager.getDefaultProvider();
  if (defaultProvider) {
    console.log(`  名称: ${defaultProvider.name}`);
    console.log(`  Provider: ${defaultProvider.provider}`);
    console.log(`  API Key: ${defaultProvider.apiKey.substring(0, 20)}...`);
  }

  console.log('\n\n第一个可用服务商:');
  const firstAvailable = manager.getFirstAvailableProvider();
  console.log(`  ${firstAvailable || '无'}`);
}

testConfig().catch(console.error);
