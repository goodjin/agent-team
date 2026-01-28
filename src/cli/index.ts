/**
 * CLI 命令行界面
 */

import readline from 'readline';
import type { AgentConfigFile } from '../config/types.js';
import { loadConfig } from '../config/config-loader.js';
import { getRoleManager } from '../roles/index.js';
import { loadPrompts } from '../prompts/index.js';
import { loadRules } from '../rules/index.js';

// 导出 CLI 相关类
export { InteractiveCLI, ProgressDisplay } from './interactive-cli.js';
export { InteractiveExecutor } from './interactive-executor.js';
export { HybridModeManager, createHybridModeManager, ExecutionMode } from './hybrid-mode.js';
export type { HybridModeOptions } from './hybrid-mode.js';
export { FreeFormProcessor } from './freeform-processor.js';

/**
 * CLI 配置
 */
export interface CLIConfig {
  showProgress: boolean;
  colorOutput: boolean;
  autoConfirm: boolean;
}

/**
 * CLI 工具函数
 */
export class CLIUtils {
  /**
   * 打印带颜色的消息
   */
  static print(message: string, color: 'green' | 'yellow' | 'red' | 'blue' | 'cyan' = 'blue'): void {
    const colors: { [key: string]: string } = {
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      red: '\x1b[31m',
      blue: '\x1b[34m',
      cyan: '\x1b[36m',
      reset: '\x1b[0m',
    };

    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  /**
   * 打印成功消息
   */
  static success(message: string): void {
    this.print(`✓ ${message}`, 'green');
  }

  /**
   * 打印警告消息
   */
  static warning(message: string): void {
    this.print(`⚠ ${message}`, 'yellow');
  }

  /**
   * 打印错误消息
   */
  static error(message: string): void {
    this.print(`✗ ${message}`, 'red');
  }

  /**
   * 打印信息消息
   */
  static info(message: string): void {
    this.print(`ℹ ${message}`, 'cyan');
  }

  /**
   * 打印标题
   */
  static title(message: string): void {
    console.log('\n' + '='.repeat(60));
    console.log(message);
    console.log('='.repeat(60) + '\n');
  }

  /**
   * 打印分隔线
   */
  static separator(): void {
    console.log('-'.repeat(60));
  }

  /**
   * 打印空行
   */
  static blank(): void {
    console.log('');
  }

  /**
   * 询问用户
   */
  static async question(prompt: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  /**
   * 确认操作
   */
  static async confirm(prompt: string, defaultValue = false): Promise<boolean> {
    const defaultText = defaultValue ? 'Y/n' : 'y/N';
    const answer = await this.question(`${prompt} (${defaultText}): `);

    if (answer === '') {
      return defaultValue;
    }

    return /^y|yes|是|好/i.test(answer);
  }

  /**
   * 选择选项
   */
  static async choose<T>(
    prompt: string,
    options: { id: T; label: string }[]
  ): Promise<T> {
    console.log(`\n${prompt}`);
    options.forEach((option, index) => {
      console.log(`  ${index + 1}. ${option.label}`);
    });

    while (true) {
      const answer = await this.question(`请选择 (1-${options.length}): `);
      const index = parseInt(answer) - 1;

      if (index >= 0 && index < options.length) {
        return options[index].id;
      }

      this.error('无效的选择，请重新输入');
    }
  }

  /**
   * 表格输出
   */
  static table(rows: string[][], headers?: string[]): void {
    if (headers) {
      const headerLine = headers.map((h) => h.padEnd(20)).join(' | ');
      console.log(headerLine);
      console.log('-'.repeat(headerLine.length));
    }

    for (const row of rows) {
      const line = row.map((cell) => String(cell).padEnd(20)).join(' | ');
      console.log(line);
    }
  }

  /**
   * 进度条
   */
  static progress(current: number, total: number, message = ''): void {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round(percentage / 5);
    const empty = 20 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    process.stdout.write(`[${bar}] ${percentage}% ${message}`);
  }

  /**
   * 加载动画
   */
  static async loading(
    message: string,
    task: () => Promise<any>
  ): Promise<any> {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧'];
    let frame = 0;

    const interval = setInterval(() => {
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      process.stdout.write(`${frames[frame]} ${message}`);
      frame = (frame + 1) % frames.length;
    }, 100);

    try {
      const result = await task();
      clearInterval(interval);
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      this.success(message + ' 完成');
      return result;
    } catch (error) {
      clearInterval(interval);
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      throw error;
    }
  }
}

/**
 * 显示配置信息
 */
export async function showConfig(): Promise<void> {
  CLIUtils.title('Project Agent 配置');

  try {
    const { config } = await loadConfig();

    // LLM 配置
    CLIUtils.info('大模型配置:');
    CLIUtils.blank();
    console.log(`  默认提供商: ${config.llm.defaultProvider}`);
    console.log(`  已配置提供商: ${Object.keys(config.llm.providers).length}`);

    const enabledProviders = Object.entries(config.llm.providers)
      .filter(([, p]: [string, any]) => (p as any).enabled)
      .map(([name]) => name);
    console.log(`  已启用: ${enabledProviders.join(', ') || '无'}`);
    CLIUtils.blank();

    // 角色配置
    const roleManager = getRoleManager();
    const roles = roleManager.getAllRoles();
    CLIUtils.info(`角色配置 (${roles.length} 个):`);
    CLIUtils.blank();
    for (const role of roles.slice(0, 5)) {
      const status = role.properties?.canDelete === false ? '内置' : '自定义';
      console.log(`  - ${role.name} (${status})`);
    }
    if (roles.length > 5) {
      console.log(`  ... 还有 ${roles.length - 5} 个角色`);
    }
    CLIUtils.blank();

    // 规则配置
    const { rules } = await loadRules({ enabledOnly: true });
    CLIUtils.info(`已启用规则: ${rules.size} 个`);
    CLIUtils.blank();

    // 项目配置
    CLIUtils.info('项目配置:');
    console.log(`  名称: ${config.project.name}`);
    console.log(`  路径: ${config.project.path}`);
    CLIUtils.blank();

  } catch (error) {
    CLIUtils.warning('无法加载配置，将使用默认配置');
  }
}

/**
 * 显示帮助信息
 */
export function showHelp(): void {
  console.log(`
Project Agent CLI 命令

用法:
  npx project-agent <命令> [选项]

命令:
  init              初始化配置
  config            配置管理
  role              角色管理
  prompt            提示词管理
  rule              规则管理
  chat              启动话
  help              显示帮助

示例:
  npx project-agent init           # 初始化配置 AI 对
  npx project-agent role list      # 查看所有角色
  npx project-agent config show    # 显示当前配置
  npx project-agent chat          # 启动对话

详细文档请访问: https://github.com/project-agent/docs
`);
}

/**
 * 显示版本信息
 */
export function showVersion(): void {
  const packageJson = JSON.parse(
    require('fs').readFileSync('./package.json', 'utf-8')
  );
  console.log(`Project Agent v${packageJson.version}`);
}
