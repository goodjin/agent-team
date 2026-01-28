/**
 * Project Agent 功能演示
 * 展示配置和工作流程（不需要完整编译）
 */

async function demo() {
  console.log('🚀 Project Agent 功能演示\n');

  // 1. 展示配置文件
  console.log('📋 配置文件展示');
  console.log('='.repeat(50));

  const fs = await import('fs/promises');

  // 读取 LLM 配置
  const llmConfig = JSON.parse(await fs.readFile('llm.config.json', 'utf-8'));
  console.log('\n🔑 LLM 服务商配置:');
  console.log(`  版本: ${llmConfig.version}`);
  console.log(`  默认服务商: ${llmConfig.defaultProvider}`);
  console.log(`  服务商总数: ${Object.keys(llmConfig.providers).length}`);
  console.log(`  故障转移: ${llmConfig.fallbackOrder.slice(0, 3).join(' → ')} → ...`);

  console.log('\n📊 服务商详情:');
  Object.entries(llmConfig.providers).slice(0, 6).forEach(([name, provider]: [string, any]) => {
    const status = provider.enabled ? '✓' : '✗';
    const models = Object.keys(provider.models).join(', ');
    console.log(`  ${status} ${provider.name}`);
    console.log(`     模型: ${models}`);
  });

  console.log('  ...');

  console.log('\n🎭 角色专属配置:');
  Object.entries(llmConfig.roleMapping).forEach(([role, mapping]: [string, any]) => {
    const provider = llmConfig.providers[mapping.providerName];
    console.log(`  ${role}:`);
    console.log(`    服务商: ${provider?.name}`);
    console.log(`    模型: ${mapping.modelName}`);
  });

  // 2. 展示提示词配置
  console.log('\n\n💬 提示词配置展示');
  console.log('='.repeat(50));

  const promptConfig = JSON.parse(await fs.readFile('prompts/config.json', 'utf-8'));
  console.log(`\n版本: ${promptConfig.version}`);
  console.log(`默认语言: ${promptConfig.defaults.language || '未设置'}`);
  console.log(`默认温度: ${promptConfig.defaults.temperature || '未设置'}`);
  console.log(`默认最大Token: ${promptConfig.defaults.maxTokens || '未设置'}`);
  console.log(`已配置角色数量: ${Object.keys(promptConfig.roles).length}`);

  // 读取一个角色提示词示例
  const developerPrompt = JSON.parse(await fs.readFile('prompts/roles/developer.json', 'utf-8'));
  console.log('\n开发者角色提示词示例:');
  console.log(`  长度: ${developerPrompt.systemPrompt.length} 字符`);
  console.log(`  温度: ${developerPrompt.temperature}`);
  console.log(`  最大Token: ${developerPrompt.maxTokens}`);
  console.log(`  支持上下文: ${Object.keys(developerPrompt.contexts || {}).length === 0 ? '无' : Object.keys(developerPrompt.contexts || {}).join(', ')}`);
  console.log(`  支持模板: ${Object.keys(developerPrompt.templates || {}).length === 0 ? '无' : Object.keys(developerPrompt.templates || {}).join(', ')}`);

  // 3. 使用建议
  console.log('\n\n💡 使用建议');
  console.log('='.repeat(50));

  console.log('\n1. 设置环境变量:');
  console.log('   cp .env.example .env');
  console.log('   # 编辑 .env 添加 API Key');

  console.log('\n2. 选择服务商:');
  console.log('   - 国际业务: Anthropic, OpenAI');
  console.log('   - 国内业务: 通义千问, 智谱 GLM, MiniMax, Kimi, DeepSeek');
  console.log('   - 本地开发: Ollama');

  console.log('\n3. 角色与服务商推荐组合:');

  const recommendations = [
    {
      role: '架构师',
      providers: ['Claude 3 Opus', 'GLM-4', 'Qwen Max', 'DeepSeek Coder'],
      reason: '需要强大的推理能力',
    },
    {
      role: '开发者',
      providers: ['Claude 3 Sonnet', 'DeepSeek Coder', 'Qwen Plus', 'GLM-4 Air'],
      reason: '代码生成，平衡性能和成本',
    },
    {
      role: '测试工程师',
      providers: ['GPT-3.5 Turbo', 'MiniMax ABAB6.5s', 'GLM-4 Flash'],
      reason: '快速测试，高并发',
    },
    {
      role: '产品经理',
      providers: ['Kimi 128k', 'Claude 3 Sonnet', 'Qwen Long'],
      reason: '长文档分析',
    },
    {
      role: '文档编写者',
      providers: ['Claude 3 Haiku', 'GLM-4 Flash', 'Qwen Turbo'],
      reason: '简单任务，成本低',
    },
  ];

  recommendations.forEach(({ role, providers, reason }) => {
    console.log(`\n  ${role}:`);
    console.log(`    推荐: ${providers.join(' / ')}`);
    console.log(`    理由: ${reason}`);
  });

  console.log('\n4. 成本优化策略:');
  console.log('   - 简单任务: 使用 Haiku/Flash/Turbo 等经济模型');
  console.log('   - 常规任务: 使用 Sonnet/Plus/Air 等平衡模型');
  console.log('   - 复杂任务: 使用 Opus/Max/GPT-4 等最强模型');

  console.log('\n5. 故障转移配置:');
  console.log('   主服务商失败时，自动尝试备用服务商');
  console.log(`   当前顺序: ${llmConfig.fallbackOrder.slice(0, 4).join(' → ')} → ...`);

  console.log('\n\n📚 相关文档');
  console.log('='.repeat(50));
  console.log('  - docs/QUICK_START.md - 快速入门指南');
  console.log('  - docs/PROMPTS_GUIDE.md - 提示词配置指南');
  console.log('  - docs/LLM_CONFIG_GUIDE.md - LLM 配置指南');
  console.log('  - docs/DOMESTIC_LLM_GUIDE.md - 国内服务商指南');
  console.log('  - docs/WORKFLOW_GUIDE.md - 工作流程详解');
  console.log('  - examples/ - 使用示例代码');

  console.log('\n\n🎉 总结');
  console.log('='.repeat(50));
  console.log('✓ 项目已完整配置');
  console.log('✓ 支持 11+ LLM 服务商');
  console.log('✓ 5 个预配置角色');
  console.log('✓ 灵活的多服务商切换');
  console.log('✓ 完整的提示词配置系统');
  console.log('✓ 工作流和任务调度');
  console.log('✓ 丰富的工具链');
  console.log('\nProject Agent 已准备就绪！🚀');
}

demo().catch(console.error);
