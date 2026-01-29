# Project Agent

> 一个基于角色的多智能体项目管理系统，支持自然语言交互，通过定义不同的专家角色来完成项目分析、需求设计、架构设计、开发执行、测试和文档等任务。

## 特性

- 多角色系统 - 产品经理、架构师、开发者、测试工程师、文档编写者等专家角色
- 任务调度 - 自动分解复杂任务、管理依赖关系、并行/串行执行
- 工具链集成 - 文件操作、Git 管理、代码分析等丰富工具
- 规范约束 - 通过约束系统确保所有任务按照项目规范执行
- 进度追踪 - 实时监控任务执行状态，完整的事件系统
- 自动化文档 - 自动生成和更新项目文档、API 文档
- 工作流引擎 - 定义复杂的开发工作流，自动执行完整流程
- 自由输入 - 支持自然语言描述任务，智能理解并执行
- 交互式会话 - 像聊天一样与 AI 协作开发
- 混合模式 - 交互式/自动模式自由切换
- 智能 AI Agent - 像 Claude Code 一样的真正 AI Agent

## 安装

### 方式 1：本地开发（推荐）

```bash
# 克隆项目
git clone <repository-url>
cd agent-team

# 安装依赖
npm install

# 构建项目
npm run build

# 链接到全局（使 agent-team 命令可用）
npm link
```

### 方式 2：全局安装

```bash
npm install -g agent-team
```

### 方式 3：使用 npx（无需安装）

```bash
npx agent-team <command>
```

## 快速开始

### 1. 初始化配置

```bash
# 交互式初始化配置
agent-team init
# 或使用 npx
npx agent-team init

# 查看配置
agent-team config show

# 测试配置
agent-team config test
```

### 2. 配置 API Key

编辑 `~/.agent-team/config.yaml` 或设置环境变量：

```bash
export ANTHROPIC_API_KEY=sk-ant-xxx
export ZHIPU_API_KEY=glm-xxx
```

### 3. 开始使用

```bash
# 启动 AI 对话（类似 Claude Code）
agent-team chat

# 查看配置
agent-team config show

# 管理角色
agent-team role list

# 管理规则
agent-team rule list

# 查看帮助
agent-team help
```

**注意**：如果使用 `npm link` 后命令仍不可用，请确保：
1. `npm run build` 已成功执行
2. `dist/cli/cli.js` 文件存在且可执行
3. 或者直接使用 `node dist/cli/cli.js <command>` 运行

## 使用示例

### 基本使用

```typescript
import { ProjectAgent, createIntelligentAgent } from 'agent-team';

const agent = new ProjectAgent({
  projectName: 'my-app',
  projectPath: '/path/to/project',
});

await agent.loadConfig();

// 使用 AI Agent
const aiAgent = createIntelligentAgent(agent);
const response = await aiAgent.chat('请帮我实现用户登录功能');
```

### 开发功能

```typescript
const result = await agent.developFeature({
  title: '用户登录',
  description: '实现基于 JWT 的用户认证',
  requirements: [
    '支持邮箱密码登录',
    '登录后返回 JWT token',
  ],
  filePath: './src/auth/login.ts',
});
```

### 使用工作流

```typescript
agent.registerWorkflow({
  id: 'feature-development',
  steps: [
    { id: 'analyze', role: 'product-manager', taskType: 'requirement-analysis' },
    { id: 'design', role: 'architect', taskType: 'architecture-design', dependencies: ['analyze'] },
    { id: 'develop', role: 'developer', taskType: 'development', dependencies: ['design'] },
    { id: 'test', role: 'tester', taskType: 'testing', dependencies: ['develop'] },
    { id: 'document', role: 'doc-writer', taskType: 'documentation', dependencies: ['test'] },
  ],
});

await agent.executeWorkflow('feature-development');
```

## 命令行工具

### 配置管理

```bash
npx agent-team config show     # 显示配置
npx agent-team config test    # 测试配置
npx agent-team config edit    # 编辑配置
npx agent-team config reset   # 重置配置
```

### 角色管理

```bash
npx agent-team role list      # 列出角色
npx agent-team role show <id> # 显示角色详情
npx agent-team role create    # 创建角色
npx agent-team role edit     # 编辑角色
npx agent-team role delete   # 删除角色
npx agent-team role enable   # 启用角色
npx agent-team role disable  # 禁用角色
```

### 提示词管理

```bash
npx agent-team prompt list    # 列出提示词
npx agent-team prompt show   # 显示提示词
npx agent-team prompt edit   # 编辑提示词
npx agent-team prompt reset  # 重置提示词
```

### 规则管理

```bash
npx agent-team rule list     # 列出规则
npx agent-team rule show    # 显示规则
npx agent-team rule enable # 启用规则
npx agent-team rule disable # 禁用规则
npx agent-team rule create # 创建规则
npx agent-team rule delete # 删除规则
```

### AI 对话

```bash
npx agent-team chat         # 启动交互式对话
```

## 配置说明

### 配置文件位置

- `~/.agent-team/config.yaml`（默认）
- `./.agent-team.yaml`
- `./agent.config.yaml`

### 环境变量覆盖

| 配置项 | 环境变量 |
|--------|---------|
| 默认提供商 | `AGENT_LLM_PROVIDER` |
| API Keys | `ANTHROPIC_API_KEY` 等 |
| 项目名称 | `AGENT_PROJECT_NAME` |
| 项目路径 | `AGENT_PROJECT_PATH` |

### 配置文件结构

```yaml
version: "1.0.0"

llm:
  defaultProvider: "zhipu-primary"
  providers:
    anthropic-primary:
      name: "Anthropic 主服务"
      provider: "anthropic"
      apiKey: "${ANTHROPIC_API_KEY}"
      enabled: false
      models:
        sonnet:
          model: "claude-3-sonnet-20240229"
          maxTokens: 4000
  roleMapping:
    developer: anthropic-primary/sonnet
  fallbackOrder:
    - anthropic-primary
    - zhipu-primary

project:
  name: "my-project"
  path: "."
  autoAnalyze: true

agent:
  maxIterations: 10
  maxHistory: 50
  autoConfirm: false
  showThoughts: false

tools:
  file:
    allowDelete: false
    allowOverwrite: true
  git:
    autoCommit: false
    confirmPush: true
  code:
    enabled: false

rules:
  enabled:
    - coding-standards
    - security-rules
  disabled:
    - best-practices
```

## 文档

- [快速入门](docs/QUICK_START.md)
- [配置指南](docs/CONFIG_GUIDE.md)
- [角色管理指南](docs/ROLES_GUIDE.md)
- [提示词管理指南](docs/PROMPTS_GUIDE.md)
- [规则管理指南](docs/RULES_GUIDE.md)
- [AI Agent 使用指南](docs/AI_AGENT_GUIDE.md)

## 项目结构

```
agent-team/
├── src/
│   ├── ai/               # AI Agent
│   ├── cli/              # 命令行界面
│   ├── config/           # 配置管理
│   ├── core/             # 核心系统
│   ├── code-analysis/    # 代码分析
│   ├── prompts/          # 提示词
│   ├── roles/            # 角色
│   ├── rules/            # 规则
│   ├── services/         # LLM 服务
│   ├── tools/            # 工具
│   ├── types/            # 类型定义
│   └── utils/            # 工具函数
├── docs/                  # 文档
├── examples/              # 示例
└── prompts/               # 提示词配置
```

## License

MIT
