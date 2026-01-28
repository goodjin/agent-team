/**
 * 交互式模式示例
 * 演示如何使用混合模式（交互式/自动）进行项目开发
 */

import { ProjectAgent, createHybridModeManager, ExecutionMode } from '../src/index.js';
import { config } from 'dotenv';

// 加载环境变量
config();

/**
 * 交互式模式示例（默认）
 */
async function interactiveModeExample() {
  console.log('\n🚀 启动交互式模式\n');

  // 创建 Project Agent
  const agent = new ProjectAgent(
    {
      projectName: 'interactive-demo',
      projectPath: process.cwd(),
    },
    {
      llm: './llm.config.json',
    }
  );

  // 加载配置
  await agent.loadConfig();

  // 创建混合模式管理器（默认交互式）
  const hybrid = createHybridModeManager(agent, {
    mode: ExecutionMode.INTERACTIVE, // 交互式模式
    showProgress: true,
    showLLMThought: false,
    autoConfirm: false, // 每步都需要确认
    colorOutput: true,
  });

  try {
    // 方式 1: 直接开发功能（完全交互式）
    await hybrid.developFeature({
      title: '用户登录功能',
      description: '实现基于邮箱和密码的用户登录',
      requirements: [
        '用户可以使用邮箱和密码登录',
        '登录成功后返回 JWT token',
        '包含输入验证',
      ],
      filePath: './src/auth/login.ts',
    });
  } finally {
    await hybrid.shutdown();
  }
}

/**
 * 自动模式示例
 */
async function autoModeExample() {
  console.log('\n🚀 启动自动模式\n');

  // 创建 Project Agent
  const agent = new ProjectAgent(
    {
      projectName: 'auto-demo',
      projectPath: process.cwd(),
    },
    {
      llm: './llm.config.json',
    }
  );

  // 加载配置
  await agent.loadConfig();

  // 创建混合模式管理器（自动模式）
  const hybrid = createHybridModeManager(agent, {
    mode: ExecutionMode.AUTO, // 自动模式
    showProgress: true,
    showLLMThought: false,
    autoConfirm: true, // 自动确认，跳过所有交互
    colorOutput: true,
  });

  try {
    // 自动执行，无需用户确认
    await hybrid.developFeature({
      title: '数据验证模块',
      description: '实现通用的数据验证功能',
      requirements: [
        '支持字符串验证',
        '支持数字验证',
        '支持邮箱验证',
        '支持自定义验证规则',
      ],
      filePath: './src/utils/validator.ts',
    });
  } finally {
    await hybrid.shutdown();
  }
}

/**
 * 混合模式示例（运行时切换）
 */
async function hybridModeExample() {
  console.log('\n🚀 启动混合模式\n');

  // 创建 Project Agent
  const agent = new ProjectAgent(
    {
      projectName: 'hybrid-demo',
      projectPath: process.cwd(),
    },
    {
      llm: './llm.config.json',
    }
  );

  // 加载配置
  await agent.loadConfig();

  // 创建混合模式管理器
  const hybrid = createHybridModeManager(agent, {
    mode: ExecutionMode.INTERACTIVE, // 初始为交互式
    showProgress: true,
    colorOutput: true,
  });

  try {
    // 1. 使用交互式模式开发第一个功能
    console.log('\n=== 功能 1: 交互式开发 ===\n');
    await hybrid.developFeature({
      title: '用户注册功能',
      description: '实现用户注册',
      requirements: ['邮箱注册', '密码加密'],
      filePath: './src/auth/register.ts',
    });

    // 2. 切换到自动模式
    console.log('\n=== 切换到自动模式 ===\n');
    hybrid.setMode(ExecutionMode.AUTO);

    // 3. 自动执行第二个功能
    console.log('\n=== 功能 2: 自动开发 ===\n');
    await hybrid.developFeature({
      title: '密码重置功能',
      description: '实现密码重置',
      requirements: ['发送重置邮件', '验证 token'],
      filePath: './src/auth/reset-password.ts',
    });

    // 4. 切换回交互式模式
    console.log('\n=== 切换回交互式模式 ===\n');
    hybrid.setMode(ExecutionMode.INTERACTIVE);

    // 5. 执行单个任务（交互式）
    console.log('\n=== 单个任务: 代码审查 ===\n');
    await hybrid.executeTask({
      type: 'code-review',
      title: '审查认证模块代码',
      assignedRole: 'developer',
      input: {
        filePath: './src/auth',
      },
    });
  } finally {
    await hybrid.shutdown();
  }
}

/**
 * 交互式会话示例（REPL）
 */
async function interactiveSessionExample() {
  console.log('\n🚀 启动交互式会话\n');

  // 创建 Project Agent
  const agent = new ProjectAgent(
    {
      projectName: 'session-demo',
      projectPath: process.cwd(),
    },
    {
      llm: './llm.config.json',
    }
  );

  // 加载配置
  await agent.loadConfig();

  // 创建混合模式管理器
  const hybrid = createHybridModeManager(agent, {
    mode: ExecutionMode.INTERACTIVE,
    showProgress: true,
    colorOutput: true,
  });

  try {
    // 启动交互式会话（REPL）
    await hybrid.startInteractiveSession();
  } finally {
    await hybrid.shutdown();
  }
}

/**
 * 自定义交互式流程
 */
async function customInteractiveExample() {
  const { InteractiveCLI } = await import('../src/cli/index.js');

  // 创建自定义 CLI
  const cli = new InteractiveCLI({
    showProgress: true,
    colorOutput: true,
  });

  try {
    cli.title('自定义交互式流程');

    // 1. 询问用户需求
    cli.blank();
    const featureName = await cli.question('请输入功能名称: ');
    const description = await cli.question('请输入功能描述: ');

    cli.blank();
    cli.section('功能概要');
    cli.log(`名称: ${featureName}`);
    cli.log(`描述: ${description}`);

    // 2. 询问是否继续
    cli.blank();
    const confirmed = await cli.confirm('是否继续开发？');
    if (!confirmed) {
      cli.warn('用户取消操作');
      return;
    }

    // 3. 选择角色
    cli.blank();
    const roleIndex = await cli.choose(
      '选择执行角色',
      ['产品经理', '架构师', '开发者', '测试工程师', '文档编写者']
    );

    const roles = ['product-manager', 'architect', 'developer', 'tester', 'doc-writer'];
    const selectedRole = roles[roleIndex];

    cli.success(`已选择: ${selectedRole}`);

    // 4. 显示进度
    cli.blank();
    cli.section('执行任务');
    for (let i = 1; i <= 5; i++) {
      cli.showProgress(i, 5, `步骤 ${i}/5`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    cli.blank();
    cli.success('任务完成！');

  } finally {
    cli.close();
  }
}

/**
 * 实时进度显示示例
 */
async function progressDisplayExample() {
  const { ProjectAgent } = await import('../src/core/index.js');
  const { ProgressDisplay, InteractiveCLI } = await import('../src/cli/index.js');

  // 创建 CLI
  const cli = new InteractiveCLI({ showProgress: true });

  // 创建 Agent
  const agent = new ProjectAgent(
    {
      projectName: 'progress-demo',
      projectPath: process.cwd(),
    },
    {
      llm: './llm.config.json',
    }
  );

  await agent.loadConfig();

  // 创建进度显示器
  const progress = new ProgressDisplay(cli);
  progress.bindTo(agent);

  try {
    // 执行任务时会自动显示进度
    cli.title('实时进度显示示例');

    await agent.execute({
      type: 'development',
      title: '示例任务',
      assignedRole: 'developer',
    });

    cli.blank();
    cli.success('任务完成！');
  } finally {
    cli.close();
    await agent.shutdown();
  }
}

// 主函数
async function main() {
  const example = process.argv[2] || 'interactive';

  switch (example) {
    case 'interactive':
      await interactiveModeExample();
      break;

    case 'auto':
      await autoModeExample();
      break;

    case 'hybrid':
      await hybridModeExample();
      break;

    case 'session':
      await interactiveSessionExample();
      break;

    case 'custom':
      await customInteractiveExample();
      break;

    case 'progress':
      await progressDisplayExample();
      break;

    default:
      console.log('用法: npm run interactive [interactive|auto|hybrid|session|custom|progress]');
      console.log('');
      console.log('示例:');
      console.log('  npm run interactive interactive  - 交互式模式');
      console.log('  npm run interactive auto        - 自动模式');
      console.log('  npm run interactive hybrid      - 混合模式（运行时切换）');
      console.log('  npm run interactive session     - 交互式会话（REPL）');
      console.log('  npm run interactive custom      - 自定义交互式流程');
      console.log('  npm run interactive progress    - 实时进度显示');
      break;
  }
}

// 运行示例
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
