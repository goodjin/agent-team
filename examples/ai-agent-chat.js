/**
 * AI Agent 聊天示例
 * 类似 Claude Code 的真正 AI Agent
 */
import { ProjectAgent, startAIAgentSession } from '../src/index.js';
import { config } from 'dotenv';
// 加载环境变量
config();
async function main() {
    console.log('\n🚀 启动 AI Agent...\n');
    // 创建 Project Agent
    const agent = new ProjectAgent({
        projectName: 'ai-agent-demo',
        projectPath: process.cwd(),
    }, {
        llm: './llm.config.json',
    });
    // 加载配置
    await agent.loadConfig();
    console.log('✅ 配置加载成功\n');
    // 启动 AI Agent 会话
    await startAIAgentSession(agent, {
        showThoughts: true, // 显示思考过程
        autoConfirmTools: true, // 自动执行工具
        greeting: '🤖 智能编程助手已就绪！\n   我可以帮你分析代码、修复错误、生成代码、优化项目等。',
        prompt: '👉 ',
    });
}
// 处理退出
process.on('SIGINT', () => {
    console.log('\n\n👋 再见！\n');
    process.exit(0);
});
// 运行
main().catch((error) => {
    console.error('启动失败:', error);
    process.exit(1);
});
//# sourceMappingURL=ai-agent-chat.js.map