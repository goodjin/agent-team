/**
 * 提示词配置文件使用示例
 *
 * 本示例展示如何配置和使用提示词文件：
 * 1. 使用单个配置文件
 * 2. 使用配置目录
 * 3. 使用多个配置路径
 * 4. 动态添加配置
 * 5. 使用不同上下文
 * 6. 使用任务模板
 * 7. 执行任务时使用自定义提示词
 *
 * 运行方式：npx tsx examples/with-prompts-config.ts [run|create]
 */
import { ProjectAgent } from '../src/index.js';
import { RoleFactory } from '../src/roles/index.js';
/**
 * ============================================================
 * 提示词配置基础
 * ============================================================
 *
 * 提示词配置文件用于定义角色的行为规范，包括：
 * - systemPrompt: 角色的系统提示词
 * - temperature: LLM 温度参数
 * - outputFormat: 输出格式要求
 *
 * 配置文件格式支持：
 * - JSON 文件（prompts.json）
 * - YAML 文件（prompts.yaml）
 * - 目录（包含多个配置文件）
 */
/**
 * ============================================================
 * 示例 1：使用单个配置文件
 * ============================================================
 *
 * 适合小型项目，将所有提示词配置放在一个文件中
 *
 * @returns ProjectAgent 实例
 */
async function exampleWithSingleConfig() {
    console.log('=== 示例 1: 单个配置文件 ===');
    // 创建 ProjectAgent，指定 LLM 配置文件和提示词配置文件
    const agent = new ProjectAgent({
        projectName: 'example-app',
        projectPath: process.cwd(),
        // 也可以直接传入 llmConfig
        llmConfig: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-opus-20240229',
        },
    }, {
        // 提示词配置路径 - 指向单个配置文件
        prompts: './prompts.json',
    });
    // 加载配置
    await agent.loadConfig();
    // 加载提示词配置
    await agent.loadPrompts();
    // 获取可用的角色列表
    const availableRoles = agent.getAvailableRoles();
    console.log('可用的角色:', availableRoles);
    // 使用后可清理
    await agent.shutdown();
    return agent;
}
/**
 * ============================================================
 * 示例 2：使用配置目录（推荐）
 * ============================================================
 *
 * 适合大型项目，将不同角色的配置放在不同文件中
 *
 * 目录结构示例：
 * prompts/
 *   ├── product-manager.json
 *   ├── architect.json
 *   ├── developer.json
 *   ├── tester.json
 *   └── doc-writer.json
 *
 * @returns ProjectAgent 实例
 */
async function exampleWithConfigDirectory() {
    console.log('\n=== 示例 2: 配置目录 ===');
    const agent = new ProjectAgent({
        projectName: 'example-app',
        projectPath: process.cwd(),
        llmConfig: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-opus-20240229',
        },
    }, {
        // 提示词配置路径 - 指向目录
        prompts: './prompts',
    });
    await agent.loadConfig();
    await agent.loadPrompts();
    console.log('提示词配置已从目录加载');
    console.log('可用的角色:', agent.getAvailableRoles());
    await agent.shutdown();
    return agent;
}
/**
 * ============================================================
 * 示例 3：使用多个配置路径
 * ============================================================
 *
 * 适合需要组合多个配置来源的场景：
 * - 项目默认配置
 * - 团队自定义配置
 * - 个人偏好配置
 *
 * @returns ProjectAgent 实例
 */
async function exampleWithMultiplePaths() {
    console.log('\n=== 示例 3: 多个配置路径 ===');
    const agent = new ProjectAgent({
        projectName: 'example-app',
        projectPath: process.cwd(),
        llmConfig: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-opus-20240229',
        },
    }, {
        // 多个配置路径，数组形式
        prompts: [
            './prompts', // 项目默认配置
            './custom-prompts', // 团队自定义配置
        ],
    });
    await agent.loadConfig();
    await agent.loadPrompts();
    console.log('提示词配置已从多个路径加载');
    await agent.shutdown();
    return agent;
}
/**
 * ============================================================
 * 示例 4：动态添加配置
 * ============================================================
 *
 * 适合运行时需要添加或修改配置的场景
 */
async function exampleWithDynamicConfig() {
    console.log('\n=== 示例 4: 动态添加配置 ===');
    const agent = new ProjectAgent({
        projectName: 'example-app',
        projectPath: process.cwd(),
        llmConfig: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-opus-20240229',
        },
    });
    await agent.loadConfig();
    // 动态设置提示词配置路径
    agent.setPromptConfigPath('./prompts');
    await agent.loadPrompts();
    console.log('提示词配置已动态设置并加载');
    await agent.shutdown();
}
/**
 * ============================================================
 * 示例 5：使用不同上下文
 * ============================================================
 *
 * 同一角色在不同业务场景下可能有不同的行为规范
 * 通过 context 参数区分不同场景
 *
 * 常见场景：
 * - B2B vs B2C 产品经理
 * - 前端 vs 后端开发者
 * - 单元测试 vs 集成测试
 */
async function exampleWithContexts() {
    console.log('\n=== 示例 5: 使用不同上下文 ===');
    const agent = new ProjectAgent({
        projectName: 'example-app',
        projectPath: process.cwd(),
        llmConfig: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-opus-20240229',
        },
    });
    await agent.loadConfig();
    await agent.loadPrompts();
    // 创建 B2B 场景的产品经理
    // 上下文会影响角色的系统提示词和行为
    const b2bPM = RoleFactory.createRole('product-manager', agent.llmService, 'b2b' // 业务场景上下文
    );
    console.log('已创建 B2B 产品经理角色');
    console.log('B2B 产品经理提示词:', b2bPM.definition.systemPrompt?.substring(0, 100) + '...');
    // 创建 B2C 场景的产品经理
    const b2cPM = RoleFactory.createRole('product-manager', agent.llmService, 'b2c' // 不同业务场景
    );
    console.log('已创建 B2C 产品经理角色');
    console.log('B2C 产品经理提示词:', b2cPM.definition.systemPrompt?.substring(0, 100) + '...');
    // B2B 和 B2C 产品经理的行为差异示例：
    // - B2B 更注重企业级功能、数据分析、API 设计
    // - B2C 更注重用户体验、界面交互、社交功能
    await agent.shutdown();
}
/**
 * ============================================================
 * 示例 6：使用任务模板
 * ============================================================
 *
 * 提示词模板使用占位符，可以在运行时动态填充
 *
 * 模板语法：
 * - {{title}} - 任务标题
 * - {{description}} - 任务描述
 * - {{requirements}} - 需求列表
 * - {{context}} - 上下文信息
 */
async function exampleWithTemplates() {
    console.log('\n=== 示例 6: 使用任务模板 ===');
    // 获取提示词加载器
    const { getPromptLoader } = await import('../src/prompts/index.js');
    const loader = getPromptLoader();
    // 从目录加载配置
    await loader.loadFromDirectory('./prompts');
    // 获取模板
    const template = loader.getTemplate('product-manager', 'analysis');
    if (template) {
        console.log('找到产品经理分析模板');
        console.log('原始模板:', template.content.substring(0, 100) + '...');
        // 渲染模板 - 替换占位符
        const rendered = loader.renderTemplate(template, {
            title: '用户登录功能',
            background: '实现基于 JWT 的用户认证系统',
            requirements: '- 支持邮箱密码登录\n- 记住登录状态\n- 支持登出',
        });
        console.log('\n渲染后的模板:');
        console.log(rendered);
    }
    else {
        console.log('未找到模板');
    }
}
/**
 * ============================================================
 * 示例 7：执行任务时使用自定义提示词
 * ============================================================
 *
 * 在执行任务时，可以指定：
 * - 使用的角色（assignedRole）
 * - 业务上下文（context）
 * - 自定义提示词
 */
async function exampleExecuteWithCustomPrompts() {
    console.log('\n=== 示例 7: 执行任务 ===');
    const agent = new ProjectAgent({
        projectName: 'example-app',
        projectPath: process.cwd(),
        llmConfig: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-opus-20240229',
        },
    });
    await agent.loadConfig();
    await agent.loadPrompts();
    // 执行需求分析任务
    const result = await agent.execute({
        type: 'requirement-analysis',
        title: '分析用户认证需求',
        description: '分析并整理用户认证功能的需求',
        assignedRole: 'product-manager',
        input: {
            requirements: [
                '支持邮箱密码注册',
                '支持邮箱密码登录',
                '登录后返回 JWT token',
                '支持 token 刷新',
            ],
            context: 'b2b', // 指定业务上下文
        },
    });
    if (result.success) {
        console.log('需求分析完成!');
        console.log('分析结果:', result.data);
    }
    else {
        console.error('执行失败:', result.error);
    }
    await agent.shutdown();
}
/**
 * 主函数：运行所有示例
 */
async function exampleWithPromptsConfig() {
    // 运行各个示例
    await exampleWithSingleConfig();
    await exampleWithConfigDirectory();
    await exampleWithMultiplePaths();
    await exampleWithDynamicConfig();
    await exampleWithContexts();
    await exampleWithTemplates();
    await exampleExecuteWithCustomPrompts();
}
/**
 * 创建自定义提示词配置文件
 *
 * 配置文件格式说明：
 * - version: 配置文件版本
 * - defaults: 默认参数
 * - roles: 角色配置
 */
async function createCustomPromptsConfig() {
    const fs = await import('fs/promises');
    // 自定义开发者角色配置
    const customConfig = {
        version: '1.0.0',
        // 默认参数，会被角色配置覆盖
        defaults: {
            language: 'zh-CN',
            temperature: 0.7,
        },
        // 角色配置
        roles: {
            'custom-developer': {
                // 系统提示词 - 定义角色行为
                systemPrompt: `你是一位专注于 TypeScript 和 Node.js 的全栈开发者。

## 技术栈
- **语言**: TypeScript, JavaScript
- **后端**: Node.js, Express, Fastify
- **前端**: React, Vue, Next.js
- **数据库**: PostgreSQL, MongoDB, Redis
- **工具**: Docker, Kubernetes, CI/CD

## 编码规范
1. 使用 TypeScript 严格模式
2. 遵循 Airbnb 风格指南
3. 所有函数必须有类型注解
4. 使用 ESLint 和 Prettier
5. 编写单元测试（Jest/Vitest）

## 代码质量
- 函数不超过 50 行
- 文件不超过 300 行
- 圈复杂度不超过 10
- 测试覆盖率不低于 80%

## 输出格式
\`\`\`typescript
// 完整的 TypeScript 代码
// 包含类型定义
// 包含错误处理
// 包含注释
\`\`\``,
                // 温度参数 - 控制随机性
                temperature: 0.3,
                // 输出格式要求
                outputFormat: '输出完整的 TypeScript 代码文件',
            },
        },
    };
    await fs.writeFile('./custom-prompts.json', JSON.stringify(customConfig, null, 2));
    console.log('自定义配置文件已创建: custom-prompts.json');
}
// ============================================================
// 运行示例
// ============================================================
//
// 命令行参数：
// - run: 运行示例（默认）
// - create: 创建自定义配置文件
if (import.meta.url === `file://${process.argv[1]}`) {
    const command = process.argv[2] || 'run';
    switch (command) {
        case 'run':
            exampleWithPromptsConfig().catch(console.error);
            break;
        case 'create':
            createCustomPromptsConfig().catch(console.error);
            break;
        default:
            console.log('用法: npx tsx examples/with-prompts-config.ts [run|create]');
    }
}
//# sourceMappingURL=with-prompts-config.js.map