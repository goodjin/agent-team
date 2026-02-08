import { LLMConfigManager } from '../src/services/llm-config.js';
import path from 'path';

async function main() {
  console.log('🧪 Testing provider filtering logic...\n');

  // Test 1: Filter providers with weight=0
  console.log('Test 1: Providers with weight=0 should be filtered');
  const manager1 = new LLMConfigManager();

  // Create test config with weight=0
  manager1.loadFromObject({
    version: '5.0.0',
    defaultProvider: 'openai',
    providers: {
      openai: {
        name: 'OpenAI',
        provider: 'openai' as any,
        apiKey: 'test-key',
        weight: 10,
        enabled: true,
        models: {
          'gpt-4': { model: 'gpt-4', maxTokens: 8000 }
        }
      },
      disabled: {
        name: 'Disabled Provider',
        provider: 'openai' as any,
        apiKey: 'test-key',
        weight: 0,
        enabled: true,
        models: {
          'model': { model: 'model', maxTokens: 8000 }
        }
      }
    }
  });

  const available1 = manager1.getAvailableProviders();
  const hasWeightZero = available1.some(p => p.weight === 0);
  console.log(`  ${!hasWeightZero ? '✅' : '❌'} Weight=0 providers are ${!hasWeightZero ? 'filtered' : 'NOT filtered'}`);
  console.log(`     Available: ${available1.map(p => p.name).join(', ')}\n`);

  // Test 2: Filter providers with empty API key
  console.log('Test 2: Providers with empty API key should be filtered');
  const manager2 = new LLMConfigManager();

  manager2.loadFromObject({
    version: '5.0.0',
    defaultProvider: 'openai',
    providers: {
      openai: {
        name: 'OpenAI',
        provider: 'openai' as any,
        apiKey: 'test-key',
        weight: 10,
        enabled: true,
        models: {
          'gpt-4': { model: 'gpt-4', maxTokens: 8000 }
        }
      },
      nokey: {
        name: 'No Key Provider',
        provider: 'openai' as any,
        apiKey: '',
        weight: 10,
        enabled: true,
        models: {
          'model': { model: 'model', maxTokens: 8000 }
        }
      }
    }
  });

  const available2 = manager2.getAvailableProviders();
  const hasEmptyKey = available2.some(p => p.apiKey === '');
  console.log(`  ${!hasEmptyKey ? '✅' : '❌'} Empty API key providers are ${!hasEmptyKey ? 'filtered' : 'NOT filtered'}`);
  console.log(`     Available: ${available2.map(p => p.name).join(', ')}\n`);

  // Test 3: Filter providers with env var placeholder
  console.log('Test 3: Providers with env var placeholders should be filtered');
  const manager3 = new LLMConfigManager();

  manager3.loadFromObject({
    version: '5.0.0',
    defaultProvider: 'openai',
    providers: {
      openai: {
        name: 'OpenAI',
        provider: 'openai' as any,
        apiKey: 'test-key',
        weight: 10,
        enabled: true,
        models: {
          'gpt-4': { model: 'gpt-4', maxTokens: 8000 }
        }
      },
      envvar: {
        name: 'Env Var Provider',
        provider: 'openai' as any,
        apiKey: '${SOME_API_KEY}',
        weight: 10,
        enabled: true,
        models: {
          'model': { model: 'model', maxTokens: 8000 }
        }
      }
    }
  });

  const available3 = manager3.getAvailableProviders();
  const hasEnvVar = available3.some(p => p.apiKey.startsWith('${'));
  console.log(`  ${!hasEnvVar ? '✅' : '❌'} Env var placeholders are ${!hasEnvVar ? 'filtered' : 'NOT filtered'}`);
  console.log(`     Available: ${available3.map(p => p.name).join(', ')}\n`);

  // Test 4: Filter disabled providers
  console.log('Test 4: Disabled providers should be filtered');
  const manager4 = new LLMConfigManager();

  manager4.loadFromObject({
    version: '5.0.0',
    defaultProvider: 'openai',
    providers: {
      openai: {
        name: 'OpenAI',
        provider: 'openai' as any,
        apiKey: 'test-key',
        weight: 10,
        enabled: true,
        models: {
          'gpt-4': { model: 'gpt-4', maxTokens: 8000 }
        }
      },
      disabled: {
        name: 'Disabled Provider',
        provider: 'openai' as any,
        apiKey: 'test-key',
        weight: 10,
        enabled: false,
        models: {
          'model': { model: 'model', maxTokens: 8000 }
        }
      }
    }
  });

  const available4 = manager4.getAvailableProviders();
  const hasDisabled = available4.some(p => p.enabled === false);
  console.log(`  ${!hasDisabled ? '✅' : '❌'} Disabled providers are ${!hasDisabled ? 'filtered' : 'NOT filtered'}`);
  console.log(`     Available: ${available4.map(p => p.name).join(', ')}\n`);

  console.log('✅ All filtering tests completed!\n');
}

main();
