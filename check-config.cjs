const fs = require('fs');
const config = JSON.parse(fs.readFileSync('llm.config.json', 'utf-8'));

console.log('默认服务商:', config.defaultProvider);
console.log('Fallback 顺序:', config.fallbackOrder.slice(0, 3));

console.log('\nMiniMax 配置:');
const minimax = config.providers['minimax-primary'];
console.log('  Name:', minimax.name);
console.log('  Provider:', minimax.provider);
console.log('  API Key 长度:', minimax.apiKey.length);
console.log('  API Key 前10字符:', minimax.apiKey.substring(0, 10));
console.log('  Enabled:', minimax.enabled);

console.log('\n检查有效性:');
const key = minimax.apiKey;
const isEmpty = !key || key.trim() === '';
const startsWithYour = key.startsWith('your_');
const isPlaceholder = key === 'sk-xxxxx';
console.log('  为空?', isEmpty);
console.log('  以 your_ 开头?', startsWithYour);
console.log('  是占位符?', isPlaceholder);
console.log('  应该有效?', !isEmpty && !startsWithYour && !isPlaceholder);

// 检查其他服务商
console.log('\n\n其他服务商 API Key 状态:');
for (const [name, provider] of Object.entries(config.providers)) {
  if (!provider.enabled) {
    console.log(`  ${name}: 禁用`);
    continue;
  }

  const pkey = provider.apiKey;
  const valid = !(!pkey || pkey.trim() === '' || pkey.startsWith('your_') || pkey === 'sk-xxxxx');
  console.log(`  ${name}: ${valid ? '✓ 有效' : '✗ 无效'} (${pkey.substring(0, 15)}...)`);
}
