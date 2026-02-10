import { LLMConfigManager } from '../src/services/llm-config.js';
import path from 'path';

async function main() {
  const configPath = path.join(process.cwd(), 'config/llm.yaml');

  console.log('🔍 Validating LLM configuration...\n');
  console.log(`Config file: ${configPath}\n`);

  const manager = new LLMConfigManager();

  try {
    await manager.loadFromFile(configPath);
    console.log('✅ Config file loaded successfully\n');
  } catch (error) {
    console.error('❌ Failed to load config file:', error);
    process.exit(1);
  }

  const validation = await manager.validateConfig();

  // 打印摘要
  console.log('📊 Summary:');
  console.log(`  Total providers: ${validation.summary.totalProviders}`);
  console.log(`  Enabled: ${validation.summary.enabledProviders}`);
  console.log(`  Ready to use: ${validation.summary.readyToUse}\n`);

  // 打印服务商详情
  console.log('📋 Providers:');
  validation.providers.forEach((p) => {
    const status = p.readyToUse ? '✅' : '⚠️';
    console.log(`  ${status} ${p.name}`);
    console.log(`     Enabled: ${p.enabled}, API Key: ${p.hasApiKey ? 'Yes' : 'No'}, Weight: ${p.weight}`);
  });
  console.log();

  // 打印错误
  if (validation.errors.length > 0) {
    console.log('❌ Errors:');
    validation.errors.forEach((err) => console.log(`  - ${err}`));
    console.log();
  }

  // 打印警告
  if (validation.warnings.length > 0) {
    console.log('⚠️  Warnings:');
    validation.warnings.forEach((warn) => console.log(`  - ${warn}`));
    console.log();
  }

  // 打印建议
  if (validation.recommendations.length > 0) {
    console.log('💡 Recommendations:');
    validation.recommendations.forEach((rec) => console.log(`  - ${rec}`));
    console.log();
  }

  // 最终结果
  if (validation.valid) {
    console.log('✅ Configuration is valid and ready to use!\n');
    process.exit(0);
  } else {
    console.log('❌ Configuration has issues. Please fix them before using.\n');
    process.exit(1);
  }
}

main();
