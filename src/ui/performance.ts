import { EventEmitter } from 'eventemitter3';
import os from 'os';

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  process: {
    uptime: number;
    memory: number;
    cpu: number;
    handles: number;
  };
  render: {
    fps: number;
    frameTime: number;
    droppedFrames: number;
  };
  network: {
    latency: number;
    throughput: number;
  };
}

/**
 * 性能优化配置
 */
export interface PerformanceConfig {
  enableFrameSkipping?: boolean;
  maxFPS?: number;
  memoryThreshold?: number;
  cpuThreshold?: number;
  enableAdaptiveQuality?: boolean;
  qualityLevels?: QualityLevel[];
}

/**
 * 质量级别
 */
export interface QualityLevel {
  name: string;
  animations: boolean;
  colors: boolean;
  updatesPerSecond: number;
  detailLevel: 'minimal' | 'normal' | 'detailed';
}

/**
 * 性能监控器
 */
export class PerformanceMonitor extends EventEmitter {
  private metrics: PerformanceMetrics;
  private config: PerformanceConfig;
  private isMonitoring = false;
  private monitorInterval?: NodeJS.Timeout;
  private lastMetricsTime = 0;
  private frameCount = 0;
  private lastFrameTime = 0;
  private droppedFrames = 0;
  private currentQualityLevel = 1;

  // 性能统计
  private frameTimes: number[] = [];
  private memoryUsage: number[] = [];
  private cpuUsage: number[] = [];

  constructor(config: PerformanceConfig = {}) {
    super();
    
    this.config = {
      enableFrameSkipping: true,
      maxFPS: 30,
      memoryThreshold: 0.8,
      cpuThreshold: 0.7,
      enableAdaptiveQuality: true,
      qualityLevels: this.getDefaultQualityLevels(),
      ...config
    };
    
    this.metrics = this.getInitialMetrics();
  }

  /**
   * 开始性能监控
   */
  start(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.lastMetricsTime = Date.now();
    
    // 启动监控循环
    this.monitorInterval = setInterval(() => {
      this.updateMetrics();
    }, 1000); // 每秒更新一次
    
    this.emit('monitoringStarted');
  }

  /**
   * 停止性能监控
   */
  stop(): void {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    
    this.emit('monitoringStopped');
  }

  /**
   * 获取当前性能指标
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * 记录帧时间
   */
  recordFrameTime(frameTime: number): void {
    this.frameTimes.push(frameTime);
    
    // 保持最近100帧的数据
    if (this.frameTimes.length > 100) {
      this.frameTimes.shift();
    }
    
    // 计算平均帧时间
    const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.metrics.render.frameTime = avgFrameTime;
    
    // 计算FPS
    this.metrics.render.fps = avgFrameTime > 0 ? Math.round(1000 / avgFrameTime) : 0;
    
    // 检测掉帧
    const targetFrameTime = 1000 / (this.config.maxFPS || 30);
    if (frameTime > targetFrameTime * 1.5) {
      this.droppedFrames++;
      this.metrics.render.droppedFrames = this.droppedFrames;
    }
    
    // 自适应质量调整
    if (this.config.enableAdaptiveQuality) {
      this.adaptQuality();
    }
  }

  /**
   * 检查是否应该跳过当前帧
   */
  shouldSkipFrame(): boolean {
    if (!this.config.enableFrameSkipping) return false;
    
    const currentTime = Date.now();
    const targetFrameTime = 1000 / (this.config.maxFPS || 30);
    
    // 如果距离上一帧时间太短，跳过
    if (currentTime - this.lastFrameTime < targetFrameTime) {
      return true;
    }
    
    // 如果系统资源紧张，跳过
    if (this.isSystemUnderPressure()) {
      return true;
    }
    
    this.lastFrameTime = currentTime;
    return false;
  }

  /**
   * 检查系统是否资源紧张
   */
  isSystemUnderPressure(): boolean {
    const memoryPressure = this.metrics.memory.usage > (this.config.memoryThreshold || 0.8);
    const cpuPressure = this.metrics.cpu.usage > (this.config.cpuThreshold || 0.7);
    
    return memoryPressure || cpuPressure;
  }

  /**
   * 获取当前质量级别
   */
  getCurrentQualityLevel(): QualityLevel {
    const levels = this.config.qualityLevels || this.getDefaultQualityLevels();
    return levels[this.currentQualityLevel] || levels[1];
  }

  /**
   * 获取性能建议
   */
  getPerformanceRecommendations(): string[] {
    const recommendations: string[] = [];
    
    if (this.metrics.memory.usage > 0.8) {
      recommendations.push('内存使用率过高，建议降低界面复杂度');
    }
    
    if (this.metrics.cpu.usage > 0.7) {
      recommendations.push('CPU使用率过高，建议减少动画效果');
    }
    
    if (this.metrics.render.fps < 20) {
      recommendations.push('帧率过低，建议启用帧跳过或减少渲染内容');
    }
    
    if (this.droppedFrames > 10) {
      recommendations.push('掉帧严重，建议降低质量级别');
    }
    
    if (this.metrics.process.memory > 100 * 1024 * 1024) { // 100MB
      recommendations.push('进程内存使用过高，建议检查内存泄漏');
    }
    
    return recommendations;
  }

  /**
   * 生成性能报告
   */
  generatePerformanceReport(): string {
    const metrics = this.getMetrics();
    const recommendations = this.getPerformanceRecommendations();
    
    const report = [
      '性能监控报告',
      '================',
      '',
      '系统资源:',
      `  CPU使用率: ${(metrics.cpu.usage * 100).toFixed(1)}%`,
      `  内存使用率: ${(metrics.memory.usage * 100).toFixed(1)}%`,
      `  可用内存: ${(metrics.memory.free / 1024 / 1024).toFixed(0)}MB`,
      '',
      '渲染性能:',
      `  当前FPS: ${metrics.render.fps}`,
      `  平均帧时间: ${metrics.render.frameTime.toFixed(1)}ms`,
      `  掉帧数: ${metrics.render.droppedFrames}`,
      '',
      '进程信息:',
      `  运行时间: ${Math.round(metrics.process.uptime / 1000)}秒`,
      `  内存使用: ${(metrics.process.memory / 1024 / 1024).toFixed(1)}MB`,
      '',
      '性能建议:',
      ...recommendations.map(r => `  • ${r}`),
      '',
      '质量级别:',
      `  当前级别: ${this.getCurrentQualityLevel().name}`,
      `  更新频率: ${this.getCurrentQualityLevel().updatesPerSecond}次/秒`
    ];
    
    return report.join('\n');
  }

  /**
   * 更新性能指标
   */
  private updateMetrics(): void {
    const now = Date.now();
    const deltaTime = now - this.lastMetricsTime;
    
    // 更新CPU使用率
    this.updateCPUUsage();
    
    // 更新内存使用
    this.updateMemoryUsage();
    
    // 更新进程信息
    this.updateProcessInfo();
    
    // 记录历史数据
    this.recordHistoricalData();
    
    this.lastMetricsTime = now;
    
    // 发出更新事件
    this.emit('metricsUpdated', this.metrics);
  }

  /**
   * 更新CPU使用率
   */
  private updateCPUUsage(): void {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });
    
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 1 - idle / total;
    
    this.metrics.cpu.usage = Math.max(0, Math.min(1, usage));
    this.metrics.cpu.cores = cpus.length;
    this.metrics.cpu.loadAverage = os.loadavg();
    
    this.cpuUsage.push(this.metrics.cpu.usage);
    if (this.cpuUsage.length > 60) {
      this.cpuUsage.shift();
    }
  }

  /**
   * 更新内存使用
   */
  private updateMemoryUsage(): void {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    
    this.metrics.memory.total = total;
    this.metrics.memory.used = used;
    this.metrics.memory.free = free;
    this.metrics.memory.usage = Math.max(0, Math.min(1, used / total));
    
    this.memoryUsage.push(this.metrics.memory.usage);
    if (this.memoryUsage.length > 60) {
      this.memoryUsage.shift();
    }
  }

  /**
   * 更新进程信息
   */
  private updateProcessInfo(): void {
    const usage = process.cpuUsage();
    const memory = process.memoryUsage();
    
    this.metrics.process.uptime = Date.now() - this.startTime;
    this.metrics.process.memory = memory.rss;
    this.metrics.process.cpu = (usage.user + usage.system) / 1000000; // 转换为秒
    this.metrics.process.handles = (process as any)._getActiveHandles().length;
  }

  /**
   * 记录历史数据
   */
  private recordHistoricalData(): void {
    // 可以在这里将数据保存到文件或发送到监控服务
    // 用于长期趋势分析
  }

  /**
   * 自适应质量调整
   */
  private adaptQuality(): void {
    const levels = this.config.qualityLevels || this.getDefaultQualityLevels();
    
    // 如果性能良好，可以尝试提高质量
    if (this.metrics.render.fps > 25 && !this.isSystemUnderPressure()) {
      if (this.currentQualityLevel < levels.length - 1) {
        this.currentQualityLevel++;
        this.emit('qualityChanged', levels[this.currentQualityLevel]);
      }
    }
    
    // 如果性能不佳，降低质量
    if (this.metrics.render.fps < 15 || this.isSystemUnderPressure()) {
      if (this.currentQualityLevel > 0) {
        this.currentQualityLevel--;
        this.emit('qualityChanged', levels[this.currentQualityLevel]);
      }
    }
  }

  /**
   * 获取初始指标
   */
  private getInitialMetrics(): PerformanceMetrics {
    const total = os.totalmem();
    const free = os.freemem();
    
    return {
      cpu: {
        usage: 0,
        cores: os.cpus().length,
        loadAverage: os.loadavg()
      },
      memory: {
        total,
        used: total - free,
        free,
        usage: (total - free) / total
      },
      process: {
        uptime: 0,
        memory: 0,
        cpu: 0,
        handles: 0
      },
      render: {
        fps: 0,
        frameTime: 0,
        droppedFrames: 0
      },
      network: {
        latency: 0,
        throughput: 0
      }
    };
  }

  /**
   * 获取默认质量级别
   */
  private getDefaultQualityLevels(): QualityLevel[] {
    return [
      {
        name: '最低',
        animations: false,
        colors: false,
        updatesPerSecond: 1,
        detailLevel: 'minimal'
      },
      {
        name: '低',
        animations: false,
        colors: true,
        updatesPerSecond: 2,
        detailLevel: 'minimal'
      },
      {
        name: '中',
        animations: true,
        colors: true,
        updatesPerSecond: 5,
        detailLevel: 'normal'
      },
      {
        name: '高',
        animations: true,
        colors: true,
        updatesPerSecond: 10,
        detailLevel: 'detailed'
      },
      {
        name: '最高',
        animations: true,
        colors: true,
        updatesPerSecond: 30,
        detailLevel: 'detailed'
      }
    ];
  }

  private startTime = Date.now();
}

/**
 * 资源管理器
 */
export class ResourceManager {
  private resources: Map<string, any> = new Map();
  private cleanupInterval?: NodeJS.Timeout;
  private maxMemoryUsage: number;

  constructor(maxMemoryMB: number = 100) {
    this.maxMemoryUsage = maxMemoryMB * 1024 * 1024; // 转换为字节
  }

  /**
   * 分配资源
   */
  allocate(key: string, resource: any): void {
    this.resources.set(key, resource);
    this.checkMemoryUsage();
  }

  /**
   * 释放资源
   */
  release(key: string): void {
    const resource = this.resources.get(key);
    if (resource && typeof resource.cleanup === 'function') {
      resource.cleanup();
    }
    this.resources.delete(key);
  }

  /**
   * 获取资源
   */
  get(key: string): any {
    return this.resources.get(key);
  }

  /**
   * 清理过期资源
   */
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    this.resources.forEach((resource, key) => {
      if (resource.timestamp && (now - resource.timestamp) > 300000) { // 5分钟
        expiredKeys.push(key);
      }
    });
    
    expiredKeys.forEach(key => this.release(key));
  }

  /**
   * 检查内存使用情况
   */
  private checkMemoryUsage(): void {
    const usage = process.memoryUsage();
    if (usage.rss > this.maxMemoryUsage) {
      this.cleanup();
    }
  }

  /**
   * 开始自动清理
   */
  startAutoCleanup(intervalMs: number = 60000): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }

  /**
   * 停止自动清理
   */
  stopAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * 获取资源统计
   */
  getStats(): { total: number; memoryUsage: number } {
    return {
      total: this.resources.size,
      memoryUsage: process.memoryUsage().rss
    };
  }
}

/**
 * 缓存管理器
 */
export class CacheManager {
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  /**
   * 设置缓存
   */
  set(key: string, data: any, ttl: number = 300000): void { // 默认5分钟
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * 获取缓存
   */
  get(key: string): any {
    const item = this.cache.get(key);
    if (!item) return null;
    
    // 检查是否过期
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  /**
   * 删除缓存
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * 清理过期缓存
   */
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    this.cache.forEach((item, key) => {
      if (now - item.timestamp > item.ttl) {
        expiredKeys.push(key);
      }
    });
    
    expiredKeys.forEach(key => this.cache.delete(key));
  }

  /**
   * 开始自动清理
   */
  startAutoCleanup(intervalMs: number = 30000): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }

  /**
   * 停止自动清理
   */
  stopAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): { total: number; hitRate: number } {
    // 简化实现，实际需要记录命中率
    return {
      total: this.cache.size,
      hitRate: 0.8 // 假设命中率
    };
  }
}