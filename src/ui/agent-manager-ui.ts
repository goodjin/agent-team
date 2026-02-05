import { EventEmitter } from 'eventemitter3';
import chalk from 'chalk';
import { DashboardUI, AgentStatus, TaskStatus, CognitiveLoad } from './dashboard-ui.js';

/**
 * 智能体配置
 */
export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  description?: string;
  maxConcurrentTasks?: number;
  priority?: number;
  enabled?: boolean;
  settings?: Record<string, any>;
}

/**
 * 智能体管理器
 * 负责智能体的创建、监控和控制
 */
export class AgentManager extends EventEmitter {
  private agents: Map<string, AgentConfig> = new Map();
  private agentStatuses: Map<string, AgentStatus> = new Map();
  private dashboard: DashboardUI;
  private isMonitoring = false;
  private monitorTimer?: NodeJS.Timeout;

  constructor(dashboard: DashboardUI) {
    super();
    this.dashboard = dashboard;
    this.setupDashboardEvents();
  }

  /**
   * 注册智能体
   */
  registerAgent(config: AgentConfig): void {
    this.agents.set(config.id, {
      maxConcurrentTasks: 1,
      priority: 1,
      enabled: true,
      settings: {},
      ...config
    });

    // 初始化状态
    this.updateAgentStatus(config.id, {
      id: config.id,
      name: config.name,
      role: config.role,
      status: 'idle',
      performance: {
        tasksCompleted: 0,
        avgResponseTime: 0,
        errorRate: 0
      },
      lastActivity: new Date()
    });

    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      source: 'agent-manager',
      message: `智能体 ${config.name} 已注册`
    });
  }

  /**
   * 注销智能体
   */
  unregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
      this.agentStatuses.delete(agentId);
      
      this.dashboard.addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        level: 'info',
        source: 'agent-manager',
        message: `智能体 ${agent.name} 已注销`
      });
    }
  }

  /**
   * 启用智能体
   */
  enableAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.enabled = true;
      this.updateAgentStatus(agentId, { status: 'idle' });
      
      this.dashboard.addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        level: 'info',
        source: 'agent-manager',
        message: `智能体 ${agent.name} 已启用`
      });
    }
  }

  /**
   * 禁用智能体
   */
  disableAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.enabled = false;
      this.updateAgentStatus(agentId, { status: 'idle' });
      
      this.dashboard.addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        level: 'warn',
        source: 'agent-manager',
        message: `智能体 ${agent.name} 已禁用`
      });
    }
  }

  /**
   * 更新智能体状态
   */
  updateAgentStatus(agentId: string, updates: Partial<AgentStatus>): void {
    const currentStatus = this.agentStatuses.get(agentId);
    if (currentStatus) {
      const newStatus = {
        ...currentStatus,
        ...updates,
        lastActivity: new Date()
      };
      
      this.agentStatuses.set(agentId, newStatus);
      this.dashboard.updateAgent(newStatus);
      
      // 状态变更日志
      if (updates.status && updates.status !== currentStatus.status) {
        this.dashboard.addLog({
          id: Date.now().toString(),
          timestamp: new Date(),
          level: 'info',
          source: 'agent-manager',
          message: `智能体 ${currentStatus.name} 状态变更为: ${updates.status}`
        });
      }
    }
  }

  /**
   * 分配任务给智能体
   */
  async assignTask(agentId: string, task: TaskStatus): Promise<boolean> {
    const agent = this.agents.get(agentId);
    const status = this.agentStatuses.get(agentId);
    
    if (!agent || !agent.enabled) {
      this.dashboard.addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        level: 'warn',
        source: 'agent-manager',
        message: `无法分配任务: 智能体 ${agentId} 未启用或不存在`
      });
      return false;
    }
    
    if (status?.status === 'working') {
      this.dashboard.addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        level: 'warn',
        source: 'agent-manager',
        message: `智能体 ${agent.name} 正忙，无法分配新任务`
      });
      return false;
    }
    
    // 更新智能体状态
    this.updateAgentStatus(agentId, {
      status: 'working',
      currentTask: task.title,
      progress: 0
    });
    
    // 更新任务状态
    task.assignedAgent = agentId;
    task.status = 'running';
    task.startedAt = new Date();
    this.dashboard.updateTask(task);
    
    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      source: 'agent-manager',
      message: `任务 "${task.title}" 已分配给智能体 ${agent.name}`
    });
    
    this.emit('taskAssigned', { agentId, task });
    return true;
  }

  /**
   * 智能体完成任务
   */
  completeTask(agentId: string, taskId: string, result?: any): void {
    const agent = this.agents.get(agentId);
    const status = this.agentStatuses.get(agentId);
    
    if (agent && status) {
      // 更新智能体状态
      this.updateAgentStatus(agentId, {
        status: 'idle',
        currentTask: undefined,
        progress: undefined,
        performance: {
          ...status.performance,
          tasksCompleted: status.performance.tasksCompleted + 1
        }
      });
      
      this.dashboard.addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        level: 'info',
        source: 'agent-manager',
        message: `智能体 ${agent.name} 完成任务`
      });
      
      this.emit('taskCompleted', { agentId, taskId, result });
    }
  }

  /**
   * 智能体任务失败
   */
  failTask(agentId: string, taskId: string, error?: any): void {
    const agent = this.agents.get(agentId);
    const status = this.agentStatuses.get(agentId);
    
    if (agent && status) {
      // 更新智能体状态
      this.updateAgentStatus(agentId, {
        status: 'idle',
        currentTask: undefined,
        progress: undefined,
        performance: {
          ...status.performance,
          errorRate: Math.min(1, status.performance.errorRate + 0.1)
        }
      });
      
      this.dashboard.addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        level: 'error',
        source: 'agent-manager',
        message: `智能体 ${agent.name} 任务失败: ${error?.message || '未知错误'}`
      });
      
      this.emit('taskFailed', { agentId, taskId, error });
    }
  }

  /**
   * 更新智能体进度
   */
  updateAgentProgress(agentId: string, progress: number): void {
    const status = this.agentStatuses.get(agentId);
    if (status) {
      this.updateAgentStatus(agentId, { progress });
    }
  }

  /**
   * 获取智能体列表
   */
  getAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * 获取智能体状态
   */
  getAgentStatus(agentId: string): AgentStatus | undefined {
    return this.agentStatuses.get(agentId);
  }

  /**
   * 获取所有智能体状态
   */
  getAllAgentStatuses(): AgentStatus[] {
    return Array.from(this.agentStatuses.values());
  }

  /**
   * 计算认知负荷
   */
  calculateCognitiveLoad(): CognitiveLoad {
    const statuses = Array.from(this.agentStatuses.values());
    const totalAgents = statuses.length;
    
    if (totalAgents === 0) {
      return {
        overall: 0,
        breakdown: { processing: 0, memory: 0, communication: 0 },
        agents: {}
      };
    }
    
    // 计算各项负荷
    const workingAgents = statuses.filter(s => s.status === 'working').length;
    const errorAgents = statuses.filter(s => s.status === 'error').length;
    const waitingAgents = statuses.filter(s => s.status === 'waiting').length;
    
    const processing = Math.round((workingAgents / totalAgents) * 100);
    const memory = Math.round((errorAgents / totalAgents) * 100);
    const communication = Math.round((waitingAgents / totalAgents) * 100);
    
    const overall = Math.round((processing + memory + communication) / 3);
    
    // 计算每个智能体的负荷
    const agents: Record<string, number> = {};
    statuses.forEach(status => {
      let load = 0;
      switch (status.status) {
        case 'working':
          load = Math.max(60, status.progress || 70);
          break;
        case 'error':
          load = 90;
          break;
        case 'waiting':
          load = 30;
          break;
        case 'idle':
          load = 10;
          break;
        default:
          load = 20;
      }
      agents[status.id] = load;
    });
    
    return {
      overall,
      breakdown: { processing, memory, communication },
      agents
    };
  }

  /**
   * 开始监控
   */
  startMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.monitorTimer = setInterval(() => {
      this.performMonitoring();
    }, 5000); // 每5秒监控一次
    
    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      source: 'agent-manager',
      message: '智能体监控已启动'
    });
  }

  /**
   * 停止监控
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
    }
    
    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      source: 'agent-manager',
      message: '智能体监控已停止'
    });
  }

  /**
   * 执行监控
   */
  private performMonitoring(): void {
    // 更新认知负荷
    const cognitiveLoad = this.calculateCognitiveLoad();
    this.dashboard.updateCognitiveLoad(cognitiveLoad);
    
    // 检查异常智能体
    this.checkAnomalies();
    
    // 自动负载均衡
    if (cognitiveLoad.overall > 80) {
      this.performLoadBalancing();
    }
  }

  /**
   * 检查异常
   */
  private checkAnomalies(): void {
    const now = Date.now();
    
    this.agentStatuses.forEach((status, agentId) => {
      const agent = this.agents.get(agentId);
      if (!agent || !agent.enabled) return;
      
      // 检查长时间运行的任务
      if (status.status === 'working' && status.currentTask) {
        const taskDuration = now - status.lastActivity.getTime();
        if (taskDuration > 300000) { // 5分钟
          this.dashboard.addLog({
            id: Date.now().toString(),
            timestamp: new Date(),
            level: 'warn',
            source: 'agent-manager',
            message: `智能体 ${agent.name} 任务运行时间过长: ${Math.round(taskDuration / 60000)}分钟`
          });
        }
      }
      
      // 检查错误率过高
      if (status.performance.errorRate > 0.3) { // 30%错误率
        this.dashboard.addLog({
          id: Date.now().toString(),
          timestamp: new Date(),
          level: 'error',
          source: 'agent-manager',
          message: `智能体 ${agent.name} 错误率过高: ${Math.round(status.performance.errorRate * 100)}%`
        });
      }
    });
  }

  /**
   * 执行负载均衡
   */
  private performLoadBalancing(): void {
    const workingAgents = Array.from(this.agentStatuses.entries())
      .filter(([, status]) => status.status === 'working')
      .sort(([, a], [, b]) => (b.progress || 0) - (a.progress || 0));
    
    const idleAgents = Array.from(this.agentStatuses.entries())
      .filter(([, status]) => status.status === 'idle');
    
    if (workingAgents.length > 0 && idleAgents.length > 0) {
      // 将进度较低的任务重新分配给空闲智能体
      const [overloadedAgentId, overloadedStatus] = workingAgents[workingAgents.length - 1];
      const [targetAgentId] = idleAgents[0];
      
      this.dashboard.addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        level: 'info',
        source: 'agent-manager',
        message: `负载均衡: 从 ${overloadedStatus.name} 重新分配任务到空闲智能体`
      });
      
      this.emit('loadBalancing', {
        fromAgent: overloadedAgentId,
        toAgent: targetAgentId,
        task: overloadedStatus.currentTask
      });
    }
  }

  /**
   * 设置仪表板事件
   */
  private setupDashboardEvents(): void {
    // 监听仪表板事件
    this.dashboard.on('pause', (item: any) => {
      if (item && item.id) {
        this.pauseAgent(item.id);
      }
    });
    
    this.dashboard.on('resume', (item: any) => {
      if (item && item.id) {
        this.resumeAgent(item.id);
      }
    });
    
    this.dashboard.on('stop', (item: any) => {
      if (item && item.id) {
        this.stopAgent(item.id);
      }
    });
  }

  /**
   * 暂停智能体
   */
  pauseAgent(agentId: string): void {
    const status = this.agentStatuses.get(agentId);
    if (status && status.status === 'working') {
      this.updateAgentStatus(agentId, { status: 'waiting' });
      
      this.dashboard.addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        level: 'info',
        source: 'agent-manager',
        message: `智能体 ${status.name} 已暂停`
      });
    }
  }

  /**
   * 恢复智能体
   */
  resumeAgent(agentId: string): void {
    const status = this.agentStatuses.get(agentId);
    if (status && status.status === 'waiting') {
      this.updateAgentStatus(agentId, { status: 'working' });
      
      this.dashboard.addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        level: 'info',
        source: 'agent-manager',
        message: `智能体 ${status.name} 已恢复`
      });
    }
  }

  /**
   * 停止智能体
   */
  stopAgent(agentId: string): void {
    const status = this.agentStatuses.get(agentId);
    if (status && (status.status === 'working' || status.status === 'waiting')) {
      this.updateAgentStatus(agentId, { 
        status: 'idle',
        currentTask: undefined,
        progress: undefined
      });
      
      this.dashboard.addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        level: 'warn',
        source: 'agent-manager',
        message: `智能体 ${status.name} 已停止`
      });
    }
  }
}