/**
 * 测试 createForRole
 */

import { getLLMConfigManager } from './dist/services/llm-config.js';
import { LLMServiceFactory } from './dist/services/llm.service.js';
import { config } from 'dotenv';

config();

async function testCreateForRole() {
  console.log('🧪 测试 createForRole\n');

  const manager = getLLMConfigManager();
  await manager.loadFromFile('./llm.config.json');

  console.log('✓ 配置已加载\n');

  const roles = ['product-manager', 'architect', 'developer'];

  for (const role of roles) {
    console.log(`${role}:`);

    // 获取配置
    const config = manager.getRoleLLMConfig(role);
    if (!config) {
      console.log('  ✗ getRoleLLMConfig 返回 null');
      continue;
    }

    console.log(`  配置: ${config.provider} / ${config.model}`);
    console.log(`  API Key: ${config.apiKey.substring(0, 20)}...`);

    // 尝试创建服务
    try {
      const service = LLMServiceFactory.createForRole(role);
      if (service) {
        console.log(`  ✓ 服务创建成功`);
        console.log(`    Provider: ${service.getProvider()}`);
        console.log(`    Model: ${service.getModel()}`);
      } else {
        console.log(`  ✗ createForRole 返回 null`);
      }
    } catch (error) {
      console.log(`  ✗ 创建服务时出错: ${error.message}`);
    }

    console.log();
  }
}

testCreateForRole().catch(console.error);
