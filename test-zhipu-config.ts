import { getLLMConfigManager } from './src/services/llm-config.js';

async function testConfig() {
  const manager = getLLMConfigManager();

  console.log('📋 加载 llm.config.json...\n');
  await manager.loadFromFile('./llm.config.json');

  const settings = manager.getSettings()!;
  console.log('✅ 配置加载成功！\n');
  console.log('📌 默认服务商:', settings.defaultProvider);
  console.log('📌 故障转移顺序:', settings.fallbackOrder?.join(' → '));

  console.log('\n📊 服务商状态:');
  console.log('─'.repeat(60));

  for (const [name, provider] of Object.entries(settings.providers)) {
    const enabled = manager.isEnabled(name) ? '✅ 启用' : '❌ 禁用';
    const hasKey = manager.hasValidApiKey(name) ? '✅ 有效' : '❌ 无效';
    const isDefault = name === settings.defaultProvider ? ' ⭐ 默认' : '';

    console.log(`${enabled} ${hasKey} ${name}${isDefault}`);
    if (provider.apiKey) {
      const keyPreview = provider.apiKey.substring(0, 15) + '...';
      console.log(`   API Key: ${keyPreview}`);
    }
  }

  console.log('\n🎭 角色映射:');
  console.log('─'.repeat(60));
  for (const [role, mapping] of Object.entries(settings.roleMapping || {})) {
    const config = manager.getRoleLLMConfig(role);
    const provider = mapping.providerName;
    const model = mapping.modelName || '默认';
    const available = config ? '✅' : '❌';

    console.log(`${available} ${role}: ${provider} / ${model}`);
  }

  console.log('\n🔍 第一个可用服务商:');
  const firstAvailable = manager.getFirstAvailableProvider();
  console.log(firstAvailable ? `✅ ${firstAvailable}` : '❌ 无可用服务商');
}

testConfig().catch(console.error);
