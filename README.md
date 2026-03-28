# Agent Team

多角色 AI 项目管理系统 - 基于智能体协作的自动化项目管理平台。

## 简介

Agent Team 是一个创新的多智能体项目管理系统，通过定义不同的专家角色（产品经理、架构师、开发工程师、测试工程师等）来完成项目分析、需求设计、架构设计、开发执行、测试验证和文档编写等全生命周期任务。

系统采用 Master-Agent/Sub-Agent 架构，支持任务自动拆分、并行执行、智能调度，并具备知识库记忆、可观测性和插件扩展能力。

## 核心特性

- **多智能体协作** - Master-Agent 统筹规划，Sub-Agent 并行执行任务
- **角色系统** - 预定义多种专家角色，支持自定义角色扩展
- **任务管理** - 完整的任务生命周期管理、状态追踪、自动调度
- **工具生态** - 丰富的工具集：文件操作、Git、代码分析、浏览器自动化、AI 生成等
- **知识库与记忆** - 向量存储、知识提取、智能体持久化记忆
- **可观测性** - 结构化日志、链路追踪、指标收集
- **插件系统** - 动态插件加载、沙箱隔离、工具扩展
- **自进化能力** - 性能自评估、提示词优化、持续改进

## 版本演进

| 版本 | 功能 | 状态 |
|------|------|------|
| v5 | 多智能体系统核心架构 (MasterAgent/SubAgent/AgentLoop) | 已完成 |
| v6 | 工具生态系统增强 | 已完成 |
| v7 | 可观测性与持久化工作流 | 已完成 |
| v8 | 知识库与持久化记忆 | 已完成 |
| v9 | 自进化与插件生态 | 已完成 |
| v10 | 主控会话编排（Master + Worker、记忆与压缩） | 规划中（见 docs/v10） |

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建

```bash
npm run build
```

### 启动服务

```bash
npm start
```

### CLI 交互

```bash
npm run cli
```

## 项目结构

```
agent-team/
├── src/
│   ├── ai/                 # AI Agent 核心
│   │   ├── master-agent.ts
│   │   ├── sub-agent.ts
│   │   ├── agent-loop.ts
│   │   └── ...
│   ├── core/               # 核心系统
│   │   ├── task-manager.ts
│   │   ├── agent-executor.ts
│   │   ├── auto-scheduler.ts
│   │   └── ...
│   ├── tools/              # 工具系统
│   │   ├── registry.ts
│   │   ├── file-tools.ts
│   │   ├── git-tools.ts
│   │   └── ...
│   ├── services/           # LLM 服务
│   │   ├── llm.service.ts
│   │   └── llm/            # 多提供商适配器
│   ├── roles/              # 角色系统
│   ├── rules/              # 规则系统
│   ├── knowledge/          # 知识库系统
│   ├── plugins/            # 插件系统
│   ├── observability/      # 可观测性
│   ├── server/             # Web API
│   ├── cli/                # 命令行界面
│   └── ui/                 # 用户界面
├── tests/                  # 测试套件
├── docs/                   # 文档
└── data/                   # 数据存储
```

## 核心架构

### Master-Agent/Sub-Agent 模式

```
用户请求
    ↓
Master-Agent (任务分析、规划)
    ↓
任务拆分 → Sub-Agent 1, Sub-Agent 2, Sub-Agent 3...
    ↓
并行执行
    ↓
结果汇总
    ↓
返回用户
```

### 角色系统

系统内置多种专家角色：

- **产品经理** - 需求分析、PRD 编写
- **系统架构师** - 技术方案、架构设计
- **服务端开发** - API 开发、业务逻辑
- **前端开发** - UI 实现、组件开发
- **测试工程师** - 测试计划、测试用例
- **DevOps 工程师** - 部署方案、CI/CD

### LLM 多提供商支持

- Anthropic (Claude)
- OpenAI (GPT)
- 通义千问 (Qwen)
- 智谱 AI (GLM)

## API 接口

### 任务管理

```typescript
// 创建任务
POST /api/tasks
{
  "title": "实现登录功能",
  "description": "...",
  "role": "backend-dev"
}

// 获取任务状态
GET /api/tasks/:id

// 列出任务
GET /api/tasks
```

### 智能体管理

```typescript
// 创建智能体
POST /api/agents
{
  "role": "architect",
  "taskId": "task-123"
}

// 发送消息
POST /api/agents/:id/message
{
  "content": "请分析这个需求"
}
```

## 配置

创建 `.env` 文件：

```env
# LLM 配置
ANTHROPIC_API_KEY=your_key
OPENAI_API_KEY=your_key
QWEN_API_KEY=your_key
GLM_API_KEY=your_key

# 默认模型
DEFAULT_LLM_PROVIDER=anthropic
DEFAULT_LLM_MODEL=claude-opus-4-6

# 服务器配置
PORT=3000
NODE_ENV=development

# 数据存储
DATA_DIR=./data
```

## 测试

基于 [Vitest](https://vitest.dev/)，`vitest.config.ts` 中对 `src/plugins`、`src/evolution` 配置了覆盖率门槛。

```bash
# 全部测试（单元 + v9 E2E + 回归冒烟）
npm test

# 监听模式
npm run test:watch

# 覆盖率（v9 相关模块 + 门槛校验）
npm run test:coverage

# 排除 e2e 文件时可用（package 内为除 e2e 外的全部 tests/**/*.test.ts）
npm run test:unit

# 仅 v9 端到端场景
npm run test:e2e
```

- `tests/v9/` — 插件加载、沙箱、动态工具、自评估、Prompt 优化、注册表、E2E
- `tests/regression/` — `createContainer` 与文件存储等核心路径冒烟（v5–v8 兼容）

## 文档

- **v10（规划中）**：[需求 PRD](docs/v10/01-requirements.md) · [架构](docs/v10/02-architecture.md) · [任务拆分](docs/v10/03-task-breakdown.md) · [API / 事件契约](docs/v10/04-api-events-contracts.md)
- **v9**：[需求（PRD）](docs/v9/01-requirements.md) · [架构](docs/v9/02-architecture.md) · [任务拆分](docs/v9/03-task-breakdown.md)

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
