import readline from 'readline';
import chalk from 'chalk';
import boxen from 'boxen';
import { EventEmitter } from 'eventemitter3';

/**
 * 智能体状态信息
 */
export interface AgentStatus {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'working' | 'waiting' | 'error' | 'completed';
  currentTask?: string;
  progress?: number;
  performance: {
    tasksCompleted: number;
    avgResponseTime: number;
    errorRate: number;
  };
  lastActivity: Date;
}

/**
 * 任务状态信息
 */
export interface TaskStatus {
  id: string;
  title: string;
  description?: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  assignedAgent?: string;
  progress: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  dependencies: string[];
}

/**
 * 认知负荷信息
 */
export interface CognitiveLoad {
  overall: number; // 0-100
  breakdown: {
    processing: number;
    memory: number;
    communication: number;
  };
  agents: Record<string, number>;
}

/**
 * 日志条目
 */
export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  metadata?: any;
}

/**
 * 仪表板配置
 */
export interface DashboardConfig {
  updateInterval?: number;
  maxLogEntries?: number;
  showTimestamps?: boolean;
  enableAnimations?: boolean;
  colorScheme?: 'dark' | 'light' | 'auto';
  layout?: 'compact' | 'comfortable' | 'detailed';
}

/**
 * 主仪表板 UI 类
 */
export class DashboardUI extends EventEmitter {
  private agents: Map<string, AgentStatus> = new Map();
  private tasks: Map<string, TaskStatus> = new Map();
  private logs: LogEntry[] = [];
  private cognitiveLoad: CognitiveLoad = {
    overall: 0,
    breakdown: { processing: 0, memory: 0, communication: 0 },
    agents: {}
  };
  
  private config: DashboardConfig;
  private isRunning = false;
  private updateTimer?: NodeJS.Timeout;
  private lastRender = '';
  private frameCount = 0;
  
  // 快捷键映射
  private keyHandlers: Map<string, () => void> = new Map();
  private activePanel: 'agents' | 'tasks' | 'logs' | 'cognitive' = 'agents';
  private selectedIndex = 0;

  // 颜色主题
  private colors = {
    primary: chalk.cyan,
    secondary: chalk.gray,
    success: chalk.green,
    warning: chalk.yellow,
    error: chalk.red,
    info: chalk.blue,
    muted: chalk.dim,
    border: chalk.gray,
    highlight: chalk.bold
  };

  constructor(config: DashboardConfig = {}) {
    super();
    this.config = {
      updateInterval: 1000,
      maxLogEntries: 1000,
      showTimestamps: true,
      enableAnimations: true,
      colorScheme: 'dark',
      layout: 'comfortable',
      ...config
    };
    this.setupKeyHandlers();
  }

  /**
   * 启动仪表板
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.setupInput();
    this.startUpdateLoop();
    this.render();
  }

  /**
   * 停止仪表板
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.cleanupInput();
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    this.showCursor();
  }

  /**
   * 更新智能体状态
   */
  updateAgent(agent: AgentStatus): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * 更新任务状态
   */
  updateTask(task: TaskStatus): void {
    this.tasks.set(task.id, task);
  }

  /**
   * 添加日志条目
   */
  addLog(entry: LogEntry): void {
    this.logs.push(entry);
    if (this.logs.length > (this.config.maxLogEntries || 1000)) {
      this.logs = this.logs.slice(-(this.config.maxLogEntries || 1000));
    }
  }

  /**
   * 更新认知负荷
   */
  updateCognitiveLoad(load: CognitiveLoad): void {
    this.cognitiveLoad = load;
  }

  /**
   * 获取当前状态快照
   */
  getSnapshot() {
    return {
      agents: Array.from(this.agents.values()),
      tasks: Array.from(this.tasks.values()),
      logs: [...this.logs],
      cognitiveLoad: { ...this.cognitiveLoad }
    };
  }

  /**
   * 设置快捷键处理
   */
  private setupKeyHandlers(): void {
    // 面板切换
    this.keyHandlers.set('1', () => this.activePanel = 'agents');
    this.keyHandlers.set('2', () => this.activePanel = 'tasks');
    this.keyHandlers.set('3', () => this.activePanel = 'logs');
    this.keyHandlers.set('4', () => this.activePanel = 'cognitive');
    
    // 导航
    this.keyHandlers.set('up', () => this.navigate(-1));
    this.keyHandlers.set('down', () => this.navigate(1));
    this.keyHandlers.set('pageup', () => this.navigate(-5));
    this.keyHandlers.set('pagedown', () => this.navigate(5));
    
    // 操作
    this.keyHandlers.set('p', () => this.pauseSelected());
    this.keyHandlers.set('r', () => this.resumeSelected());
    this.keyHandlers.set('s', () => this.stopSelected());
    this.keyHandlers.set('d', () => this.deleteSelected());
    this.keyHandlers.set('c', () => this.clearLogs());
    
    // 系统
    this.keyHandlers.set('q', () => this.emit('quit'));
    this.keyHandlers.set('?', () => this.showHelp());
    this.keyHandlers.set('h', () => this.showHelp());
  }

  /**
   * 设置输入处理
   */
  private setupInput(): void {
    if (!process.stdin.isTTY) return;
    
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', this.onKeypress);
  }

  /**
   * 清理输入处理
   */
  private cleanupInput(): void {
    if (!process.stdin.isTTY) return;
    
    process.stdin.off('keypress', this.onKeypress);
    process.stdin.setRawMode(false);
  }

  /**
   * 键盘事件处理
   */
  private onKeypress = (str: string, key: any): void => {
    if (key && key.ctrl && key.name === 'c') {
      this.emit('quit');
      return;
    }

    const handler = this.keyHandlers.get(key.name || str);
    if (handler) {
      handler();
      this.render();
    }
  };

  /**
   * 导航选择
   */
  private navigate(direction: number): void {
    const items = this.getCurrentPanelItems();
    if (items.length === 0) return;
    
    this.selectedIndex = Math.max(0, Math.min(items.length - 1, this.selectedIndex + direction));
  }

  /**
   * 获取当前面板项目
   */
  private getCurrentPanelItems(): any[] {
    switch (this.activePanel) {
      case 'agents': return Array.from(this.agents.values());
      case 'tasks': return Array.from(this.tasks.values());
      case 'logs': return this.logs.slice(-50);
      case 'cognitive': return Object.entries(this.cognitiveLoad.agents);
      default: return [];
    }
  }

  /**
   * 暂停选中项
   */
  private pauseSelected(): void {
    const items = this.getCurrentPanelItems();
    if (this.selectedIndex >= 0 && this.selectedIndex < items.length) {
      this.emit('pause', items[this.selectedIndex]);
    }
  }

  /**
   * 恢复选中项
   */
  private resumeSelected(): void {
    const items = this.getCurrentPanelItems();
    if (this.selectedIndex >= 0 && this.selectedIndex < items.length) {
      this.emit('resume', items[this.selectedIndex]);
    }
  }

  /**
   * 停止选中项
   */
  private stopSelected(): void {
    const items = this.getCurrentPanelItems();
    if (this.selectedIndex >= 0 && this.selectedIndex < items.length) {
      this.emit('stop', items[this.selectedIndex]);
    }
  }

  /**
   * 删除选中项
   */
  private deleteSelected(): void {
    const items = this.getCurrentPanelItems();
    if (this.selectedIndex >= 0 && this.selectedIndex < items.length) {
      this.emit('delete', items[this.selectedIndex]);
    }
  }

  /**
   * 清除日志
   */
  private clearLogs(): void {
    this.logs = [];
    this.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      source: 'system',
      message: '日志已清除'
    });
  }

  /**
   * 显示帮助
   */
  private showHelp(): void {
    const help = [
      '快捷键帮助:',
      '',
      '面板切换:',
      '  1 - 智能体面板',
      '  2 - 任务面板', 
      '  3 - 日志面板',
      '  4 - 认知面板',
      '',
      '导航:',
      '  ↑/↓ - 上下选择',
      '  PageUp/PageDown - 快速翻页',
      '',
      '操作:',
      '  p - 暂停选中项',
      '  r - 恢复选中项', 
      '  s - 停止选中项',
      '  d - 删除选中项',
      '  c - 清除日志',
      '',
      '系统:',
      '  ?/h - 显示帮助',
      '  q - 退出',
      '  Ctrl+C - 强制退出'
    ];

    this.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      source: 'system',
      message: help.join('\n')
    });
  }

  /**
   * 启动更新循环
   */
  private startUpdateLoop(): void {
    this.updateTimer = setInterval(() => {
      this.frameCount++;
      this.render();
    }, this.config.updateInterval);
  }

  /**
   * 渲染仪表板
   */
  private render(): void {
    if (!this.isRunning) return;

    const terminalWidth = process.stdout.columns || 80;
    const terminalHeight = process.stdout.rows || 24;
    
    const content = this.buildDashboard(terminalWidth, terminalHeight);
    
    // 避免不必要的重绘
    if (content !== this.lastRender) {
      this.hideCursor();
      process.stdout.write('\x1b[H\x1b[2J'); // 清屏
      process.stdout.write(content);
      this.lastRender = content;
    }
  }

  /**
   * 构建仪表板内容
   */
  private buildDashboard(width: number, height: number): string {
    const header = this.buildHeader(width);
    const mainContent = this.buildMainContent(width, height - 4); // 减去头部和状态栏
    const statusBar = this.buildStatusBar(width);
    
    return header + mainContent + statusBar;
  }

  /**
   * 构建头部
   */
  private buildHeader(width: number): string {
    const title = ' AI协作系统控制台 ';
    const padding = Math.max(0, width - title.length - 2);
    const leftPadding = Math.floor(padding / 2);
    const rightPadding = padding - leftPadding;
    
    const line = this.colors.border('┌' + '─'.repeat(width - 2) + '┐');
    const titleLine = this.colors.border('│') + 
      this.colors.primary(title) + 
      this.colors.border('│'.padStart(width - title.length - 1));
    
    const menu = this.buildMenu(width);
    
    return line + '\n' + titleLine + '\n' + menu + '\n';
  }

  /**
   * 构建菜单
   */
  private buildMenu(width: number): string {
    const menuItems = [
      { key: '1', label: '智能体', active: this.activePanel === 'agents' },
      { key: '2', label: '任务', active: this.activePanel === 'tasks' },
      { key: '3', label: '日志', active: this.activePanel === 'logs' },
      { key: '4', label: '认知', active: this.activePanel === 'cognitive' }
    ];

    let menuLine = this.colors.border('│');
    menuItems.forEach(item => {
      const itemText = ` ${item.key}:${item.label} `;
      const coloredText = item.active ? 
        this.colors.highlight(itemText) : 
        this.colors.secondary(itemText);
      menuLine += coloredText;
    });
    
    menuLine += this.colors.border('│'.padStart(width - menuLine.length + 1));
    return menuLine;
  }

  /**
   * 构建主内容区域
   */
  private buildMainContent(width: number, height: number): string {
    switch (this.activePanel) {
      case 'agents':
        return this.buildAgentsPanel(width, height);
      case 'tasks':
        return this.buildTasksPanel(width, height);
      case 'logs':
        return this.buildLogsPanel(width, height);
      case 'cognitive':
        return this.buildCognitivePanel(width, height);
      default:
        return '';
    }
  }

  /**
   * 构建智能体面板
   */
  private buildAgentsPanel(width: number, height: number): string {
    const agents = Array.from(this.agents.values());
    let content = '';
    
    // 统计信息
    const stats = {
      total: agents.length,
      working: agents.filter(a => a.status === 'working').length,
      idle: agents.filter(a => a.status === 'idle').length,
      error: agents.filter(a => a.status === 'error').length
    };
    
    const statsLine = `总计: ${stats.total} | 工作中: ${stats.working} | 空闲: ${stats.idle} | 错误: ${stats.error}`;
    content += this.colors.border('│') + this.colors.info(statsLine.padEnd(width - 2)) + this.colors.border('│') + '\n';
    content += this.colors.border('├' + '─'.repeat(width - 2) + '┤') + '\n';
    
    // 智能体列表
    const listHeight = height - 3; // 减去统计信息和分隔线
    const visibleAgents = agents.slice(0, listHeight);
    
    visibleAgents.forEach((agent, index) => {
      const isSelected = index === this.selectedIndex;
      const statusColor = this.getStatusColor(agent.status);
      const statusIcon = this.getStatusIcon(agent.status);
      
      let line = this.colors.border('│');
      
      if (isSelected) {
        line += this.colors.highlight('▶ ');
      } else {
        line += '  ';
      }
      
      line += statusColor(`${statusIcon} ${agent.name}`);
      line += this.colors.secondary(` (${agent.role})`).padEnd(width - line.length - 1);
      line += this.colors.border('│');
      
      content += line + '\n';
      
      // 显示当前任务
      if (agent.currentTask && index < listHeight - 1) {
        const taskLine = this.colors.border('│') + 
          this.colors.muted(`  └─ ${agent.currentTask}`.padEnd(width - 2)) + 
          this.colors.border('│');
        content += taskLine + '\n';
      }
    });
    
    // 填充空白行
    const remainingLines = Math.max(0, listHeight - visibleAgents.length * 2);
    for (let i = 0; i < remainingLines; i++) {
      content += this.colors.border('│') + ' '.repeat(width - 2) + this.colors.border('│') + '\n';
    }
    
    return content;
  }

  /**
   * 构建任务面板
   */
  private buildTasksPanel(width: number, height: number): string {
    const tasks = Array.from(this.tasks.values()).sort((a, b) => {
      const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
    
    let content = '';
    
    // 统计信息
    const stats = {
      total: tasks.length,
      running: tasks.filter(t => t.status === 'running').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length
    };
    
    const statsLine = `总计: ${stats.total} | 运行中: ${stats.running} | 完成: ${stats.completed} | 失败: ${stats.failed}`;
    content += this.colors.border('│') + this.colors.info(statsLine.padEnd(width - 2)) + this.colors.border('│') + '\n';
    content += this.colors.border('├' + '─'.repeat(width - 2) + '┤') + '\n';
    
    // 任务列表
    const listHeight = height - 3;
    const visibleTasks = tasks.slice(0, listHeight);
    
    visibleTasks.forEach((task, index) => {
      const isSelected = index === this.selectedIndex;
      const statusColor = this.getStatusColor(task.status);
      const priorityColor = this.getPriorityColor(task.priority);
      const progressBar = this.buildProgressBar(task.progress, width - 20);
      
      let line = this.colors.border('│');
      
      if (isSelected) {
        line += this.colors.highlight('▶ ');
      } else {
        line += '  ';
      }
      
      line += priorityColor(`[${task.priority.toUpperCase()}] `);
      line += statusColor(task.title.slice(0, Math.max(0, width - 25)));
      line += progressBar;
      line += this.colors.border('│');
      
      content += line + '\n';
    });
    
    // 填充空白行
    const remainingLines = Math.max(0, listHeight - visibleTasks.length);
    for (let i = 0; i < remainingLines; i++) {
      content += this.colors.border('│') + ' '.repeat(width - 2) + this.colors.border('│') + '\n';
    }
    
    return content;
  }

  /**
   * 构建日志面板
   */
  private buildLogsPanel(width: number, height: number): string {
    const recentLogs = this.logs.slice(-height);
    let content = '';
    
    recentLogs.forEach(log => {
      const levelColor = this.getLevelColor(log.level);
      const timestamp = this.config.showTimestamps ? 
        this.colors.muted(`[${log.timestamp.toLocaleTimeString()}] `) : '';
      
      let line = this.colors.border('│') + timestamp;
      line += levelColor(`[${log.level.toUpperCase()}] `);
      line += `${log.source}: ${log.message}`;
      
      // 截断过长的消息
      if (line.length > width - 2) {
        line = line.slice(0, width - 5) + '...';
      }
      
      line += this.colors.border('│'.padStart(width - line.length + 1));
      content += line + '\n';
    });
    
    // 填充空白行
    const remainingLines = Math.max(0, height - recentLogs.length);
    for (let i = 0; i < remainingLines; i++) {
      content += this.colors.border('│') + ' '.repeat(width - 2) + this.colors.border('│') + '\n';
    }
    
    return content;
  }

  /**
   * 构建认知面板
   */
  private buildCognitivePanel(width: number, height: number): string {
    let content = '';
    
    // 总体负荷
    const overallBar = this.buildProgressBar(this.cognitiveLoad.overall, width - 20);
    const overallLine = this.colors.border('│') + 
      this.colors.info(`总体认知负荷: ${this.cognitiveLoad.overall}%`) + 
      overallBar + 
      this.colors.border('│');
    content += overallLine + '\n';
    
    // 分项负荷
    const breakdown = this.cognitiveLoad.breakdown;
    content += this.colors.border('├' + '─'.repeat(width - 2) + '┤') + '\n';
    
    const processingBar = this.buildProgressBar(breakdown.processing, width - 25);
    const memoryBar = this.buildProgressBar(breakdown.memory, width - 25);
    const commBar = this.buildProgressBar(breakdown.communication, width - 25);
    
    content += this.colors.border('│') + 
      `处理: ${breakdown.processing}%`.padEnd(15) + processingBar + 
      this.colors.border('│') + '\n';
    
    content += this.colors.border('│') + 
      `内存: ${breakdown.memory}%`.padEnd(15) + memoryBar + 
      this.colors.border('│') + '\n';
    
    content += this.colors.border('│') + 
      `通信: ${breakdown.communication}%`.padEnd(15) + commBar + 
      this.colors.border('│') + '\n';
    
    content += this.colors.border('├' + '─'.repeat(width - 2) + '┤') + '\n';
    
    // 智能体负荷详情
    const agentLoads = Object.entries(this.cognitiveLoad.agents)
      .sort(([,a], [,b]) => b - a)
      .slice(0, height - 6);
    
    agentLoads.forEach(([agentId, load]) => {
      const agent = this.agents.get(agentId);
      const name = agent?.name || agentId;
      const loadBar = this.buildProgressBar(load, width - 25);
      
      content += this.colors.border('│') + 
        `${name}: ${load}%`.padEnd(20) + loadBar + 
        this.colors.border('│') + '\n';
    });
    
    // 填充剩余空间
    const remainingLines = Math.max(0, height - 6 - agentLoads.length);
    for (let i = 0; i < remainingLines; i++) {
      content += this.colors.border('│') + ' '.repeat(width - 2) + this.colors.border('│') + '\n';
    }
    
    return content;
  }

  /**
   * 构建状态栏
   */
  private buildStatusBar(width: number): string {
    const shortcuts = [
      '1:智能体', '2:任务', '3:日志', '4:认知',
      '↑↓:导航', 'p:暂停', 'r:恢复', 's:停止',
      'c:清日志', '?:帮助', 'q:退出'
    ];
    
    let statusLine = this.colors.border('└' + '─'.repeat(width - 2) + '┘') + '\n';
    
    const shortcutsText = shortcuts.join(' | ');
    if (shortcutsText.length <= width - 4) {
      statusLine += this.colors.border('│') + 
        this.colors.muted(shortcutsText.padEnd(width - 2)) + 
        this.colors.border('│');
    } else {
      statusLine += this.colors.border('│') + 
        this.colors.muted('按 ? 显示帮助'.padEnd(width - 2)) + 
        this.colors.border('│');
    }
    
    return statusLine;
  }

  /**
   * 构建进度条
   */
  private buildProgressBar(progress: number, maxWidth: number): string {
    const filledLength = Math.round((progress / 100) * maxWidth);
    const emptyLength = maxWidth - filledLength;
    
    const filled = '█'.repeat(filledLength);
    const empty = '░'.repeat(emptyLength);
    
    const color = progress < 30 ? this.colors.success :
                 progress < 70 ? this.colors.warning :
                 this.colors.error;
    
    return color(filled + empty) + ` ${progress}%`.padStart(5);
  }

  /**
   * 获取状态颜色
   */
  private getStatusColor(status: string): (text: string) => string {
    switch (status) {
      case 'working':
      case 'running':
        return this.colors.warning;
      case 'completed':
        return this.colors.success;
      case 'error':
      case 'failed':
        return this.colors.error;
      case 'idle':
      case 'pending':
        return this.colors.secondary;
      default:
        return this.colors.info;
    }
  }

  /**
   * 获取状态图标
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'working':
      case 'running':
        return '●';
      case 'completed':
        return '✓';
      case 'error':
      case 'failed':
        return '✗';
      case 'idle':
        return '○';
      case 'waiting':
        return '◐';
      default:
        return '?';
    }
  }

  /**
   * 获取优先级颜色
   */
  private getPriorityColor(priority: string): (text: string) => string {
    switch (priority) {
      case 'urgent':
        return this.colors.error;
      case 'high':
        return this.colors.warning;
      case 'medium':
        return this.colors.info;
      case 'low':
        return this.colors.secondary;
      default:
        return this.colors.info;
    }
  }

  /**
   * 获取日志级别颜色
   */
  private getLevelColor(level: string): (text: string) => string {
    switch (level) {
      case 'error':
        return this.colors.error;
      case 'warn':
        return this.colors.warning;
      case 'info':
        return this.colors.info;
      case 'debug':
        return this.colors.secondary;
      default:
        return this.colors.info;
    }
  }

  /**
   * 隐藏光标
   */
  private hideCursor(): void {
    process.stdout.write('\x1b[?25l');
  }

  /**
   * 显示光标
   */
  private showCursor(): void {
    process.stdout.write('\x1b[?25h');
  }
}