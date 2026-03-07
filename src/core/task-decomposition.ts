/**
 * Task Decomposition Engine
 * 将复杂需求自动拆分为可执行的子任务列表
 */

import { v4 as uuidv4 } from 'uuid';
import type { Task, TaskType, RoleType, Priority, TaskConstraints } from '../types/index.js';

/**
 * 子任务接口
 */
export interface SubTask {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  assignedRole: RoleType;
  priority: Priority;
  dependencies: string[]; // 依赖的子任务 ID
  estimatedDuration?: number; // 预估时长（毫秒）
  constraints?: TaskConstraints;
  input?: Record<string, any>;
}

/**
 * 任务分解结果
 */
export interface DecompositionResult {
  id: string;
  originalTask: string;
  tasks: SubTask[];
  metadata: {
    complexity: 'simple' | 'moderate' | 'complex';
    estimatedTotalDuration?: number;
    parallelizable: string[]; // 可以并行执行的任务组
    criticalPath: string[]; // 关键路径上的任务
  };
}

/**
 * 分解策略
 */
export interface DecompositionStrategy {
  name: string;
  description: string;
  maxDepth?: number; // 最大分解深度
  minTaskDuration?: number; // 最小任务预估时长（毫秒）
  maxTasks?: number; // 最大子任务数量
}

/**
 * 任务分解引擎配置
 */
export interface TaskDecompositionConfig {
  strategies?: DecompositionStrategy[];
  defaultRoleMapping?: Record<TaskType, RoleType>;
  enableParallelAnalysis?: boolean;
  enableComplexityEstimation?: boolean;
}

/**
 * 默认分解策略
 */
export const DEFAULT_STRATEGY: DecompositionStrategy = {
  name: 'default',
  description: 'Default task decomposition strategy',
  maxDepth: 3,
  minTaskDuration: 300000, // 5 minutes
  maxTasks: 20,
};

/**
 * 默认角色映射
 */
export const DEFAULT_ROLE_MAPPING: Record<TaskType, RoleType> = {
  'requirement-analysis': 'product-manager',
  'architecture-design': 'architect',
  'development': 'developer',
  'testing': 'tester',
  'documentation': 'doc-writer',
  'code-review': 'code-reviewer',
  'refactoring': 'developer',
  'bug-fix': 'developer',
  'custom': 'developer',
};

/**
 * 任务分解引擎
 */
export class TaskDecompositionEngine {
  private config: TaskDecompositionConfig;
  private strategies: Map<string, DecompositionStrategy>;

  constructor(config: TaskDecompositionConfig = {}) {
    this.config = config;
    this.strategies = new Map();

    // 注册默认策略
    this.strategies.set(DEFAULT_STRATEGY.name, DEFAULT_STRATEGY);

    // 注册自定义策略
    if (config.strategies) {
      for (const strategy of config.strategies) {
        this.strategies.set(strategy.name, strategy);
      }
    }
  }

  /**
   * 添加分解策略
   */
  addStrategy(strategy: DecompositionStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  /**
   * 移除分解策略
   */
  removeStrategy(name: string): void {
    if (name !== DEFAULT_STRATEGY.name) {
      this.strategies.delete(name);
    }
  }

  /**
   * 获取可用的策略名称
   */
  getStrategyNames(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * 分解任务
   * 核心方法：将复杂需求拆分为可执行的子任务列表
   */
  decompose(
    taskDescription: string,
    options: {
      strategy?: string;
      context?: Record<string, any>;
      taskType?: TaskType;
    } = {}
  ): DecompositionResult {
    const strategy = this.strategies.get(options.strategy || DEFAULT_STRATEGY.name) || DEFAULT_STRATEGY;
    const roleMapping = this.config.defaultRoleMapping || DEFAULT_ROLE_MAPPING;

    // 解析任务类型
    const taskType = options.taskType || this.inferTaskType(taskDescription);

    // 根据任务类型进行分解
    let tasks: SubTask[];

    switch (taskType) {
      case 'requirement-analysis':
        tasks = this.decomposeRequirementAnalysis(taskDescription, roleMapping, strategy);
        break;
      case 'architecture-design':
        tasks = this.decomposeArchitectureDesign(taskDescription, roleMapping, strategy);
        break;
      case 'development':
        tasks = this.decomposeDevelopment(taskDescription, roleMapping, strategy);
        break;
      case 'testing':
        tasks = this.decomposeTesting(taskDescription, roleMapping, strategy);
        break;
      case 'bug-fix':
        tasks = this.decomposeBugFix(taskDescription, roleMapping, strategy);
        break;
      default:
        tasks = this.decomposeGeneric(taskDescription, roleMapping, strategy);
    }

    // 分析并行性和关键路径
    const analysis = this.analyzeTaskGraph(tasks);

    // 估算复杂度
    const complexity = this.estimateComplexity(tasks, taskDescription);

    return {
      id: uuidv4(),
      originalTask: taskDescription,
      tasks,
      metadata: {
        complexity,
        estimatedTotalDuration: this.calculateTotalDuration(tasks),
        parallelizable: analysis.parallelizable,
        criticalPath: analysis.criticalPath,
      },
    };
  }

  /**
   * 从 Task 对象进行分解
   */
  decomposeFromTask(task: Task): DecompositionResult {
    return this.decompose(task.description, {
      taskType: task.type,
      context: task.input,
    });
  }

  /**
   * 推断任务类型
   */
  private inferTaskType(description: string): TaskType {
    const lowerDesc = description.toLowerCase();

    if (lowerDesc.includes('分析') || lowerDesc.includes('需求') || lowerDesc.includes('分析需求')) {
      return 'requirement-analysis';
    }
    if (lowerDesc.includes('架构') || lowerDesc.includes('设计') || lowerDesc.includes('架构设计')) {
      return 'architecture-design';
    }
    if (lowerDesc.includes('修复') || lowerDesc.includes('bug') || lowerDesc.includes('错误')) {
      return 'bug-fix';
    }
    if (lowerDesc.includes('测试') || lowerDesc.includes('测试用例')) {
      return 'testing';
    }
    if (lowerDesc.includes('重构') || lowerDesc.includes('优化代码')) {
      return 'refactoring';
    }
    if (lowerDesc.includes('文档') || lowerDesc.includes('文档编写')) {
      return 'documentation';
    }

    return 'development';
  }

  /**
   * 分解需求分析任务
   */
  private decomposeRequirementAnalysis(
    description: string,
    roleMapping: Record<TaskType, RoleType>,
    strategy: DecompositionStrategy
  ): SubTask[] {
    const tasks: SubTask[] = [];
    const baseId = uuidv4().slice(0, 8);

    // 任务 1: 收集需求
    tasks.push({
      id: `${baseId}-collect`,
      title: '收集和整理需求',
      description: '收集用户需求，整理需求清单',
      type: 'requirement-analysis',
      assignedRole: roleMapping['requirement-analysis'],
      priority: 'high',
      dependencies: [],
      estimatedDuration: 300000,
    });

    // 任务 2: 分析可行性
    tasks.push({
      id: `${baseId}-feasibility`,
      title: '分析需求可行性',
      description: '评估需求的技术可行性和实现难度',
      type: 'requirement-analysis',
      assignedRole: roleMapping['requirement-analysis'],
      priority: 'high',
      dependencies: [`${baseId}-collect`],
      estimatedDuration: 300000,
    });

    // 任务 3: 编写需求文档
    tasks.push({
      id: `${baseId}-document`,
      title: '编写需求规格说明书',
      description: '编写详细的需求规格说明书',
      type: 'requirement-analysis',
      assignedRole: roleMapping['requirement-analysis'],
      priority: 'medium',
      dependencies: [`${baseId}-feasibility`],
      estimatedDuration: 600000,
    });

    return tasks;
  }

  /**
   * 分解架构设计任务
   */
  private decomposeArchitectureDesign(
    description: string,
    roleMapping: Record<TaskType, RoleType>,
    strategy: DecompositionStrategy
  ): SubTask[] {
    const tasks: SubTask[] = [];
    const baseId = uuidv4().slice(0, 8);

    // 任务 1: 系统概览设计
    tasks.push({
      id: `${baseId}-overview`,
      title: '设计系统架构概览',
      description: '设计系统整体架构和模块划分',
      type: 'architecture-design',
      assignedRole: roleMapping['architecture-design'],
      priority: 'high',
      dependencies: [],
      estimatedDuration: 600000,
    });

    // 任务 2: 详细设计
    tasks.push({
      id: `${baseId}-detail`,
      title: '设计模块详细架构',
      description: '设计各模块的详细架构和技术选型',
      type: 'architecture-design',
      assignedRole: roleMapping['architecture-design'],
      priority: 'high',
      dependencies: [`${baseId}-overview`],
      estimatedDuration: 900000,
    });

    // 任务 3: 接口设计
    tasks.push({
      id: `${baseId}-api`,
      title: '设计 API 接口',
      description: '设计系统 API 接口和数据交互格式',
      type: 'architecture-design',
      assignedRole: roleMapping['architecture-design'],
      priority: 'medium',
      dependencies: [`${baseId}-detail`],
      estimatedDuration: 300000,
    });

    return tasks;
  }

  /**
   * 分解开发任务
   */
  private decomposeDevelopment(
    description: string,
    roleMapping: Record<TaskType, RoleType>,
    strategy: DecompositionStrategy
  ): SubTask[] {
    const tasks: SubTask[] = [];
    const baseId = uuidv4().slice(0, 8);

    // 任务 1: 实现核心功能
    tasks.push({
      id: `${baseId}-core`,
      title: '实现核心功能',
      description: '开发核心业务逻辑和功能',
      type: 'development',
      assignedRole: roleMapping['development'],
      priority: 'critical',
      dependencies: [],
      estimatedDuration: 1800000,
    });

    // 任务 2: 实现接口层
    tasks.push({
      id: `${baseId}-api`,
      title: '实现 API 接口',
      description: '开发 API 接口和控制器',
      type: 'development',
      assignedRole: roleMapping['development'],
      priority: 'high',
      dependencies: [`${baseId}-core`],
      estimatedDuration: 600000,
    });

    // 任务 3: 集成测试
    tasks.push({
      id: `${baseId}-integration`,
      title: '编写集成测试',
      description: '编写集成测试用例',
      type: 'testing',
      assignedRole: roleMapping['testing'],
      priority: 'medium',
      dependencies: [`${baseId}-api`],
      estimatedDuration: 600000,
    });

    return tasks;
  }

  /**
   * 分解测试任务
   */
  private decomposeTesting(
    description: string,
    roleMapping: Record<TaskType, RoleType>,
    strategy: DecompositionStrategy
  ): SubTask[] {
    const tasks: SubTask[] = [];
    const baseId = uuidv4().slice(0, 8);

    // 任务 1: 设计测试用例
    tasks.push({
      id: `${baseId}-design`,
      title: '设计测试用例',
      description: '设计测试用例和测试场景',
      type: 'testing',
      assignedRole: roleMapping['testing'],
      priority: 'high',
      dependencies: [],
      estimatedDuration: 300000,
    });

    // 任务 2: 编写单元测试
    tasks.push({
      id: `${baseId}-unit`,
      title: '编写单元测试',
      description: '编写单元测试用例',
      type: 'testing',
      assignedRole: roleMapping['testing'],
      priority: 'high',
      dependencies: [`${baseId}-design`],
      estimatedDuration: 600000,
    });

    // 任务 3: 执行测试
    tasks.push({
      id: `${baseId}-execute`,
      title: '执行测试并生成报告',
      description: '执行测试并生成测试报告',
      type: 'testing',
      assignedRole: roleMapping['testing'],
      priority: 'high',
      dependencies: [`${baseId}-unit`],
      estimatedDuration: 300000,
    });

    return tasks;
  }

  /**
   * 分解 Bug 修复任务
   */
  private decomposeBugFix(
    description: string,
    roleMapping: Record<TaskType, RoleType>,
    strategy: DecompositionStrategy
  ): SubTask[] {
    const tasks: SubTask[] = [];
    const baseId = uuidv4().slice(0, 8);

    // 任务 1: 复现问题
    tasks.push({
      id: `${baseId}-reproduce`,
      title: '复现 Bug',
      description: '尝试复现问题，确定 bug 的触发条件',
      type: 'bug-fix',
      assignedRole: roleMapping['bug-fix'],
      priority: 'critical',
      dependencies: [],
      estimatedDuration: 300000,
    });

    // 任务 2: 定位问题
    tasks.push({
      id: `${baseId}-locate`,
      title: '定位问题根因',
      description: '分析代码，找到问题的根本原因',
      type: 'bug-fix',
      assignedRole: roleMapping['bug-fix'],
      priority: 'critical',
      dependencies: [`${baseId}-reproduce`],
      estimatedDuration: 600000,
    });

    // 任务 3: 修复问题
    tasks.push({
      id: `${baseId}-fix`,
      title: '修复 Bug',
      description: '编写修复代码',
      type: 'bug-fix',
      assignedRole: roleMapping['bug-fix'],
      priority: 'critical',
      dependencies: [`${baseId}-locate`],
      estimatedDuration: 300000,
    });

    // 任务 4: 验证修复
    tasks.push({
      id: `${baseId}-verify`,
      title: '验证修复',
      description: '验证 bug 已修复且没有引入新问题',
      type: 'testing',
      assignedRole: roleMapping['testing'],
      priority: 'high',
      dependencies: [`${baseId}-fix`],
      estimatedDuration: 300000,
    });

    return tasks;
  }

  /**
   * 通用任务分解
   */
  private decomposeGeneric(
    description: string,
    roleMapping: Record<TaskType, RoleType>,
    strategy: DecompositionStrategy
  ): SubTask[] {
    const tasks: SubTask[] = [];
    const baseId = uuidv4().slice(0, 8);

    // 基础任务结构
    tasks.push({
      id: `${baseId}-analyze`,
      title: '分析任务需求',
      description: `分析任务: ${description}`,
      type: 'requirement-analysis',
      assignedRole: roleMapping['requirement-analysis'],
      priority: 'medium',
      dependencies: [],
      estimatedDuration: 300000,
    });

    tasks.push({
      id: `${baseId}-execute`,
      title: '执行任务',
      description: `执行: ${description}`,
      type: 'development',
      assignedRole: roleMapping['development'],
      priority: 'medium',
      dependencies: [`${baseId}-analyze`],
      estimatedDuration: 600000,
    });

    tasks.push({
      id: `${baseId}-verify`,
      title: '验证结果',
      description: '验证任务完成情况',
      type: 'testing',
      assignedRole: roleMapping['testing'],
      priority: 'low',
      dependencies: [`${baseId}-execute`],
      estimatedDuration: 300000,
    });

    return tasks;
  }

  /**
   * 分析任务图（并行性和关键路径）
   */
  private analyzeTaskGraph(tasks: SubTask[]): {
    parallelizable: string[];
    criticalPath: string[];
  } {
    const parallelizable: string[] = [];
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const inDegree = new Map<string, number>();
    const criticalPath: string[] = [];

    // 计算入度
    for (const task of tasks) {
      inDegree.set(task.id, task.dependencies.length);
    }

    // 找出可以并行执行的任务（入度为0且没有依赖的任务）
    for (const task of tasks) {
      if (task.dependencies.length === 0) {
        parallelizable.push(task.id);
      }
    }

    // 计算关键路径（简化版：最长依赖链）
    const getLongestPath = (taskId: string, visited: Set<string>): string[] => {
      if (visited.has(taskId)) return [];
      visited.add(taskId);

      const task = taskMap.get(taskId);
      if (!task || task.dependencies.length === 0) {
        return [taskId];
      }

      let longest: string[] = [];
      for (const depId of task.dependencies) {
        const path = getLongestPath(depId, new Set(visited));
        if (path.length > longest.length) {
          longest = path;
        }
      }

      return [...longest, taskId];
    };

    // 找到没有依赖的起始任务，从它们开始找关键路径
    const startTasks = tasks.filter(t => t.dependencies.length === 0);
    for (const startTask of startTasks) {
      const path = getLongestPath(startTask.id, new Set());
      if (path.length > criticalPath.length) {
        criticalPath.length = 0;
        criticalPath.push(...path);
      }
    }

    return { parallelizable, criticalPath };
  }

  /**
   * 估算复杂度
   */
  private estimateComplexity(
    tasks: SubTask[],
    description: string
  ): 'simple' | 'moderate' | 'complex' {
    const length = description.length;
    const taskCount = tasks.length;

    // 基于任务数量和描述长度判断
    if (taskCount <= 2 && length < 100) {
      return 'simple';
    }
    if (taskCount <= 5 && length < 500) {
      return 'moderate';
    }
    return 'complex';
  }

  /**
   * 计算总预估时长
   */
  private calculateTotalDuration(tasks: SubTask[]): number {
    return tasks.reduce((sum, task) => sum + (task.estimatedDuration || 0), 0);
  }

  /**
   * 转换为 Task 数组
   */
  toTasks(decomposition: DecompositionResult): Task[] {
    return decomposition.tasks.map(subTask => ({
      id: subTask.id,
      type: subTask.type,
      title: subTask.title,
      description: subTask.description,
      status: 'pending' as const,
      priority: subTask.priority,
      dependencies: subTask.dependencies,
      assignedRole: subTask.assignedRole,
      constraints: subTask.constraints,
      input: subTask.input,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  /**
   * 获取 JSON 格式的子任务数组
   */
  toJSON(decomposition: DecompositionResult): object[] {
    return decomposition.tasks.map(task => ({
      title: task.title,
      description: task.description,
      dependencies: task.dependencies,
      type: task.type,
      assignedRole: task.assignedRole,
      priority: task.priority,
      estimatedDuration: task.estimatedDuration,
    }));
  }
}

/**
 * 创建默认的任务分解引擎实例
 */
export function createTaskDecompositionEngine(
  config?: TaskDecompositionConfig
): TaskDecompositionEngine {
  return new TaskDecompositionEngine(config);
}
