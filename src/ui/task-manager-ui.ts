import { EventEmitter } from 'eventemitter3';
import chalk from 'chalk';
import { DashboardUI, TaskStatus, AgentStatus } from './dashboard-ui.js';

/**
 * 任务配置
 */
export interface TaskConfig {
  id: string;
  title: string;
  description?: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  maxRetries?: number;
  timeout?: number; // 毫秒
  dependencies?: string[];
  payload?: any;
  metadata?: Record<string, any>;
}

/**
 * 任务队列配置
 */
export interface QueueConfig {
  maxConcurrent?: number;
  retryDelay?: number;
  timeout?: number;
  priorityWeights?: Record<string, number>;
}

/**
 * 任务管理器
 * 负责任务的创建、调度、执行和监控
 */
export class TaskManager extends EventEmitter {
  private tasks: Map<string, TaskStatus> = new Map();
  private taskQueue: TaskConfig[] = [];
  private runningTasks: Set<string> = new Set();
  private completedTasks: Map<string, TaskStatus> = new Map();
  private failedTasks: Map<string, TaskStatus> = new Map();
  
  private dashboard: DashboardUI;
  private config: QueueConfig;
  private isProcessing = false;
  private processTimer?: NodeJS.Timeout;
  private taskTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(dashboard: DashboardUI, config: QueueConfig = {}) {
    super();
    this.dashboard = dashboard;
    this.config = {
      maxConcurrent: 3,
      retryDelay: 5000,
      timeout: 300000, // 5分钟
      priorityWeights: {
        urgent: 4,
        high: 3,
        medium: 2,
        low: 1
      },
      ...config
    };
    this.setupDashboardEvents();
  }

  /**
   * 创建任务
   */
  createTask(config: TaskConfig): TaskStatus {
    const task: TaskStatus = {
      id: config.id,
      title: config.title,
      type: config.type,
      status: 'pending',
      progress: 0,
      priority: config.priority,
      createdAt: new Date(),
      dependencies: config.dependencies || []
    };

    this.tasks.set(task.id, task);
    this.taskQueue.push(config);
    
    // 按优先级排序
    this.sortQueue();
    
    this.dashboard.updateTask(task);
    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      source: 'task-manager',
      message: `任务 "${task.title}" 已创建，优先级: ${task.priority}`
    });
    
    this.emit('taskCreated', task);
    return task;
  }

  /**
   * 批量创建任务
   */
  batchCreateTasks(configs: TaskConfig[]): TaskStatus[] {
    return configs.map(config => this.createTask(config));
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // 从队列中移除
    this.taskQueue = this.taskQueue.filter(t => t.id !== taskId);
    
    // 停止运行中的任务
    if (this.runningTasks.has(taskId)) {
      this.stopTask(taskId);
    }
    
    // 更新状态
    task.status = 'failed';
    task.completedAt = new Date();
    this.tasks.delete(taskId);
    this.failedTasks.set(taskId, task);
    
    this.dashboard.updateTask(task);
    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'warn',
      source: 'task-manager',
      message: `任务 "${task.title}" 已取消`
    });
    
    this.emit('taskCancelled', task);
    return true;
  }

  /**
   * 暂停任务
   */
  pauseTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'running') return false;

    task.status = 'paused';
    this.dashboard.updateTask(task);
    
    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      source: 'task-manager',
      message: `任务 "${task.title}" 已暂停`
    });
    
    this.emit('taskPaused', task);
    return true;
  }

  /**
   * 恢复任务
   */
  resumeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'paused') return false;

    task.status = 'running';
    this.dashboard.updateTask(task);
    
    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      source: 'task-manager',
      message: `任务 "${task.title}" 已恢复`
    });
    
    this.emit('taskResumed', task);
    return true;
  }

  /**
   * 停止任务
   */
  stopTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // 清除定时器
    const timer = this.taskTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.taskTimers.delete(taskId);
    }
    
    // 从运行中移除
    this.runningTasks.delete(taskId);
    
    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'warn',
      source: 'task-manager',
      message: `任务 "${task.title}" 已停止`
    });
    
    this.emit('taskStopped', task);
    return true;
  }

  /**
   * 更新任务进度
   */
  updateTaskProgress(taskId: string, progress: number): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.progress = Math.max(0, Math.min(100, progress));
      this.dashboard.updateTask(task);
      this.emit('taskProgress', { taskId, progress });
    }
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): TaskStatus[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取任务统计
   */
  getTaskStats() {
    const allTasks = Array.from(this.tasks.values());
    return {
      total: allTasks.length,
      pending: allTasks.filter(t => t.status === 'pending').length,
      running: allTasks.filter(t => t.status === 'running').length,
      completed: allTasks.filter(t => t.status === 'completed').length,
      failed: allTasks.filter(t => t.status === 'failed').length,
      paused: allTasks.filter(t => t.status === 'paused').length
    };
  }

  /**
   * 开始任务处理
   */
  start(): void {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.processTimer = setInterval(() => {
      this.processQueue();
    }, 1000); // 每秒检查一次
    
    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      source: 'task-manager',
      message: '任务管理器已启动'
    });
  }

  /**
   * 停止任务处理
   */
  stop(): void {
    if (!this.isProcessing) return;
    
    this.isProcessing = false;
    if (this.processTimer) {
      clearInterval(this.processTimer);
    }
    
    // 停止所有运行中的任务
    this.runningTasks.forEach(taskId => {
      this.stopTask(taskId);
    });
    
    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      source: 'task-manager',
      message: '任务管理器已停止'
    });
  }

  /**
   * 处理任务队列
   */
  private async processQueue(): Promise<void> {
    if (!this.isProcessing) return;
    if (this.runningTasks.size >= (this.config.maxConcurrent || 3)) return;
    if (this.taskQueue.length === 0) return;
    
    // 获取下一个可执行的任务
    const nextTask = this.getNextExecutableTask();
    if (!nextTask) return;
    
    // 从队列中移除
    this.taskQueue = this.taskQueue.filter(t => t.id !== nextTask.id);
    
    // 执行任务
    await this.executeTask(nextTask);
  }

  /**
   * 获取下一个可执行的任务
   */
  private getNextExecutableTask(): TaskConfig | null {
    for (const taskConfig of this.taskQueue) {
      const taskStatus = this.tasks.get(taskConfig.id);
      if (!taskStatus) continue;
      
      // 检查依赖是否完成
      const dependenciesMet = this.checkDependencies(taskConfig.dependencies || []);
      if (!dependenciesMet) continue;
      
      return taskConfig;
    }
    return null;
  }

  /**
   * 检查依赖是否满足
   */
  private checkDependencies(dependencies: string[]): boolean {
    return dependencies.every(depId => {
      const depTask = this.tasks.get(depId) || this.completedTasks.get(depId);
      return depTask && depTask.status === 'completed';
    });
  }

  /**
   * 执行任务
   */
  private async executeTask(taskConfig: TaskConfig): Promise<void> {
    const task = this.tasks.get(taskConfig.id);
    if (!task) return;
    
    // 标记为运行中
    task.status = 'running';
    task.startedAt = new Date();
    this.runningTasks.add(task.id);
    this.dashboard.updateTask(task);
    
    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      source: 'task-manager',
      message: `开始执行任务: "${task.title}"`
    });
    
    this.emit('taskStarted', task);
    
    // 设置超时
    const timeout = taskConfig.timeout || this.config.timeout || 300000;
    const timeoutTimer = setTimeout(() => {
      this.handleTaskTimeout(task.id);
    }, timeout);
    
    this.taskTimers.set(task.id, timeoutTimer);
    
    try {
      // 模拟任务执行
      await this.simulateTaskExecution(task, taskConfig);
      
      // 清除超时定时器
      clearTimeout(timeoutTimer);
      this.taskTimers.delete(task.id);
      
      // 完成任务
      await this.completeTask(task.id);
      
    } catch (error) {
      // 清除超时定时器
      clearTimeout(timeoutTimer);
      this.taskTimers.delete(task.id);
      
      // 处理任务失败
      await this.handleTaskFailure(task.id, error as Error);
    }
  }

  /**
   * 模拟任务执行
   */
  private async simulateTaskExecution(task: TaskStatus, config: TaskConfig): Promise<void> {
    const duration = this.getTaskDuration(config.type);
    const steps = 10;
    const stepDuration = duration / steps;
    
    for (let i = 0; i <= steps; i++) {
      if (task.status === 'paused') {
        // 等待恢复
        await this.waitForResume(task.id);
      }
      
      if (task.status === 'failed') {
        throw new Error('任务被取消');
      }
      
      // 更新进度
      this.updateTaskProgress(task.id, Math.round((i / steps) * 100));
      
      // 模拟工作
      await this.sleep(stepDuration);
    }
  }

  /**
   * 获取任务持续时间（模拟）
   */
  private getTaskDuration(taskType: string): number {
    const durations: Record<string, number> = {
      'analysis': 10000,      // 10秒
      'development': 20000,   // 20秒
      'testing': 15000,       // 15秒
      'documentation': 8000,  // 8秒
      'deployment': 12000,    // 12秒
      'default': 10000        // 10秒
    };
    return durations[taskType] || durations.default;
  }

  /**
   * 等待任务恢复
   */
  private async waitForResume(taskId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        const task = this.tasks.get(taskId);
        if (task?.status === 'running') {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * 完成任务
   */
  private async completeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;
    
    // 更新状态
    task.status = 'completed';
    task.progress = 100;
    task.completedAt = new Date();
    
    // 从运行中移除
    this.runningTasks.delete(taskId);
    this.tasks.delete(taskId);
    this.completedTasks.set(taskId, task);
    
    this.dashboard.updateTask(task);
    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'info',
      source: 'task-manager',
      message: `任务 "${task.title}" 已完成`
    });
    
    this.emit('taskCompleted', task);
  }

  /**
   * 处理任务失败
   */
  private async handleTaskFailure(taskId: string, error: Error): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;
    
    // 更新状态
    task.status = 'failed';
    task.completedAt = new Date();
    
    // 从运行中移除
    this.runningTasks.delete(taskId);
    this.tasks.delete(taskId);
    this.failedTasks.set(taskId, task);
    
    this.dashboard.updateTask(task);
    this.dashboard.addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      level: 'error',
      source: 'task-manager',
      message: `任务 "${task.title}" 失败: ${error.message}`
    });
    
    this.emit('taskFailed', { task, error });
  }

  /**
   * 处理任务超时
   */
  private handleTaskTimeout(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    
    const error = new Error('任务超时');
    this.handleTaskFailure(taskId, error);
  }

  /**
   * 排序任务队列
   */
  private sortQueue(): void {
    const weights = this.config.priorityWeights || {
      urgent: 4,
      high: 3,
      medium: 2,
      low: 1
    };
    
    this.taskQueue.sort((a, b) => {
      const weightA = weights[a.priority] || 1;
      const weightB = weights[b.priority] || 1;
      
      if (weightA !== weightB) {
        return weightB - weightA; // 高优先级在前
      }
      
      // 相同优先级时，按创建时间排序
      const taskA = this.tasks.get(a.id);
      const taskB = this.tasks.get(b.id);
      
      if (taskA && taskB) {
        return taskA.createdAt.getTime() - taskB.createdAt.getTime();
      }
      
      return 0;
    });
  }

  /**
   * 设置仪表板事件
   */
  private setupDashboardEvents(): void {
    this.dashboard.on('pause', (item: any) => {
      if (item && item.id && this.pauseTask(item.id)) {
        this.dashboard.addLog({
          id: Date.now().toString(),
          timestamp: new Date(),
          level: 'info',
          source: 'task-manager',
          message: `任务 "${item.title}" 已暂停`
        });
      }
    });
    
    this.dashboard.on('resume', (item: any) => {
      if (item && item.id && this.resumeTask(item.id)) {
        this.dashboard.addLog({
          id: Date.now().toString(),
          timestamp: new Date(),
          level: 'info',
          source: 'task-manager',
          message: `任务 "${item.title}" 已恢复`
        });
      }
    });
    
    this.dashboard.on('stop', (item: any) => {
      if (item && item.id && this.stopTask(item.id)) {
        this.dashboard.addLog({
          id: Date.now().toString(),
          timestamp: new Date(),
          level: 'warn',
          source: 'task-manager',
          message: `任务 "${item.title}" 已停止`
        });
      }
    });
    
    this.dashboard.on('delete', (item: any) => {
      if (item && item.id && this.cancelTask(item.id)) {
        this.dashboard.addLog({
          id: Date.now().toString(),
          timestamp: new Date(),
          level: 'info',
          source: 'task-manager',
          message: `任务 "${item.title}" 已删除`
        });
      }
    });
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}