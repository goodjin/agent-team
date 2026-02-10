import { LLMConfigManager } from '../src/services/llm-config.js';
import path from 'path';

async function main() {
  const configPath = path.join(process.cwd(), 'config/llm.yaml');

  console.log('🧪 Testing weight-based provider selection...\n');

  const manager = new LLMConfigManager();
  await manager.loadFromFile(configPath);

  // Set some test API keys to make providers available
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.ANTHROPIC_API_KEY = 'test-claude-key';
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';

  // Reload config with test keys
  await manager.loadFromFile(configPath);

  console.log('Available providers:');
  const available = manager.getAvailableProviders();
  available.forEach(p => {
    console.log(`  - ${p.name} (weight: ${p.weight})`);
  });
  console.log();

  // Test selection distribution
  const selections = new Map<string, number>();
  const iterations = 1000;

  console.log(`Running ${iterations} selections to test distribution...\n`);

  for (let i = 0; i < iterations; i++) {
    const provider = manager.selectProvider();
    selections.set(provider.name, (selections.get(provider.name) || 0) + 1);
  }

  // Calculate total weight
  const totalWeight = available.reduce((sum, p) => sum + p.weight, 0);

  console.log('Selection results:');
  console.log('Provider Name          | Selections | Percentage | Expected | Diff');
  console.log('---------------------- | ---------- | ---------- | -------- | -----');

  for (const provider of available) {
    const count = selections.get(provider.name) || 0;
    const percentage = (count / iterations * 100).toFixed(1);
    const expected = (provider.weight / totalWeight * 100).toFixed(1);
    const diff = (parseFloat(percentage) - parseFloat(expected)).toFixed(1);
    const diffSign = parseFloat(diff) >= 0 ? '+' : '';

    console.log(
      `${provider.name.padEnd(22)} | ${count.toString().padEnd(10)} | ${percentage.padEnd(9)}% | ${expected.padEnd(7)}% | ${diffSign}${diff}%`
    );
  }

  console.log('\n✅ Weight-based selection test completed!\n');

  // Test filtering logic
  console.log('Testing filter logic...\n');

  // Test 1: Enabled providers with weight > 0 and valid API key
  console.log('Test 1: All available providers should have:');
  console.log('  - enabled = true');
  console.log('  - weight > 0');
  console.log('  - valid API key');

  let allValid = true;
  for (const provider of available) {
    const hasValidKey = provider.apiKey !== '' && !provider.apiKey.startsWith('${');
    const isValid = provider.enabled !== false && provider.weight > 0 && hasValidKey;
    if (!isValid) {
      console.log(`  ❌ ${provider.name} failed validation`);
      allValid = false;
    }
  }

  if (allValid) {
    console.log('  ✅ All providers pass validation\n');
  }

  // Test 2: Providers with weight = 0 should be filtered
  console.log('Test 2: Checking that weight=0 providers are filtered...');
  const allProviders = manager.getSettings()?.providers || {};
  const zeroWeightProviders = Object.values(allProviders).filter(p => p.weight === 0);
  const zeroWeightInAvailable = available.filter(p => p.weight === 0);

  if (zeroWeightProviders.length > 0 && zeroWeightInAvailable.length === 0) {
    console.log(`  ✅ ${zeroWeightProviders.length} providers with weight=0 are correctly filtered\n`);
  } else if (zeroWeightProviders.length === 0) {
    console.log('  ℹ️  No providers with weight=0 in config\n');
  } else {
    console.log('  ❌ Some weight=0 providers are not filtered\n');
  }
}

main();
