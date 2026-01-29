import type { ProjectAgent } from '../core/project-agent.js';
import type { ToolResult } from '../types/index.js';
import { InteractiveCLI, ProgressDisplay } from './interactive-cli.js';
import { InteractiveExecutor } from './interactive-executor.js';
import { FreeFormProcessor } from './freeform-processor.js';
import { ProgressManager } from './progress.js';

/**
 * 执行模式
 */
export enum ExecutionMode {
  /// 自动执行模式
  AUTO = 'auto',
  /// 交互式模式
  INTERACTIVE = 'interactive',
}

/**
 * 混合模式配置
 */
export interface HybridModeOptions {
  /// 执行模式
  mode?: ExecutionMode;
  /// 显示进度
  showProgress?: boolean;
  /// 显示 LLM 思考过程
  showLLMThought?: boolean;
  /// 自动确认（跳过交互式确认）
  autoConfirm?: boolean;
  /// 彩色输出
  colorOutput?: boolean;
  /// 使用增强的UI（更好的格式化和可视化）
  useEnhancedUI?: boolean;
  /// 使用 Ink UI（基于 React 的现代化界面，类似 Claude Code）
  useInkUI?: boolean;
}

/**
 * 混合模式管理器
 * 支持自动执行和交互式执行两种模式
 */
export class HybridModeManager {
  private agent: ProjectAgent;
  private cli: InteractiveCLI;
  private executor: InteractiveExecutor;
  private progress: ProgressDisplay;
  private progressManager: ProgressManager;
  private freeform: FreeFormProcessor;
  private mode: ExecutionMode;
  private options: HybridModeOptions;

  constructor(agent: ProjectAgent, options: HybridModeOptions = {}) {
    this.agent = agent;
    this.options = {
      mode: ExecutionMode.INTERACTIVE, // 默认交互式
      showProgress: true,
      showLLMThought: false,
      autoConfirm: false,
      colorOutput: true,
      ...options,
    };

    this.mode = this.options.mode || ExecutionMode.INTERACTIVE;

    // 创建 CLI
    this.cli = new InteractiveCLI({
      showProgress: this.options.showProgress,
      showLLMThought: this.options.showLLMThought,
      colorOutput: this.options.colorOutput,
      useEnhancedUI: this.options.useEnhancedUI ?? false,
    });

    // 创建交互式执行器
    this.executor = new InteractiveExecutor(agent, this.cli);

    // 创建进度显示器
    this.progress = new ProgressDisplay(this.cli);

    // 创建进度管理器（用于自动模式）
    this.progressManager = new ProgressManager({
      type: 'processing',
      showPercentage: true,
    });

    // 创建自由输入处理器
    this.freeform = new FreeFormProcessor(agent, this.cli);

    // 绑定事件
    this.progress.bindTo(agent);
  }

  /**
   * 切换执行模式
   */
  setMode(mode: ExecutionMode): void {
    this.mode = mode;
    this.cli.info(`执行模式已切换为: ${mode === ExecutionMode.INTERACTIVE ? '交互式' : '自动'}`);
  }

  /**
   * 获取当前模式
   */
  getMode(): ExecutionMode {
    return this.mode;
  }

  /**
   * 开发功能
   */
  async developFeature(params?: {
    title?: string;
    description?: string;
    requirements?: string[];
    filePath?: string;
  }): Promise<ToolResult> {
    if (this.mode === ExecutionMode.INTERACTIVE) {
      return await this.executor.developFeature(params || {});
    } else {
      // 自动模式 - 使用进度显示
      this.cli.title('自动功能开发', 2);

      const defaultParams = {
        title: '示例功能',
        description: '这是一个示例功能',
        requirements: ['需求1', '需求2'],
      };

      const finalParams = {
        title: params?.title || defaultParams.title,
        description: params?.description || defaultParams.description,
        requirements: params?.requirements || defaultParams.requirements,
        filePath: params?.filePath,
      };

      // 显示任务信息
      this.cli.blank();
      this.cli.log(`功能标题: ${finalParams.title}`);
      this.cli.log(`功能描述: ${finalParams.description}`);
      this.cli.log(`需求数量: ${finalParams.requirements.length}`);

      // 使用进度管理器显示进度
      this.progressManager.start(`正在开发功能: ${finalParams.title}`, 4);

      try {
        const result = await this.agent.developFeature(finalParams);

        // 更新进度
        this.progressManager.update(4, '开发完成');

        return result;
      } catch (error) {
        this.progressManager.fail(String(error));
        throw error;
      }
    }
  }

  /**
   * 执行单个任务
   */
  async executeTask(params: {
    type: string;
    title: string;
    description?: string;
    assignedRole: string;
    input?: any;
  }): Promise<ToolResult> {
    if (this.mode === ExecutionMode.INTERACTIVE && !this.options.autoConfirm) {
      this.cli.section(`执行任务: ${params.title}`);

      const confirmed = await this.cli.confirm('是否执行此任务？', true);
      if (!confirmed) {
        return { success: false, error: '用户取消操作' };
      }

      return await this.cli.withLoading(
        '执行任务中...',
        () =>
          this.agent.execute({
            type: params.type as any,
            title: params.title,
            description: params.description || '',
            assignedRole: params.assignedRole as any,
            input: params.input,
          })
      );
    } else {
      // 自动模式 - 使用进度显示
      this.cli.section(`执行任务: ${params.title}`);
      this.cli.log(`类型: ${params.type}`);
      this.cli.log(`角色: ${params.assignedRole}`);

      this.progressManager.start(`正在执行: ${params.title}`, 3);

      try {
        const result = await this.agent.execute({
          type: params.type as any,
          title: params.title,
          description: params.description || '',
          assignedRole: params.assignedRole as any,
          input: params.input,
        });

        this.progressManager.update(3, '执行完成');
        return result;
      } catch (error) {
        this.progressManager.fail(String(error));
        throw error;
      }
    }
  }

  /**
   * 执行工作流
   */
  async executeWorkflow(workflowId: string): Promise<ToolResult[]> {
    if (this.mode === ExecutionMode.INTERACTIVE && !this.options.autoConfirm) {
      this.cli.section(`执行工作流: ${workflowId}`);

      const confirmed = await this.cli.confirm('是否执行此工作流？', true);
      if (!confirmed) {
        return [];
      }

      return await this.cli.withLoading(
        '执行工作流中...',
        () => this.agent.executeWorkflow(workflowId)
      );
    } else {
      // 自动模式 - 使用进度显示
      this.cli.section(`执行工作流: ${workflowId}`);

      this.progressManager.start(`正在执行工作流: ${workflowId}`, 2);

      try {
        const results = await this.agent.executeWorkflow(workflowId);
        this.progressManager.update(2, '执行完成');
        return results;
      } catch (error) {
        this.progressManager.fail(String(error));
        throw error;
      }
    }
  }

  /**
   * 使用工具
   */
  async useTool(toolName: string, params: any): Promise<ToolResult> {
    if (this.mode === ExecutionMode.INTERACTIVE && !this.options.autoConfirm) {
      this.cli.section(`使用工具: ${toolName}`);

      const confirmed = await this.cli.confirm('是否使用此工具？', true);
      if (!confirmed) {
        return { success: false, error: '用户取消操作' };
      }

      return await this.cli.withLoading(
        '使用工具中...',
        () => this.agent.useTool(toolName, params)
      );
    } else {
      return await this.agent.useTool(toolName, params);
    }
  }

  /**
   * 启动交互式会话（支持自由输入）
   */
  async startInteractiveSession(): Promise<void> {
    // 如果启用了 Ink UI，使用 Ink 界面
    if (this.options.useInkUI) {
      const { startInkChatUI } = await import('./ink-chat-ui.js');
      startInkChatUI({
        agent: this.agent,
        onExit: () => {
          this.cli.close();
        },
      });
      return;
    }

    // 使用传统的 CLI 界面
    this.cli.enableChatUI({ inputPrompt: 'You: ' });
    this.cli.appendRoleOutput('system', 'Project Agent - AI Assistant\n');
    this.cli.appendRoleOutput('system', 'Type anything to ask or execute tasks.\n');
    this.cli.appendRoleOutput('system', 'Commands: /help, /mode, /stats, /clear, exit\n\n');

    while (true) {
      const input = await this.cli.question('You: ');
      this.cli.appendRoleOutput('user', input + '\n');

      try {
        const shouldContinue = await this.freeform.process(input);
        if (!shouldContinue) {
          // 退出循环
          break;
        }
      } catch (error) {
        this.cli.blank();
        this.cli.error(`❌ 执行出错: ${error}`);
        this.cli.info('💡 输入 "help" 查看可用命令');
        this.cli.blank();
      }
    }
    
    // 确保 readline 接口正确关闭
    this.cli.close();
  }

  /**
   * 处理命令
   */
  private async handleCommand(command: string): Promise<boolean> {
    switch (command) {
      case 'feature':
      case 'f': {
        await this.developFeature({});
        break;
      }

      case 'task':
      case 't': {
        const type = await this.cli.question('任务类型: ');
        const title = await this.cli.question('任务标题: ');
        const role = await this.cli.question('分配角色 (product-manager/architect/developer/tester/doc-writer): ');

        await this.executeTask({
          type,
          title,
          assignedRole: role,
        });
        break;
      }

      case 'workflow':
      case 'w': {
        const workflowId = await this.cli.question('工作流 ID: ');
        await this.executeWorkflow(workflowId);
        break;
      }

      case 'tool': {
        const toolName = await this.cli.question('工具名称: ');
        const paramsStr = await this.cli.question('工具参数 (JSON): ');
        const params = JSON.parse(paramsStr || '{}');

        await this.useTool(toolName, params);
        break;
      }

      case 'mode':
      case 'm': {
        const modeIndex = await this.cli.choose('选择执行模式', ['交互式模式', '自动模式']);
        this.setMode(
          modeIndex === 0 ? ExecutionMode.INTERACTIVE : ExecutionMode.AUTO
        );
        break;
      }

      case 'stats':
      case 's': {
        this.displayStats();
        break;
      }

      case 'help':
      case 'h': {
        this.displayHelp();
        break;
      }

      case 'exit':
      case 'quit':
      case 'q': {
        const confirmed = await this.cli.confirm('确定要退出吗？');
        if (confirmed) {
          this.cli.success('再见！');
          return false;
        }
        break;
      }

      default: {
        this.cli.error(`未知命令: ${command}`);
        this.cli.info('输入 "help" 查看可用命令');
        break;
      }
    }

    return true;
  }

  /**
   * 显示统计信息
   */
  private displayStats(): void {
    this.cli.blank();
    this.cli.section('统计信息');

    const stats = this.agent.getStats();

    this.cli.log('\n任务统计:');
    this.cli.log(`  总计: ${stats.tasks.total}`);
    this.cli.log(`  已完成: ${stats.tasks.byStatus.completed}`);
    this.cli.log(`  失败: ${stats.tasks.byStatus.failed}`);
    this.cli.log(`  进行中: ${stats.tasks.byStatus['in-progress']}`);
    this.cli.log(`  执行中: ${stats.tasks.executing}`);

    if (stats.tools) {
      this.cli.log('\n工具统计:');
      Object.entries(stats.tools).forEach(([tool, count]) => {
        this.cli.log(`  ${tool}: ${count} 次`);
      });
    }

    this.cli.log(`\n当前模式: ${this.mode === ExecutionMode.INTERACTIVE ? '交互式' : '自动'}`);
  }

  /**
   * 显示帮助
   */
  private displayHelp(): void {
    this.cli.blank();
    this.cli.section('帮助');

    this.cli.log('\n命令:');
    this.cli.list(
      [
        'feature, f - 开发新功能（交互式）',
        'task, t - 执行单个任务',
        'workflow, w - 执行工作流',
        'tool - 使用工具',
        'mode, m - 切换执行模式',
        'stats, s - 查看统计信息',
        'help, h - 显示此帮助',
        'exit, quit, q - 退出程序',
      ],
      true
    );

    this.cli.log('\n执行模式:');
    this.cli.list(
      [
        '交互式模式 - 每步都需要确认，可以查看详细结果',
        '自动模式 - 自动执行所有步骤，无需确认',
      ],
      true
    );

    this.cli.log('\n角色:');
    this.cli.list(
      [
        'product-manager - 产品经理（需求分析）',
        'architect - 架构师（架构设计）',
        'developer - 开发者（代码开发）',
        'tester - 测试工程师（测试）',
        'doc-writer - 文档编写者（文档）',
      ],
      true
    );
  }

  /**
   * 关闭管理器
   */
  async shutdown(): Promise<void> {
    this.cli.close();
    await this.agent.shutdown();
  }
}

/**
 * 创建混合模式管理器
 */
export function createHybridModeManager(
  agent: ProjectAgent,
  options?: HybridModeOptions
): HybridModeManager {
  return new HybridModeManager(agent, options);
}
