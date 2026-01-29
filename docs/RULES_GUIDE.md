# 规则管理指南

本文档介绍 Project Agent 的规则管理系统，包括编码规范、安全规则和最佳实践。

## 规则概述

规则系统用于定义代码检查和约束，确保生成代码符合项目规范。

## 规则文件结构

规则文件使用 YAML 格式，保存在 `~/.agent-team/rules/` 目录：

```yaml
# ~/.agent-team/rules/coding-standards.yaml

id: coding-standards
name: 编码规范
description: 项目编码规范，所有角色必须遵守
version: "1.0.0"
enabled: true

category: coding
priority: 80

# 适用范围
appliesTo:
  - all

# 规则列表
rules:
  - id: naming-convention
    name: 命名规范
    description: 变量、函数、类命名必须遵循统一规范
    severity: warning
    pattern: |
      // 正则表达式模式
    suggestion: "请使用有意义的命名"

# 规则例外
exceptions:
  - id: test-files
    description: 测试文件可以豁免
    pattern: "**/*.test.ts"
    rules:
      - naming-convention
```

## 规则字段说明

### 必需字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | 字符串 | 规则唯一标识 |
| `name` | 字符串 | 规则显示名称 |
| `description` | 字符串 | 规则描述 |
| `category` | 枚举 | 规则类别 |
| `appliesTo` | 字符串数组 | 适用角色 |
| `rules` | 对象数组 | 规则列表 |

### 可选字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `version` | 字符串 | "1.0.0" | 规则版本 |
| `enabled` | 布尔值 | true | 是否启用 |
| `priority` | 数字 | 类别默认值 | 优先级 |
| `exceptions` | 对象数组 | 空数组 | 规则例外 |

### 规则类别

| 类别 | 优先级 | 说明 |
|------|--------|------|
| `security` | 100 | 安全规则（最高） |
| `coding` | 80 | 编码规范 |
| `best-practices` | 60 | 最佳实践 |
| `project` | 40 | 项目特定规则 |
| `custom` | 20 | 自定义规则 |

### 严重级别

| 级别 | 说明 |
|------|------|
| `critical` | 严重问题，必须修复 |
| `error` | 错误，应修复 |
| `warning` | 警告，建议修复 |
| `info` | 信息，可忽略 |

## 内置规则

### 安全规则（security-rules）

```yaml
id: security-rules
name: 安全规范
description: 代码安全规范，防止常见安全漏洞
category: security
priority: 100

rules:
  - id: no-sql-injection
    name: SQL注入防护
    severity: critical
    suggestion: "请使用参数化查询"
```

### 编码规范（coding-standards）

```yaml
id: coding-standards
name: 编码规范
description: 项目编码规范
category: coding
priority: 80

rules:
  - id: naming-convention
    name: 命名规范
    severity: warning
```

### 最佳实践（best-practices）

```yaml
id: best-practices
name: 最佳实践
description: 代码最佳实践规范
category: best-practices
priority: 60
enabled: false  # 默认禁用
```

## 规则例外

可以为特定文件或目录配置规则例外：

```yaml
exceptions:
  - id: test-files
    description: 测试文件可以豁免某些规则
    pattern: "**/*.test.ts"
    rules:
      - no-console-log
      - naming-convention
```

## 使用示例

### 使用规则管理器

```typescript
import { getRuleManager } from 'agent-team';

const manager = getRuleManager();

// 获取所有规则
const allRules = manager.getAllRules();

// 获取启用的规则
const enabledRules = manager.getEnabledRules();

// 获取适用于特定角色的规则
const developerRules = manager.getRulesForRole('developer');

// 获取按优先级排序的规则
const sortedRules = manager.getRulesByPriority();
```

### 使用规则注入器

```typescript
import { createRuleInjector } from 'agent-team';

const injector = createRuleInjector();

// 将规则注入到提示词
const result = injector.injectIntoSystemPrompt(
  'developer',
  baseSystemPrompt
);

console.log(result.systemPrompt);
console.log(result.injectedRules);
```

### 自定义规则

```typescript
import { getRuleManager } from 'agent-team';

const manager = getRuleManager();

await manager.createRule({
  name: '我的自定义规则',
  description: '项目特定编码规范',
  category: 'project',
  enabled: true,
  appliesTo: ['developer'],
  priority: 50,
  rules: [
    {
      id: my-rule
      name: '我的规则',
      description: '具体描述',
      severity: 'warning',
      pattern: '具体模式',
      suggestion: '修复建议',
    },
  ],
});
```

## 命令行工具

```bash
# 查看所有规则
npx agent-team rule list

# 查看规则详情
npx agent-team rule show <rule-id>

# 启用规则
npx agent-team rule enable <rule-id>

# 禁用规则
npx agent-team rule disable <rule-id>

# 创建自定义规则
npx agent-team rule create <rule-id>

# 编辑规则
npx agent-team rule edit <rule-id>

# 删除规则（仅限自定义规则）
npx agent-team rule delete <rule-id>

# 测试规则
npx agent-team rule test <rule-id> --file <path>
```

## 规则优先级

规则按优先级从高到低执行：

```typescript
import { getPriorityManager } from 'agent-team';

const priorityManager = getPriorityManager();

// 获取优先级
const securityPriority = priorityManager.getPriority('security'); // 100
const codingPriority = priorityManager.getPriority('coding'); // 80

// 自定义优先级
priorityManager.setPriority('custom', 50);

// 导出配置
console.log(priorityManager.export());
```

## 最佳实践

1. **安全优先**：始终启用安全规则
2. **逐步引入**：新规则先在 warning 级别测试
3. **合理例外**：不要过度使用例外
4. **定期审查**：定期检查规则有效性
5. **版本管理**：更新规则时更新版本号

## 常见问题

### Q: 规则不生效？
A: 检查规则是否启用，文件是否在适用范围内。

### Q: 如何临时禁用规则？
A: 将规则的 `enabled` 设为 `false`。

### Q: 如何为特定文件设置例外？
A: 在规则的 `exceptions` 中添加配置。

### Q: 规则优先级如何调整？
A: 修改规则的 `priority` 字段。

## 相关文档

- [配置指南](CONFIG_GUIDE.md)
- [角色管理指南](ROLES_GUIDE.md)
- [提示词管理指南](PROMPTS_GUIDE.md)
- [AI Agent 使用指南](AI_AGENT_GUIDE.md)
