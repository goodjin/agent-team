import { EventEmitter } from 'eventemitter3';
import chalk from 'chalk';
import { DashboardUI } from './dashboard-ui.js';
import { AgentManager, AgentConfig } from './agent-manager-ui.js';
import { TaskManager, TaskConfig } from './task-manager-ui.js';
import { ProjectAgent } from '../core/project-agent.js';

/**
 * 协作模式
 */
export type CollaborationMode = 'auto' | 'interactive' | 'hybrid';

/**
 * 控制器配置
 */
export interface ControllerConfig {
  mode?: CollaborationMode;
  autoConfirm?: boolean;
  maxRetries?: number;
  timeout?: number;
  enableMonitoring?: boolean;
  updateInterval?: number;
}

/**
 * 多智能体协作控制器
 * 集成所有UI组件，提供统一的控制接口
 */
export class CollaborationController extends EventEmitter {
  private dashboard: DashboardUI;
  private agentManager: AgentManager;
  private taskManager: TaskManager;
  private projectAgent: ProjectAgent;
  private config: ControllerConfig;
  private isRunning = false;
  private startTime: Date = new Date();

  constructor(projectAgent: ProjectAgent, config: ControllerConfig = {}) {
    super();
    
    this.projectAgent = projectAgent;
    this.config = {
      mode: 'hybrid',
      autoConfirm: false,
      maxRetries: 3,
      timeout: 300000,
      enableMonitoring: true,
      updateInterval: 1000,
      ...config
    };
    
    // 初始化组件
    this.dashboard = new DashboardUI({
      updateInterval: this.config.updateInterval,
      enableAnimations: true,
      showTimestamps: true
    });
    
    this.agentManager = new AgentManager(this.dashboard);
    this.taskManager = new TaskManager(this.dashboard);
    
    this.setupEventHandlers();
    this.registerDefaultAgents();
  }

  /**
   * 启动控制器
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.startTime = new Date();
    
    // 启动仪表板
    this.dashboard.start();
    
    // 启动管理器
    this.taskManager.start();
    
    if (this.config.enableMonitoring) {
      this.agentManager.startMonitoring();
    }
    
    // 显示启动信息
    this.showStartupInfo();
    
    // 监听退出事件
    this.dashboard.on('quit', () => {
      this.stop();
    });
    
    this.emit('started');
  }

  /**
   * 停止控制器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    // 停止管理器
    this.taskManager.stop();
    this.agentManager.stopMonitoring();
    
    // 停止仪表板
    this.dashboard.stop();
    
    // 显示运行统计
    this.showRuntimeStats();
    
    this.emit('stopped');
    process.exit(0);
  }

  /**
   * 创建任务
   */
  async createTask(description: string, options: {
    type?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    dependencies?: string[];
  } = {}): Promise<string> {
    const taskId = `task_${Date.now()}`;
    const taskType = options.type || 'development';
    const priority = options.priority || 'medium';
    
    const taskConfig: TaskConfig = {
      id: taskId,
      title: description.slice(0, 50) + (description.length > 50 ? '...' : ''),
      description,
      type: taskType,
      priority,
      dependencies: options.dependencies,
      metadata: {
        createdBy: 'user',
        collaborationMode: this.config.mode
      }
    };
    
    const task = this.taskManager.createTask(taskConfig);
    
    // 根据模式处理任务
    switch (this.config.mode) {
      case 'auto':
        await this.autoProcessTask(task.id);
        break;
      case 'interactive':
        await this.interactiveProcessTask(task.id);
        break;
      case 'hybrid':
        await this.hybridProcessTask(task.id);
        break;
    }
    
    return task.id;
  }

  /**
   * 自动处理任务
   */
  private async autoProcessTask(taskId: string): Promise<void> {
    const task = this.taskManager.getTaskStatus(taskId);
    if (!task) return;
    
    // 选择合适的智能体
    const agent = this.selectAgentForTask(task);
    if (!agent) {
      this.dashboard.addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        level: 'error',
        source: 'controller',
        message: `无法为任务 "${task.title}" 找到合适的智能体`
      });
      return;
    }
    
    // 分配任务
    const assigned = await this.agentManager.assignTask(agent.id, task);
    if (assigned) {
      // 任务已分配，agent 会自动处理执行
      // 完成状态由 agent 完成任务时更新
    }
  }

  /**
   * 交互式处理任务
   */
  private async interactiveProcessTask(taskId: string): Promise<void> {
    const task = this.taskManager.getTaskStatus(taskId);
    if (!task) return;
    
    // 显示任务详情
    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      source: 'controller',
      message: `交互式处理任务: "${task.title}"\n类型: ${task.type}\n优先级: ${task.priority}`
    });
    
    // 选择智能体
    const availableAgents = this.agentManager.getAgents()
      .filter(agent => agent.enabled)
      .map(agent => `${agent.name} (${agent.role})`);
    
    if (availableAgents.length === 0) {
      this.dashboard.addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        level: 'error',
        source: 'controller',
        message: '没有可用的智能体'
      });
      return;
    }
    
    // 等待用户选择（这里简化处理，实际应该通过UI交互）
    const selectedAgent = this.agentManager.getAgents()[0];
    
    // 确认执行
    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      source: 'controller',
      message: `将使用智能体 ${selectedAgent.name} 执行任务`
    });
    
    // 分配任务
    const assigned = await this.agentManager.assignTask(selectedAgent.id, task);
    if (assigned) {
      try {
        const result = await this.projectAgent.developFeature({
          title: task.title,
          description: '',
          requirements: [],
          filePath: `./tasks/${task.id}.md`
        });
        
        this.agentManager.completeTask(selectedAgent.id, taskId, result);
        
      } catch (error) {
        this.agentManager.failTask(selectedAgent.id, taskId, error);
      }
    }
  }

  /**
   * 混合模式处理任务
   */
  private async hybridProcessTask(taskId: string): Promise<void> {
    const task = this.taskManager.getTaskStatus(taskId);
    if (!task) return;
    
    // 根据任务类型和优先级决定处理方式
    if (task.priority === 'urgent' || task.type === 'deployment') {
      // 紧急任务自动处理
      await this.autoProcessTask(taskId);
    } else {
      // 其他任务交互式处理
      await this.interactiveProcessTask(taskId);
    }
  }

  /**
   * 选择智能体
   */
  private selectAgentForTask(task: any): AgentConfig | null {
    const availableAgents = this.agentManager.getAgents()
      .filter(agent => agent.enabled);
    
    if (availableAgents.length === 0) return null;
    
    // 根据任务类型选择最合适的智能体
    const roleMapping: Record<string, string> = {
      'analysis': 'product-manager',
      'design': 'architect',
      'development': 'developer',
      'testing': 'tester',
      'documentation': 'doc-writer'
    };
    
    const requiredRole = roleMapping[task.type] || 'developer';
    const suitableAgents = availableAgents.filter(agent => agent.role === requiredRole);
    
    if (suitableAgents.length > 0) {
      // 选择负载最小的智能体
      const statuses = suitableAgents.map(agent => 
        this.agentManager.getAgentStatus(agent.id)
      ).filter(Boolean);
      
      return statuses.sort((a, b) => {
        const loadA = a!.status === 'idle' ? 0 : 1;
        const loadB = b!.status === 'idle' ? 0 : 1;
        return loadA - loadB;
      })[0]?.id ? 
        suitableAgents.find(a => a.id === statuses[0]!.id) || suitableAgents[0] :
        suitableAgents[0];
    }
    
    // 如果没有合适的角色，选择第一个可用的智能体
    return availableAgents[0];
  }

  /**
   * 创建工作流
   */
  async createWorkflow(steps: Array<{
    title: string;
    type: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  }>): Promise<string[]> {
    const taskIds: string[] = [];
    let previousTaskId: string | undefined;
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const taskId = await this.createTask(step.title, {
        type: step.type,
        priority: step.priority || 'medium',
        dependencies: previousTaskId ? [previousTaskId] : undefined
      });
      
      taskIds.push(taskId);
      previousTaskId = taskId;
    }
    
    return taskIds;
  }

  /**
   * 获取系统状态
   */
  getSystemStatus() {
    const agents = this.agentManager.getAllAgentStatuses();
    const tasks = this.taskManager.getAllTasks();
    const taskStats = this.taskManager.getTaskStats();
    const cognitiveLoad = this.agentManager.calculateCognitiveLoad();
    
    return {
      running: this.isRunning,
      uptime: Date.now() - this.startTime.getTime(),
      agents: {
        total: agents.length,
        working: agents.filter(a => a.status === 'working').length,
        idle: agents.filter(a => a.status === 'idle').length,
        error: agents.filter(a => a.status === 'error').length
      },
      tasks: taskStats,
      cognitiveLoad
    };
  }

  /**
   * 显示启动信息
   */
  private showStartupInfo(): void {
    const info = [
      '',
      '╔══════════════════════════════════════════════════════════════════════════════════════╗',
      '║                                 AI协作系统已启动                                      ║',
      '╠══════════════════════════════════════════════════════════════════════════════════════╣',
      `║ 模式: ${(this.config.mode || 'unknown').padEnd(70)} ║`,
      `║ 监控: ${(this.config.enableMonitoring ? '启用' : '禁用').padEnd(70)} ║`,
      `║ 自动确认: ${(this.config.autoConfirm ? '启用' : '禁用').padEnd(67)} ║`,
      '╚══════════════════════════════════════════════════════════════════════════════════════╝',
      '',
      '使用说明:',
      '  • 按数字键 1-4 切换面板',
      '  • 按 ↑↓ 键导航选择',
      '  • 按 p/r/s/d 控制任务',
      '  • 按 ? 显示详细帮助',
      '  • 按 q 退出系统',
      ''
    ];
    
    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      source: 'system',
      message: info.join('\n')
    });
  }

  /**
   * 显示运行统计
   */
  private showRuntimeStats(): void {
    const stats = this.getSystemStatus();
    const uptime = Math.round(stats.uptime / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;
    
    const info = [
      '',
      '╔══════════════════════════════════════════════════════════════════════════════════════╗',
      '║                                 运行统计                                             ║',
      '╠══════════════════════════════════════════════════════════════════════════════════════╣',
      `║ 运行时间: ${`${hours}小时 ${minutes}分钟 ${seconds}秒`.padEnd(65)} ║`,
      `║ 智能体统计: ${`总计${stats.agents.total} | 工作${stats.agents.working} | 空闲${stats.agents.idle} | 错误${stats.agents.error}`.padEnd(63)} ║`,
      `║ 任务统计: ${`总计${stats.tasks.total} | 运行${stats.tasks.running} | 完成${stats.tasks.completed} | 失败${stats.tasks.failed}`.padEnd(64)} ║`,
      `║ 认知负荷: ${`${stats.cognitiveLoad.overall}%`.padEnd(68)} ║`,
      '╚══════════════════════════════════════════════════════════════════════════════════════╝',
      ''
    ];
    
    console.log(chalk.cyan(info.join('\n')));
  }

  /**
   * 注册默认智能体
   */
  private registerDefaultAgents(): void {
    const defaultAgents: AgentConfig[] = [
      {
        id: 'pm',
        name: '产品经理',
        role: 'product-manager',
        description: '负责需求分析和产品设计',
        priority: 1,
        enabled: true
      },
      {
        id: 'arch',
        name: '架构师',
        role: 'architect',
        description: '负责系统架构设计',
        priority: 2,
        enabled: true
      },
      {
        id: 'dev',
        name: '开发者',
        role: 'developer',
        description: '负责代码开发',
        priority: 3,
        enabled: true
      },
      {
        id: 'tester',
        name: '测试工程师',
        role: 'tester',
        description: '负责测试和质量保证',
        priority: 4,
        enabled: true
      },
      {
        id: 'writer',
        name: '文档编写者',
        role: 'doc-writer',
        description: '负责文档编写',
        priority: 5,
        enabled: true
      }
    ];
    
    defaultAgents.forEach(agent => {
      this.agentManager.registerAgent(agent);
    });
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    // 任务事件
    this.taskManager.on('taskCreated', (task) => {
      this.emit('taskCreated', task);
    });
    
    this.taskManager.on('taskStarted', (task) => {
      this.emit('taskStarted', task);
    });
    
    this.taskManager.on('taskCompleted', (task) => {
      this.emit('taskCompleted', task);
    });
    
    this.taskManager.on('taskFailed', ({ task, error }) => {
      this.emit('taskFailed', { task, error });
    });
    
    // 智能体事件
    this.agentManager.on('taskAssigned', ({ agentId, task }) => {
      this.emit('agentTaskAssigned', { agentId, task });
    });
    
    this.agentManager.on('taskCompleted', ({ agentId, taskId, result }) => {
      this.emit('agentTaskCompleted', { agentId, taskId, result });
    });
    
    this.agentManager.on('taskFailed', ({ agentId, taskId, error }) => {
      this.emit('agentTaskFailed', { agentId, taskId, error });
    });
  }
}