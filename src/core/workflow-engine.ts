import type {
  Workflow,
  WorkflowStepConfig,
  WorkflowStageConfig,
  WorkflowExecution,
  WorkflowExecutionContext,
  StepExecutionResult,
  StageExecutionResult,
  WorkflowEvent,
  WorkflowTemplate,
  NextStageConfig,
  ConditionalBranch
} from '../types/workflow.js';
import type { ToolResult, Task, RoleType, TaskType, TaskConstraints } from '../types/index.js';
import type { ProjectAgent } from './project-agent.js';
import { EventEmitter } from 'events';

export class WorkflowEngine extends EventEmitter {
  private agent: ProjectAgent;
  private executions: Map<string, WorkflowExecution> = new Map();
  private workflows: Map<string, Workflow> = new Map();
  private executionCounter = 0;

  constructor(agent: ProjectAgent) {
    super();
    this.agent = agent;
    this.registerBuiltInTemplates();
  }

  private registerBuiltInTemplates(): void {
    const featureDevelopment: Omit<Workflow, 'id'> = {
      name: '功能开发',
      description: '标准功能开发流程',
      version: '1.0.0',
      steps: [
        {
          id: 'analysis',
          name: '需求分析',
          type: 'task',
          role: 'product-manager',
          taskType: 'requirement-analysis',
          description: '分析需求并创建用户故事'
        },
        {
          id: 'architecture',
          name: '架构设计',
          type: 'task',
          role: 'architect',
          taskType: 'architecture-design',
          description: '设计系统架构和技术方案',
          dependencies: ['analysis']
        },
        {
          id: 'development',
          name: '开发实现',
          type: 'task',
          role: 'developer',
          taskType: 'development',
          description: '编写代码实现功能',
          dependencies: ['architecture']
        },
        {
          id: 'testing',
          name: '测试验证',
          type: 'task',
          role: 'tester',
          taskType: 'testing',
          description: '编写测试用例并验证功能',
          dependencies: ['development']
        },
        {
          id: 'documentation',
          name: '文档编写',
          type: 'task',
          role: 'doc-writer',
          taskType: 'documentation',
          description: '编写用户和开发文档',
          dependencies: ['development']
        }
      ],
      settings: {
        continueOnFailure: false
      }
    };

    const bugFix: Omit<Workflow, 'id'> = {
      name: 'Bug修复',
      description: 'Bug分析和修复流程',
      version: '1.0.0',
      steps: [
        {
          id: 'analyze',
          name: '问题分析',
          type: 'task',
          role: 'developer',
          taskType: 'bug-fix',
          description: '分析bug原因和影响范围'
        },
        {
          id: 'fix',
          name: '代码修复',
          type: 'task',
          role: 'developer',
          taskType: 'bug-fix',
          description: '修复代码问题',
          dependencies: ['analyze']
        },
        {
          id: 'verify',
          name: '验证修复',
          type: 'task',
          role: 'tester',
          taskType: 'testing',
          description: '验证bug已修复',
          dependencies: ['fix']
        }
      ],
      settings: {
        continueOnFailure: false
      }
    };

    const refactoring: Omit<Workflow, 'id'> = {
      name: '代码重构',
      description: '代码重构流程',
      version: '1.0.0',
      steps: [
        {
          id: 'analyze',
          name: '重构分析',
          type: 'task',
          role: 'architect',
          taskType: 'refactoring',
          description: '分析需要重构的代码'
        },
        {
          id: 'plan',
          name: '重构计划',
          type: 'task',
          role: 'architect',
          taskType: 'refactoring',
          description: '制定重构计划',
          dependencies: ['analyze']
        },
        {
          id: 'refactor',
          name: '执行重构',
          type: 'task',
          role: 'developer',
          taskType: 'refactoring',
          description: '执行代码重构',
          dependencies: ['plan']
        },
        {
          id: 'test',
          name: '测试验证',
          type: 'task',
          role: 'tester',
          taskType: 'testing',
          description: '确保测试通过',
          dependencies: ['refactor']
        }
      ],
      settings: {
        continueOnFailure: false
      }
    };

    const documentation: Omit<Workflow, 'id'> = {
      name: '文档编写',
      description: '文档编写流程',
      version: '1.0.0',
      steps: [
        {
          id: 'outline',
          name: '创建大纲',
          type: 'task',
          role: 'doc-writer',
          taskType: 'documentation',
          description: '创建文档大纲'
        },
        {
          id: 'content',
          name: '编写内容',
          type: 'task',
          role: 'doc-writer',
          taskType: 'documentation',
          description: '编写文档内容',
          dependencies: ['outline']
        },
        {
          id: 'review',
          name: '审核发布',
          type: 'task',
          role: 'code-reviewer',
          taskType: 'code-review',
          description: '审核文档并发布',
          dependencies: ['content']
        }
      ],
      settings: {
        continueOnFailure: false
      }
    };

    const templates: { [key: string]: Omit<Workflow, 'id'> } = {
      'feature-development': featureDevelopment,
      'bug-fix': bugFix,
      'refactoring': refactoring,
      'documentation': documentation
    };

    for (const [key, template] of Object.entries(templates)) {
      this.workflows.set(`template-${key}`, {
        ...template,
        id: `template-${key}`
      });
    }
  }

  async createWorkflow(definition: Omit<Workflow, 'id'>): Promise<Workflow> {
    const id = `wf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const workflow: Workflow = {
      ...definition,
      id
    };

    this.validateWorkflow(workflow);
    this.workflows.set(id, workflow);
    return workflow;
  }

  getWorkflow(id: string): Workflow | undefined {
    return this.workflows.get(id);
  }

  getAllWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  updateWorkflow(id: string, updates: Partial<Workflow>): Workflow | null {
    const existing = this.workflows.get(id);
    if (!existing) return null;

    const updated: Workflow = {
      ...existing,
      ...updates,
      id
    };
    this.validateWorkflow(updated);
    this.workflows.set(id, updated);
    return updated;
  }

  deleteWorkflow(id: string): boolean {
    return this.workflows.delete(id);
  }

  private validateWorkflow(workflow: Workflow): void {
    const stepIds = new Set(workflow.steps.map(s => s.id));

    for (const step of workflow.steps) {
      if (step.dependencies) {
        for (const depId of step.dependencies) {
          if (!stepIds.has(depId)) {
            throw new Error(`Step ${step.id} has invalid dependency: ${depId}`);
          }
        }
      }
    }

    this.checkForCycles(workflow.steps);
  }

  private checkForCycles(steps: WorkflowStepConfig[]): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const visit = (stepId: string): boolean => {
      if (recursionStack.has(stepId)) {
        return true;
      }
      if (visited.has(stepId)) {
        return false;
      }

      visited.add(stepId);
      recursionStack.add(stepId);

      const step = steps.find(s => s.id === stepId);
      if (step?.dependencies) {
        for (const depId of step.dependencies) {
          if (visit(depId)) {
            return true;
          }
        }
      }

      recursionStack.delete(stepId);
      return false;
    };

    for (const step of steps) {
      if (!visited.has(step.id) && visit(step.id)) {
        throw new Error(`Circular dependency detected involving step: ${step.id}`);
      }
    }
  }

  topologicalSort(steps: WorkflowStepConfig[]): WorkflowStepConfig[] {
    const result: WorkflowStepConfig[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (step: WorkflowStepConfig): void => {
      if (temp.has(step.id)) {
        throw new Error(`Circular dependency: ${step.id}`);
      }
      if (visited.has(step.id)) {
        return;
      }

      temp.add(step.id);

      if (step.dependencies) {
        for (const depId of step.dependencies) {
          const depStep = steps.find(s => s.id === depId);
          if (depStep) {
            visit(depStep);
          }
        }
      }

      temp.delete(step.id);
      visited.add(step.id);
      result.push(step);
    };

    for (const step of steps) {
      if (!visited.has(step.id)) {
        visit(step);
      }
    }

    return result;
  }

  async executeWorkflow(
    workflowId: string,
    input?: Record<string, any>
  ): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const executionId = `exec-${Date.now()}-${++this.executionCounter}`;
    const context: WorkflowExecutionContext = {
      workflow,
      variables: new Map(Object.entries(input || {})),
      stepResults: new Map(),
      currentStep: null,
      status: 'running',
      startedAt: new Date()
    };

    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: 'running',
      context,
      results: [],
      startedAt: new Date()
    };

    this.executions.set(executionId, execution);

    this.emit('workflow:started', {
      type: 'workflow:started',
      timestamp: new Date(),
      executionId,
      data: { workflowId, workflowName: workflow.name }
    });

    try {
      const sortedSteps = this.topologicalSort(workflow.steps);

      for (const step of sortedSteps) {
        const result = await this.executeStep(execution, step);
        execution.results.push(result);

        if (result.status === 'failed' && !workflow.settings?.continueOnFailure) {
          context.status = 'failed';
          context.error = `Step ${step.name} failed: ${result.error}`;
          break;
        }
      }

      if (context.status === 'running') {
        context.status = execution.results.some(r => r.status === 'failed')
          ? 'failed'
          : 'completed';
      }

      context.completedAt = new Date();
      execution.completedAt = context.completedAt;
      execution.totalDuration = context.completedAt.getTime() - execution.startedAt.getTime();

      if (context.status === 'completed') {
        this.emit('workflow:completed', {
          type: 'workflow:completed',
          timestamp: new Date(),
          executionId,
          data: { workflowId, duration: execution.totalDuration }
        });
      } else {
        this.emit('workflow:failed', {
          type: 'workflow:failed',
          timestamp: new Date(),
          executionId,
          data: { workflowId, error: context.error }
        });
      }
    } catch (error) {
      context.status = 'failed';
      context.error = error instanceof Error ? error.message : String(error);
      context.completedAt = new Date();
      execution.completedAt = context.completedAt;
      execution.totalDuration = context.completedAt.getTime() - execution.startedAt.getTime();

      this.emit('workflow:failed', {
        type: 'workflow:failed',
        timestamp: new Date(),
        executionId,
        data: { workflowId, error: context.error }
      });
    }

    execution.status = context.status;
    return execution;
  }

  private async executeStep(
    execution: WorkflowExecution,
    step: WorkflowStepConfig
  ): Promise<StepExecutionResult> {
    const result: StepExecutionResult = {
      step,
      status: 'running',
      startedAt: new Date(),
      retryCount: 0,
      outputs: new Map()
    };

    execution.context.currentStep = step;
    execution.context.stepResults.set(step.id, result);

    this.emit('step:started', {
      type: 'step:started',
      timestamp: new Date(),
      executionId: execution.id,
      stepId: step.id,
      data: { stepName: step.name }
    });

    try {
      if (step.condition && !this.evaluateCondition(step.condition, execution.context)) {
        result.status = 'skipped';
        result.completedAt = new Date();
        result.duration = result.completedAt.getTime() - (result.startedAt?.getTime() || result.completedAt.getTime());
        return result;
      }

      const timeout = step.timeout || (this.agent.getConfig().constraints?.maxDuration as number) || 300000;

      result.result = await this.executeStepAction(step, execution.context);
      result.status = 'completed';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (step.retryPolicy && result.retryCount < step.retryPolicy.maxRetries) {
        const retryableErrors = step.retryPolicy.retryableErrors || [];
        const shouldRetry = retryableErrors.length === 0 ||
          retryableErrors.some(e => errorMessage.includes(e));

        if (shouldRetry) {
          result.retryCount++;
          await this.delay(step.retryPolicy.backoffMs * Math.pow(2, result.retryCount - 1));

          this.emit('step:retried', {
            type: 'step:retried',
            timestamp: new Date(),
            executionId: execution.id,
            stepId: step.id,
            data: { retryCount: result.retryCount }
          });

          return this.executeStep(execution, step);
        }
      }

      result.status = 'failed';
      result.error = errorMessage;
    }

    result.completedAt = new Date();
    result.duration = result.completedAt.getTime() - (result.startedAt?.getTime() || result.completedAt.getTime());

    if (result.status === 'completed') {
      this.emit('step:completed', {
        type: 'step:completed',
        timestamp: new Date(),
        executionId: execution.id,
        stepId: step.id,
        data: { stepName: step.name, duration: result.duration }
      });
    } else {
      this.emit('step:failed', {
        type: 'step:failed',
        timestamp: new Date(),
        executionId: execution.id,
        stepId: step.id,
        data: { stepName: step.name, error: result.error }
      });
    }

    return result;
  }

  private async executeStepAction(
    step: WorkflowStepConfig,
    context: WorkflowExecutionContext
  ): Promise<any> {
    switch (step.type) {
      case 'task':
        return this.executeTaskStep(step, context);

      case 'role':
        return this.executeRoleStep(step, context);

      case 'parallel':
        return this.executeParallelStep(step, context);

      case 'condition':
        return this.evaluateCondition(step.condition || 'true', context);

      case 'script':
        return this.executeScriptStep(step, context);

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  private async executeRoleStep(
    step: WorkflowStepConfig,
    context: WorkflowExecutionContext
  ): Promise<any> {
    // 使用角色执行任务
    const taskManager = this.agent.getTaskManager();
    
    // 创建任务，分配给指定角色
    const task = taskManager.createTask({
      title: step.name,
      description: step.description || `执行${step.name}步骤`,
      assignedRole: step.role,
      ownerRole: step.role,
      priority: 'medium',
      initialMessage: step.description,
    });

    // 获取任务输出
    const taskResult = await taskManager.executeTask(task.id);
    
    if (!taskResult.success) {
      throw new Error(taskResult.error || '角色执行失败');
    }
    
    return taskResult;
  }

  private async executeTaskStep(
    step: WorkflowStepConfig,
    context: WorkflowExecutionContext
  ): Promise<ToolResult> {
    const stepOutputs: Record<string, any> = {};

    if (step.dependencies) {
      for (const depId of step.dependencies) {
        const depResult = context.stepResults.get(depId);
        if (depResult?.result) {
          stepOutputs[depId] = depResult.result;
          if (depResult.result.data) {
            stepOutputs[depId] = depResult.result.data;
          }
        }
      }
    }

    const task: Task = {
      id: `task-${Date.now()}`,
      type: step.taskType as TaskType || 'development',
      title: step.name,
      description: step.description || '',
      status: 'pending',
      priority: 'medium',
      dependencies: step.dependencies,
      assignedRole: step.role as RoleType,
      input: {
        variables: Object.fromEntries(context.variables),
        stepConfig: step.config,
        stepOutputs
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await this.agent.execute(task);

    if (result.success && result.data) {
      context.variables.set(`step.${step.id}.output`, result.data);
      context.variables.set(`step.${step.id}.success`, true);
    } else if (!result.success) {
      context.variables.set(`step.${step.id}.success`, false);
      context.variables.set(`step.${step.id}.error`, result.error);
    }

    return result;
  }

  private async executeParallelStep(
    step: WorkflowStepConfig,
    context: WorkflowExecutionContext
  ): Promise<any[]> {
    const childSteps = this.workflows.get(context.workflow.id)?.steps.filter(
      s => s.dependencies?.includes(step.id)
    ) || [];

    const results: any[] = [];

    for (const childStep of childSteps) {
      const result = await this.executeStep(
        { ...context.workflow as any, id: `temp-${Date.now()}` } as any,
        childStep
      );
      results.push(result);
    }

    return results;
  }

  private evaluateCondition(
    condition: string,
    context: WorkflowExecutionContext
  ): boolean {
    try {
      const variables = Object.fromEntries(context.variables);
      const fn = new Function('variables', `return ${condition}`);
      return fn(variables);
    } catch {
      return false;
    }
  }

  private async executeScriptStep(
    step: WorkflowStepConfig,
    context: WorkflowExecutionContext
  ): Promise<any> {
    if (!step.script) {
      throw new Error('Script step requires script property');
    }

    const variables = Object.fromEntries(context.variables);
    const fn = new Function('variables', 'return ' + step.script);
    return fn(variables);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getExecution(id: string): WorkflowExecution | undefined {
    return this.executions.get(id);
  }

  getExecutionsByWorkflow(workflowId: string): WorkflowExecution[] {
    return Array.from(this.executions.values()).filter(
      e => e.workflowId === workflowId
    );
  }

  cancelExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (!execution) return false;

    execution.status = 'cancelled';
    execution.context.status = 'cancelled';
    execution.context.completedAt = new Date();
    execution.completedAt = new Date();
    execution.totalDuration =
      execution.completedAt.getTime() - execution.startedAt.getTime();

    this.emit('workflow:cancelled', {
      type: 'workflow:cancelled',
      timestamp: new Date(),
      executionId,
      data: { workflowId: execution.workflowId }
    });

    return true;
  }

  getTemplates(): WorkflowTemplate[] {
    return [
      {
        id: 'feature-development',
        name: '功能开发',
        description: '标准功能开发流程：需求分析 → 架构设计 → 开发 → 测试 → 文档',
        category: 'development',
        workflow: this.workflows.get('template-feature-development')!
      },
      {
        id: 'bug-fix',
        name: 'Bug修复',
        description: 'Bug分析和修复流程：问题分析 → 代码修复 → 验证修复',
        category: 'maintenance',
        workflow: this.workflows.get('template-bug-fix')!
      },
      {
        id: 'refactoring',
        name: '代码重构',
        description: '代码重构流程：重构分析 → 重构计划 → 执行重构 → 测试验证',
        category: 'maintenance',
        workflow: this.workflows.get('template-refactoring')!
      },
      {
        id: 'documentation',
        name: '文档编写',
        description: '文档编写流程：创建大纲 → 编写内容 → 审核发布',
        category: 'documentation',
        workflow: this.workflows.get('template-documentation')!
      }
    ];
  }

  // ============ Stage-based Workflow 执行方法 ============

  /**
   * 执行基于Stage的工作流
   */
  async executeStageWorkflow(
    workflowId: string,
    input?: Record<string, any>
  ): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (!workflow.stages || workflow.stages.length === 0) {
      throw new Error(`Workflow ${workflowId} has no stages defined`);
    }

    const executionId = `exec-${Date.now()}-${++this.executionCounter}`;
    const context: WorkflowExecutionContext = {
      workflow,
      variables: new Map(Object.entries(input || {})),
      stepResults: new Map(),
      currentStep: null,
      status: 'running',
      startedAt: new Date()
    };

    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: 'running',
      context,
      results: [],
      startedAt: new Date()
    };

    this.executions.set(executionId, execution);

    this.emit('workflow:started', {
      type: 'workflow:started',
      timestamp: new Date(),
      executionId,
      data: { workflowId, workflowName: workflow.name, mode: 'stage' }
    });

    try {
      // 按order排序stages
      const sortedStages = [...workflow.stages].sort((a, b) => a.order - b.order);

      // 追踪已完成的stages
      const completedStages = new Set<string>();

      for (const stage of sortedStages) {
        // 检查入口条件
        if (!this.checkEntryCriteria(stage, context, completedStages)) {
          this.emit('step:skipped', {
            type: 'step:skipped',
            timestamp: new Date(),
            executionId,
            stepId: stage.id,
            data: { stageName: stage.name, reason: 'entry criteria not met' }
          });
          continue;
        }

        // 执行stage
        const stageResult = await this.executeStage(execution, stage, context);
        const stepResult: StepExecutionResult = {
          step: {
            id: stage.id,
            name: stage.name,
            type: 'task',
            role: stage.roles[0] || 'developer',
            description: stage.description
          },
          status: stageResult.status === 'completed' ? 'completed' : stageResult.status,
          startedAt: stageResult.startedAt,
          completedAt: stageResult.completedAt,
          duration: stageResult.duration,
          result: stageResult.result,
          error: stageResult.error,
          retryCount: 0,
          outputs: stageResult.outputs
        };
        execution.results.push(stepResult);

        if (stageResult.status === 'failed' && !workflow.settings?.continueOnFailure) {
          context.status = 'failed';
          context.error = `Stage ${stage.name} failed: ${stageResult.error}`;
          break;
        }

        if (stageResult.status === 'completed') {
          completedStages.add(stage.id);
        }
      }

      if (context.status === 'running') {
        context.status = execution.results.some(r => r.status === 'failed')
          ? 'failed'
          : 'completed';
      }

      context.completedAt = new Date();
      execution.completedAt = context.completedAt;
      execution.totalDuration = context.completedAt.getTime() - execution.startedAt.getTime();

      if (context.status === 'completed') {
        this.emit('workflow:completed', {
          type: 'workflow:completed',
          timestamp: new Date(),
          executionId,
          data: { workflowId, duration: execution.totalDuration, mode: 'stage' }
        });
      } else {
        this.emit('workflow:failed', {
          type: 'workflow:failed',
          timestamp: new Date(),
          executionId,
          data: { workflowId, error: context.error }
        });
      }
    } catch (error) {
      context.status = 'failed';
      context.error = error instanceof Error ? error.message : String(error);
      context.completedAt = new Date();
      execution.completedAt = context.completedAt;
      execution.totalDuration = context.completedAt.getTime() - execution.startedAt.getTime();

      this.emit('workflow:failed', {
        type: 'workflow:failed',
        timestamp: new Date(),
        executionId,
        data: { workflowId, error: context.error }
      });
    }

    execution.status = context.status;
    return execution;
  }

  /**
   * 检查入口条件
   */
  private checkEntryCriteria(
    stage: WorkflowStageConfig,
    context: WorkflowExecutionContext,
    completedStages: Set<string>
  ): boolean {
    if (!stage.entryCriteria || stage.entryCriteria.length === 0) {
      return true;
    }

    for (const criteria of stage.entryCriteria) {
      // 检查依赖的stage是否已完成
      if (criteria.startsWith('stage:')) {
        const requiredStageId = criteria.substring(6);
        if (!completedStages.has(requiredStageId)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 执行单个Stage
   */
  private async executeStage(
    execution: WorkflowExecution,
    stage: WorkflowStageConfig,
    context: WorkflowExecutionContext
  ): Promise<StageExecutionResult> {
    const result: StageExecutionResult = {
      stageId: stage.id,
      status: 'running',
      startedAt: new Date(),
      outputs: new Map()
    };

    this.emit('step:started', {
      type: 'step:started',
      timestamp: new Date(),
      executionId: execution.id,
      stepId: stage.id,
      data: { stageName: stage.name, roles: stage.roles }
    });

    try {
      const timeout = stage.timeout || 300000;

      // 如果有steps配置，执行steps
      if (stage.steps && stage.steps.length > 0) {
        if (stage.parallel) {
          // 并行执行
          const parallelResults = await this.executeParallelStages(
            execution,
            stage.steps,
            context
          );
          result.result = parallelResults;
        } else {
          // 顺序执行
          for (const step of stage.steps) {
            const stepResult = await this.executeStep(execution, step);
            result.stepResults?.push(stepResult);

            if (stepResult.status === 'failed') {
              result.status = 'failed';
              result.error = `Step ${step.name} failed: ${stepResult.error}`;
              break;
            }
          }
        }
      } else if (stage.taskConfig) {
        // 直接执行任务配置
        const task: Task = {
          id: `task-${Date.now()}`,
          type: stage.taskConfig.type,
          title: stage.name,
          description: stage.description || '',
          status: 'pending',
          priority: 'medium',
          assignedRole: stage.roles[0] as RoleType,
          input: {
            variables: Object.fromEntries(context.variables),
            ...stage.taskConfig.input
          },
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const taskResult = await this.agent.execute(task);

        if (taskResult.success) {
          result.result = taskResult.data;
          context.variables.set(`stage.${stage.id}.output`, taskResult.data);
        } else {
          result.status = 'failed';
          result.error = taskResult.error;
        }
      }

      // 检查出口条件
      if (result.status === 'running' && stage.exitCriteria) {
        const exitMet = this.checkExitCriteria(stage, context, result);
        if (!exitMet) {
          result.status = 'failed';
          result.error = 'Exit criteria not met';
        }
      }

      // 处理条件分支
      if (stage.conditionals && stage.conditionals.length > 0 && result.status === 'completed') {
        const nextStage = this.evaluateConditionals(stage.conditionals, context, result);
        if (nextStage) {
          result.outputs.set('nextStage', nextStage);
        }
      }

      if (result.status === 'running') {
        result.status = 'completed';
      }
    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);
    }

    result.completedAt = new Date();
    result.duration = result.completedAt.getTime() - result.startedAt!.getTime();

    if (result.status === 'completed') {
      this.emit('step:completed', {
        type: 'step:completed',
        timestamp: new Date(),
        executionId: execution.id,
        stepId: stage.id,
        data: { stageName: stage.name, duration: result.duration }
      });
    } else {
      this.emit('step:failed', {
        type: 'step:failed',
        timestamp: new Date(),
        executionId: execution.id,
        stepId: stage.id,
        data: { stageName: stage.name, error: result.error }
      });
    }

    return result;
  }

  /**
   * 检查出口条件
   */
  private checkExitCriteria(
    stage: WorkflowStageConfig,
    context: WorkflowExecutionContext,
    result: StageExecutionResult
  ): boolean {
    if (!stage.exitCriteria || stage.exitCriteria.length === 0) {
      return true;
    }

    for (const criteria of stage.exitCriteria) {
      // 可以扩展更多条件检查逻辑
      if (criteria === 'task.completed') {
        if (result.status !== 'completed') return false;
      }
    }

    return true;
  }

  /**
   * 评估条件分支
   */
  private evaluateConditionals(
    conditionals: ConditionalBranch[],
    context: WorkflowExecutionContext,
    result: StageExecutionResult
  ): NextStageConfig | null {
    for (const branch of conditionals) {
      try {
        const variables = {
          ...Object.fromEntries(context.variables),
          result: result.result,
          status: result.status
        };
        const fn = new Function('variables', `return ${branch.condition}`);
        if (fn(variables)) {
          return {
            stageId: branch.targetStageId,
            condition: branch.condition,
            label: branch.name
          };
        }
      } catch {
        // 忽略评估错误
      }
    }
    return null;
  }

  /**
   * 并行执行stages
   */
  private async executeParallelStages(
    execution: WorkflowExecution,
    steps: WorkflowStepConfig[],
    context: WorkflowExecutionContext
  ): Promise<any[]> {
    const promises = steps.map(step => this.executeStep(execution, step));
    return Promise.all(promises);
  }

  /**
   * 创建带Stage的工作流
   */
  async createStageWorkflow(definition: Omit<Workflow, 'id'>): Promise<Workflow> {
    const id = `wf-stage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const workflow: Workflow = {
      ...definition,
      id
    };

    this.validateStageWorkflow(workflow);
    this.workflows.set(id, workflow);
    return workflow;
  }

  /**
   * 验证Stage工作流
   */
  private validateStageWorkflow(workflow: Workflow): void {
    if (!workflow.stages || workflow.stages.length === 0) {
      throw new Error('Stage workflow must have at least one stage');
    }

    const stageIds = new Set(workflow.stages.map(s => s.id));

    // 验证stage引用有效
    for (const stage of workflow.stages) {
      if (stage.nextStages) {
        for (const next of stage.nextStages) {
          if (!stageIds.has(next.stageId)) {
            throw new Error(`Stage ${stage.id} references invalid next stage: ${next.stageId}`);
          }
        }
      }

      if (stage.conditionals) {
        for (const conditional of stage.conditionals) {
          if (!stageIds.has(conditional.targetStageId)) {
            throw new Error(`Stage ${stage.id} has conditional to invalid stage: ${conditional.targetStageId}`);
          }
        }
      }
    }

    // 检查循环依赖
    this.checkStageCycles(workflow.stages);
  }

  /**
   * 检查Stage循环依赖
   */
  private checkStageCycles(stages: WorkflowStageConfig[]): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const visit = (stageId: string): boolean => {
      if (recursionStack.has(stageId)) return true;
      if (visited.has(stageId)) return false;

      visited.add(stageId);
      recursionStack.add(stageId);

      const stage = stages.find(s => s.id === stageId);
      if (stage?.nextStages) {
        for (const next of stage.nextStages) {
          if (visit(next.stageId)) return true;
        }
      }

      recursionStack.delete(stageId);
      return false;
    };

    for (const stage of stages) {
      if (!visited.has(stage.id) && visit(stage.id)) {
        throw new Error(`Circular dependency detected involving stage: ${stage.id}`);
      }
    }
  }
}
