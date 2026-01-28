/**
 * AI Agent 交互式会话
 * 类似 Claude Code 的交互体验
 */

import readline from 'readline';
import { createIntelligentAgent } from './intelligent-agent.js';
import type { ProjectAgent } from '../core/project-agent.js';

/**
 * 交互式会话配置
 */
export interface AIAgentSessionConfig {
  showThoughts?: boolean;
  autoConfirmTools?: boolean;
  greeting?: string;
  prompt?: string;
}

/**
 * AI Agent 交互式会话
 */
export class AIAgentSession {
  private agent: ProjectAgent;
  private aiAgent: ReturnType<typeof createIntelligentAgent>;
  private rl: readline.Interface;
  private config: Required<AIAgentSessionConfig>;

  constructor(agent: ProjectAgent, config: AIAgentSessionConfig = {}) {
    this.agent = agent;
    this.config = {
      showThoughts: false,
      autoConfirmTools: true,
      greeting: '🤖 智能编程助手已就绪！',
      prompt: '👉 ',
      ...config,
    };

    this.aiAgent = createIntelligentAgent(agent, {
      showThoughts: this.config.showThoughts,
      autoConfirmTools: this.config.autoConfirmTools,
    });

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * 启动会话
   */
  async start(): Promise<void> {
    this.printGreeting();
    this.printHelp();

    // 主循环
    while (true) {
      const input = await this.question(this.config.prompt);

      if (!input || input.trim() === '') {
        continue;
      }

      // 检查特殊命令
      if (await this.handleCommand(input)) {
        continue;
      }

      // 处理普通消息
      try {
        console.log('\n⏳ 正在思考...\n');

        const response = await this.aiAgent.chat(input);

        console.log('\n🤖 回复:\n');
        console.log(response);
        console.log('');
      } catch (error) {
        console.error('\n❌ 错误:', error);
        console.log('');
      }
    }
  }

  /**
   * 处理特殊命令
   */
  private async handleCommand(input: string): Promise<boolean> {
    const command = input.trim().toLowerCase();

    // 退出
    if (command === '/exit' || command === '/quit' || command === '/bye') {
      const confirmed = await this.confirm('确定要退出吗？');
      if (confirmed) {
        console.log('\n👋 再见！\n');
        process.exit(0);
      }
      return true;
    }

    // 清除历史
    if (command === '/clear') {
      this.aiAgent.clearHistory();
      console.log('\n✅ 对话历史已清除\n');
      return true;
    }

    // 帮助
    if (command === '/help') {
      this.printHelp();
      return true;
    }

    // 分析项目
    if (command === '/analyze') {
      console.log('\n🔍 正在分析项目...\n');
      const response = await this.aiAgent.analyzeProject();
      console.log('\n' + response + '\n');
      return true;
    }

    // 切换思考模式
    if (command === '/verbose') {
      this.aiAgent.setConfig({ showThoughts: !this.config.showThoughts });
      this.config.showThoughts = !this.config.showThoughts;
      console.log(`\n${this.config.showThoughts ? '✅' : '❌'} 思考模式: ${this.config.showThoughts ? '开启' : '关闭'}\n`);
      return true;
    }

    // 显示历史
    if (command === '/history') {
      const history = this.aiAgent.getHistory();
      console.log('\n📜 对话历史:\n');
      history.forEach((msg, i) => {
        const icon = msg.role === 'user' ? '👤' : '🤖';
        console.log(`${icon} [${i + 1}] ${msg.content.substring(0, 100)}...`);
      });
      console.log(`\n总共 ${history.length} 条消息\n`);
      return true;
    }

    return false;
  }

  /**
   * 打印欢迎信息
   */
  private printGreeting(): void {
    console.log('\n' + '='.repeat(60));
    console.log(this.config.greeting);
    console.log('='.repeat(60) + '\n');
  }

  /**
   * 打印帮助
   */
  private printHelp(): void {
    console.log('💡 使用提示:\n');
    console.log('  • 直接输入你的问题或任务');
    console.log('  • 输入 /help 查看此帮助');
    console.log('  • 输入 /analyze 分析项目');
    console.log('  • 输入 /verbose 切换思考模式');
    console.log('  • 输入 /history 查看对话历史');
    console.log('  • 输入 /clear 清除历史');
    console.log('  • 输入 /exit 退出程序\n');
    console.log('📌 示例:\n');
    console.log('  "分析这个项目的结构"');
    console.log('  "读取 package.json 文件"');
    console.log('  "搜索包含 "login" 的文件"');
    console.log('  "帮我优化这段代码"');
    console.log('  "修复这个错误: ..."');
    console.log('');
  }

  /**
   * 提问
   */
  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  }

  /**
   * 确认
   */
  private confirm(prompt: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.rl.question(`${prompt} (y/N): `, (answer) => {
        resolve(/^y|yes|是|好的$/i.test(answer));
      });
    });
  }

  /**
   * 关闭
   */
  close(): void {
    this.rl.close();
  }
}

/**
 * 创建并启动 AI Agent 会话
 */
export async function startAIAgentSession(
  agent: ProjectAgent,
  config?: AIAgentSessionConfig
): Promise<void> {
  const session = new AIAgentSession(agent, config);

  try {
    await session.start();
  } finally {
    session.close();
  }
}
