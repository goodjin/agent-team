---
name: bugfix
description: 当用户报告错误、操作失败、系统报错时自动触发，执行问题诊断和修复流程。包括收集错误信息、分析错误、定位问题代码、设计修复方案、执行修复和文档记录。
---

# Bug Fix Skill

当用户报告错误、操作失败、系统报错时，自动执行问题诊断和修复流程。

## 触发场景

- 运行报错了
- 操作失败了
- 查一下现有的问题
- 系统报错了

## 工作流程

### 步骤 1: 收集错误信息

```bash
# 检查测试结果
cat test-results/.last-run.json

# 检查 daemon 日志
cat .daemon.log 2>/dev/null || echo "No daemon log"

# 运行测试查看具体错误
npm test 2>&1 | head -100
```

### 步骤 2: 分析错误

1. **测试失败**: 查看具体失败的测试和错误信息
2. **编译错误**: 检查 TypeScript 错误
3. **运行时错误**: 查看日志和堆栈信息
4. **API 错误**: 检查 API 响应和状态码

### 步骤 3: 定位问题代码

使用以下工具：
- `grep` - 搜索错误关键字
- `read` - 查看相关代码文件
- `glob` - 查找相关文件

### 步骤 4: 设计修复方案

分析问题根因后，设计修复方案：
- 是否需要修改代码？
- 是否需要更新测试？
- 是否有设计问题需要改进？

### 步骤 5: 执行修复

1. 应用代码修复
2. 更新或添加测试
3. 验证修复有效

### 步骤 6: 文档记录

在 `docs/bugfix/` 目录创建问题文档：

```markdown
# Bug Fix: [问题标题]

## 问题描述
- 日期: YYYY-MM-DD
- 严重程度: Low/Medium/High/Critical
- 影响范围: ...

## 根因分析
- 问题位置: [文件:行号]
- 原因: ...
- 代码流程: ...

## 修复方案
- 修改文件: ...
- 修改内容: ...

## 验证步骤
1. ✅ 运行测试确认问题
2. ✅ 应用修复
3. ✅ 运行测试确认修复有效

## 相关测试
- [测试列表]

## 设计建议
- 是否有设计问题？
- 改进建议？
```

## 常用命令

```bash
# 检查测试状态
npm test 2>&1 | grep -E "PASS|FAIL|Error"

# 查看特定测试
npx vitest run tests/[file].test.ts

# 运行单个测试
npx vitest run -t "test name"

# 构建检查
npm run build

# ESLint 检查
npx eslint src --ext .ts
```

## 输出格式

执行完成后，输出：

```
## Bug Fix 完成

### 问题
[简短描述]

### 原因
[根因分析]

### 修复
[修改的文件和内容]

### 验证
[测试结果]

### 文档
docs/bugfix/[YYYY-MM-DD]-[issue-key].md
```

## 示例

### 示例 1: 测试失败

```
> npm test
❌ tests/server-agents.test.ts > GET /api/agents
Error: expected 200, got 500

分析: createAgentRouter() 缺少 agentMgr 参数
修复: tests/server-agents.test.ts:123 添加 mock agentMgr
文档: docs/bugfix/2024-02-05-AGENT_API_500.md
```

### 示例 2: 编译错误

```
> npm run build
Error: src/server/routes/agents.ts:45
Property 'xxx' does not exist on type 'Agent'

分析: 类型定义不完整
修复: src/types/index.ts 添加缺失的属性
```

## 注意事项

1. 优先使用 subagent 执行复杂分析
2. 确保测试覆盖修复的代码路径
3. 更新设计文档如果有架构问题
4. 提交前运行完整测试套件
