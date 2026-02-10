import { LLMConfigManager } from '../src/services/llm-config.js';
import path from 'path';

async function main() {
  const manager = new LLMConfigManager();
  await manager.loadFromFile(path.join(process.cwd(), 'config/llm.yaml'));

  const settings = manager.getSettings();
  if (!settings) {
    console.log('❌ Failed to load settings');
    return;
  }

  console.log('✅ Config file verification:\n');

  console.log('Required providers:');
  const required = ['OpenAI', 'Claude', 'DeepSeek', 'Qwen', 'MiniMax', 'BigModel'];
  const providerNames = Object.values(settings.providers).map(p => p.name);

  required.forEach(name => {
    const found = providerNames.some(p => p.includes(name));
    console.log(`  ${found ? '✅' : '❌'} ${name}: ${found ? 'Found' : 'Missing'}`);
  });

  console.log('\nAll providers have weight field:');
  Object.entries(settings.providers).forEach(([key, provider]) => {
    const hasWeight = typeof provider.weight === 'number';
    console.log(`  ${hasWeight ? '✅' : '❌'} ${provider.name}: weight = ${provider.weight}`);
  });

  console.log('\nVerification summary:');
  console.log(`  Total providers: ${Object.keys(settings.providers).length}`);
  console.log(`  All required providers: ${required.every(name => providerNames.some(p => p.includes(name))) ? '✅' : '❌'}`);
  console.log(`  All have weight field: ${Object.values(settings.providers).every(p => typeof p.weight === 'number') ? '✅' : '❌'}`);
}

main();
