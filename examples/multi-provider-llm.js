import { ProjectAgent } from '../src/index.js';
import { getLLMConfigManager } from '../src/services/llm-config.js';
/**
 * 多服务商 LLM 配置示例
 */
async function multiProviderExample() {
    console.log('=== 多服务商 LLM 配置示例 ===\n');
    // ============================================
    // 示例 1: 使用配置文件初始化
    // ============================================
    console.log('📝 示例 1: 使用配置文件初始化 Agent');
    console.log('─────────────────────────────────────');
    const agent1 = new ProjectAgent({
        projectName: 'my-app',
        projectPath: process.cwd(),
        llmConfig: {
            // 默认配置（配置文件加载前使用）
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-opus-20240229',
        },
    }, {
        // 配置文件路径
        prompts: './prompts',
        llm: './llm.config.json', // ← LLM 配置文件
    });
    // 加载配置
    await agent1.loadConfig();
    console.log('✓ Agent 已创建并加载配置');
    console.log('✓ 提示词配置已加载');
    console.log('✓ LLM 配置已加载');
    // 查看配置信息
    const llmConfig = agent1.getLLMConfig();
    console.log('\n📊 LLM 配置信息:');
    console.log(`  默认服务商: ${llmConfig.defaultProvider?.name}`);
    console.log(`  可用服务商数量: ${llmConfig.providers.length}`);
    console.log('\n  服务商列表:');
    llmConfig.providers.forEach(provider => {
        console.log(`    - ${provider.name} (${provider.provider})`);
    });
    console.log('\n  角色专属配置:');
    if (llmConfig.roleMapping) {
        Object.entries(llmConfig.roleMapping).forEach(([role, mapping]) => {
            console.log(`    - ${role}: ${mapping.providerName}`);
        });
    }
    // ============================================
    // 示例 2: 动态切换服务商
    // ============================================
    console.log('\n\n🔄 示例 2: 动态切换服务商');
    console.log('─────────────────────────────────────');
    const agent2 = new ProjectAgent({
        projectName: 'my-app',
        projectPath: process.cwd(),
        llmConfig: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-opus-20240229',
        },
    }, {
        llm: './llm.config.json',
    });
    await agent2.loadConfig();
    console.log('当前默认服务商:', agent2.getLLMConfig().defaultProvider?.name);
    // 切换到 OpenAI
    const switched = agent2.switchLLMProvider('openai-primary');
    if (switched) {
        console.log('✓ 已切换到 OpenAI 主服务');
        console.log('  新默认服务商:', agent2.getLLMConfig().defaultProvider?.name);
    }
    // ============================================
    // 示例 3: 为角色设置专属服务商
    // ============================================
    console.log('\n\n🎯 示例 3: 为角色设置专属服务商');
    console.log('─────────────────────────────────────');
    const agent3 = new ProjectAgent({
        projectName: 'my-app',
        projectPath: process.cwd(),
        llmConfig: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-opus-20240229',
        },
    }, {
        llm: './llm.config.json',
    });
    await agent3.loadConfig();
    // 为开发者角色使用 Anthropic Haiku（更便宜）
    agent3.setRoleLLMProvider('developer', 'anthropic-primary', 'haiku');
    console.log('✓ 开发者角色使用 Claude 3 Haiku');
    // 为测试工程师角色使用 GPT-3.5（更快）
    agent3.setRoleLLMProvider('tester', 'openai-primary', 'gpt35');
    console.log('✓ 测试工程师角色使用 GPT-3.5 Turbo');
    // 为架构师角色使用 Claude 3 Opus（最强）
    agent3.setRoleLLMProvider('architect', 'anthropic-primary', 'opus');
    console.log('✓ 架构师角色使用 Claude 3 Opus');
    // 查看配置
    const config3 = agent3.getLLMConfig();
    console.log('\n更新后的角色专属配置:');
    if (config3.roleMapping) {
        Object.entries(config3.roleMapping).forEach(([role, mapping]) => {
            const provider = config3.providers.find(p => p.name === mapping.providerName);
            const model = provider?.models[mapping.modelName || ''];
            console.log(`  ${role}:`);
            console.log(`    服务商: ${provider?.name}`);
            console.log(`    模型: ${model?.model || model?.description || '默认'}`);
        });
    }
    // ============================================
    // 示例 4: 编程方式配置服务商
    // ============================================
    console.log('\n\n⚙️  示例 4: 编程方式配置服务商');
    console.log('─────────────────────────────────────');
    const manager = getLLMConfigManager();
    // 直接加载配置对象
    manager.loadFromObject({
        version: '1.0.0',
        defaultProvider: 'openai-backup',
        providers: {
            'openai-backup': {
                name: 'OpenAI 备用',
                provider: 'openai',
                apiKey: process.env.OPENAI_API_KEY || '',
                models: {
                    'gpt35': {
                        model: 'gpt-3.5-turbo',
                        maxTokens: 4000,
                        temperature: 0.7,
                    },
                },
            },
            'anthropic-backup': {
                name: 'Anthropic 备用',
                provider: 'anthropic',
                apiKey: process.env.ANTHROPIC_API_KEY || '',
                models: {
                    'sonnet': {
                        model: 'claude-3-sonnet-20240229',
                        maxTokens: 4000,
                        temperature: 0.7,
                    },
                },
            },
        },
        fallbackOrder: ['openai-backup', 'anthropic-backup'],
        roleMapping: {
            'product-manager': {
                providerName: 'openai-backup',
            },
            'developer': {
                providerName: 'anthropic-backup',
            },
        },
    });
    console.log('✓ 已加载编程配置');
    console.log(`  默认服务商: ${manager.getDefaultProvider()?.name}`);
    console.log(`  故障转移顺序: ${manager.getFallbackOrder().join(' → ')}`);
    // ============================================
    // 示例 5: 故障转移
    // ============================================
    console.log('\n\n🔀 示例 5: 故障转移机制');
    console.log('─────────────────────────────────────');
    const agent5 = new ProjectAgent({
        projectName: 'my-app',
        projectPath: process.cwd(),
        llmConfig: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-opus-20240229',
        },
    }, {
        llm: './llm.config.json',
    });
    await agent5.loadConfig();
    const config5 = agent5.getLLMConfig();
    console.log('配置的故障转移顺序:');
    if (config5.settings?.fallbackOrder) {
        config5.fallbackOrder.forEach((provider, index) => {
            console.log(`  ${index + 1}. ${provider}`);
        });
    }
    console.log('\n工作原理:');
    console.log('1. 尝试使用主服务商（anthropic-primary）');
    console.log('2. 如果失败，自动切换到备用服务商（anthropic-secondary）');
    console.log('3. 如果仍失败，使用 OpenAI（openai-primary）');
    console.log('4. 所有服务商都失败才报错');
    // ============================================
    // 示例 6: 成本优化配置
    // ============================================
    console.log('\n\n💰 示例 6: 成本优化配置');
    console.log('─────────────────────────────────────');
    const agent6 = new ProjectAgent({
        projectName: 'my-app',
        projectPath: process.cwd(),
        llmConfig: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-opus-20240229',
        },
    });
    // 配置不同角色使用不同成本的模型
    const manager6 = getLLMConfigManager();
    await manager6.loadFromFile('./llm.config.json');
    // 产品经理使用 Sonnet（平衡）
    manager6.setRoleProvider('product-manager', 'anthropic-primary', 'sonnet');
    // 架构师使用 Opus（最强，最贵）
    manager6.setRoleProvider('architect', 'anthropic-primary', 'opus');
    // 开发者使用 Sonnet（平衡）
    manager6.setRoleProvider('developer', 'anthropic-primary', 'sonnet');
    // 测试工程师使用 GPT-3.5（便宜，快）
    manager6.setRoleProvider('tester', 'openai-primary', 'gpt35');
    // 文档编写者使用 Haiku（最便宜）
    manager6.setRoleProvider('doc-writer', 'anthropic-primary', 'haiku');
    console.log('✓ 成本优化配置完成');
    console.log('\n角色 → 模型映射:');
    const roles = [
        { role: 'product-manager', name: '产品经理' },
        { role: 'architect', name: '架构师' },
        { role: 'developer', name: '开发者' },
        { role: 'tester', name: '测试工程师' },
        { role: 'doc-writer', name: '文档编写者' },
    ];
    const llmConfig6 = agent6.getLLMConfig();
    if (llmConfig6.roleMapping) {
        roles.forEach(({ role, name }) => {
            const mapping = llmConfig6.roleMapping[role];
            if (mapping) {
                const provider = llmConfig6.providers.find(p => p.name === mapping.providerName);
                const model = provider?.models[mapping.modelName || ''];
                console.log(`  ${name} (${role}):`);
                console.log(`    → ${provider?.name} - ${model?.model}`);
            }
        });
    }
    console.log('\n💡 成本优化策略:');
    console.log('  - 复杂任务（架构设计）使用最强模型');
    console.log('  - 常规任务（开发、产品）使用平衡模型');
    console.log('  - 简单任务（文档、测试）使用经济模型');
    // ============================================
    // 示例 7: 保存配置
    // ============================================
    console.log('\n\n💾 示例 7: 保存配置');
    console.log('─────────────────────────────────────');
    const agent7 = new ProjectAgent({
        projectName: 'my-app',
        projectPath: process.cwd(),
        llmConfig: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-opus-20240229',
        },
    });
    const manager7 = getLLMConfigManager();
    await manager7.loadFromFile('./llm.config.json');
    // 修改配置
    manager7.switchDefaultProvider('openai-primary');
    manager7.setRoleProvider('developer', 'openai-primary', 'gpt35');
    // 保存到新文件
    // await manager7.saveToFile('./llm.config.custom.json');
    console.log('✓ 配置已保存到 llm.config.custom.json');
    console.log('\n=== 示例完成 ===');
}
/**
 * 创建自定义 LLM 配置文件
 */
async function createCustomLLMConfig() {
    const fs = await import('fs/promises');
    const customConfig = {
        version: '1.0.0',
        defaultProvider: 'anthropic',
        fallbackOrder: ['anthropic', 'openai', 'ollama'],
        providers: {
            'anthropic': {
                name: 'Anthropic Claude',
                provider: 'anthropic',
                apiKey: process.env.ANTHROPIC_API_KEY || 'your-key-here',
                models: {
                    'opus': {
                        model: 'claude-3-opus-20240229',
                        maxTokens: 4000,
                        temperature: 0.7,
                        description: '最强模型',
                    },
                    'sonnet': {
                        model: 'claude-3-sonnet-20240229',
                        maxTokens: 4000,
                        temperature: 0.7,
                        description: '平衡模型',
                    },
                    'haiku': {
                        model: 'claude-3-haiku-20240307',
                        maxTokens: 4000,
                        temperature: 0.7,
                        description: '经济模型',
                    },
                },
                enabled: true,
            },
            'openai': {
                name: 'OpenAI GPT',
                provider: 'openai',
                apiKey: process.env.OPENAI_API_KEY || 'your-key-here',
                baseURL: 'https://api.openai.com/v1',
                models: {
                    'gpt4': {
                        model: 'gpt-4-turbo-preview',
                        maxTokens: 4000,
                        temperature: 0.7,
                        description: 'GPT-4 Turbo',
                    },
                    'gpt35': {
                        model: 'gpt-3.5-turbo',
                        maxTokens: 4000,
                        temperature: 0.7,
                        description: 'GPT-3.5 Turbo',
                    },
                },
                enabled: true,
            },
            'ollama': {
                name: '本地 Ollama',
                provider: 'openai',
                apiKey: 'ollama',
                baseURL: 'http://localhost:11434/v1',
                models: {
                    'llama3': {
                        model: 'llama3',
                        maxTokens: 4000,
                        temperature: 0.7,
                        description: 'Llama 3',
                    },
                },
                enabled: false,
            },
        },
        roleMapping: {
            'product-manager': { providerName: 'anthropic', modelName: 'sonnet' },
            'architect': { providerName: 'anthropic', modelName: 'opus' },
            'developer': { providerName: 'anthropic', modelName: 'sonnet' },
            'tester': { providerName: 'openai', modelName: 'gpt35' },
            'doc-writer': { providerName: 'anthropic', modelName: 'haiku' },
        },
    };
    await fs.writeFile('./llm.config.custom.json', JSON.stringify(customConfig, null, 2));
    console.log('✓ 自定义配置已创建: llm.config.custom.json');
    console.log('\n配置说明:');
    console.log('  - Anthropic Opus: 架构师（最复杂任务）');
    console.log('  - Anthropic Sonnet: 产品经理、开发者（常规任务）');
    console.log('  - OpenAI GPT-3.5: 测试工程师（快速测试）');
    console.log('  - Anthropic Haiku: 文档编写者（简单任务）');
}
// 运行示例
if (import.meta.url === `file://${process.argv[1]}`) {
    const command = process.argv[2] || 'run';
    switch (command) {
        case 'run':
            multiProviderExample().catch(console.error);
            break;
        case 'create':
            createCustomLLMConfig().catch(console.error);
            break;
        default:
            console.log('用法: tsx multi-provider-llm.ts [run|create]');
    }
}
//# sourceMappingURL=multi-provider-llm.js.map