# 增强交互界面使用指南

## 概述

Agent Team 现在提供了**增强的交互界面**，带来更好的用户体验和可视化效果。

## 主要改进

### 1. 增强的CLI组件 (`EnhancedCLI`)

提供更强大的交互组件：

- ✅ **美观的欢迎界面** - 使用 boxen 显示欢迎信息
- ✅ **交互式选择器** - 使用 prompts 库提供更好的选择体验
- ✅ **表格显示** - 美观的表格展示数据
- ✅ **加载动画** - 使用 ora 显示优雅的加载动画
- ✅ **代码高亮** - 更好的代码块显示
- ✅ **进度条** - 可视化的进度显示

### 2. 增强的聊天UI (`EnhancedChatUI`)

改进的聊天界面：

- ✅ **角色颜色区分** - 不同角色使用不同颜色
- ✅ **时间戳显示** - 可选的时间戳显示
- ✅ **代码高亮** - 自动识别并高亮代码
- ✅ **更好的滚动条** - 彩色滚动条指示
- ✅ **流式输出** - 平滑的流式文本输出

## 快速开始

### 方式1：使用增强UI（推荐）

在创建 HybridModeManager 时启用增强UI：

```typescript
import { createHybridModeManager, ExecutionMode } from 'agent-team';

const hybrid = createHybridModeManager(agent, {
  mode: ExecutionMode.INTERACTIVE,
  showProgress: true,
  useEnhancedUI: true, // 启用增强UI
});

await hybrid.startInteractiveSession();
```

### 方式2：直接使用 EnhancedCLI

```typescript
import { EnhancedCLI } from 'agent-team';

const cli = new EnhancedCLI();

// 显示欢迎信息
cli.welcome('Agent Team', '欢迎使用增强交互模式');

// 交互式选择
const choice = await cli.select('选择操作', [
  { title: '开发功能', value: 'develop' },
  { title: '执行任务', value: 'task' },
  { title: '查看统计', value: 'stats' },
]);

// 显示表格
cli.table([
  { 任务: '开发登录功能', 状态: '完成', 耗时: '2.5s' },
  { 任务: '编写测试', 状态: '进行中', 耗时: '1.2s' },
]);

// 显示加载动画
await cli.withLoading('处理中...', async () => {
  // 你的异步操作
});
```

### 方式3：使用 EnhancedChatUI

```typescript
import { EnhancedChatUI } from 'agent-team';

const chatUI = new EnhancedChatUI({
  inputPrompt: 'You: ',
  showTimestamps: true,
  colorizeRoles: true,
});

chatUI.start();
chatUI.appendRole('user', '你好\n');
await chatUI.streamRole('assistant', '你好！我是AI助手。\n');
```

## 运行示例

```bash
# 运行增强交互示例
npm run interactive:enhanced

# 或使用命令行（默认已启用增强UI）
agent-team chat
```

## 功能对比

| 功能 | 基础CLI | 增强CLI |
|------|---------|---------|
| 交互式选择 | 基础 | ✅ 美观的选择器 |
| 表格显示 | 文本 | ✅ 格式化表格 |
| 加载动画 | 简单 | ✅ 优雅动画 |
| 代码高亮 | ❌ | ✅ |
| 角色颜色 | ❌ | ✅ |
| 时间戳 | ❌ | ✅ 可选 |
| 欢迎界面 | ❌ | ✅ |

## 配置选项

### EnhancedCLI 选项

```typescript
const cli = new EnhancedCLI();
// 无需配置，开箱即用
```

### EnhancedChatUI 选项

```typescript
const chatUI = new EnhancedChatUI({
  inputPrompt: 'You: ',           // 输入提示符
  maxOutputLines: 100,            // 最大输出行数
  showTimestamps: true,           // 显示时间戳
  colorizeRoles: true,           // 角色颜色区分
});
```

### HybridModeOptions 选项

```typescript
const hybrid = createHybridModeManager(agent, {
  mode: ExecutionMode.INTERACTIVE,
  showProgress: true,
  autoConfirm: false,
  useEnhancedUI: true,  // 启用增强UI
});
```

## 最佳实践

1. **开发环境**：使用 `useEnhancedUI: true` 获得更好的开发体验
2. **生产环境**：可以根据需要选择是否启用增强UI
3. **CI/CD**：建议使用基础CLI（`useEnhancedUI: false`）以避免终端兼容性问题

## 依赖库

增强UI使用了以下优秀的开源库：

- `prompts` - 交互式提示
- `@clack/prompts` - 美观的CLI组件
- `boxen` - 边框装饰
- `ora` - 加载动画
- `chalk` - 终端颜色

## 迁移指南

从基础CLI迁移到增强CLI非常简单：

```typescript
// 之前
const hybrid = createHybridModeManager(agent, {
  mode: ExecutionMode.INTERACTIVE,
});

// 现在（只需添加一个选项）
const hybrid = createHybridModeManager(agent, {
  mode: ExecutionMode.INTERACTIVE,
  useEnhancedUI: true,  // 添加这一行即可
});
```

API完全兼容，无需修改其他代码！
