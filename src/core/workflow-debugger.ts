import readline from 'readline';
import type { Workflow, WorkflowStep, ToolResult } from '../types/index.js';
import type { ProjectAgent } from './project-agent.js';

/**
 * 工作流调试器状态
 */
export interface WorkflowDebuggerState {
  workflow: Workflow | null;
  stepResults: Map<string, ToolResult>;
  breakpoints: Set<string>;
  currentStepIndex: number;
}

/**
 * 工作流调试器
 * 提供工作流可视化、单步执行、状态检查等功能
 */
export class WorkflowDebugger {
  private agent: ProjectAgent;
  private state: WorkflowDebuggerState;

  constructor(agent: ProjectAgent) {
    this.agent = agent;
    this.state = {
      workflow: null,
      stepResults: new Map(),
      breakpoints: new Set(),
      currentStepIndex: 0,
    };
  }

  /**
   * 加载工作流
   */
  loadWorkflow(workflowId: string): Workflow | null {
    // 从 Agent 获取工作流
    const workflows = this.getAllWorkflows();
    this.state.workflow = workflows.get(workflowId) || null;
    this.state.stepResults.clear();
    this.state.currentStepIndex = 0;
    return this.state.workflow;
  }

  /**
   * 获取所有已注册的工作流
   */
  private getAllWorkflows(): Map<string, Workflow> {
    return this.agent.getWorkflows();
  }

  /**
   * 可视化工作流结构
   */
  visualize(): string {
    const workflow = this.state.workflow;
    if (!workflow) {
      return '工作流未加载。请先使用 loadWorkflow() 加载工作流。';
    }

    const lines: string[] = [];
    lines.push('');
    lines.push(`工作流: ${workflow.name}`);
    lines.push(`ID: ${workflow.id}`);
    lines.push(`描述: ${workflow.description || '无'}`);
    lines.push(`步骤数: ${workflow.steps.length}`);
    lines.push('');
    lines.push('步骤流程:');
    lines.push('─'.repeat(60));

    // 按依赖关系排序
    const sortedSteps = this.topologicalSort(workflow.steps);

    for (const step of sortedSteps) {
      const status = this.getStepStatus(step);
      const prefix = status === 'completed' ? '✓' : status === 'failed' ? '✗' : status === 'in-progress' ? '▶' : '○';
      const indent = '  '.repeat(step.dependencies?.length || 0);

      lines.push(`${prefix} ${step.name}`);
      lines.push(`  角色: ${step.role}`);
      lines.push(`  类型: ${step.taskType}`);

      if (step.dependencies && step.dependencies.length > 0) {
        lines.push(`  依赖: ${step.dependencies.join(', ')}`);
      }

      // 显示执行结果
      const result = this.state.stepResults.get(step.id);
      if (result) {
        const resultIcon = result.success ? '✓' : '✗';
        lines.push(`  结果: ${resultIcon}`);
        if (result.error) {
          lines.push(`  错误: ${result.error}`);
        }
      }

      if (this.state.breakpoints.has(step.id)) {
        lines.push(`  断点: 已设置`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 获取步骤列表
   */
  listSteps(): WorkflowStep[] {
    if (!this.state.workflow) {
      return [];
    }
    return this.topologicalSort(this.state.workflow.steps);
  }

  /**
   * 获取步骤状态
   */
  getStepStatus(step: WorkflowStep): 'pending' | 'in-progress' | 'completed' | 'failed' {
    const result = this.state.stepResults.get(step.id);
    if (!result) return 'pending';
    if (result.success) return 'completed';
    return 'failed';
  }

  /**
   * 设置断点
   */
  setBreakpoint(stepId: string): boolean {
    if (!this.state.workflow) {
      return false;
    }

    const step = this.state.workflow.steps.find(s => s.id === stepId);
    if (!step) {
      return false;
    }

    this.state.breakpoints.add(stepId);
    return true;
  }

  /**
   * 移除断点
   */
  removeBreakpoint(stepId: string): boolean {
    return this.state.breakpoints.delete(stepId);
  }

  /**
   * 列出所有断点
   */
  listBreakpoints(): string[] {
    return Array.from(this.state.breakpoints);
  }

  /**
   * 清除所有断点
   */
  clearBreakpoints(): void {
    this.state.breakpoints.clear();
  }

  /**
   * 单步执行工作流
   */
  async stepExecute(stepId?: string): Promise<ToolResult> {
    if (!this.state.workflow) {
      throw new Error('工作流未加载');
    }

    const sortedSteps = this.topologicalSort(this.state.workflow.steps);

    // 如果没有指定 stepId，执行下一个未执行的步骤
    let targetStep: WorkflowStep | undefined;
    if (stepId) {
      targetStep = sortedSteps.find(s => s.id === stepId);
    } else {
      targetStep = sortedSteps.find(s => this.getStepStatus(s) === 'pending');
    }

    if (!targetStep) {
      throw new Error('没有可执行的步骤');
    }

    // 检查依赖是否完成
    if (targetStep.dependencies) {
      for (const depId of targetStep.dependencies) {
        const depResult = this.state.stepResults.get(depId);
        if (!depResult?.success) {
          throw new Error(`依赖步骤 ${depId} 未成功完成`);
        }
      }
    }

    // 执行步骤
    const result = await this.agent.execute({
      type: targetStep.taskType as any,
      title: targetStep.name,
      description: `工作流步骤: ${targetStep.name}`,
      assignedRole: targetStep.role as any,
    });

    this.state.stepResults.set(targetStep.id, result);
    return result;
  }

  /**
   * 带断点的执行
   */
  async executeWithBreakpoints(
    onBreakpoint?: (step: WorkflowStep) => Promise<void>
  ): Promise<ToolResult[]> {
    if (!this.state.workflow) {
      throw new Error('工作流未加载');
    }

    const results: ToolResult[] = [];
    const sortedSteps = this.topologicalSort(this.state.workflow.steps);

    for (const step of sortedSteps) {
      // 检查断点
      if (this.state.breakpoints.has(step.id)) {
        console.log(`\n⏸️  断点暂停: ${step.name}`);

        if (onBreakpoint) {
          await onBreakpoint(step);
        } else {
          await this.waitForEnter();
        }
      }

      const result = await this.stepExecute(step.id);
      results.push(result);

      if (!result.success) {
        console.log(`\n❌ 步骤失败: ${step.name}`);
        console.log(`错误: ${result.error}`);
        break;
      }
    }

    return results;
  }

  /**
   * 跳转到指定步骤
   */
  async jumpToStep(stepId: string): Promise<ToolResult> {
    if (!this.state.workflow) {
      throw new Error('工作流未加载');
    }

    const sortedSteps = this.topologicalSort(this.state.workflow.steps);
    const targetIndex = sortedSteps.findIndex(s => s.id === stepId);

    if (targetIndex === -1) {
      throw new Error(`步骤不存在: ${stepId}`);
    }

    // 执行到目标步骤之前的所有步骤
    for (let i = 0; i < targetIndex; i++) {
      const step = sortedSteps[i];
      if (this.getStepStatus(step) === 'pending') {
        await this.stepExecute(step.id);
      }
    }

    // 执行目标步骤
    return await this.stepExecute(stepId);
  }

  /**
   * 重置工作流状态
   */
  reset(): void {
    this.state.stepResults.clear();
    this.state.currentStepIndex = 0;
  }

  /**
   * 导出工作流状态
   */
  exportState(): object {
    return {
      workflow: this.state.workflow,
      stepResults: Object.fromEntries(this.state.stepResults),
      breakpoints: Array.from(this.state.breakpoints),
      currentStepIndex: this.state.currentStepIndex,
    };
  }

  /**
   * 导入工作流状态
   */
  importState(state: object): void {
    const stateObj = state as any;
    if (stateObj.workflow) {
      this.state.workflow = stateObj.workflow;
    }
    if (stateObj.stepResults) {
      this.state.stepResults = new Map(Object.entries(stateObj.stepResults));
    }
    if (stateObj.breakpoints) {
      this.state.breakpoints = new Set(stateObj.breakpoints);
    }
    if (typeof stateObj.currentStepIndex === 'number') {
      this.state.currentStepIndex = stateObj.currentStepIndex;
    }
  }

  /**
   * 获取当前工作流
   */
  getCurrentWorkflow(): Workflow | null {
    return this.state.workflow;
  }

  /**
   * 获取步骤结果
   */
  getStepResult(stepId: string): ToolResult | undefined {
    return this.state.stepResults.get(stepId);
  }

  /**
   * 获取所有步骤结果
   */
  getAllStepResults(): Map<string, ToolResult> {
    return new Map(this.state.stepResults);
  }

  /**
   * 检查工作流是否完成
   */
  isCompleted(): boolean {
    if (!this.state.workflow) {
      return false;
    }

    for (const step of this.state.workflow.steps) {
      const result = this.state.stepResults.get(step.id);
      if (!result?.success) {
        return false;
      }
    }

    return true;
  }

  /**
   * 检查工作流是否失败
   */
  isFailed(): boolean {
    if (!this.state.workflow) {
      return false;
    }

    for (const step of this.state.workflow.steps) {
      const result = this.state.stepResults.get(step.id);
      if (result && !result.success) {
        return true;
      }
    }

    return false;
  }

  /**
   * 拓扑排序（按依赖关系排序步骤）
   */
  private topologicalSort(steps: WorkflowStep[]): WorkflowStep[] {
    const result: WorkflowStep[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (step: WorkflowStep) => {
      if (temp.has(step.id)) {
        throw new Error(`检测到循环依赖: ${step.id}`);
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

  /**
   * 等待用户输入
   */
  private waitForEnter(): Promise<void> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question('按 Enter 继续...', () => {
        rl.close();
        resolve();
      });
    });
  }
}

/**
 * 交互式工作流调试会话
 */
export class InteractiveWorkflowDebugger {
  private debugger: WorkflowDebugger;
  private running: boolean = false;

  constructor(agent: ProjectAgent) {
    this.debugger = new WorkflowDebugger(agent);
  }

  /**
   * 启动交互式调试会话
   */
  async start(workflowId: string): Promise<void> {
    this.running = true;

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║           Project Agent - 工作流调试器                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const workflow = this.debugger.loadWorkflow(workflowId);
    if (!workflow) {
      console.log(`❌ 未找到工作流: ${workflowId}`);
      return;
    }

    console.log('\n✅ 工作流已加载');
    console.log(this.debugger.visualize());

    await this.runREPL();
  }

  /**
   * 运行 REPL 循环
   */
  private async runREPL(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    while (this.running) {
      const input = await this.askQuestion(rl, '\n调试器> ');

      if (!input) continue;

      const trimmed = input.trim().toLowerCase();

      if (trimmed === 'exit' || trimmed === 'quit' || trimmed === 'q') {
        console.log('再见！');
        break;
      }

      await this.handleCommand(input, rl);
    }

    rl.close();
  }

  /**
   * 处理调试命令
   */
  private async handleCommand(input: string, rl: readline.Interface): Promise<void> {
    const parts = input.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
      switch (command) {
        case 'help':
        case 'h':
          this.showHelp();
          break;

        case 'list':
        case 'ls':
          console.log(this.debugger.visualize());
          break;

        case 'step':
        case 's':
          await this.debugger.stepExecute();
          console.log(this.debugger.visualize());
          break;

        case 'run':
        case 'r':
          await this.debugger.executeWithBreakpoints();
          console.log(this.debugger.visualize());
          break;

        case 'break':
        case 'b':
          if (args.length > 0) {
            const stepId = args[0];
            if (this.debugger.setBreakpoint(stepId)) {
              console.log(`✅ 断点已设置: ${stepId}`);
            } else {
              console.log(`❌ 无法设置断点: ${stepId}`);
            }
          } else {
            console.log('用法: break <步骤ID>');
          }
          break;

        case 'breakpoints':
        case 'bl':
          const breakpoints = this.debugger.listBreakpoints();
          if (breakpoints.length > 0) {
            console.log('当前断点:');
            breakpoints.forEach(id => console.log(`  - ${id}`));
          } else {
            console.log('没有设置断点');
          }
          break;

        case 'clear':
        case 'c':
          this.debugger.clearBreakpoints();
          console.log('✅ 所有断点已清除');
          break;

        case 'reset':
          this.debugger.reset();
          console.log('✅ 工作流状态已重置');
          console.log(this.debugger.visualize());
          break;

        case 'status':
          const completed = this.debugger.isCompleted();
          const failed = this.debugger.isFailed();
          if (completed) {
            console.log('✅ 工作流已完成');
          } else if (failed) {
            console.log('❌ 工作流执行失败');
          } else {
            console.log('⏳ 工作流执行中...');
          }
          break;

        case 'result':
        case 'res':
          if (args.length > 0) {
            const result = this.debugger.getStepResult(args[0]);
            if (result) {
              console.log(`步骤 ${args[0]} 的结果:`);
              console.log(JSON.stringify(result, null, 2));
            } else {
              console.log(`未找到步骤结果: ${args[0]}`);
            }
          } else {
            console.log('所有步骤结果:');
            const results = this.debugger.getAllStepResults();
            results.forEach((result, stepId) => {
              console.log(`  ${stepId}: ${result.success ? '✓' : '✗'}`);
            });
          }
          break;

        case 'export':
        case 'e':
          const state = this.debugger.exportState();
          console.log('工作流状态:');
          console.log(JSON.stringify(state, null, 2));
          break;

        default:
          console.log(`未知命令: ${command}`);
          console.log('输入 "help" 查看可用命令');
      }
    } catch (error) {
      console.log(`❌ 错误: ${error}`);
    }
  }

  /**
   * 显示帮助信息
   */
  private showHelp(): void {
    console.log('\n可用命令:');
    console.log('  help, h      - 显示此帮助信息');
    console.log('  list, ls     - 显示工作流结构');
    console.log('  step, s      - 执行下一个步骤');
    console.log('  run, r       - 执行所有步骤（遇到断点暂停）');
    console.log('  break <id>   - 设置断点');
    console.log('  breakpoints  - 列出所有断点');
    console.log('  clear        - 清除所有断点');
    console.log('  reset        - 重置工作流状态');
    console.log('  status       - 检查工作流状态');
    console.log('  result [id]  - 查看步骤结果');
    console.log('  export       - 导出工作流状态');
    console.log('  exit, quit   - 退出调试器');
  }

  /**
   * 询问用户
   */
  private askQuestion(rl: readline.Interface, prompt: string): Promise<string> {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  }

  /**
   * 停止调试会话
   */
  stop(): void {
    this.running = false;
  }
}
