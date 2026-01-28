# 提示词管理指南

本文档介绍 Project Agent 的提示词管理系统，包括内置提示词、自定义提示词和模板配置。

## 提示词概述

提示词用于定义不同角色的系统行为和任务处理方式。每个角色对应一个提示词配置文件。

## 提示词文件结构

提示词文件使用 YAML 格式，保存在 `~/.agent-team/prompts/` 目录：

```yaml
# ~/.agent-team/prompts/developer.yaml

version: "1.0.0"
lastUpdated: "2025-01-24T00:00:00Z"

# 系统提示词
systemPrompt: |
  你是一个专业且高效的开发者...

# 任务提示词模板
taskTemplates:
  featureDevelopment:
    template: |
      请开发以下功能...
    variables:
      - title
      - description
      - requirements

  bugFix:
    template: |
      请修复以下 bug...
    variables:
      - errorMessage
      - code

# 上下文配置
contexts:
  typescript:
    description: TypeScript 项目
    filePattern: "**/*.ts"

# 输出格式
outputFormat:
  code:
    language: typescript
    style: pretty
  tests:
    framework: jest
    coverage: true
  documentation:
    style: markdown

# 标签
tags:
  - development
  - coding
```

## 提示词字段说明

### 系统提示词（systemPrompt）

定义角色的核心行为和约束。使用 `{{variableName}}` 语法插入变量。

### 任务提示词模板（taskTemplates）

为不同类型的任务提供专用模板：

| 模板名称 | 说明 |
|---------|------|
| `featureDevelopment` | 功能开发 |
| `bugFix` | Bug 修复 |
| `codeReview` | 代码审查 |
| `requirementAnalysis` | 需求分析 |
| `architectureDesign` | 架构设计 |
| `testing` | 测试编写 |
| `documentation` | 文档编写 |

### 上下文配置（contexts）

根据项目类型自动选择相关上下文：

```yaml
contexts:
  typescript:
    description: TypeScript 项目
    filePattern: "**/*.ts"
  react:
    description: React 项目
    filePattern: "**/{component,page}.tsx"
```

### 输出格式配置（outputFormat）

定义不同类型输出的格式偏好：

```yaml
outputFormat:
  code:
    language: typescript
    style: pretty
  tests:
    framework: jest
    coverage: true
  documentation:
    style: markdown
```

## 变量系统

### 系统变量（自动注入）

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `{{projectName}}` | 项目名称 | default-project |
| `{{projectPath}}` | 项目路径 | . |
| `{{codeStyle}}` | 代码风格 | default |
| `{{testCoverage}}` | 测试覆盖率 | 80 |
| `{{currentDate}}` | 当前日期 | - |
| `{{language}}` | 编程语言 | typescript |
| `{{framework}}` | 使用的框架 | - |
| `{{techStack}}` | 技术栈 | - |

### 自定义变量（在任务中定义）

在任务提示词模板中通过 `variables` 声明：

```yaml
taskTemplates:
  featureDevelopment:
    template: |
      开发功能: {{title}}
      描述: {{description}}
    variables:
      - title
      - description
```

## 使用示例

### 使用提示词管理器

```typescript
import { loadPrompts, getVersionManager } from 'project-agent';

const { prompts } = await loadPrompts({
  roleId: 'developer',
  includeBuiltIn: true,
  includeCustom: true,
});

// 获取特定角色的提示词
const developerPrompt = prompts.get('developer');
```

### 使用变量解析器

```typescript
import { VariableParser, replaceVariables } from 'project-agent';

const parser = new VariableParser();
parser.setValues({
  projectName: 'my-project',
  language: 'typescript',
});

const rendered = parser.parseTemplate(
  '开发 {{language}} 项目: {{projectName}}'
);
// 结果: "开发 typescript 项目: my-project"

// 或者使用工具函数
const result = replaceVariables(
  '项目名称: {{projectName}}',
  { projectName: 'my-project' }
);
```

### 使用模板渲染器

```typescript
import { createTemplateRenderer } from 'project-agent';

const taskTemplates = {
  featureDevelopment: {
    template: '开发 {{title}} 功能',
  },
};

const renderer = createTemplateRenderer(taskTemplates);
const result = renderer.render('featureDevelopment', {
  title: '用户登录',
});

console.log(result.content);
// 输出: "开发 用户登录 功能"
```

### 版本管理

```typescript
import { getVersionManager } from 'project-agent';

const versionManager = getVersionManager();

// 创建快照
const snapshot = await versionManager.createSnapshot(
  promptDefinition,
  '添加安全检查'
);

// 获取历史快照
const snapshots = await versionManager.getSnapshots('developer');

// 恢复到历史版本
const restored = await versionManager.restoreFromSnapshot(snapshotId);
```

## 命令行工具

```bash
# 查看所有提示词
npx project-agent prompt list

# 查看提示词详情
npx project-agent prompt show <role-id>

# 编辑提示词
npx project-agent prompt edit <role-id>

# 导出提示词
npx project-agent prompt export <role-id> > prompt.yaml

# 导入提示词
npx project-agent prompt import <role-id> < prompt.yaml

# 重置提示词（恢复默认）
npx project-agent prompt reset <role-id>

# 对比提示词差异
npx project-agent prompt diff <role-id> <other-prompt.yaml>

# 查看提示词历史
npx project-agent prompt history <role-id>

# 回滚到指定版本
npx project-agent prompt rollback <role-id> <version>
```

## 自定义提示词

### 创建自定义提示词

在 `~/.agent-team/prompts/` 目录创建新的 YAML 文件：

```yaml
# ~/.agent-team/prompts/custom-role.yaml

version: "1.0.0"
lastUpdated: "2025-01-24T00:00:00Z"

systemPrompt: |
  你是一个专业的 {{customRole}}...

taskTemplates:
  customTask:
    template: |
      处理自定义任务...
    variables:
      - input

contexts: {}

outputFormat:
  code:
    language: typescript
  tests:
    framework: jest
  documentation:
    style: markdown

tags:
  - custom
```

### 继承内置提示词

自定义提示词可以继承内置提示词并扩展：

```yaml
# 继承开发者提示词并添加前端能力
systemPrompt: |
  你是一个专业且高效的开发者...
  
  ## 前端扩展
  除了具备开发者的所有能力外，还需要：
  - 熟悉 React/Vue 框架
  - 理解组件化开发
```

## 最佳实践

1. **模板复用**：尽量复用内置模板，只做必要的定制
2. **变量声明**：在模板中明确声明所需变量
3. **版本管理**：重要修改时创建快照
4. **测试验证**：修改后测试提示词效果
5. **文档同步**：更新提示词时同步更新文档

## 常见问题

### Q: 如何恢复误修改的提示词？
A: 使用 `npx project-agent prompt reset <role-id>` 命令恢复默认提示词。

### Q: 提示词不生效？
A: 检查文件格式是否正确，确保文件位于正确目录。

### Q: 如何共享提示词？
A: 导出提示词为 YAML 文件，分享给其他用户导入。

### Q: 变量替换失败？
A: 检查变量名是否拼写正确，确认变量值已设置。

## 相关文档

- [配置指南](CONFIG_GUIDE.md)
- [角色管理指南](ROLES_GUIDE.md)
- [规则管理指南](RULES_GUIDE.md)
- [AI Agent 使用指南](AI_AGENT_GUIDE.md)
