import { v4 as uuidv4 } from 'uuid';
import type {
  ProjectConfig,
  Task,
  TaskType,
  Workflow,
  ToolResult,
  AgentEvent,
  AgentEventData,
  EventListener,
  ProjectAnalysis,
} from '../types/index.js';
import { TaskManager } from './task-manager.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { RoleFactory } from '../roles/index.js';
import type { RoleType } from '../types/index.js';
import pathModule from 'path';
import { fileURLToPath } from 'url';
import { getPromptLoader } from '../prompts/loader.js';
import { getLLMConfigManager, type ConfigValidationResult } from '../services/llm-config.js';
import { AgentMgr } from './agent-mgr.js';
import { EventSystem } from './events.js';
import { WorkflowEngine } from './workflow-engine.js';
import { WorkDirManager } from './work-dir-manager.js';

/**
 * 核心 Project Agent 类
 * 这是整个系统的入口点，协调各个组件完成项目管理任务
 */
export class ProjectAgent {
  private config: ProjectConfig;
  private toolRegistry: ToolRegistry;
  private taskManager: TaskManager;
  private eventSystem: EventSystem;
  private agentMgr: AgentMgr;
  private eventListeners: Map<AgentEvent, Set<EventListener>> = new Map();
  private workflows: Map<string, Workflow> = new Map();
  public workflowEngine: WorkflowEngine;
  private promptConfigPaths: string[] = [];
  private llmConfigPath: string | null = null;
  private workDirManager: WorkDirManager;

  constructor(
    config: ProjectConfig,
    configPaths?: {
      prompts?: string | string[];
      llm?: string;
    }
  ) {
    this.config = config;
    this.workDirManager = new WorkDirManager();
    this.toolRegistry = new ToolRegistry(this.workDirManager);
    this.eventSystem = new EventSystem();
    this.agentMgr = new AgentMgr(config.projectId || 'default', this.eventSystem);
    this.taskManager = new TaskManager(config, this.toolRegistry);
    this.workflowEngine = new WorkflowEngine(this);

    // 设置提示词配置路径
    if (configPaths?.prompts) {
      this.promptConfigPaths = Array.isArray(configPaths.prompts)
        ? configPaths.prompts
        : [configPaths.prompts];

      RoleFactory.setPromptConfigPaths(this.promptConfigPaths);
    }

    // 设置 LLM 配置路径
    if (configPaths?.llm) {
      this.llmConfigPath = configPaths.llm;
    }

    // 设置事件转发
    this.setupEventForwarding();
  }

  getWorkDirManager(): WorkDirManager {
    return this.workDirManager;
  }

  /**
   * 设置提示词配置路径
   */
  setPromptConfigPath(paths: string | string[]): void {
    this.promptConfigPaths = Array.isArray(paths) ? paths : [paths];
    RoleFactory.setPromptConfigPaths(this.promptConfigPaths);
  }

  /**
   * 添加提示词配置路径
   */
  addPromptConfigPath(path: string): void {
    this.promptConfigPaths.push(path);
    RoleFactory.addPromptConfigPath(path);
  }

  /**
   * 设置 LLM 配置文件路径
   */
  async setLLMConfigPath(path: string): Promise<void> {
    this.llmConfigPath = path;
    const manager = getLLMConfigManager();
    await manager.loadFromFile(path);
  }

  /**
   * 加载所有配置
   */
  async loadConfig(): Promise<void> {
    // 加载提示词配置
    if (this.promptConfigPaths.length > 0) {
      await this.loadPrompts();
    }

    // 加载 LLM 配置
    if (this.llmConfigPath) {
      const manager = getLLMConfigManager();
      await manager.loadFromFile(this.llmConfigPath);

      // 输出配置验证结果
      const validation = await manager.validateConfig();
      this.emitConfigSummary(validation);
    }
  }

  /**
   * 输出配置摘要
   */
  private emitConfigSummary(validation: ConfigValidationResult): void {
    console.log('\n' + '='.repeat(50));
    console.log('LLM 配置摘要');
    console.log('='.repeat(50));
    console.log(`\n服务商总数: ${validation.summary.totalProviders}`);
    console.log(`已启用: ${validation.summary.enabledProviders}`);
    console.log(`已配置: ${validation.summary.configuredProviders}`);
    console.log(`可用: ${validation.summary.readyToUse}`);

    if (validation.recommendations.length > 0) {
      console.log('\n需要配置:');
      validation.recommendations.forEach(rec => {
        console.log(`  - ${rec}`);
      });
    }

    if (validation.summary.readyToUse > 0) {
      console.log('\n已配置好的服务商:');
      validation.providers
        .filter(p => p.readyToUse)
        .forEach(p => {
          console.log(`  ✓ ${p.name}`);
        });
    }

    if (!validation.isValid) {
      console.log('\n提示: 请复制 .env.example 为 .env 并配置有效的 API Key');
    }
  }

  /**
   * 预加载提示词配置
   */
  async loadPrompts(): Promise<void> {
    await RoleFactory.loadPrompts();
  }

  /**
   * 切换默认 LLM 服务商
   */
  switchLLMProvider(providerName: string): boolean {
    const manager = getLLMConfigManager();
    return manager.switchDefaultProvider(providerName);
  }

  /**
   * 为角色设置专属服务商
   */
  setRoleLLMProvider(
    roleType: RoleType,
    providerName: string,
    modelName?: string
  ): boolean {
    const manager = getLLMConfigManager();
    return manager.setRoleProvider(roleType, providerName, modelName);
  }

  /**
   * 获取 LLM 配置信息
   */
  getLLMConfig() {
    const manager = getLLMConfigManager();
    return {
      settings: manager.getSettings(),
      defaultProvider: manager.getDefaultProvider(),
      providers: manager.getEnabledProviders(),
      roleMapping: manager.getSettings()?.roleMapping,
    };
  }

  /**
   * 分析项目
   */
  async analyzeProject(): Promise<ProjectAnalysis> {
    this.emit('project:analysis:started', {
      event: 'project:analysis:started',
      timestamp: new Date(),
      data: { projectPath: this.config.projectPath },
    });

    const task = this.taskManager.createTask({
      type: 'requirement-analysis',
      title: '分析项目结构',
      description: '分析项目的文件结构、技术栈和依赖关系',
      priority: 'high',
      assignedRole: 'product-manager',
      input: {
        projectPath: this.config.projectPath,
      },
    });

    const result = await this.taskManager.executeTask(task.id);

    if (!result.success) {
      throw new Error(`Project analysis failed: ${result.error}`);
    }

    this.emit('project:analysis:completed', {
      event: 'project:analysis:completed',
      timestamp: new Date(),
      data: result.data,
    });

    return result.data as ProjectAnalysis;
  }

  /**
   * 设计架构
   */
  async designArchitecture(requirements: string): Promise<any> {
    const task = this.taskManager.createTask({
      type: 'architecture-design',
      title: '设计系统架构',
      description: requirements,
      priority: 'high',
      assignedRole: 'architect',
      input: {
        requirements,
      },
    });

    const result = await this.taskManager.executeTask(task.id);

    if (!result.success) {
      throw new Error(`Architecture design failed: ${result.error}`);
    }

    return result.data;
  }

  /**
   * 开发功能
   */
  async developFeature(params: {
    title: string;
    description: string;
    requirements: string[];
    filePath?: string;
  }): Promise<ToolResult> {
    // 先进行需求分析
    const analysisTask = this.taskManager.createTask({
      type: 'requirement-analysis',
      title: `分析需求: ${params.title}`,
      description: '分析功能需求并拆解任务',
      priority: 'high',
      assignedRole: 'product-manager',
      input: {
        requirements: params.requirements,
      },
    });

    const analysisResult = await this.taskManager.executeTask(analysisTask.id);

    if (!analysisResult.success) {
      return analysisResult;
    }

    // 设计架构
    const designTask = this.taskManager.createTask({
      type: 'architecture-design',
      title: `设计架构: ${params.title}`,
      description: '设计技术实现方案',
      priority: 'high',
      assignedRole: 'architect',
      dependencies: [analysisTask.id],
      input: {
        projectInfo: analysisResult.data,
      },
    });

    const designResult = await this.taskManager.executeTask(designTask.id);

    if (!designResult.success) {
      return designResult;
    }

    // 开发实现
    const devTask = this.taskManager.createTask({
      type: 'development',
      title: `开发功能: ${params.title}`,
      description: params.description,
      priority: 'high',
      assignedRole: 'developer',
      dependencies: [designTask.id],
      input: {
        requirements: params.requirements,
        filePath: params.filePath,
        architecture: designResult.data,
      },
    });

    const devResult = await this.taskManager.executeTask(devTask.id);

    if (!devResult.success) {
      return devResult;
    }

    // 编写测试
    const testTask = this.taskManager.createTask({
      type: 'testing',
      title: `编写测试: ${params.title}`,
      description: '为功能编写测试用例',
      priority: 'medium',
      assignedRole: 'tester',
      dependencies: [devTask.id],
      input: {
        code: devResult.data?.code,
        requirements: params.requirements,
      },
    });

    const testResult = await this.taskManager.executeTask(testTask.id);

    // 更新文档
    const docTask = this.taskManager.createTask({
      type: 'documentation',
      title: `更新文档: ${params.title}`,
      description: '更新项目文档',
      priority: 'low',
      assignedRole: 'doc-writer',
      dependencies: [testTask.id],
      input: {
        feature: params.title,
        code: devResult.data?.code,
        tests: testResult.data,
      },
    });

    await this.taskManager.executeTask(docTask.id);

    return devResult;
  }

  /**
   * 执行任务
   */
  async execute(params: {
    type: TaskType;
    title: string;
    description: string;
    assignedRole?: RoleType;
    input?: any;
    constraints?: Task['constraints'];
  }): Promise<ToolResult> {
    const task = this.taskManager.createTask({
      type: params.type,
      title: params.title,
      description: params.description,
      assignedRole: params.assignedRole,
      input: params.input,
      constraints: params.constraints,
    });

    return this.taskManager.executeTask(task.id);
  }

  /**
   * 注册工作流
   */
  registerWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.id, workflow);
  }

  /**
   * 获取所有已注册的工作流
   */
  getWorkflows(): Map<string, Workflow> {
    return this.workflows;
  }

  /**
   * 执行工作流
   */
  async executeWorkflow(workflowId: string): Promise<ToolResult[]> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    this.emit('workflow:started', {
      event: 'workflow:started',
      timestamp: new Date(),
      data: { workflowId, workflow },
    });

    // 创建所有步骤的任务
    const taskMap = new Map<string, string>();
    for (const step of workflow.steps) {
      const dependencies = step.dependencies
        ? step.dependencies.map(depId => taskMap.get(depId)).filter(Boolean) as string[]
        : [];

      const task = this.taskManager.createTask({
        type: step.taskType,
        title: step.name,
        description: `工作流步骤: ${step.name}`,
        assignedRole: step.role,
        dependencies,
        constraints: step.constraints,
      });

      taskMap.set(step.id, task.id);
    }

    // 执行所有任务（按照依赖顺序）
    const taskIds = Array.from(taskMap.values());
    const results = await this.taskManager.executeTasks(taskIds, true);

    const allSuccess = results.every(r => r.success);
    this.emit(allSuccess ? 'workflow:completed' : 'workflow:failed', {
      event: allSuccess ? 'workflow:completed' : 'workflow:failed',
      timestamp: new Date(),
      data: { workflowId, results },
    });

    return results;
  }

  /**
   * 使用工具
   */
  async useTool(name: string, params: any): Promise<ToolResult> {
    return this.toolRegistry.execute(name, params);
  }

  /**
   * 获取可用工具
   */
  getAvailableTools(): string[] {
    return this.toolRegistry.getAllNames();
  }

  /**
   * 获取可用角色
   */
  getAvailableRoles(): RoleType[] {
    return RoleFactory.getAvailableRoles() as RoleType[];
  }

  /**
   * 添加事件监听器
   */
  on(event: AgentEvent, listener: EventListener): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  /**
   * 移除事件监听器
   */
  off(event: AgentEvent, listener: EventListener): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  /**
   * 触发事件
   */
  private emit(event: AgentEvent, data: AgentEventData): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      }
    }
  }

  /**
   * 设置事件转发
   */
  private setupEventForwarding(): void {
    this.taskManager.on('task:created', (data) => this.emit('task:created', data));
    this.taskManager.on('task:started', (data) => this.emit('task:started', data));
    this.taskManager.on('task:completed', (data) => this.emit('task:completed', data));
    this.taskManager.on('task:failed', (data) => this.emit('task:failed', data));
    this.taskManager.on('task:blocked', (data) => this.emit('task:blocked', data));
    this.taskManager.on('error', (data) => this.emit('error', data));

    this.toolRegistry.on('tool:executed', (data) => this.emit('tool:executed', data));
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    tasks: ReturnType<TaskManager['getStats']>;
    tools: ReturnType<ToolRegistry['getStats']>;
  } {
    return {
      tasks: this.taskManager.getStats(),
      tools: this.toolRegistry.getStats(),
    };
  }

  /**
   * 关闭 Agent
   */
  async shutdown(): Promise<void> {
    this.eventListeners.clear();
    this.workflows.clear();
  }

  /**
   * 获取配置
   */
  getConfig(): ProjectConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<ProjectConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * 获取任务管理器（用于HTTP服务器等需要直接访问的场景）
   */
  getTaskManager(): TaskManager {
    return this.taskManager;
  }

/**
    * 获取工具注册表（用于HTTP服务器等需要直接访问的场景）
    */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
    * 获取智能体管理器（用于HTTP服务器等需要直接访问的场景）
    */
  getAgentMgr(): AgentMgr {
    return this.agentMgr;
  }

/**
     * 获取事件系统（用于HTTP服务器等需要直接访问的场景）
     */
  getEventSystem(): EventSystem {
    return this.eventSystem;
  }

  }
