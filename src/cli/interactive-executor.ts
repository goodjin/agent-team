import type { ProjectAgent } from '../core/project-agent.js';
import type { Task, Workflow, ToolResult } from '../types/index.js';
import { InteractiveCLI } from './interactive-cli.js';

/**
 * 交互式执行器
 * 在执行过程中允许用户确认和调整
 */
export class InteractiveExecutor {
  private cli: InteractiveCLI;
  private agent: ProjectAgent;

  constructor(agent: ProjectAgent, cli: InteractiveCLI) {
    this.agent = agent;
    this.cli = cli;
  }

  /**
   * 交互式开发功能
   */
  async developFeature(params: {
    title?: string;
    description?: string;
    requirements?: string[];
    filePath?: string;
  }): Promise<ToolResult> {
    this.cli.title('交互式功能开发', 2);

    // 1. 收集需求
    const requirements = await this.collectRequirements(params);

    // 2. 确认开始
    this.cli.blank();
    this.cli.section('功能概要');
    this.cli.log(`标题: ${requirements.title}`);
    this.cli.log(`描述: ${requirements.description}`);
    this.cli.blank();
    this.cli.list(requirements.requirements, true);

    const confirmed = await this.cli.confirm('\n是否开始开发？');
    if (!confirmed) {
      return { success: false, error: '用户取消操作' };
    }

    // 3. 需求分析
    this.cli.blank();
    const analysis = await this.withConfirmation(
      '需求分析',
      async () => {
        const task = this.agent['taskManager'].createTask({
          type: 'requirement-analysis',
          title: `分析需求: ${requirements.title}`,
          description: '分析功能需求并拆解任务',
          priority: 'high',
          assignedRole: 'product-manager',
          input: { requirements: requirements.requirements },
        });

        return await this.agent['taskManager'].executeTask(task.id);
      }
    );

    if (!analysis.success) {
      return analysis;
    }

    // 显示分析结果
    await this.displayAnalysisResult(analysis);

    // 4. 架构设计
    const design = await this.withConfirmation(
      '架构设计',
      async () => {
        const task = this.agent['taskManager'].createTask({
          type: 'architecture-design',
          title: `设计架构: ${requirements.title}`,
          description: '设计技术实现方案',
          priority: 'high',
          assignedRole: 'architect',
          input: { projectInfo: analysis.data },
        });

        return await this.agent['taskManager'].executeTask(task.id);
      }
    );

    if (!design.success) {
      return design;
    }

    await this.displayDesignResult(design);

    // 5. 代码开发
    const development = await this.withConfirmation(
      '代码开发',
      async () => {
        const task = this.agent['taskManager'].createTask({
          type: 'development',
          title: `开发功能: ${requirements.title}`,
          description: requirements.description || '',
          priority: 'high',
          assignedRole: 'developer',
          input: {
            requirements: requirements.requirements,
            filePath: requirements.filePath,
            architecture: design.data,
          },
        });

        return await this.agent['taskManager'].executeTask(task.id);
      }
    );

    if (!development.success) {
      return development;
    }

    await this.displayCodeResult(development);

    // 询问是否保存代码
    if (development.data?.code && requirements.filePath) {
      const saveCode = await this.cli.confirm('是否保存生成的代码？');
      if (saveCode) {
        await this.agent.useTool('write-file', {
          filePath: requirements.filePath,
          content: development.data.code,
        });
        this.cli.success(`代码已保存到: ${requirements.filePath}`);
      }
    }

    // 6. 编写测试
    const testing = await this.withConfirmation(
      '编写测试',
      async () => {
        const task = this.agent['taskManager'].createTask({
          type: 'testing',
          title: `编写测试: ${requirements.title}`,
          description: '为功能编写测试用例',
          priority: 'medium',
          assignedRole: 'tester',
          input: {
            code: development.data?.code,
            requirements: requirements.requirements,
          },
        });

        return await this.agent['taskManager'].executeTask(task.id);
      }
    );

    if (!testing.success) {
      return testing;
    }

    await this.displayTestResult(testing);

    // 7. 更新文档
    const documentation = await this.withConfirmation(
      '更新文档',
      async () => {
        const task = this.agent['taskManager'].createTask({
          type: 'documentation',
          title: `更新文档: ${requirements.title}`,
          description: '更新项目文档',
          priority: 'low',
          assignedRole: 'doc-writer',
          input: {
            feature: requirements.title,
            code: development.data?.code,
            tests: testing.data,
          },
        });

        return await this.agent['taskManager'].executeTask(task.id);
      }
    );

    if (!documentation.success) {
      return documentation;
    }

    await this.displayDocumentationResult(documentation);

    // 完成
    this.cli.blank();
    this.cli.title('开发完成', 2);
    this.cli.blank();
    this.cli.success('所有步骤已完成！');
    this.cli.blank();

    const stats = this.agent.getStats();
    this.cli.log(`总任务数: ${stats.tasks.total}`);
    this.cli.log(`成功: ${stats.tasks.byStatus.completed}`);
    this.cli.log(`失败: ${stats.tasks.byStatus.failed}`);

    return {
      success: true,
      data: {
        analysis: analysis.data,
        design: design.data,
        code: development.data,
        tests: testing.data,
        docs: documentation.data,
      },
    };
  }

  /**
   * 收集需求
   */
  private async collectRequirements(params: any): Promise<any> {
    const requirements: any = {};

    // 标题
    if (!params.title) {
      requirements.title = await this.cli.question('请输入功能标题: ');
    } else {
      requirements.title = params.title;
    }

    // 描述
    if (!params.description) {
      requirements.description = await this.cli.question('请输入功能描述: ');
    } else {
      requirements.description = params.description;
    }

    // 需求列表
    if (!params.requirements || params.requirements.length === 0) {
      this.cli.blank();
      this.cli.info('请输入功能需求（每行一个，空行结束）:');

      const reqs: string[] = [];
      while (true) {
        const req = await this.cli.question(`  需求 ${reqs.length + 1}: `);
        if (req.trim() === '') break;
        reqs.push(req);
      }

      requirements.requirements = reqs;
    } else {
      requirements.requirements = params.requirements;
    }

    // 文件路径
    if (!params.filePath) {
      const defaultPath = `./src/${this.slugify(requirements.title)}.ts`;
      requirements.filePath = await this.cli.question(
        `文件路径 (${defaultPath}): `
      );

      if (!requirements.filePath) {
        requirements.filePath = defaultPath;
      }
    } else {
      requirements.filePath = params.filePath;
    }

    return requirements;
  }

  /**
   * 执行步骤并等待用户确认
   */
  private async withConfirmation<T>(
    stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    this.cli.blank();
    this.cli.section(`步骤: ${stepName}`);

    const proceed = await this.cli.confirm(`是否继续${stepName}？`, true);

    if (!proceed) {
      const action = await this.cli.choose(
        `如何处理 ${stepName}？`,
        ['跳过此步骤', '重新配置', '取消整个流程']
      );

      if (action === 2) {
        throw new Error('用户取消操作');
      }

      if (action === 0) {
        // 跳过，返回空结果
        return {} as T;
      }

      // 重新配置 - 这里可以扩展
      return await fn();
    }

    // 执行步骤
    return await this.cli.withLoading(
      `正在${stepName}...`,
      fn
    );
  }

  /**
   * 显示需求分析结果
   */
  private async displayAnalysisResult(result: ToolResult): Promise<void> {
    this.cli.blank();
    this.cli.section('需求分析结果');

    if (result.data?.summary) {
      this.cli.log(`\n摘要:\n${result.data.summary}`);
    }

    if (result.data?.tasks) {
      this.cli.log('\n拆解的任务:');
      this.cli.list(result.data.tasks, true);
    }

    if (result.data?.acceptanceCriteria) {
      this.cli.log('\n验收标准:');
      this.cli.list(result.data.acceptanceCriteria, true);
    }
  }

  /**
   * 显示架构设计结果
   */
  private async displayDesignResult(result: ToolResult): Promise<void> {
    this.cli.blank();
    this.cli.section('架构设计结果');

    if (result.data?.architecture) {
      this.cli.log(`\n架构:\n${result.data.architecture}`);
    }

    if (result.data?.components) {
      this.cli.log('\n组件:');
      this.cli.list(result.data.components, true);
    }

    if (result.data?.dependencies) {
      this.cli.log('\n依赖:');
      Object.entries(result.data.dependencies).forEach(([name, version]) => {
        this.cli.log(`  • ${name}: ${version}`);
      });
    }
  }

  /**
   * 显示代码结果
   */
  private async displayCodeResult(result: ToolResult): Promise<void> {
    this.cli.blank();
    this.cli.section('代码生成结果');

    if (result.data?.code) {
      this.cli.code(result.data.code);
    }

    if (result.data?.explanation) {
      this.cli.log(`\n说明:\n${result.data.explanation}`);
    }

    if (result.data?.files) {
      this.cli.log('\n相关文件:');
      this.cli.list(result.data.files, true);
    }
  }

  /**
   * 显示测试结果
   */
  private async displayTestResult(result: ToolResult): Promise<void> {
    this.cli.blank();
    this.cli.section('测试结果');

    if (result.data?.testCases) {
      this.cli.log('\n测试用例:');
      result.data.testCases.forEach((testCase: any, index: number) => {
        this.cli.log(`\n${index + 1}. ${testCase.name}`);
        this.cli.log(`   描述: ${testCase.description}`);
      });
    }

    if (result.data?.coverage) {
      this.cli.log(`\n覆盖率: ${result.data.coverage}`);
    }
  }

  /**
   * 显示文档结果
   */
  private async displayDocumentationResult(result: ToolResult): Promise<void> {
    this.cli.blank();
    this.cli.section('文档结果');

    if (result.data?.documentation) {
      this.cli.log(`\n${result.data.documentation}`);
    }

    if (result.data?.updatedFiles) {
      this.cli.log('\n更新的文件:');
      this.cli.list(result.data.updatedFiles, true);
    }
  }

  /**
   * 将文本转换为 URL 友好的 slug
   */
  private slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-');
  }
}
