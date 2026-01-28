import type { ProjectAgent } from '../core/project-agent.js';
import type { ToolResult } from '../types/index.js';
import { InteractiveCLI } from './interactive-cli.js';
import { createIntelligentAgent } from '../ai/index.js';
import { getLogger } from '../utils/logger.js';

/**
 * 自由输入处理器
 * 理解用户的自然语言输入并调用相应的功能
 * 类似 Claude Code，可以回答任何问题或执行任务
 */
export class FreeFormProcessor {
  private agent: ProjectAgent;
  private cli: InteractiveCLI;
  private aiAgent: ReturnType<typeof createIntelligentAgent>;

  constructor(agent: ProjectAgent, cli: InteractiveCLI) {
    this.agent = agent;
    this.cli = cli;
    // 创建智能 AI Agent，用于处理对话和任务
    this.aiAgent = createIntelligentAgent(agent, {
      showThoughts: false,
      autoConfirmTools: false, // 需要用户确认工具调用
      maxHistory: 50,
      maxToolIterations: 10,
      output: (text: string) => this.cli.appendRoleOutput('system', text),
    });
  }

  /**
   * 处理自由输入
   * 类似 Claude Code，可以回答任何问题或执行任务
   */
  async process(input: string): Promise<boolean> {
    // 去除首尾空格
    const trimmed = input.trim();

    // 空输入
    if (!trimmed) {
      return true;
    }

    // 检查是否是命令（以 / 开头）
    if (trimmed.startsWith('/')) {
      return await this.handleCommand(trimmed);
    }

    // 检查是否是退出
    if (/^(exit|quit|bye|再见|退出)$/i.test(trimmed)) {
      const confirmed = await this.cli.confirm('确定要退出吗？');
      if (confirmed) {
        this.cli.blank();
        this.cli.success('再见！');
        this.cli.blank();
        // 返回 false 表示不继续，应该退出
        return false;
      }
      // 用户取消退出，继续运行
      return true;
    }

    // 检查是否是帮助
    if (/^(help|\?|帮助)$/i.test(trimmed)) {
      this.showHelp();
      return true;
    }

    // 使用 AI Agent 处理输入（可以是问题、任务或任何内容）
    try {
      const logger = getLogger();
      logger.info('用户输入', { input: trimmed.substring(0, 100) }); // 只记录前100个字符
      
      // 调用 AI Agent 处理（内部会显示工具调用信息）
      const response = await this.aiAgent.chat(trimmed);

      logger.info('AI 响应', { responseLength: response?.length || 0 });

      // 显示 AI 的回复
      if (response && response.trim()) {
        await this.cli.streamRoleOutput('assistant', response + '\n');
      }

      return true;
    } catch (error) {
      const logger = getLogger();
      logger.error('处理用户输入失败', { error, input: trimmed.substring(0, 100) });
      
      // 友好的错误显示
      this.cli.blank();
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // 如果错误信息已经格式化过（包含 emoji 和换行），直接显示
      if (errorMessage.includes('❌') || errorMessage.includes('\n')) {
        this.cli.appendRoleOutput('system', errorMessage + '\n');
      } else {
        // 否则使用 CLI 工具格式化显示
        this.cli.error(`处理失败: ${errorMessage}`);
        this.cli.info('输入 "help" 查看帮助，或检查配置文件');
      }
      
      this.cli.blank();
      return true;
    }
  }

  /**
   * 处理命令
   */
  private async handleCommand(input: string): Promise<boolean> {
    const parts = input.slice(1).split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case 'mode':
      case 'm':
        return await this.cmdMode(args);

      case 'stats':
      case 's':
        this.cmdStats();
        return true;

      case 'clear':
      case 'cls':
        this.cli.clear();
        return true;

      case 'exit':
      case 'quit':
      case 'q': {
        const confirmed = await this.cli.confirm('确定要退出吗？');
        return !confirmed;
      }

      case 'help':
      case 'h':
      case '?':
        this.showHelp();
        return true;

      case 'feature':
      case 'f': {
        const title = args.join(' ') || '新功能';
        await this.executeFeature(title);
        return true;
      }

      case 'code':
      case 'dev': {
        const description = args.join(' ') || '代码任务';
        await this.executeCodeTask(description);
        return true;
      }

      case 'review': {
        const target = args.join(' ') || './src';
        await this.executeReview(target);
        return true;
      }

      case 'test': {
        const description = args.join(' ') || '编写测试';
        await this.executeTest(description);
        return true;
      }

      case 'doc': {
        const topic = args.join(' ') || '文档';
        await this.executeDoc(topic);
        return true;
      }

      default:
        this.cli.error(`未知命令: ${command}`);
        this.cli.info('输入 "help" 查看帮助，或直接描述你的任务');
        return true;
    }
  }

  /**
   * 切换模式命令
   */
  private async cmdMode(args: string[]): Promise<boolean> {
    if (args.length === 0) {
      this.cli.info('当前模式: 交互式（自由输入）');
      this.cli.info('使用 /mode [auto|interactive] 切换模式');
      return true;
    }

    const mode = args[0]?.toLowerCase();
    if (mode === 'auto' || mode === 'automatic' || mode === '自动') {
      this.cli.warn('切换到自动模式');
      this.cli.info('注意：自由输入仅在交互式模式下可用');
      return true;
    }

    if (mode === 'interactive' || mode === '交互') {
      this.cli.success('已切换到交互式模式（自由输入）');
      return true;
    }

    this.cli.error('无效的模式，请使用: auto 或 interactive');
    return true;
  }

  /**
   * 统计命令
   */
  private cmdStats(): void {
    this.cli.blank();
    this.cli.section('统计信息');

    const stats = this.agent.getStats();

    this.cli.log('\n任务统计:');
    this.cli.log(`  总计: ${stats.tasks.total}`);
    this.cli.log(`  已完成: ${stats.tasks.byStatus.completed}`);
    this.cli.log(`  失败: ${stats.tasks.byStatus.failed}`);
    this.cli.log(`  进行中: ${stats.tasks.byStatus['in-progress']}`);

    if (stats.tools) {
      this.cli.log('\n工具使用统计:');
      Object.entries(stats.tools)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 10)
        .forEach(([tool, count]) => {
          this.cli.log(`  ${tool}: ${count} 次`);
        });
    }
  }

  /**
   * 处理任务描述
   */
  private async handleTask(description: string): Promise<boolean> {
    this.cli.blank();
    this.cli.section('理解任务...');

    // 分析任务类型
    const taskType = this.analyzeTaskType(description);

    // 确认执行
    this.cli.blank();
    this.cli.log(`任务类型: ${taskType.label}`);
    this.cli.log(`任务描述: ${description}`);

    const confirmed = await this.cli.confirm('\n是否执行此任务？');
    if (!confirmed) {
      this.cli.info('任务已取消');
      return true;
    }

    // 执行任务
    try {
      await this.cli.withLoading(
        `正在${taskType.action}...`,
        () => taskType.executor(description)
      );

      this.cli.success('任务完成！');
    } catch (error) {
      this.cli.error(`任务失败: ${error}`);
    }

    return true;
  }

  /**
   * 分析任务类型
   */
  private analyzeTaskType(description: string): {
    label: string;
    action: string;
    executor: (desc: string) => Promise<any>;
  } {
    const lower = description.toLowerCase();

    // 功能开发
    if (
      /开发|实现|添加|新增|创建|功能|feature|develop|implement|add|create/i.test(
        lower
      )
    ) {
      return {
        label: '功能开发',
        action: '开发功能',
        executor: (desc) => this.executeFeature(desc),
      };
    }

    // 代码编写
    if (/写|写代码|代码|code|编程/i.test(lower)) {
      return {
        label: '代码开发',
        action: '编写代码',
        executor: (desc) => this.executeCodeTask(desc),
      };
    }

    // 代码审查
    if (
      /审查|review|检查|check|优化|optimize|重构|refactor/i.test(lower)
    ) {
      return {
        label: '代码审查',
        action: '审查代码',
        executor: (desc) => this.executeReview(desc),
      };
    }

    // 测试
    if (/测试|test|单元测试/i.test(lower)) {
      return {
        label: '编写测试',
        action: '编写测试',
        executor: (desc) => this.executeTest(desc),
      };
    }

    // 文档
    if (/文档|doc|文档说明|readme/i.test(lower)) {
      return {
        label: '编写文档',
        action: '编写文档',
        executor: (desc) => this.executeDoc(desc),
      };
    }

    // 需求分析
    if (/需求|分析|analyze|requirement/i.test(lower)) {
      return {
        label: '需求分析',
        action: '分析需求',
        executor: (desc) => this.executeAnalysis(desc),
      };
    }

    // 架构设计
    if (/架构|设计|design|architecture/i.test(lower)) {
      return {
        label: '架构设计',
        action: '设计架构',
        executor: (desc) => this.executeDesign(desc),
      };
    }

    // 默认：功能开发
    return {
      label: '功能开发',
      action: '开发功能',
      executor: (desc) => this.executeFeature(desc),
    };
  }

  /**
   * 执行功能开发
   */
  private async executeFeature(description: string): Promise<void> {
    const result = await this.agent.developFeature({
      title: this.extractTitle(description),
      description,
      requirements: this.extractRequirements(description),
    });

    if (!result.success) {
      throw new Error(result.error || '功能开发失败');
    }

    // 显示结果摘要
    if (result.data?.code) {
      this.cli.blank();
      this.cli.section('生成的代码');
      this.cli.code(result.data.code.substring(0, 500) + '...');
    }
  }

  /**
   * 执行代码任务
   */
  private async executeCodeTask(description: string): Promise<void> {
    const result = await this.agent.execute({
      type: 'development',
      title: this.extractTitle(description),
      description,
      assignedRole: 'developer',
    });

    if (!result.success) {
      throw new Error(result.error || '代码开发失败');
    }
  }

  /**
   * 执行代码审查
   */
  private async executeReview(target: string): Promise<void> {
    const result = await this.agent.execute({
      type: 'code-review',
      title: `代码审查: ${target}`,
      description: `审查 ${target} 的代码`,
      assignedRole: 'developer',
      input: { filePath: target },
    });

    if (!result.success) {
      throw new Error(result.error || '代码审查失败');
    }

    // 显示审查结果
    if (result.data?.report) {
      this.cli.blank();
      this.cli.section('审查结果');
      this.cli.log(result.data.report);
    }
  }

  /**
   * 执行测试
   */
  private async executeTest(description: string): Promise<void> {
    const result = await this.agent.execute({
      type: 'testing',
      title: `编写测试: ${description}`,
      description,
      assignedRole: 'tester',
    });

    if (!result.success) {
      throw new Error(result.error || '测试编写失败');
    }
  }

  /**
   * 执行文档
   */
  private async executeDoc(topic: string): Promise<void> {
    const result = await this.agent.execute({
      type: 'documentation',
      title: `文档: ${topic}`,
      description: `为 ${topic} 编写文档`,
      assignedRole: 'doc-writer',
      input: { topic },
    });

    if (!result.success) {
      throw new Error(result.error || '文档编写失败');
    }

    // 显示文档内容
    if (result.data?.content) {
      this.cli.blank();
      this.cli.section('生成的文档');
      this.cli.log(result.data.content);
    }
  }

  /**
   * 执行需求分析
   */
  private async executeAnalysis(description: string): Promise<void> {
    const result = await this.agent.execute({
      type: 'requirement-analysis',
      title: `需求分析: ${description}`,
      description,
      assignedRole: 'product-manager',
    });

    if (!result.success) {
      throw new Error(result.error || '需求分析失败');
    }

    // 显示分析结果
    if (result.data?.summary) {
      this.cli.blank();
      this.cli.section('需求分析结果');
      this.cli.log(result.data.summary);
    }
  }

  /**
   * 执行架构设计
   */
  private async executeDesign(description: string): Promise<void> {
    const result = await this.agent.execute({
      type: 'architecture-design',
      title: `架构设计: ${description}`,
      description,
      assignedRole: 'architect',
    });

    if (!result.success) {
      throw new Error(result.error || '架构设计失败');
    }

    // 显示设计结果
    if (result.data?.architecture) {
      this.cli.blank();
      this.cli.section('架构设计结果');
      this.cli.log(result.data.architecture);
    }
  }

  /**
   * 从描述中提取标题
   */
  private extractTitle(description: string): string {
    // 简单提取：取前20个字符
    return description.substring(0, Math.min(50, description.length));
  }

  /**
   * 从描述中提取需求
   */
  private extractRequirements(description: string): string[] {
    // 简单实现：将描述按句子分割
    return description
      .split(/[，。；,.;\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * 显示帮助
   */
  private showHelp(): void {
    this.cli.blank();
    this.cli.title('自由输入帮助', 2);

    this.cli.blank();
    this.cli.section('输入方式');
    this.cli.log('');
    this.cli.log('1. 直接描述你的任务，例如：');
    this.cli.list(
      [
        '开发一个用户登录功能',
        '编写数据验证模块',
        '审查 src/auth 目录的代码',
        '为用户管理模块编写测试',
        '更新 API 文档',
      ],
      true
    );

    this.cli.log('\n2. 使用命令（以 / 开头），例如：');
    this.cli.list(
      [
        '/feature 用户管理',
        '/code 实现分页功能',
        '/review ./src',
        '/test 用户登录',
        '/doc README',
        '/mode auto',
        '/stats',
        '/clear',
        '/exit',
      ],
      true
    );

    this.cli.log('\n3. 支持的任务类型：');
    this.cli.list(
      [
        '功能开发 - "开发/实现/添加..."',
        '代码编写 - "写代码/编程..."',
        '代码审查 - "审查/检查/优化..."',
        '编写测试 - "测试/单元测试..."',
        '编写文档 - "文档/README..."',
        '需求分析 - "需求/分析..."',
        '架构设计 - "架构/设计..."',
      ],
      true
    );

    this.cli.log('\n4. 退出：');
    this.cli.list(
      ['输入 "exit"、"quit" 或 "再见"'],
      true
    );
  }
}
