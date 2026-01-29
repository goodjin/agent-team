import prompts from 'prompts';
import * as clack from '@clack/prompts';
import boxen from 'boxen';
import ora, { type Ora } from 'ora';
import chalk from 'chalk';
import readline from 'readline';

/**
 * 增强的交互式CLI
 * 提供更好的用户体验和可视化
 */
export class EnhancedCLI {
  private rl: readline.Interface;
  private spinner: Ora | null = null;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * 显示欢迎信息
   */
  welcome(title: string, description?: string): void {
    const content = description 
      ? `${chalk.bold.cyan(title)}\n\n${description}`
      : chalk.bold.cyan(title);
    
    console.log(
      boxen(content, {
        padding: 1,
        borderColor: 'cyan',
        borderStyle: 'round',
        title: '🚀 Agent Team',
        titleAlignment: 'center',
      })
    );
  }

  /**
   * 显示标题
   */
  title(text: string, level = 1): void {
    const prefix = '═'.repeat(level * 10);
    console.log('\n' + chalk.bold.cyan(`${prefix} ${text} ${prefix}`));
  }

  /**
   * 显示章节
   */
  section(text: string): void {
    console.log('\n' + chalk.cyan(`### ${text}`));
  }

  /**
   * 显示成功信息
   */
  success(message: string): void {
    clack.log.success(message);
  }

  /**
   * 显示错误信息
   */
  error(message: string): void {
    clack.log.error(message);
  }

  /**
   * 显示警告信息
   */
  warn(message: string): void {
    clack.log.warn(message);
  }

  /**
   * 显示信息
   */
  info(message: string): void {
    clack.log.info(message);
  }

  /**
   * 显示普通日志
   */
  log(message: string): void {
    console.log(message);
  }

  /**
   * 显示代码块
   */
  code(code: string, language = ''): void {
    const lines = code.split('\n');
    const maxLength = Math.max(...lines.map(l => l.length));
    const border = '─'.repeat(maxLength + 2);

    console.log('');
    console.log(chalk.gray('┌' + border + '┐'));
    lines.forEach(line => {
      console.log(chalk.gray('│ ') + chalk.white(line.padEnd(maxLength)) + chalk.gray(' │'));
    });
    console.log(chalk.gray('└' + border + '┘'));
  }

  /**
   * 显示表格
   */
  table(data: Array<Record<string, any>>, columns?: string[]): void {
    if (data.length === 0) {
      this.info('暂无数据');
      return;
    }

    const allColumns = columns || Object.keys(data[0]);
    const rows = data.map(row => 
      allColumns.map(col => String(row[col] || ''))
    );

    // 计算每列的最大宽度
    const widths = allColumns.map((col, i) => {
      const headerWidth = col.length;
      const contentWidth = Math.max(...rows.map(row => row[i].length));
      return Math.max(headerWidth, contentWidth, 10);
    });

    // 打印表头
    const header = allColumns.map((col, i) => 
      chalk.bold.cyan(col.padEnd(widths[i]))
    ).join(' │ ');
    console.log('\n' + chalk.gray('┌') + '─'.repeat(header.length + 2) + chalk.gray('┐'));
    console.log(chalk.gray('│ ') + header + chalk.gray(' │'));
    console.log(chalk.gray('├') + '─'.repeat(header.length + 2) + chalk.gray('┤'));

    // 打印数据行
    rows.forEach(row => {
      const rowStr = row.map((cell, i) => 
        cell.padEnd(widths[i])
      ).join(' │ ');
      console.log(chalk.gray('│ ') + rowStr + chalk.gray(' │'));
    });

    console.log(chalk.gray('└') + '─'.repeat(header.length + 2) + chalk.gray('┘'));
  }

  /**
   * 询问用户（使用 prompts）
   */
  async question(message: string, options?: {
    initial?: string;
    validate?: (value: string) => boolean | string;
  }): Promise<string> {
    const { value } = await prompts({
      type: 'text',
      name: 'value',
      message: chalk.cyan(message),
      initial: options?.initial,
      validate: options?.validate,
    });

    return value || '';
  }

  /**
   * 询问用户确认
   */
  async confirm(message: string, defaultValue = false): Promise<boolean> {
    const { value } = await prompts({
      type: 'confirm',
      name: 'value',
      message: chalk.cyan(message),
      initial: defaultValue,
    });

    return value ?? defaultValue;
  }

  /**
   * 让用户选择选项（单选）
   */
  async select<T = string>(
    message: string,
    choices: Array<{ title: string; value: T; description?: string }>
  ): Promise<T> {
    const { value } = await prompts({
      type: 'select',
      name: 'value',
      message: chalk.cyan(message),
      choices: choices.map(choice => ({
        title: choice.title,
        value: choice.value,
        description: choice.description,
      })),
    });

    return value;
  }

  /**
   * 让用户选择多个选项（多选）
   */
  async multiselect<T = string>(
    message: string,
    choices: Array<{ title: string; value: T; description?: string }>
  ): Promise<T[]> {
    const { value } = await prompts({
      type: 'multiselect',
      name: 'value',
      message: chalk.cyan(message),
      choices: choices.map(choice => ({
        title: choice.title,
        value: choice.value,
        description: choice.description,
      })),
    });

    return value || [];
  }

  /**
   * 显示加载动画
   */
  async withLoading<T>(
    message: string,
    fn: () => Promise<T>
  ): Promise<T> {
    this.spinner = ora(message).start();
    
    try {
      const result = await fn();
      this.spinner.succeed(message);
      return result;
    } catch (error) {
      this.spinner.fail(`${message} - ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      this.spinner = null;
    }
  }

  /**
   * 显示进度条
   */
  showProgress(current: number, total: number, message: string): void {
    const percentage = Math.round((current / total) * 100);
    const barLength = 30;
    const filled = Math.round((barLength * current) / total);
    const empty = barLength - filled;

    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    const prefix = `\r[${bar}] ${percentage}%`;

    process.stdout.write(prefix + ` ${message}`);
    
    if (current === total) {
      process.stdout.write('\n');
    }
  }

  /**
   * 显示分隔线
   */
  separator(char = '─', length = 60): void {
    console.log(chalk.gray(char.repeat(length)));
  }

  /**
   * 显示空白行
   */
  blank(lines = 1): void {
    for (let i = 0; i < lines; i++) {
      console.log('');
    }
  }

  /**
   * 清屏
   */
  clear(): void {
    console.clear();
  }

  /**
   * 显示任务结果
   */
  showTaskResult(result: any, title?: string): void {
    if (title) {
      this.section(title);
    }

    if (result.success) {
      this.success('任务执行成功');

      if (result.metadata) {
        this.blank();
        this.log(chalk.bold('执行信息:'));
        Object.entries(result.metadata).forEach(([key, value]) => {
          const displayValue = typeof value === 'object'
            ? JSON.stringify(value, null, 2)
            : String(value);
          this.log(`  ${chalk.cyan(key)}: ${displayValue}`);
        });
      }

      if (result.data) {
        this.blank();
        this.log(chalk.bold('返回数据:'));
        this.log(
          typeof result.data === 'string'
            ? result.data
            : JSON.stringify(result.data, null, 2)
        );
      }

      if (result.content) {
        this.blank();
        this.log(chalk.bold('输出内容:'));
        this.log(result.content);
      }
    } else {
      this.error('任务执行失败');
      if (result.error) {
        this.blank();
        this.log(chalk.red(`错误信息: ${result.error}`));
      }
      if (result.metadata?.errorCode) {
        this.log(chalk.red(`错误代码: ${result.metadata.errorCode}`));
      }
    }
  }

  /**
   * 显示执行摘要
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
    const summaryData = [
      { key: '总任务数', value: summary.totalTasks },
      { key: '成功', value: chalk.green(String(summary.completedTasks)) },
      { key: '失败', value: chalk.red(String(summary.failedTasks)) },
      { key: '总耗时', value: `${(summary.totalDuration / 1000).toFixed(2)}s` },
    ];

    summaryData.forEach(({ key, value }) => {
      this.log(`${chalk.bold(key)}: ${value}`);
    });

    if (summary.roleStats && Object.keys(summary.roleStats).length > 0) {
      this.blank();
      this.log(chalk.bold('角色统计:'));
      Object.entries(summary.roleStats).forEach(([role, count]) => {
        this.log(`  ${chalk.cyan(role)}: ${count} 个任务`);
      });
    }
  }

  /**
   * 关闭 CLI
   */
  close(): void {
    if (this.spinner) {
      this.spinner.stop();
    }
    this.rl.close();
  }
}
