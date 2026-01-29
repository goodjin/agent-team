# 交互式模式使用指南

## 概述

Project Agent 现在支持**混合模式**，可以自由切换交互式和自动两种执行方式：

- **交互式模式（默认）** - 逐步确认，查看详细结果，适合调试和学习
- **自动模式** - 全自动执行，无需确认，适合批量处理和 CI/CD
- **实时进度显示** - 显示执行进度和中间结果
- **交互式会话（REPL）** - 命令行交互界面

## 交互界面

交互界面需满足以下要求：

- 输入框始终固定在最下方，并显示上下边框
- 输出内容显示在输入框上方
- 输出支持流式输出
- 输出内容需显示当前角色并跟随大模型输出内容同步展示
- 输出内容过多时限制高度并出现滚动条
- 多个角色同时运行时按顺序展示，每个角色各占一块区域

## 快速开始

### 1. 交互式模式（默认）

```typescript
import { ProjectAgent, createHybridModeManager, ExecutionMode } from 'agent-team';

const agent = new ProjectAgent(
  { projectName: 'my-app', projectPath: process.cwd() },
  { llm: './llm.config.json' }
);

await agent.loadConfig();

// 创建混合模式管理器（默认交互式）
const hybrid = createHybridModeManager(agent, {
  mode: ExecutionMode.INTERACTIVE,
  showProgress: true,
  autoConfirm: false, // 每步都需要确认
});

// 开发功能（会询问用户输入）
await hybrid.developFeature({});
```

运行：
```bash
npm run interactive
```

### 2. 自动模式

```typescript
const hybrid = createHybridModeManager(agent, {
  mode: ExecutionMode.AUTO, // 自动模式
  autoConfirm: true, // 自动确认
});

// 自动执行，无需用户确认
await hybrid.developFeature({
  title: '用户登录',
  requirements: ['邮箱登录', 'JWT token'],
});
```

### 3. 交互式会话（REPL）

启动交互式命令行界面：

```typescript
const hybrid = createHybridModeManager(agent);
await hybrid.startInteractiveSession();
```

运行：
```bash
npm run interactive:session
```

## 可用命令

在交互式会话中，可以使用以下命令：

| 命令 | 简写 | 说明 |
|------|------|------|
| `feature` | `f` | 开发新功能（交互式） |
| `task` | `t` | 执行单个任务 |
| `workflow` | `w` | 执行工作流 |
| `tool` | - | 使用工具 |
| `mode` | `m` | 切换执行模式 |
| `stats` | `s` | 查看统计信息 |
| `help` | `h` | 显示帮助 |
| `exit` | `q` | 退出程序 |

## 执行模式对比

### 交互式模式

**特点**：
- ✅ 每步都需要用户确认
- ✅ 显示详细的中间结果
- ✅ 可以跳过某些步骤
- ✅ 可以调整执行流程
- ✅ 适合调试和学习

**示例流程**：
```
1. 询问功能需求
2. 确认开始 → 显示需求分析结果
3. 确认架构设计 → 显示设计方案
4. 确认代码开发 → 显示生成的代码
5. 询问是否保存代码
6. 确认编写测试 → 显示测试用例
7. 确认更新文档 → 显示文档
```

### 自动模式

**特点**：
- ✅ 无需确认，自动执行
- ✅ 快速高效
- ✅ 适合批量处理
- ✅ 适合 CI/CD 集成
- ✅ 可以配合进度显示

**示例流程**：
```
1. 自动执行所有步骤
2. 显示实时进度
3. 完成后返回结果
```

## 实时进度显示

### 启用进度显示

```typescript
const hybrid = createHybridModeManager(agent, {
  showProgress: true, // 显示进度
  showLLMThought: false, // 是否显示 LLM 思考过程
  colorOutput: true, // 彩色输出
});
```

### 进度显示内容

- **任务进度** - 显示当前任务和步骤
- **进度条** - 显示执行进度百分比
- **LLM 调用** - 显示服务商和模型（可选）
- **工具调用** - 显示使用的工具
- **结果展示** - 显示生成的内容

## 使用场景

### 1. 开发新功能

```typescript
// 交互式 - 逐步引导
await hybrid.developFeature({});

// 自动 - 传入参数
await hybrid.developFeature({
  title: '用户认证',
  description: '实现用户登录注册',
  requirements: [
    '邮箱密码登录',
    'JWT token 认证',
    '密码加密存储',
  ],
  filePath: './src/auth/index.ts',
});
```

### 2. 执行单个任务

```typescript
await hybrid.executeTask({
  type: 'code-review',
  title: '代码审查',
  assignedRole: 'developer',
  input: {
    filePath: './src',
  },
});
```

### 3. 执行工作流

```typescript
await agent.registerWorkflow({
  id: 'feature-development',
  steps: [
    { id: 'analyze', role: 'product-manager', taskType: 'requirement-analysis' },
    { id: 'design', role: 'architect', taskType: 'architecture-design', dependencies: ['analyze'] },
    { id: 'develop', role: 'developer', taskType: 'development', dependencies: ['design'] },
  ],
});

await hybrid.executeWorkflow('feature-development');
```

### 4. 使用工具

```typescript
await hybrid.useTool('read-file', {
  filePath: './src/index.ts',
});
```

## 运行时切换模式

```typescript
// 初始为交互式
const hybrid = createHybridModeManager(agent, {
  mode: ExecutionMode.INTERACTIVE,
});

// 执行第一个功能（交互式）
await hybrid.developFeature({ title: '功能 A' });

// 切换到自动模式
hybrid.setMode(ExecutionMode.AUTO);

// 执行第二个功能（自动）
await hybrid.developFeature({ title: '功能 B' });

// 切换回交互式
hybrid.setMode(ExecutionMode.INTERACTIVE);
```

## 自定义交互式流程

```typescript
import { InteractiveCLI } from 'agent-team';

const cli = new InteractiveCLI({ colorOutput: true });

try {
  cli.title('自定义流程');

  // 询问用户
  const name = await cli.question('请输入名称: ');

  // 确认
  const confirmed = await cli.confirm('是否继续？');
  if (!confirmed) {
    cli.warn('用户取消');
    return;
  }

  // 选择
  const index = await cli.choose('选择选项', ['选项 A', '选项 B', '选项 C']);

  // 多选
  const indices = await cli.chooseMultiple('选择多个', ['A', 'B', 'C', 'D']);

  // 显示进度
  cli.showProgress(5, 10, '处理中 5/10');

  // 显示代码
  cli.code('const x = 42;');

  // 显示列表
  cli.list(['项目 1', '项目 2'], true);

} finally {
  cli.close();
}
```

## 配置选项

### HybridModeOptions

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `mode` | `ExecutionMode` | `INTERACTIVE` | 执行模式 |
| `showProgress` | `boolean` | `true` | 显示进度 |
| `showLLMThought` | `boolean` | `false` | 显示 LLM 思考过程 |
| `autoConfirm` | `boolean` | `false` | 自动确认（跳过交互） |
| `colorOutput` | `boolean` | `true` | 彩色输出 |

### ExecutionMode

```typescript
enum ExecutionMode {
  INTERACTIVE = 'interactive', // 交互式
  AUTO = 'auto',               // 自动
}
```

## 示例代码

### 完整示例：交互式功能开发

```typescript
import { ProjectAgent, createHybridModeManager, ExecutionMode } from 'agent-team';
import { config } from 'dotenv';

config();

async function main() {
  const agent = new ProjectAgent(
    {
      projectName: 'my-project',
      projectPath: process.cwd(),
    },
    {
      llm: './llm.config.json',
    }
  );

  await agent.loadConfig();

  const hybrid = createHybridModeManager(agent, {
    mode: ExecutionMode.INTERACTIVE,
    showProgress: true,
    colorOutput: true,
  });

  try {
    await hybrid.developFeature({
      title: '用户管理模块',
      description: '实现用户 CRUD 功能',
      requirements: [
        '创建用户',
        '读取用户列表',
        '更新用户信息',
        '删除用户',
      ],
      filePath: './src/users/index.ts',
    });
  } finally {
    await hybrid.shutdown();
  }
}

main().catch(console.error);
```

运行：
```bash
npm run interactive
```

### 完整示例：自动模式

```typescript
async function autoMode() {
  const agent = new ProjectAgent(...);
  await agent.loadConfig();

  const hybrid = createHybridModeManager(agent, {
    mode: ExecutionMode.AUTO,
    autoConfirm: true,
  });

  await hybrid.developFeature({
    title: '数据验证模块',
    requirements: ['字符串验证', '数字验证', '邮箱验证'],
  });

  await hybrid.shutdown();
}
```

### 完整示例：混合模式

```typescript
async function hybridMode() {
  const agent = new ProjectAgent(...);
  await agent.loadConfig();

  const hybrid = createHybridModeManager(agent);

  // 交互式开发
  await hybrid.developFeature({ title: '核心功能' });

  // 切换到自动
  hybrid.setMode(ExecutionMode.AUTO);

  // 自动开发辅助功能
  await hybrid.developFeature({ title: '辅助功能' });

  await hybrid.shutdown();
}
```

## 最佳实践

### 1. 开发阶段

使用**交互式模式**，逐步确认和调整：
```typescript
const hybrid = createHybridModeManager(agent, {
  mode: ExecutionMode.INTERACTIVE,
  autoConfirm: false,
});
```

### 2. 批量处理

使用**自动模式**，提高效率：
```typescript
const hybrid = createHybridModeManager(agent, {
  mode: ExecutionMode.AUTO,
  autoConfirm: true,
});

for (const feature of features) {
  await hybrid.developFeature(feature);
}
```

### 3. CI/CD 集成

使用**自动模式 + 进度显示**：
```typescript
const hybrid = createHybridModeManager(agent, {
  mode: ExecutionMode.AUTO,
  showProgress: true,
  colorOutput: false, // CI 环境关闭颜色
});
```

### 4. 调试问题

使用**交互式 + LLM 思考过程**：
```typescript
const hybrid = createHybridModeManager(agent, {
  mode: ExecutionMode.INTERACTIVE,
  showLLMThought: true, // 显示 LLM 思考
  showProgress: true,
});
```

## 注意事项

1. **API Key 配置** - 确保 `llm.config.json` 中配置了有效的 API key
2. **环境变量** - 使用 `.env` 文件存储敏感信息
3. **模式切换** - 可以随时切换执行模式
4. **资源清理** - 使用完毕后调用 `hybrid.shutdown()`
5. **错误处理** - 捕获并处理可能的错误

## 故障排除

### Q: 如何启用详细日志？

A: 设置 `showLLMThought: true`：
```typescript
const hybrid = createHybridModeManager(agent, {
  showLLMThought: true,
});
```

### Q: 如何跳过所有确认？

A: 设置 `autoConfirm: true`：
```typescript
const hybrid = createHybridModeManager(agent, {
  autoConfirm: true,
});
```

### Q: 如何在 CI 环境中使用？

A: 使用自动模式并关闭颜色输出：
```typescript
const hybrid = createHybridModeManager(agent, {
  mode: ExecutionMode.AUTO,
  colorOutput: false,
});
```

### Q: 如何测试 CLI 功能？

A: 运行测试脚本：
```bash
npx tsx test-interactive-cli.ts
```

## 总结

交互式模式为 Project Agent 提供了灵活的使用方式：

- ✅ **交互式模式** - 适合学习和调试
- ✅ **自动模式** - 适合批量处理
- ✅ **混合模式** - 运行时自由切换
- ✅ **实时进度** - 清晰了解执行状态
- ✅ **交互式会话** - 命令行交互界面

选择适合你的模式，提高开发效率！🚀
