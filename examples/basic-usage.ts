/**
 * Project Agent 基本使用示例
 *
 * 本示例展示 Project Agent 的核心功能和使用方法，包括：
 * 1. 创建 ProjectAgent 实例并加载配置
 * 2. 监听任务生命周期事件
 * 3. 使用 developFeature() 开发新功能
 * 4. 使用 execute() 执行单个任务
 * 5. 使用 useTool() 调用工具
 * 6. 注册和执行工作流
 * 7. 创建自定义角色和工具
 *
 * 运行方式：npx tsx examples/basic-usage.ts [basic|workflow|custom-role|custom-tool]
 */

import { ProjectAgent } from '../src/index.js';
import { config } from 'dotenv';

// 加载环境变量
// dotenv 会自动读取 .env 文件并注入到 process.env 中
config();

/**
 * ============================================================
 * 示例 1：基本 API 使用
 * ============================================================
 * 展示 ProjectAgent 的核心使用方法：
 * - 实例创建和配置加载
 * - 事件监听
 * - 功能开发
 * - 工具使用
 */
async function basicExample() {
  // ============================================================
  // 步骤 1：创建 ProjectAgent 实例
  // ============================================================
  //
  // ProjectAgent 是整个系统的入口类，它管理：
  // - 配置（LLM、提示词等）
  // - 任务（创建、执行、监控）
  // - 工具（文件操作、Git 操作等）
  // - 事件（任务状态变化等）
  //
  // 构造函数参数说明：
  // - projectConfig: 项目配置对象
  //   - projectName: 项目名称（用于标识和日志）
  //   - projectPath: 项目路径（工具执行的根目录）
  // - runtimeConfig: 运行时配置
  //   - llm: LLM 配置文件路径（支持单个路径或路径数组）
  //   - prompts: 提示词配置路径（可选）
  //
  // 注意：这里不传入 llmConfig，LLM 配置会从 llm.config.json 加载
  const agent = new ProjectAgent(
    {
      projectName: 'my-awesome-project',
      projectPath: process.cwd(),
    },
    {
      llm: './llm.config.json', // LLM 配置文件路径
    }
  );

  // ============================================================
  // 步骤 2：加载配置（必须调用）
  // ============================================================
  //
  // loadConfig() 方法会：
  // 1. 加载 LLM 配置（从 llm.config.json）
  // 2. 加载提示词配置（从 prompts 目录）
  // 3. 验证配置有效性
  // 4. 初始化 LLM 服务
  //
  // 必须在执行任何任务之前调用此方法
  await agent.loadConfig();

  // ============================================================
  // 步骤 3：注册事件监听器（可选但推荐）
  // ============================================================
  //
  // ProjectAgent 提供了事件系统，可以监听：
  // - 任务生命周期事件（created, started, completed, failed, blocked）
  // - 工具执行事件（before-execute, after-execute, error）
  // - 工作流事件（started, completed, failed）
  // - 系统事件（error）
  //
  // 事件监听对于监控任务进度、日志记录、错误处理非常有用
  //
  // 监听任务开始事件
  agent.on('task:started', (data) => {
    console.log(`[事件] 任务开始: ${data.data.task.title}`);
  });

  // 监听任务完成事件
  agent.on('task:completed', (data) => {
    console.log(`[事件] 任务完成: ${data.data.task.title}`);
    console.log(`  耗时: ${data.data.duration}ms`);
  });

  // 监听任务失败事件
  agent.on('task:failed', (data) => {
    console.error(`[事件] 任务失败: ${data.data.task.title}`);
    if (data.data.result?.error) {
      console.error(`  错误: ${data.data.result.error}`);
    }
  });

  // 监听任务阻塞事件
  agent.on('task:blocked', (data) => {
    console.warn(`[事件] 任务阻塞: ${data.data.task.title}`);
    console.warn(`  等待依赖: ${data.data.blockingDependencies.join(', ')}`);
  });

  try {
    // ============================================================
    // 步骤 4：开发新功能
    // ============================================================
    //
    // developFeature() 是最常用的方法，它执行完整的开发流程：
    // 1. 需求分析（产品经理角色）
    // 2. 架构设计（架构师角色）
    // 3. 代码实现（开发者角色）
    // 4. 编写测试（测试工程师角色）
    // 5. 更新文档（文档编写者角色）
    //
    // 参数说明：
    // - title: 功能标题
    // - description: 功能描述
    // - requirements: 需求列表（LLM 会据此生成代码）
    // - filePath: 生成代码的保存路径
    //
    // 返回值：
    // - success: 是否成功
    // - data: 包含 code（代码）、tests（测试）、docs（文档）等
    // - error: 错误信息（如果失败）
    console.log('\n=== 开发新功能 ===');

    const result = await agent.developFeature({
      title: '实现用户登录功能',
      description: '实现基于邮箱和密码的用户登录功能，包含 JWT token 管理',
      requirements: [
        '用户可以使用邮箱和密码登录',
        '登录成功后返回 JWT token',
        '支持 token 刷新机制',
        '包含输入验证和错误处理',
      ],
      filePath: './src/auth/login.ts',
    });

    if (result.success) {
      console.log('功能开发成功！');
      // result.data 包含生成的代码、测试等
      if (result.data?.code) {
        console.log(`生成的代码长度: ${result.data.code.length} 字符`);
      }
    } else {
      console.error(`功能开发失败: ${result.error}`);
    }

    // ============================================================
    // 步骤 5：执行单个任务
    // ============================================================
    //
    // execute() 方法用于执行单个任务，适合以下场景：
    // - 只做代码审查
    // - 只写测试
    // - 只更新文档
    // - 执行自定义任务
    //
    // 参数说明：
    // - type: 任务类型（如 code-review, testing, documentation）
    // - title: 任务标题
    // - description: 任务描述
    // - assignedRole: 执行任务的角色（可选，默认使用任务类型对应的角色）
    // - input: 任务输入数据
    //
    // 返回值：与 developFeature 类似，包含 success、data、error
    console.log('\n=== 执行单个任务：代码审查 ===');

    const reviewResult = await agent.execute({
      type: 'code-review',
      title: '',
      description:审查登录模块代码 '审查登录模块的代码质量、安全性和最佳实践',
      assignedRole: 'developer',
      input: {
        filePath: './src/auth/login.ts',
        reviewAspects: [
          '代码质量',
          '安全性',
          '性能',
          '可维护性',
          '测试覆盖',
        ],
      },
    });

    if (reviewResult.success) {
      console.log('代码审查完成！');
      if (reviewResult.data?.report) {
        console.log('审查报告:', reviewResult.data.report);
      }
    } else {
      console.error(`代码审查失败: ${reviewResult.error}`);
    }

    // ============================================================
    // 步骤 6：使用工具
    // ============================================================
    //
    // useTool() 方法用于直接调用工具，适合：
    // - 文件操作（读取、写入、搜索、删除）
    // - Git 操作（查看状态、提交、分支管理）
    //
    // 第一个参数是工具名称，第二个参数是工具参数
    //
    // 常用文件工具：
    // - read-file: 读取文件内容
    // - write-file: 写入文件内容
    // - search-files: 使用 glob 模式搜索文件
    // - delete-file: 删除文件或目录
    // - list-directory: 列出目录内容
    //
    // 常用 Git 工具：
    // - git-status: 查看 Git 状态
    // - git-commit: 创建提交
    // - git-branch: 管理分支
    // - git-pull: 拉取更新
    // - git-push: 推送代码
    console.log('\n=== 使用工具 ===');

    // 读取文件
    const fileResult = await agent.useTool('read-file', {
      filePath: './src/auth/login.ts',
    });

    if (fileResult.success) {
      console.log('文件读取成功！');
      console.log(`文件大小: ${fileResult.data?.size} bytes`);
      console.log(`文件编码: ${fileResult.data?.encoding}`);
    } else {
      console.error(`文件读取失败: ${fileResult.error}`);
    }

    // 搜索文件
    const searchResult = await agent.useTool('search-files', {
      pattern: '**/*.ts',
      options: {
        ignore: ['node_modules/**', 'dist/**'],
      },
    });

    if (searchResult.success) {
      console.log(`找到 ${searchResult.data?.count || 0} 个 TypeScript 文件`);
    }

    // ============================================================
    // 步骤 7：获取统计信息
    // ============================================================
    //
    // getStats() 返回当前会话的统计信息，包括：
    // - tasks: 任务统计（总数、状态分布、类型分布）
    // - tools: 工具统计（总数、分类统计、危险工具列表）
    console.log('\n=== 统计信息 ===');

    const stats = agent.getStats();

    console.log('任务统计:');
    console.log(`  总数: ${stats.tasks.total}`);
    console.log(`  待执行: ${stats.tasks.byStatus.pending}`);
    console.log(`  进行中: ${stats.tasks.byStatus['in-progress']}`);
    console.log(`  已完成: ${stats.tasks.byStatus.completed}`);
    console.log(`  失败: ${stats.tasks.byStatus.failed}`);

    console.log('工具统计:');
    console.log(`  总数: ${stats.tools.totalTools}`);
    Object.entries(stats.tools.toolsByCategory).forEach(([category, count]) => {
      console.log(`  - ${category}: ${count}`);
    });

  } catch (error) {
    // 捕获并处理异常
    console.error('发生错误:', error);
  } finally {
    // ============================================================
    // 步骤 8：关闭 Agent（必须调用）
    // ============================================================
    //
    // shutdown() 方法会：
    // 1. 取消所有进行中的任务
    // 2. 清理事件监听器
    // 3. 关闭 LLM 服务连接
    // 4. 释放系统资源
    //
    // 建议在 finally 块中调用，确保即使发生错误也能正确清理
    await agent.shutdown();
    console.log('\nAgent 已关闭');
  }
}

/**
 * ============================================================
 * 示例 2：工作流注册与执行
 * ============================================================
 * 展示如何注册自定义工作流并执行：
 * - 定义工作流步骤
 * - 配置步骤依赖关系
 * - 执行完整工作流
 */
async function workflowExample() {
  // 创建 ProjectAgent 实例
  // 与 basicExample 不同，这里直接传入 llmConfig
  const agent = new ProjectAgent({
    projectName: 'workflow-example',
    projectPath: '/path/to/project',
    // 直接配置 LLM（也可以使用配置文件）
    llmConfig: {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: 'claude-3-opus-20240229',
    },
  });

  await agent.loadConfig();

  // ============================================================
  // 注册完整功能开发工作流
  // ============================================================
  //
  // 工作流由多个步骤组成，每个步骤可以指定：
  // - id: 步骤唯一标识（用于依赖引用）
  // - name: 步骤名称（显示用）
  // - role: 执行角色（product-manager, architect, developer, tester, doc-writer）
  // - taskType: 任务类型
  // - dependencies: 依赖的步骤 ID（可选）
  //
  // 依赖关系说明：
  // - 如果步骤 A 依赖步骤 B，则 A 会在 B 完成后才开始执行
  // - 没有依赖关系的步骤可以并行执行
  // - 系统会自动解析依赖顺序
  agent.registerWorkflow({
    id: 'full-feature-development',
    name: '完整功能开发流程',
    description: '从需求分析到文档更新的完整功能开发流程',
    steps: [
      {
        id: 'analyze',
        name: '需求分析',
        role: 'product-manager',
        taskType: 'requirement-analysis',
        // 无依赖，可以立即执行
      },
      {
        id: 'design',
        name: '架构设计',
        role: 'architect',
        taskType: 'architecture-design',
        dependencies: ['analyze'],  // 依赖需求分析
      },
      {
        id: 'develop',
        name: '代码实现',
        role: 'developer',
        taskType: 'development',
        dependencies: ['design'],  // 依赖架构设计
      },
      {
        id: 'test',
        name: '编写测试',
        role: 'tester',
        taskType: 'testing',
        dependencies: ['develop'],  // 依赖代码实现
      },
      {
        id: 'document',
        name: '更新文档',
        role: 'doc-writer',
        taskType: 'documentation',
        dependencies: ['test'],  // 依赖测试完成
      },
    ],
  });

  try {
    // ============================================================
    // 执行工作流
    // ============================================================
    //
    // executeWorkflow() 方法会：
    // 1. 按照依赖关系排序步骤
    // 2. 并行执行无依赖的步骤
    // 3. 等待依赖完成后执行后续步骤
    // 4. 收集所有步骤的结果
    //
    // 参数：工作流 ID
    // 返回值：步骤结果数组
    console.log('\n=== 执行工作流 ===');

    const results = await agent.executeWorkflow('full-feature-development');

    console.log('\n工作流执行结果:');
    results.forEach((result, index) => {
      const status = result.success ? '成功' : '失败';
      console.log(`步骤 ${index + 1}: ${status}`);
      if (!result.success && result.error) {
        console.log(`  错误: ${result.error}`);
      }
    });

  } finally {
    await agent.shutdown();
  }
}

/**
 * ============================================================
 * 示例 3：自定义角色
 * ============================================================
 * 展示如何创建和使用自定义角色：
 * - 继承 BaseRole 基类
  * - 定义角色属性和职责
  * - 实现任务处理逻辑
 * - 注册自定义角色
 * - 使用自定义角色执行任务
 */
async function customRoleExample() {
  // 导入需要的类
  const { BaseRole } = await import('../src/roles/index.js');
  const { RoleFactory } = await import('../src/roles/index.js');
  const { ProjectAgent } = await import('../src/index.js');

  // ============================================================
  // 创建自定义安全专家角色
  // ============================================================
  //
  // 角色定义说明：
  // - id: 角色唯一标识
  // - name: 角色名称
  // - type: 角色类型（custom 表示自定义角色）
  // - description: 角色描述
  // - responsibilities: 职责列表
  // - capabilities: 能力列表
  // - constraints: 约束条件
  // - outputFormat: 输出格式说明
  // - systemPrompt: 系统提示词（可选，如果没有会使用默认模板）
  class SecurityExpert extends BaseRole {
    constructor(llmService: any) {
      const definition = {
        id: 'security-expert',
        name: '安全专家',
        type: 'custom' as const,
        description: '专业的网络安全专家，擅长代码安全审查和漏洞检测',
        responsibilities: [
          '审查代码安全问题',
          '检测潜在漏洞',
          '提供安全修复建议',
          '验证安全补丁',
        ],
        capabilities: [
          'SQL注入检测',
          'XSS漏洞检测',
          'CSRF防护',
          '认证授权检查',
          '敏感数据泄露检测',
        ],
        constraints: [
          '必须遵循OWASP Top 10',
          '必须考虑最小权限原则',
          '必须验证所有输入',
          '必须使用安全的加密算法',
        ],
        outputFormat: '输出安全审查报告，包括发现的问题、风险等级和修复建议',
        systemPrompt: '',  // 使用默认模板
      };

      super(definition, llmService);
    }

    /**
     * 构建任务提示词
     *
     * @param task - 任务对象，包含 input 中的数据
     * @param context - 执行上下文
     * @returns 格式化后的提示词
     */
    protected buildTaskPrompt(task: any, context: any): string {
      return `请对以下代码进行安全审查：

${task.input?.code || ''}

请按照以下格式输出审查结果：
1. 发现的问题列表
2. 每个问题的风险等级（高/中/低）
3. 修复建议
`;
    }

    /**
     * 处理 LLM 响应
     *
     * @param response - LLM 返回的响应
     * @param task - 任务对象
     * @param context - 执行上下文
     * @returns 处理后的结果
     */
    protected async processResponse(response: any, task: any, context: any): Promise<any> {
      // 解析 LLM 返回的安全审查结果
      return {
        report: response.content,
        issues: [],  // 从响应中解析安全问题
        recommendations: [],  // 从响应中提取修复建议
      };
    }
  }

  // 注册自定义角色到工厂
  RoleFactory.registerRole('security-expert', SecurityExpert);

  // 使用自定义角色
  const agent = new ProjectAgent({
    projectName: 'security-audit',
    projectPath: '/path/to/project',
    llmConfig: {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: 'claude-3-opus-20240229',
    },
  });

  await agent.loadConfig();

  // 执行安全审查任务，使用自定义角色
  const result = await agent.execute({
    type: 'code-review',
    title: '安全审查',
    description: '对代码进行安全审查',
    assignedRole: 'security-expert',  // 使用自定义角色
    input: {
      code: `
function login(username, password) {
  const query = "SELECT * FROM users WHERE username = '" + username + "'";
  // ...
}
      `,
    },
  });

  if (result.success) {
    console.log('安全审查完成！');
    console.log('审查报告:', result.data?.report);
  } else {
    console.error(`安全审查失败: ${result.error}`);
  }

  await agent.shutdown();
}

/**
 * ============================================================
 * 示例 4：自定义工具
 * ============================================================
 * 展示如何创建和使用自定义工具：
 * - 继承 BaseTool 基类
 * - 定义工具属性
 * - 实现工具执行逻辑
 * - 注册自定义工具
 * - 使用自定义工具
 */
async function customToolExample() {
  // 导入需要的类
  const { BaseTool } = await import('../src/tools/index.js');
  const { ProjectAgent } = await import('../src/index.js');
  const { z } = await import('zod');

  // ============================================================
  // 创建自定义代码格式化工具
  // ============================================================
  //
  // 工具定义说明：
  // - name: 工具名称
  // - description: 工具描述
  // - category: 工具类别（file, git, code, test, deploy, custom）
  // - execute: 执行函数
  // - schema: 参数验证 schema（使用 Zod）
  // - dangerous: 是否是危险操作
  class PrettierTool extends BaseTool {
    constructor() {
      const definition = {
        name: 'prettier-format',
        description: '使用 Prettier 格式化代码',
        category: 'code' as const,
        execute: async (params: any) => this.executeImpl(params),
        schema: z.object({
          filePath: z.string(),  // 必填：文件路径
          options: z.object({}).optional(),  // 可选：格式化选项
        }),
        dangerous: false,  // 格式化操作是安全的
      };

      super(definition);
    }

    /**
     * 工具执行逻辑
     *
     * @param params - 工具参数（已通过 schema 验证）
     * @returns 执行结果
     */
    protected async executeImpl(params: { filePath: string; options?: any }): Promise<any> {
      // 实际实现会调用 prettier API
      // 这里简化处理
      try {
        // 模拟格式化过程
        console.log(`格式化文件: ${params.filePath}`);

        return {
          success: true,
          data: {
            formatted: true,
            filePath: params.filePath,
          },
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    }
  }

  const agent = new ProjectAgent({
    projectName: 'custom-tools',
    projectPath: '/path/to/project',
    llmConfig: {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: 'claude-3-opus-20240229',
    },
  });

  await agent.loadConfig();

  // 注册自定义工具
  // agent.toolRegistry.register(new PrettierTool());

  // 使用自定义工具
  const result = await agent.useTool('prettier-format', {
    filePath: './src/example.ts',
  });

  if (result.success) {
    console.log('格式化成功！');
  } else {
    console.error(`格式化失败: ${result.error}`);
  }

  await agent.shutdown();
}

// ============================================================
// 运行示例
// ============================================================
//
// 支持通过命令行参数选择要运行的示例：
// - basic: 基本使用示例（默认）
// - workflow: 工作流示例
// - custom-role: 自定义角色示例
// - custom-tool: 自定义工具示例
if (import.meta.url === `file://${process.argv[1]}`) {
  const example = process.argv[2] || 'basic';

  switch (example) {
    case 'basic':
      basicExample().catch(console.error);
      break;
    case 'workflow':
      workflowExample().catch(console.error);
      break;
    case 'custom-role':
      customRoleExample().catch(console.error);
      break;
    case 'custom-tool':
      customToolExample().catch(console.error);
      break;
    default:
      console.log('用法: npx tsx examples/basic-usage.ts [basic|workflow|custom-role|custom-tool]');
  }
}
