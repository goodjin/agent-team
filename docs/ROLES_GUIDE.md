# 角色管理指南

本文档介绍 Project Agent 的角色管理系统，包括内置角色、自定义角色和角色继承。

## 角色概述

Project Agent 使用角色系统来定义不同类型的 AI 助手，每个角色有独特的能力、职责和行为约束。

### 内置角色（不可删除/禁用）

系统提供以下 5 个内置角色：

| 角色 ID | 名称 | 职责 | 默认模型 |
|---------|------|------|----------|
| `product-manager` | 产品经理 | 需求分析、用户故事、优先级评估 | glm-4 |
| `architect` | 架构师 | 系统设计、技术选型、组件定义 | glm-4-plus |
| `developer` | 开发者 | 代码实现、代码审查、重构 | glm-4 |
| `tester` | 测试工程师 | 测试策略、用例设计、自动化测试 | glm-4-flash |
| `doc-writer` | 文档编写者 | 技术文档、API文档、使用指南 | glm-4-air |

### 自定义角色

用户可以创建自定义角色来满足特定需求。自定义角色可以删除和禁用。

## 角色文件结构

角色配置文件使用 YAML 格式，保存在 `~/.agent-team/roles/` 目录：

```yaml
# ~/.agent-team/roles/custom-role.yaml

id: security-expert
name: 安全专家
description: 专业的网络安全专家，擅长代码安全审查和漏洞检测
type: custom

# 角色属性
properties:
  canDelete: true
  canDisable: true
  hidden: false

# 角色能力
capabilities:
  - SQL注入检测
  - XSS漏洞检测
  - CSRF防护检查

# 角色职责
responsibilities:
  - 审查代码安全问题
  - 检测潜在漏洞

# 角色约束
constraints:
  - 必须遵循OWASP Top 10

# LLM 配置
llm:
  provider: anthropic-primary
  model: sonnet
  temperature: 0.3
  maxTokens: 4000

# 提示词文件
promptFile: ../prompts/custom/security-expert.yaml

# 标签
tags:
  - security
  - review

# 元数据
version: "1.0.0"
lastUpdated: "2025-01-24T00:00:00Z"
```

## 角色字段说明

### 必需字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | 字符串 | 角色唯一标识，只能包含字母、数字、下划线和短横线 |
| `name` | 字符串 | 角色显示名称 |
| `description` | 字符串 | 角色描述 |
| `type` | 枚举 | 角色类型：`built-in`、`custom` 或 `extends` |
| `capabilities` | 字符串数组 | 角色能力列表 |
| `responsibilities` | 字符串数组 | 角色职责列表 |
| `constraints` | 字符串数组 | 角色约束列表 |
| `llm.provider` | 字符串 | LLM 提供商名称 |
| `llm.model` | 字符串 | LLM 模型名称 |

### 可选字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `extends` | 字符串 | 无 | 继承自另一个角色 ID |
| `properties.canDelete` | 布尔值 | `true` | 是否可删除 |
| `properties.canDisable` | 布尔值 | `true` | 是否可禁用 |
| `properties.hidden` | 布尔值 | `false` | 是否隐藏 |
| `llm.temperature` | 数字 | 0.7 | LLM 温度参数 |
| `llm.maxTokens` | 数字 | 4000 | 最大 token 数量 |
| `promptFile` | 字符串 | 无 | 提示词文件路径 |
| `tags` | 字符串数组 | 空数组 | 角色标签 |
| `version` | 字符串 | "1.0.0" | 角色版本 |
| `lastUpdated` | 字符串 | 当前时间 | 最后更新时间 |
| `author` | 字符串 | 无 | 作者 |

## 角色继承

自定义角色可以继承内置角色的能力：

```yaml
id: full-stack-developer
name: 全栈开发者
description: 具备前端和后端开发能力的开发者
type: extends
extends: developer

properties:
  canDelete: true
  canDisable: true
  hidden: false

additionalCapabilities:
  - React前端开发
  - Node.js后端开发
  - 数据库设计

additionalConstraints:
  - 前端代码必须响应式适配
  - API必须提供OpenAPI文档

promptEnhancement: |
  ## 全栈开发扩展
  除了具备开发者的所有能力外，还需要：
  - 理解前端技术栈（React/Vue/Angular）
  - 理解后端技术栈（Node.js/Python/Go）
  - 能够设计RESTful API
```

## 使用示例

### 使用角色管理器

```typescript
import { getRoleManager } from 'agent-team';

const manager = getRoleManager();

// 获取所有角色
const allRoles = manager.getAllRoles();

// 获取特定角色
const developer = manager.getRoleById('developer');

// 创建自定义角色
await manager.createRole({
  name: '安全专家',
  description: '安全专家角色',
  capabilities: ['安全审计', '漏洞检测'],
  responsibilities: ['代码安全审查'],
  constraints: ['遵循OWASP Top 10'],
  llm: {
    provider: 'anthropic-primary',
    model: 'sonnet',
  },
  tags: ['security'],
});

// 更新角色
await manager.updateRole('security-expert', {
  name: '高级安全专家',
});

// 删除角色
await manager.deleteRole('security-expert');
```

### 使用角色加载器

```typescript
import { loadRoles, loadRole } from 'agent-team';

// 加载所有角色
const { roles, loaded, errors } = await loadRoles({
  includeBuiltIn: true,
  includeCustom: true,
  includeDisabled: false,
});

// 加载单个角色
const developer = await loadRole('developer');
```

## 命令行工具

```bash
# 查看所有角色
npx agent-team role list

# 查看角色详情
npx agent-team role show <role-id>

# 创建新角色
npx agent-team role create <role-id>

# 编辑角色
npx agent-team role edit <role-id>

# 禁用角色
npx agent-team role disable <role-id>

# 启用角色
npx agent-team role enable <role-id>

# 删除角色（仅限自定义角色）
npx agent-team role delete <role-id>

# 导出角色
npx agent-team role export <role-id> > role.yaml

# 导入角色
npx agent-team role import < role.yaml
```

## 最佳实践

1. **角色命名**：使用清晰、有意义的名称，便于识别角色职责
2. **能力描述**：详细列出角色的能力和职责
3. **约束设置**：合理设置约束，确保角色行为符合预期
4. **标签使用**：使用标签便于角色分类和搜索
5. **版本管理**：更新角色时更新版本号和最后更新时间

## 常见问题

### Q: 如何修改内置角色？
A: 内置角色无法修改，但可以通过继承创建变体。

### Q: 角色可以重命名吗？
A: 可以，但会创建新角色，原角色仍存在。

### Q: 如何恢复误删的角色？
A: 从备份恢复或重新定义角色。

### Q: 角色继承有什么限制？
A: 不支持多重继承，不支持循环继承。

## 相关文档

- [配置指南](CONFIG_GUIDE.md)
- [提示词管理指南](PROMPTS_GUIDE.md)
- [规则管理指南](RULES_GUIDE.md)
- [AI Agent 使用指南](AI_AGENT_GUIDE.md)
