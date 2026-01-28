# AI Agent 使用指南

本文档介绍 Project Agent 的 AI Agent 功能，包括智能对话、代码分析和任务执行。

## AI Agent 概述

AI Agent 是 Project Agent 的核心功能，类似于 Claude Code，可以：

- 理解自然语言请求
- 分析代码和项目
- 自主使用工具
- 多轮对话
- 记忆上下文

## 快速开始

```typescript
import { ProjectAgent, createIntelligentAgent } from 'project-agent';

const agent = new ProjectAgent({
  projectName: 'my-project',
  projectPath: '/path/to/project',
});

await agent.loadConfig();

const aiAgent = createIntelligentAgent(agent);

// 开始对话
const response = await aiAgent.chat('请帮我实现一个用户登录功能');
console.log(response);
```

## 对话功能

### 基本对话

```typescript
const response = await aiAgent.chat('如何优化这段代码？');
console.log(response);
```

### 带上下文的对话

```typescript
// AI Agent 会记住之前的对话
await aiAgent.chat('查看 src/auth/login.ts');
await aiAgent.chat('这段代码有什么安全问题？');
```

### 配置对话

```typescript
const aiAgent = createIntelligentAgent(agent, {
  maxHistory: 50,           // 最大历史消息数
  maxToolIterations: 10,     // 最大工具调用迭代次数
  showThoughts: false,       // 是否显示思考过程
  autoConfirmTools: true,    // 自动确认工具调用
});
```

## 工具使用

AI Agent 可以自动使用以下工具：

### 文件操作

```typescript
// AI Agent 会自动读取文件
await aiAgent.chat('查看 src/index.ts 的内容');

// 写入文件
await aiAgent.chat('在 src/utils 创建新工具文件');

// 搜索文件
await aiAgent.chat('找到所有测试文件');
```

### Git 操作

```typescript
// 查看 Git 状态
await aiAgent.chat('检查 Git 状态');

// 提交更改
await aiAgent.chat('提交刚才的修改');
```

### 代码分析

```typescript
// 分析代码质量
await aiAgent.chat('分析 src 目录的代码质量');

// 查找安全问题
await aiAgent.chat('检查登录模块的安全性');
```

## 高级功能

### 项目分析

```typescript
// 分析整个项目
const analysis = await aiAgent.analyzeProject();
console.log(analysis);

// 分析特定目录
const analysis = await aiAgent.analyzeProject('./src/auth');
```

### 错误修复

```typescript
// 提供错误信息，自动诊断和修复
const fix = await aiAgent.fixError(
  'TypeError: Cannot read property of undefined',
  'src/auth/login.ts'
);
console.log(fix);
```

### 代码生成

```typescript
// 生成代码
const code = await aiAgent.generateCode(
  '实现一个用户验证中间件',
  '使用 Express.js 框架'
);
console.log(code);
```

## 交互模式

### 交互式会话

```bash
# 启动交互式会话
npx project-agent chat
```

在交互式会话中，您可以：

- 输入自然语言请求
- 使用命令（以 `/` 开头）
- 查看执行进度
- 确认或取消操作

### 可用命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助 |
| `/mode` | 切换执行模式 |
| `/stats` | 显示统计信息 |
| `/clear` | 清除对话历史 |
| `/exit` | 退出会话 |

## 配置选项

### Agent 配置

```yaml
# ~/.agent-team/config.yaml

agent:
  maxIterations: 10        # 最大迭代次数
  maxHistory: 50           # 最大历史消息数
  autoConfirm: false       # 自动确认
  showThoughts: false      # 显示思考过程
```

### 工具配置

```yaml
tools:
  file:
    allowDelete: false     # 允许删除文件
    allowOverwrite: true   # 允许覆盖文件
  git:
    autoCommit: false      # 自动提交
    confirmPush: true      # 推送时确认
  code:
    enabled: false        # 启用代码执行
```

## 最佳实践

### 1. 提供清晰的需求

```typescript
// 推荐
await aiAgent.chat('实现用户登录功能，包含：1) 邮箱密码验证 2) JWT token 生成 3) 错误处理');

// 不推荐
await aiAgent.chat('帮我做个登录功能')
```

### 2. 逐步迭代

```typescript
// 先实现基本功能
await aiAgent.chat('实现用户登录基本功能');

// 再添加高级功能
await aiAgent.chat('添加记住我功能');

// 最后优化
await aiAgent.chat('优化登录性能');
```

### 3. 利用上下文

```typescript
// AI Agent 会记住之前的对话
await aiAgent.chat('查看用户服务代码');
await aiAgent.chat('在哪里处理用户验证？'); // 利用上下文
await aiAgent.chat('添加登录失败次数限制'); // 继续之前的上下文
```

### 4. 使用工具辅助

```typescript
// 查看相关代码后再提问
await aiAgent.chat('查看认证中间件');
await aiAgent.chat('这个中间件有什么问题？');
```

## 常见问题

### Q: AI Agent 不理解我的请求？
A: 尝试更具体地描述需求，或分解为多个小问题。

### Q: 工具调用失败？
A: 检查文件路径和权限，确保工具已启用。

### Q: 对话历史丢失？
A: 对话历史保存在内存中，重新启动会话会丢失。重要上下文请保存到文件。

### Q: 如何提高回答质量？
A: 提供更多上下文信息，指定技术栈和约束条件。

### Q: 支持中文吗？
A: 支持中英文混合输入，AI Agent 会自动识别。

## 性能优化

### 减少迭代次数

```typescript
const aiAgent = createIntelligentAgent(agent, {
  maxToolIterations: 5, // 减少迭代次数提高响应速度
});
```

### 限制历史长度

```typescript
const aiAgent = createIntelligentAgent(agent, {
  maxHistory: 20, // 减少历史消息节省内存
});
```

## 相关文档

- [配置指南](CONFIG_GUIDE.md)
- [角色管理指南](ROLES_GUIDE.md)
- [提示词管理指南](PROMPTS_GUIDE.md)
- [规则管理指南](RULES_GUIDE.md)
