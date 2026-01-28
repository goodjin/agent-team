# Project Agent 快速入门指南

这是一个基于角色的多智能体项目管理系统，通过定义不同的专家角色来完成项目分析、需求设计、架构设计、开发执行、测试和文档等任务。

## 安装

```bash
npm install project-agent
```

或者克隆仓库：

```bash
git clone <repository-url>
cd project-agent
npm install
npm run build
```

## 基础配置

创建一个 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，添加你的 API 密钥：

```env
ANTHROPIC_API_KEY=your_key_here
# 或者使用 OpenAI
OPENAI_API_KEY=your_key_here
```

## 快速开始

### 1. 创建你的第一个 Agent

```typescript
import { ProjectAgent } from 'project-agent';

const agent = new ProjectAgent({
  projectName: 'my-app',
  projectPath: '/path/to/project',
  llmConfig: {
    provider: 'anthropic', // 或 'openai'
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-opus-20240229',
  },
});
```

### 2. 开发一个新功能

```typescript
const result = await agent.developFeature({
  title: '实现用户认证',
  description: '实现基于 JWT 的用户认证系统',
  requirements: [
    '支持邮箱密码注册',
    '支持邮箱密码登录',
    '登录后返回 JWT token',
    '支持 token 刷新',
  ],
});

if (result.success) {
  console.log('功能开发成功！');
  console.log(result.data.code); // 生成的代码
  console.log(result.data.tests); // 生成的测试
}
```

### 3. 执行单个任务

```typescript
// 需求分析
const analysis = await agent.execute({
  type: 'requirement-analysis',
  title: '分析用户需求',
  description: '分析并整理用户认证功能的需求',
  assignedRole: 'product-manager',
  input: {
    requirements: [
      '用户可以注册账户',
      '用户可以登录',
      '登录后保持会话',
    ],
  },
});

// 架构设计
const design = await agent.execute({
  type: 'architecture-design',
  title: '设计认证系统架构',
  description: '设计用户认证系统的技术架构',
  assignedRole: 'architect',
  input: {
    requirements: analysis.data,
  },
});

// 开发实现
const code = await agent.execute({
  type: 'development',
  title: '实现认证接口',
  description: '实现用户认证的 API 接口',
  assignedRole: 'developer',
  input: {
    architecture: design.data,
    requirements: ['实现注册接口', '实现登录接口'],
  },
});
```

### 4. 使用工作流

```typescript
// 注册工作流
agent.registerWorkflow({
  id: 'feature-development',
  name: '功能开发工作流',
  description: '完整的功能开发流程',
  steps: [
    {
      id: 'analyze',
      name: '需求分析',
      role: 'product-manager',
      taskType: 'requirement-analysis',
    },
    {
      id: 'design',
      name: '架构设计',
      role: 'architect',
      taskType: 'architecture-design',
      dependencies: ['analyze'],
    },
    {
      id: 'develop',
      name: '代码实现',
      role: 'developer',
      taskType: 'development',
      dependencies: ['design'],
    },
    {
      id: 'test',
      name: '编写测试',
      role: 'tester',
      taskType: 'testing',
      dependencies: ['develop'],
    },
    {
      id: 'document',
      name: '更新文档',
      role: 'doc-writer',
      taskType: 'documentation',
      dependencies: ['test'],
    },
  ],
});

// 执行工作流
const results = await agent.executeWorkflow('feature-development');
```

### 5. 直接使用工具

```typescript
// 读取文件
const file = await agent.useTool('read-file', {
  filePath: './src/index.ts',
});

// 写入文件
await agent.useTool('write-file', {
  filePath: './src/new-file.ts',
  content: 'console.log("Hello World");',
});

// Git 操作
await agent.useTool('git-commit', {
  message: 'feat: add new feature',
  addAll: true,
});

// 搜索文件
const files = await agent.useTool('search-files', {
  pattern: '**/*.ts',
  ignore: ['node_modules/**', 'dist/**'],
});
```

## 可用角色

### 产品经理 (product-manager)
- 负责需求分析
- 编写用户故事
- 评估功能优先级
- 风险评估

### 架构师 (architect)
- 设计系统架构
- 选择技术栈
- 定义组件和接口
- 权衡决策

### 开发者 (developer)
- 编写代码
- 遵循代码规范
- 编写单元测试
- 代码审查

### 测试工程师 (tester)
- 设计测试策略
- 编写测试用例
- 自动化测试
- 性能测试

### 文档编写者 (doc-writer)
- 编写技术文档
- 维护 API 文档
- 更新使用指南

## 可用工具

### 文件工具
- `read-file` - 读取文件内容
- `write-file` - 写入文件
- `search-files` - 搜索文件
- `delete-file` - 删除文件
- `list-directory` - 列出目录

### Git 工具
- `git-status` - 查看 Git 状态
- `git-commit` - 创建提交
- `git-branch` - 管理分支
- `git-pull` - 拉取更新
- `git-push` - 推送代码

## 事件监听

```typescript
// 监听任务事件
agent.on('task:created', (data) => {
  console.log('任务已创建:', data.data.task.title);
});

agent.on('task:completed', (data) => {
  console.log('任务已完成:', data.data.task.title);
});

agent.on('task:failed', (data) => {
  console.error('任务失败:', data.data.task.result?.error);
});

// 监听工作流事件
agent.on('workflow:started', (data) => {
  console.log('工作流开始:', data.data.workflowId);
});

agent.on('workflow:completed', (data) => {
  console.log('工作流完成');
});
```

## 自定义角色

```typescript
import { BaseRole } from 'project-agent';

class SecurityExpert extends BaseRole {
  constructor(llmService) {
    const definition = {
      id: 'security-expert',
      name: '安全专家',
      type: 'custom',
      description: '专业的安全工程师',
      responsibilities: [
        '代码安全审查',
        '漏洞检测',
        '安全修复建议',
      ],
      capabilities: [
        'SQL注入检测',
        'XSS检测',
        'CSRF防护',
      ],
      constraints: [
        '遵循OWASP Top 10',
        '最小权限原则',
      ],
      outputFormat: '输出安全审查报告',
      systemPrompt: '',
    };

    super(definition, llmService);
  }

  protected buildTaskPrompt(task, context) {
    return `请对以下代码进行安全审查：\n\n${task.input?.code || ''}`;
  }

  protected async processResponse(response, task, context) {
    return {
      report: response.content,
      issues: [],
      recommendations: [],
    };
  }
}

// 注册自定义角色
import { RoleFactory } from 'project-agent';
RoleFactory.registerRole('security-expert', SecurityExpert);
```

## 最佳实践

1. **明确任务描述** - 提供清晰、具体的任务描述和需求
2. **合理使用约束** - 使用约束条件确保输出符合项目规范
3. **监听事件** - 通过事件监听实时了解任务执行状态
4. **错误处理** - 始终检查 `result.success` 并处理错误情况
5. **使用工作流** - 对于复杂任务，使用工作流确保步骤正确执行

## 示例项目

查看 `examples/` 目录获取更多示例：

```bash
npm run example:basic    # 基础使用示例
npm run example:workflow # 工作流示例
```

## 常见问题

### Q: 如何更换 LLM 提供商？
A: 修改 `llmConfig.provider` 为 `'anthropic'` 或 `'openai'`，并设置相应的 API key。

### Q: 如何限制任务的执行时间？
A: 在任务约束中设置 `maxDuration`（毫秒）：
```typescript
constraints: {
  maxDuration: 300000, // 5分钟
}
```

### Q: 如何添加自定义工具？
A: 继承 `BaseTool` 类并实现 `executeImpl` 方法，然后注册到工具注册表。

### Q: 任务执行失败怎么办？
A: 检查 `result.error` 获取错误信息，可以使用 `agent.getTask(id)` 查看任务详情。

## 获取帮助

- 查看 README.md 获取完整文档
- 查看 examples/ 目录获取示例代码
- 提交 Issue 报告问题或建议

## 许可证

MIT
