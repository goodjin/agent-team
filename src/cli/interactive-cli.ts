import readline from 'readline';
import type { AgentEvent, AgentEventData } from '../types/index.js';
import { ChatUI, type ChatUIOptions } from './chat-ui.js';
import { EnhancedChatUI, type EnhancedChatUIOptions } from './enhanced-chat-ui.js';

/**
 * 交互模式配置
 */
export interface InteractiveOptions {
  showProgress?: boolean;
  showLLMThought?: boolean;
  autoConfirm?: boolean;
  colorOutput?: boolean;
  useEnhancedUI?: boolean; // 是否使用增强的UI
}

/**
 * 进度信息
 */
export interface ProgressInfo {
  current: number;
  total: number;
  message: string;
  percentage: number;
}

/**
 * 交互式 CLI 类
 * 提供用户交互和实时进度显示
 */
export class InteractiveCLI {
  private rl: readline.Interface;
  public options: InteractiveOptions; // 改为 public，让 ProgressDisplay 可以访问
  private currentProgress: ProgressInfo | null = null;
  private eventHandlers: Map<string, (data: AgentEventData) => void> = new Map();
  private chatUI: ChatUI | null = null;
  private enhancedChatUI: EnhancedChatUI | null = null;

  constructor(options: InteractiveOptions = {}) {
    this.options = {
      showProgress: true,
      showLLMThought: false,
      autoConfirm: false,
      colorOutput: true,
      useEnhancedUI: false,
      ...options,
    };

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * 询问用户
   */
  async question(prompt: string): Promise<string> {
    if (this.enhancedChatUI && this.enhancedChatUI.isActive()) {
      const answer = await this.enhancedChatUI.readLine(prompt);
      return answer.trim();
    }
    
    if (this.chatUI && this.chatUI.isActive()) {
      const answer = await this.chatUI.readLine(prompt);
      return answer.trim();
    }

    return new Promise((resolve) => {
      this.rl.question(this.color(prompt, 'cyan'), (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * 询问用户确认
   */
  async confirm(prompt: string, defaultValue = false): Promise<boolean> {
    const defaultText = defaultValue ? 'Y/n' : 'y/N';
    const answer = await this.question(`${prompt} (${defaultText}): `);

    if (answer === '') {
      return defaultValue;
    }

    return /^y|yes|是|好的|确定$/i.test(answer);
  }

  /**
   * 让用户选择选项
   */
  async choose(prompt: string, options: string[]): Promise<number> {
    this.log('\n' + this.color('请选择:', 'yellow'));
    options.forEach((option, index) => {
      this.log(`  ${index + 1}. ${option}`);
    });

    while (true) {
      const answer = await this.question(`\n${prompt} (1-${options.length}): `);
      const index = parseInt(answer) - 1;

      if (index >= 0 && index < options.length) {
        return index;
      }

      this.error('无效的选择，请重新输入');
    }
  }

  /**
   * 让用户选择多个选项
   */
  async chooseMultiple(prompt: string, options: string[]): Promise<number[]> {
    this.log('\n' + this.color('请选择（可多选）:', 'yellow'));
    options.forEach((option, index) => {
      this.log(`  [${index + 1}] ${option}`);
    });

    while (true) {
      const answer = await this.question(`\n${prompt} (输入序号，用逗号分隔): `);
      const indices = answer
        .split(',')
        .map(s => parseInt(s.trim()) - 1)
        .filter(i => i >= 0 && i < options.length);

      if (indices.length > 0) {
        return [...new Set(indices)]; // 去重
      }

      this.error('无效的选择，请重新输入');
    }
  }

  /**
   * 显示标题
   */
  title(text: string, level = 1): void {
    const prefix = '═'.repeat(level * 10);
    this.log('\n' + this.color(`${prefix} ${text} ${prefix}`, 'bold'));
  }

  /**
   * 显示章节
   */
  section(text: string): void {
    this.log('\n' + this.color(`\n### ${text}`, 'cyan'));
  }

  /**
   * 显示普通日志
   */
  log(message: string): void {
    if (this.enhancedChatUI && this.enhancedChatUI.isActive()) {
      this.enhancedChatUI.appendSystem(message + '\n');
      return;
    }
    
    if (this.chatUI && this.chatUI.isActive()) {
      this.chatUI.appendSystem(message + '\n');
      return;
    }
    console.log(message);
  }

  /**
   * 显示成功信息
   */
  success(message: string): void {
    if (this.enhancedChatUI && this.enhancedChatUI.isActive()) {
      this.enhancedChatUI.appendSystem(`✓ ${message}\n`);
      return;
    }
    
    if (this.chatUI && this.chatUI.isActive()) {
      this.chatUI.appendSystem(`✓ ${message}\n`);
      return;
    }
    console.log(this.color(`✓ ${message}`, 'green'));
  }

  /**
   * 显示错误信息
   */
  error(message: string): void {
    if (this.enhancedChatUI && this.enhancedChatUI.isActive()) {
      this.enhancedChatUI.appendSystem(`✗ ${message}\n`);
      return;
    }
    
    if (this.chatUI && this.chatUI.isActive()) {
      this.chatUI.appendSystem(`✗ ${message}\n`);
      return;
    }
    console.error(this.color(`✗ ${message}`, 'red'));
  }

  /**
   * 显示警告信息
   */
  warn(message: string): void {
    if (this.enhancedChatUI && this.enhancedChatUI.isActive()) {
      this.enhancedChatUI.appendSystem(`! ${message}\n`);
      return;
    }
    
    if (this.chatUI && this.chatUI.isActive()) {
      this.chatUI.appendSystem(`! ${message}\n`);
      return;
    }
    console.warn(this.color(`⚠ ${message}`, 'yellow'));
  }

  /**
   * 显示信息
   */
  info(message: string): void {
    if (this.enhancedChatUI && this.enhancedChatUI.isActive()) {
      this.enhancedChatUI.appendSystem(`i ${message}\n`);
      return;
    }
    
    if (this.chatUI && this.chatUI.isActive()) {
      this.chatUI.appendSystem(`i ${message}\n`);
      return;
    }
    console.info(this.color(`ℹ ${message}`, 'blue'));
  }

  /**
   * 显示代码片段
   */
  code(code: string, language = ''): void {
    const lines = code.split('\n');
    const maxLength = Math.max(...lines.map(l => l.length));

    this.log('');
    this.log(this.color('┌' + '─'.repeat(maxLength + 2) + '┐', 'gray'));
    lines.forEach(line => {
      this.log(this.color('│ ' + line.padEnd(maxLength) + ' │', 'gray'));
    });
    this.log(this.color('└' + '─'.repeat(maxLength + 2) + '┘', 'gray'));
  }

  /**
   * 显示列表
   */
  list(items: string[], numbered = false): void {
    items.forEach((item, index) => {
      const prefix = numbered ? `${index + 1}.` : '•';
      this.log(`  ${prefix} ${item}`);
    });
  }

  /**
   * 显示进度条
   */
  showProgress(current: number, total: number, message: string): void {
    if (!this.options.showProgress) return;
    if (this.enhancedChatUI && this.enhancedChatUI.isActive()) {
      const percentage = Math.round((current / total) * 100);
      this.enhancedChatUI.appendSystem(`[progress ${percentage}%] ${message}\n`);
      return;
    }
    
    if (this.chatUI && this.chatUI.isActive()) {
      const percentage = Math.round((current / total) * 100);
      this.chatUI.appendSystem(`[progress ${percentage}%] ${message}\n`);
      return;
    }

    const percentage = Math.round((current / total) * 100);
    const barLength = 40;
    const filled = Math.round((barLength * current) / total);
    const empty = barLength - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const prefix = `\r[${bar}] ${percentage}%`;

    // 清除当前行并显示进度
    process.stdout.write(prefix + ` ${message}`);

    this.currentProgress = { current, total, message, percentage };

    // 完成时换行
    if (current === total) {
      process.stdout.write('\n');
    }
  }

  /**
   * 更新进度消息
   */
  updateProgress(message: string): void {
    if (this.currentProgress) {
      this.showProgress(
        this.currentProgress.current,
        this.currentProgress.total,
        message
      );
    }
  }

  /**
   * 完成进度
   */
  completeProgress(): void {
    if (this.currentProgress) {
      this.showProgress(
        this.currentProgress.total,
        this.currentProgress.total,
        this.currentProgress.message
      );
      this.currentProgress = null;
    }
  }

  /**
   * 显示加载动画
   */
  async withLoading<T>(
    message: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    let loading = true;

    const interval = setInterval(() => {
      if (loading) {
        process.stdout.write(`\r${frames[i % frames.length]} ${message}`);
        i++;
      }
    }, 80);

    try {
      const result = await fn();
      loading = false;
      clearInterval(interval);
      process.stdout.write(`\r${this.color('✓', 'green')} ${message}\n`);
      return result;
    } catch (error) {
      loading = false;
      clearInterval(interval);
      process.stdout.write(`\r${this.color('✗', 'red')} ${message}\n`);
      throw error;
    }
  }

  /**
   * 显示分隔线
   */
  separator(char = '─', length = 60): void {
    this.log(char.repeat(length));
  }

  /**
   * 显示空白行
   */
  blank(lines = 1): void {
    for (let i = 0; i < lines; i++) {
      this.log('');
    }
  }

  /**
   * 清屏
   */
  clear(): void {
    if (this.enhancedChatUI && this.enhancedChatUI.isActive()) {
      this.enhancedChatUI.clearOutput();
      return;
    }
    
    if (this.chatUI && this.chatUI.isActive()) {
      this.chatUI.clearOutput();
      return;
    }
    console.clear();
  }

  /**
   * 颜色化文本
   */
  private color(text: string, color: string): string {
    if (this.chatUI && this.chatUI.isActive()) {
      return text;
    }
    if (!this.options.colorOutput || !process.stdout.isTTY) {
      return text;
    }

    const colors: Record<string, string> = {
      black: '\x1b[30m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',
      gray: '\x1b[90m',
      bold: '\x1b[1m',
      reset: '\x1b[0m',
    };

    const reset = colors.reset;
    const code = colors[color] || '';

    return `${code}${text}${reset}`;
  }

  /**
   * 关闭 CLI
   */
  close(): void {
    if (this.enhancedChatUI) {
      this.enhancedChatUI.close();
      this.enhancedChatUI = null;
    }
    
    if (this.chatUI) {
      this.chatUI.close();
      this.chatUI = null;
    }
    this.rl.close();
  }

  enableChatUI(options: ChatUIOptions = {}): void {
    if (!process.stdout.isTTY || !process.stdin.isTTY) {
      return;
    }
    
    if (this.options.useEnhancedUI) {
      this.enhancedChatUI = new EnhancedChatUI({
        inputPrompt: options.inputPrompt,
        maxOutputLines: options.maxOutputLines,
        showTimestamps: true,
        colorizeRoles: true,
      });
      this.enhancedChatUI.start();
    } else {
      this.chatUI = new ChatUI(options);
      this.chatUI.start();
    }
  }

  appendRoleOutput(role: string, message: string): void {
    if (this.enhancedChatUI && this.enhancedChatUI.isActive()) {
      this.enhancedChatUI.appendRole(role, message);
      return;
    }
    
    if (this.chatUI && this.chatUI.isActive()) {
      this.chatUI.appendRole(role, message);
      return;
    }
    console.log(`[${role}] ${message}`);
  }

  async streamRoleOutput(role: string, message: string): Promise<void> {
    if (this.enhancedChatUI && this.enhancedChatUI.isActive()) {
      await this.enhancedChatUI.streamRole(role, message);
      return;
    }
    
    if (this.chatUI && this.chatUI.isActive()) {
      await this.chatUI.streamRole(role, message);
      return;
    }
    console.log(`[${role}] ${message}`);
  }

  /**
   * 展示任务结果
   */
  showTaskResult(result: any, title?: string): void {
    if (title) {
      this.section(title);
    }

    if (result.success) {
      this.success('任务执行成功');

      if (result.metadata) {
        this.blank();
        this.log('执行信息:');
        Object.entries(result.metadata).forEach(([key, value]) => {
          const displayValue = typeof value === 'object'
            ? JSON.stringify(value, null, 2)
            : String(value);
          this.log(`  ${key}: ${displayValue}`);
        });
      }

      if (result.data) {
        this.blank();
        this.log('返回数据:');
        this.log(
          typeof result.data === 'string'
            ? result.data
            : JSON.stringify(result.data, null, 2)
        );
      }

      if (result.content) {
        this.blank();
        this.log('输出内容:');
        this.log(result.content);
      }
    } else {
      this.error('任务执行失败');
      if (result.error) {
        this.blank();
        this.log(`错误信息: ${result.error}`);
      }
      if (result.metadata?.errorCode) {
        this.log(`错误代码: ${result.metadata.errorCode}`);
      }
    }
  }

  /**
   * 展示执行摘要
   */
  showExecutionSummary(summary: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    totalDuration: number;
    roleStats?: Record<string, number>;
  }): void {
    this.title('执行摘要');

    this.blank();
    this.log(`总任务数: ${summary.totalTasks}`);
    this.log(`成功: ${this.color(String(summary.completedTasks), 'green')}`);
    this.log(`失败: ${this.color(String(summary.failedTasks), 'red')}`);
    this.log(`总耗时: ${(summary.totalDuration / 1000).toFixed(2)}s`);

    if (summary.roleStats && Object.keys(summary.roleStats).length > 0) {
      this.blank();
      this.log('角色统计:');
      Object.entries(summary.roleStats).forEach(([role, count]) => {
        this.log(`  ${role}: ${count} 个任务`);
      });
    }
  }

  /**
   * 展示工作流结果
   */
  showWorkflowResult(workflowName: string, results: any[]): void {
    this.title(`工作流完成: ${workflowName}`);
    this.blank();

    let completed = 0;
    let failed = 0;

    results.forEach((result, index) => {
      const status = result.success
        ? this.color('✓', 'green')
        : this.color('✗', 'red');

      if (result.success) {
        completed++;
      } else {
        failed++;
      }

      this.log(`${status} 步骤 ${index + 1}`);
      if (result.error) {
        this.log(`  错误: ${result.error}`);
      }
    });

    this.blank();
    this.log(`完成: ${this.color(String(completed), 'green')}`);
    this.log(`失败: ${this.color(String(failed), 'red')}`);
  }

  /**
   * 展示文件变更
   */
  showFileChanges(files: Array<{
    path: string;
    action: 'create' | 'update' | 'delete';
  }>): void {
    if (files.length === 0) {
      return;
    }

    this.section('文件变更');

    files.forEach(file => {
      const actionIcon = file.action === 'create'
        ? this.color('+', 'green')
        : file.action === 'delete'
          ? this.color('-', 'red')
          : this.color('~', 'yellow');
      this.log(`${actionIcon} ${file.path}`);
    });
  }

  /**
   * 展示问题列表
   */
  showIssues(issues: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    location?: string;
  }>): void {
    if (issues.length === 0) {
      return;
    }

    this.section('发现的问题');

    issues.forEach(issue => {
      const icon = issue.severity === 'error'
        ? this.color('✗', 'red')
        : issue.severity === 'warning'
          ? this.color('⚠', 'yellow')
          : this.color('ℹ', 'blue');
      this.log(`${icon} ${issue.message}`);
      if (issue.location) {
        this.log(`  位置: ${issue.location}`);
      }
    });
  }
}

/**
 * 事件驱动的进度显示
 */
export class ProgressDisplay {
  private cli: InteractiveCLI;
  private stepProgress: Map<string, { current: number; total: number }> = new Map();

  constructor(cli: InteractiveCLI) {
    this.cli = cli;
  }

  /**
   * 处理任务开始事件
   */
  onTaskStarted(data: AgentEventData): void {
    const task = data.data.task;
    const role = task.assignedRole || 'assistant';
    this.cli.appendRoleOutput(role, `开始任务: ${task.title}\n`);
    this.cli.appendRoleOutput(role, `类型: ${task.type}\n`);
    if (task.description) {
      this.cli.appendRoleOutput(role, `描述: ${task.description}\n`);
    }

    this.stepProgress.set(task.id, { current: 0, total: 1 });
  }

  /**
   * 处理任务完成事件
   */
  onTaskCompleted(data: AgentEventData): void {
    const task = data.data.task;
    const result = task.result;
    const role = task.assignedRole || 'assistant';
    this.cli.appendRoleOutput(role, `任务完成: ${task.title}\n`);
    if (result?.summary) {
      this.cli.appendRoleOutput(role, `摘要: ${result.summary}\n`);
    }
    if (result?.code) {
      this.cli.appendRoleOutput(role, `代码:\n${result.code}\n`);
    }

    this.stepProgress.delete(task.id);
  }

  /**
   * 处理任务失败事件
   */
  onTaskFailed(data: AgentEventData): void {
    const task = data.data.task;
    const error = task.result?.error;
    const role = task.assignedRole || 'assistant';
    this.cli.appendRoleOutput(role, `任务失败: ${task.title}\n`);
    if (error) {
      this.cli.appendRoleOutput(role, `错误: ${error}\n`);
    }

    this.stepProgress.delete(task.id);
  }

  /**
   * 处理步骤开始事件
   */
  onStepStarted(data: AgentEventData): void {
    const step = data.data.step;
    this.cli.log(`\n${this.cli['color']('▶', 'cyan')} ${step.title}`);
  }

  /**
   * 处理步骤完成事件
   */
  onStepCompleted(data: AgentEventData): void {
    const step = data.data.step;
    this.cli.log(`${this.cli['color']('✓', 'green')} ${step.title}`);
  }

  /**
   * 处理 LLM 调用事件
   */
  onLLMCall(data: AgentEventData): void {
    if (!this.cli.options.showLLMThought) return;

    const call = data.data.llmCall;
    this.cli.log(`\n${this.cli['color']('🤖 LLM 思考中...', 'magenta')}`);
    this.cli.info(`服务商: ${call.provider}`);
    this.cli.info(`模型: ${call.model}`);
  }

  /**
   * 处理工具调用事件
   */
  onToolCall(data: AgentEventData): void {
    const tool = data.data.toolCall;
    this.cli.log(`\n${this.cli['color']('🔧', 'yellow')} 调用工具: ${tool.name}`);
  }

  /**
   * 处理工作流开始事件
   */
  onWorkflowStarted(data: AgentEventData): void {
    const workflow = data.data.workflow;
    this.cli.title(`工作流: ${workflow.name}`);
    this.cli.log(`步骤数: ${workflow.steps.length}`);
  }

  /**
   * 处理工作流完成事件
   */
  onWorkflowCompleted(data: AgentEventData): void {
    const workflow = data.data.workflow;
    const results = data.data.results;

    this.cli.blank();
    this.cli.title('工作流完成');
    this.cli.blank();

    results.forEach((result: any, index: number) => {
      const status = result.success
        ? this.cli['color']('✓', 'green')
        : this.cli['color']('✗', 'red');
      this.cli.log(
        `${status} ${index + 1}. ${workflow.steps[index]?.title || 'Unknown'}`
      );
    });
  }

  /**
   * 绑定到 ProjectAgent 事件
   */
  bindTo(agent: any): void {
    agent.on('task:started', (data: AgentEventData) => this.onTaskStarted(data));
    agent.on('task:completed', (data: AgentEventData) => this.onTaskCompleted(data));
    agent.on('task:failed', (data: AgentEventData) => this.onTaskFailed(data));
    agent.on('step:started', (data: AgentEventData) => this.onStepStarted(data));
    agent.on('step:completed', (data: AgentEventData) => this.onStepCompleted(data));
    agent.on('llm:call', (data: AgentEventData) => this.onLLMCall(data));
    agent.on('tool:call', (data: AgentEventData) => this.onToolCall(data));
    agent.on('workflow:started', (data: AgentEventData) => this.onWorkflowStarted(data));
    agent.on('workflow:completed', (data: AgentEventData) => this.onWorkflowCompleted(data));
  }
}
