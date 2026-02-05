import { EventEmitter } from 'eventemitter3';
import chalk from 'chalk';

/**
 * 快捷键配置
 */
export interface ShortcutConfig {
  key: string;
  description: string;
  category: 'navigation' | 'control' | 'system' | 'view';
  handler: () => void;
  enabled?: boolean;
}

/**
 * 快捷键管理器
 */
export class ShortcutManager extends EventEmitter {
  private shortcuts: Map<string, ShortcutConfig> = new Map();
  private enabled = true;
  private commandMode = false;
  private commandBuffer = '';

  constructor() {
    super();
    this.registerDefaultShortcuts();
  }

  /**
   * 注册快捷键
   */
  registerShortcut(config: ShortcutConfig): void {
    this.shortcuts.set(config.key.toLowerCase(), {
      enabled: true,
      ...config
    });
  }

  /**
   * 取消注册快捷键
   */
  unregisterShortcut(key: string): void {
    this.shortcuts.delete(key.toLowerCase());
  }

  /**
   * 启用/禁用快捷键
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 处理键盘输入
   */
  handleKeypress(str: string, key: any): void {
    if (!this.enabled) return;

    // 处理特殊组合键
    if (this.handleSpecialKeys(str, key)) {
      return;
    }

    // 处理命令模式
    if (this.commandMode) {
      this.handleCommandMode(str, key);
      return;
    }

    // 处理普通快捷键
    const shortcutKey = this.getShortcutKey(str, key);
    const shortcut = this.shortcuts.get(shortcutKey);
    
    if (shortcut && shortcut.enabled) {
      this.executeShortcut(shortcut);
    } else {
      // 未知快捷键
      this.emit('unknownShortcut', shortcutKey);
    }
  }

  /**
   * 获取所有快捷键
   */
  getAllShortcuts(): ShortcutConfig[] {
    return Array.from(this.shortcuts.values())
      .sort((a, b) => a.category.localeCompare(b.category) || a.key.localeCompare(b.key));
  }

  /**
   * 按分类获取快捷键
   */
  getShortcutsByCategory(category: string): ShortcutConfig[] {
    return Array.from(this.shortcuts.values())
      .filter(s => s.category === category && s.enabled)
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  /**
   * 显示帮助信息
   */
  showHelp(): string {
    const categories = {
      navigation: '导航',
      control: '控制',
      system: '系统',
      view: '视图'
    };

    const help: string[] = [
      chalk.cyan.bold('快捷键帮助'),
      chalk.gray('═'.repeat(50)),
      ''
    ];

    Object.entries(categories).forEach(([category, name]) => {
      const shortcuts = this.getShortcutsByCategory(category);
      if (shortcuts.length === 0) return;

      help.push(chalk.yellow.bold(`${name}:`));
      shortcuts.forEach(shortcut => {
        const key = chalk.cyan(shortcut.key.padEnd(12));
        const desc = chalk.white(shortcut.description);
        help.push(`  ${key} ${desc}`);
      });
      help.push('');
    });

    help.push(
      chalk.gray('═'.repeat(50)),
      chalk.gray('按 ? 或 h 显示此帮助'),
      chalk.gray('按 : 进入命令模式'),
      chalk.gray('按 Ctrl+C 退出')
    );

    return help.join('\n');
  }

  /**
   * 执行快捷键
   */
  private executeShortcut(shortcut: ShortcutConfig): void {
    try {
      shortcut.handler();
      this.emit('shortcutExecuted', shortcut);
    } catch (error) {
      this.emit('shortcutError', shortcut, error);
    }
  }

  /**
   * 处理特殊组合键
   */
  private handleSpecialKeys(str: string, key: any): boolean {
    // Ctrl+C
    if (key && key.ctrl && key.name === 'c') {
      this.emit('exit');
      return true;
    }

    // 帮助键
    if (str === '?' || str === 'h') {
      this.emit('showHelp');
      return true;
    }

    // 命令模式
    if (str === ':') {
      this.enterCommandMode();
      return true;
    }

    // ESC退出命令模式
    if (key && key.name === 'escape') {
      this.exitCommandMode();
      return true;
    }

    return false;
  }

  /**
   * 处理命令模式
   */
  private handleCommandMode(str: string, key: any): void {
    if (key && key.name === 'return') {
      this.executeCommand(this.commandBuffer.trim());
      this.exitCommandMode();
      return;
    }

    if (key && key.name === 'backspace') {
      this.commandBuffer = this.commandBuffer.slice(0, -1);
      this.emit('commandBufferUpdated', this.commandBuffer);
      return;
    }

    if (str && str.length === 1) {
      this.commandBuffer += str;
      this.emit('commandBufferUpdated', this.commandBuffer);
    }
  }

  /**
   * 进入命令模式
   */
  private enterCommandMode(): void {
    this.commandMode = true;
    this.commandBuffer = '';
    this.emit('commandModeEntered');
  }

  /**
   * 退出命令模式
   */
  private exitCommandMode(): void {
    this.commandMode = false;
    this.commandBuffer = '';
    this.emit('commandModeExited');
  }

  /**
   * 执行命令
   */
  private executeCommand(command: string): void {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'quit':
      case 'q':
        this.emit('exit');
        break;
      
      case 'help':
        this.emit('showHelp');
        break;
      
      case 'clear':
        this.emit('clear');
        break;
      
      case 'status':
        this.emit('showStatus');
        break;
      
      case 'theme':
        if (args.length > 0) {
          this.emit('changeTheme', args[0]);
        }
        break;
      
      case 'mode':
        if (args.length > 0) {
          this.emit('changeMode', args[0]);
        }
        break;
      
      case 'export':
        this.emit('exportData', args[0]);
        break;
      
      case 'import':
        this.emit('importData', args[0]);
        break;
      
      default:
        this.emit('unknownCommand', command);
    }
  }

  /**
   * 获取快捷键键值
   */
  private getShortcutKey(str: string, key: any): string {
    if (key && key.name) {
      // 特殊键名
      return key.name;
    }
    
    // 普通字符
    return str.toLowerCase();
  }

  /**
   * 注册默认快捷键
   */
  private registerDefaultShortcuts(): void {
    // 导航快捷键
    this.registerShortcut({
      key: '1',
      description: '切换到智能体面板',
      category: 'navigation',
      handler: () => this.emit('switchPanel', 'agents')
    });

    this.registerShortcut({
      key: '2',
      description: '切换到任务面板',
      category: 'navigation',
      handler: () => this.emit('switchPanel', 'tasks')
    });

    this.registerShortcut({
      key: '3',
      description: '切换到日志面板',
      category: 'navigation',
      handler: () => this.emit('switchPanel', 'logs')
    });

    this.registerShortcut({
      key: '4',
      description: '切换到认知面板',
      category: 'navigation',
      handler: () => this.emit('switchPanel', 'cognitive')
    });

    this.registerShortcut({
      key: 'tab',
      description: '循环切换面板',
      category: 'navigation',
      handler: () => this.emit('cyclePanel')
    });

    // 导航键
    this.registerShortcut({
      key: 'up',
      description: '向上选择',
      category: 'navigation',
      handler: () => this.emit('navigateUp')
    });

    this.registerShortcut({
      key: 'down',
      description: '向下选择',
      category: 'navigation',
      handler: () => this.emit('navigateDown')
    });

    this.registerShortcut({
      key: 'left',
      description: '向左选择/返回',
      category: 'navigation',
      handler: () => this.emit('navigateLeft')
    });

    this.registerShortcut({
      key: 'right',
      description: '向右选择/确认',
      category: 'navigation',
      handler: () => this.emit('navigateRight')
    });

    this.registerShortcut({
      key: 'pageup',
      description: '向上翻页',
      category: 'navigation',
      handler: () => this.emit('pageUp')
    });

    this.registerShortcut({
      key: 'pagedown',
      description: '向下翻页',
      category: 'navigation',
      handler: () => this.emit('pageDown')
    });

    this.registerShortcut({
      key: 'home',
      description: '跳转到开头',
      category: 'navigation',
      handler: () => this.emit('jumpToStart')
    });

    this.registerShortcut({
      key: 'end',
      description: '跳转到结尾',
      category: 'navigation',
      handler: () => this.emit('jumpToEnd')
    });

    // 控制快捷键
    this.registerShortcut({
      key: 'p',
      description: '暂停选中项',
      category: 'control',
      handler: () => this.emit('pauseSelected')
    });

    this.registerShortcut({
      key: 'r',
      description: '恢复选中项',
      category: 'control',
      handler: () => this.emit('resumeSelected')
    });

    this.registerShortcut({
      key: 's',
      description: '停止选中项',
      category: 'control',
      handler: () => this.emit('stopSelected')
    });

    this.registerShortcut({
      key: 'd',
      description: '删除选中项',
      category: 'control',
      handler: () => this.emit('deleteSelected')
    });

    this.registerShortcut({
      key: 'space',
      description: '切换开始/暂停',
      category: 'control',
      handler: () => this.emit('togglePlayPause')
    });

    this.registerShortcut({
      key: 'enter',
      description: '确认/执行',
      category: 'control',
      handler: () => this.emit('executeSelected')
    });

    // 视图快捷键
    this.registerShortcut({
      key: 'c',
      description: '清除日志',
      category: 'view',
      handler: () => this.emit('clearLogs')
    });

    this.registerShortcut({
      key: 'f',
      description: '切换全屏',
      category: 'view',
      handler: () => this.emit('toggleFullscreen')
    });

    this.registerShortcut({
      key: 't',
      description: '切换主题',
      category: 'view',
      handler: () => this.emit('cycleTheme')
    });

    this.registerShortcut({
      key: 'm',
      description: '切换模式',
      category: 'view',
      handler: () => this.emit('cycleMode')
    });

    this.registerShortcut({
      key: 'a',
      description: '切换自动刷新',
      category: 'view',
      handler: () => this.emit('toggleAutoRefresh')
    });

    // 系统快捷键
    this.registerShortcut({
      key: 'ctrl+r',
      description: '刷新界面',
      category: 'system',
      handler: () => this.emit('refresh')
    });

    this.registerShortcut({
      key: 'ctrl+l',
      description: '清屏',
      category: 'system',
      handler: () => this.emit('clearScreen')
    });

    this.registerShortcut({
      key: 'ctrl+s',
      description: '保存状态',
      category: 'system',
      handler: () => this.emit('saveState')
    });

    this.registerShortcut({
      key: 'ctrl+q',
      description: '快速退出',
      category: 'system',
      handler: () => this.emit('quickExit')
    });

    // 数字快捷键（快速跳转）
    for (let i = 0; i <= 9; i++) {
      this.registerShortcut({
        key: i.toString(),
        description: `快速跳转到第${i}项`,
        category: 'navigation',
        handler: () => this.emit('quickJump', i)
      });
    }
  }
}

/**
 * 宏录制器
 */
export class MacroRecorder extends EventEmitter {
  private isRecording = false;
  private isPlaying = false;
  private currentMacro: string[] = [];
  private macros: Map<string, string[]> = new Map();

  /**
   * 开始录制宏
   */
  startRecording(name?: string): void {
    if (this.isRecording) return;
    
    this.isRecording = true;
    this.currentMacro = [];
    this.emit('recordingStarted', name);
  }

  /**
   * 停止录制宏
   */
  stopRecording(): string[] {
    if (!this.isRecording) return [];
    
    this.isRecording = false;
    const macro = [...this.currentMacro];
    this.currentMacro = [];
    this.emit('recordingStopped', macro);
    
    return macro;
  }

  /**
   * 保存宏
   */
  saveMacro(name: string, macro?: string[]): void {
    const macroToSave = macro || this.currentMacro;
    if (macroToSave.length === 0) return;
    
    this.macros.set(name, [...macroToSave]);
    this.emit('macroSaved', name, macroToSave);
  }

  /**
   * 加载宏
   */
  loadMacro(name: string): string[] {
    return this.macros.get(name) || [];
  }

  /**
   * 播放宏
   */
  async playMacro(name: string, delay: number = 100): Promise<void> {
    const macro = this.macros.get(name);
    if (!macro || macro.length === 0) return;
    
    this.isPlaying = true;
    this.emit('playbackStarted', name);
    
    for (const action of macro) {
      if (!this.isPlaying) break;
      
      this.emit('macroAction', action);
      await this.sleep(delay);
    }
    
    this.isPlaying = false;
    this.emit('playbackStopped', name);
  }

  /**
   * 停止播放宏
   */
  stopPlayback(): void {
    this.isPlaying = false;
    this.emit('playbackStopped');
  }

  /**
   * 记录动作
   */
  recordAction(action: string): void {
    if (!this.isRecording) return;
    
    this.currentMacro.push(action);
    this.emit('actionRecorded', action);
  }

  /**
   * 获取所有宏
   */
  getAllMacros(): string[] {
    return Array.from(this.macros.keys());
  }

  /**
   * 删除宏
   */
  deleteMacro(name: string): boolean {
    return this.macros.delete(name);
  }

  /**
   * 导出宏
   */
  exportMacros(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    this.macros.forEach((macro, name) => {
      result[name] = macro;
    });
    return result;
  }

  /**
   * 导入宏
   */
  importMacros(macros: Record<string, string[]>): void {
    Object.entries(macros).forEach(([name, actions]) => {
      this.macros.set(name, actions);
    });
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 快捷键提示器
 */
export class ShortcutHint extends EventEmitter {
  private hints: Map<string, string> = new Map();
  private enabled = true;
  private timeout?: NodeJS.Timeout;

  /**
   * 显示提示
   */
  showHint(key: string, description: string, duration: number = 3000): void {
    if (!this.enabled) return;
    
    const hint = `${chalk.cyan(key)}: ${chalk.white(description)}`;
    this.hints.set(key, hint);
    
    this.emit('hintShown', key, description);
    
    // 自动隐藏
    if (duration > 0) {
      if (this.timeout) {
        clearTimeout(this.timeout);
      }
      
      this.timeout = setTimeout(() => {
        this.hideHint(key);
      }, duration);
    }
  }

  /**
   * 隐藏提示
   */
  hideHint(key: string): void {
    this.hints.delete(key);
    this.emit('hintHidden', key);
  }

  /**
   * 清除所有提示
   */
  clearHints(): void {
    this.hints.clear();
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.emit('hintsCleared');
  }

  /**
   * 启用/禁用提示
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearHints();
    }
  }

  /**
   * 获取当前提示
   */
  getCurrentHints(): string[] {
    return Array.from(this.hints.values());
  }

  /**
   * 显示上下文相关提示
   */
  showContextualHints(context: string): void {
    const contextualHints: Record<string, Record<string, string>> = {
      'agents': {
        'p': '暂停智能体',
        'r': '恢复智能体',
        's': '停止智能体',
        'd': '删除智能体'
      },
      'tasks': {
        'p': '暂停任务',
        'r': '恢复任务',
        's': '停止任务',
        'd': '删除任务'
      },
      'logs': {
        'c': '清除日志',
        'f': '过滤日志',
        's': '保存日志'
      },
      'cognitive': {
        'r': '刷新数据',
        'a': '自动调整',
        'm': '手动模式'
      }
    };
    
    const hints = contextualHints[context] || {};
    Object.entries(hints).forEach(([key, description]) => {
      this.showHint(key, description, 5000);
    });
  }
}