# Ink UI 使用指南

## 概述

**Ink** 是业界最优秀的 CLI 交互库，被以下知名项目使用：

- ✅ **Claude Code** (Anthropic) - AI 编程助手
- ✅ **GitHub Copilot CLI** - GitHub 的 CLI 工具
- ✅ **Gemini CLI** (Google) - Google 的 AI 编程工具
- ✅ **Cloudflare Wrangler** - Cloudflare Workers CLI
- ✅ **Gatsby** - 静态网站生成器
- ✅ **Prisma** - 数据库工具

## 为什么选择 Ink？

### 1. **React 生态**
- 使用熟悉的 React 组件和 Hooks
- 支持所有 React 特性（状态管理、生命周期等）
- 可以使用 React DevTools 调试

### 2. **Flexbox 布局**
- 使用 Yoga 引擎实现 Flexbox
- 熟悉的 CSS-like 属性
- 响应式布局支持

### 3. **丰富的组件生态**
- `ink-text-input` - 文本输入
- `ink-select-input` - 选择器
- `ink-spinner` - 加载动画
- `ink-table` - 表格
- 还有很多其他组件

### 4. **性能优化**
- 增量渲染（只更新变化的部分）
- 虚拟化列表支持
- 高效的布局计算

## 快速开始

### 安装

```bash
npm install ink react
npm install ink-text-input ink-select-input ink-spinner ink-table
```

### 基础示例

```tsx
import React from 'react';
import { render, Box, Text } from 'ink';

const App = () => (
  <Box flexDirection="column">
    <Text color="green">Hello World</Text>
    <Text color="cyan">使用 Ink 构建 CLI</Text>
  </Box>
);

render(<App />);
```

## 核心组件

### Box - 布局容器

```tsx
import { Box, Text } from 'ink';

<Box
  flexDirection="column"
  padding={1}
  borderStyle="single"
  borderColor="cyan"
>
  <Text>内容</Text>
</Box>
```

### Text - 文本显示

```tsx
<Text color="green" bold>
  绿色粗体文本
</Text>
```

### Static - 静态内容

用于显示不会改变的内容（如日志、已完成的任务）：

```tsx
import { Static } from 'ink';

<Static items={completedTasks}>
  {(task) => (
    <Text key={task.id}>✓ {task.title}</Text>
  )}
</Static>
```

## Hooks

### useInput - 处理用户输入

```tsx
import { useInput } from 'ink';

useInput((input, key) => {
  if (key.return) {
    // Enter 键被按下
  }
  if (key.escape) {
    // Esc 键被按下
  }
  if (key.upArrow) {
    // 上箭头
  }
});
```

### useApp - 应用控制

```tsx
import { useApp } from 'ink';

const { exit } = useApp();

// 退出应用
exit();
```

## 实际应用示例

### 聊天界面

```tsx
const ChatInterface = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  useInput((inputKey, key) => {
    if (key.return) {
      setMessages([...messages, { role: 'user', content: input }]);
      setInput('');
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      <Box flexGrow={1}>
        {messages.map((msg, i) => (
          <Text key={i} color={msg.role === 'user' ? 'cyan' : 'green'}>
            [{msg.role}]: {msg.content}
          </Text>
        ))}
      </Box>
      <Box borderStyle="single">
        <Text>You: {input}</Text>
      </Box>
    </Box>
  );
};
```

### 选择器

```tsx
import SelectInput from 'ink-select-input';

const options = [
  { label: '选项1', value: '1' },
  { label: '选项2', value: '2' },
];

<SelectInput
  items={options}
  onSelect={(item) => console.log(item.value)}
/>
```

### 表格

```tsx
import Table from 'ink-table';

const data = [
  { 任务: '开发功能', 状态: '完成', 耗时: '2.5s' },
  { 任务: '编写测试', 状态: '进行中', 耗时: '1.2s' },
];

<Table data={data} />
```

## 与现有系统集成

### 方式1：完全替换（推荐）

使用 Ink 完全重写交互界面：

```typescript
import { startInkUI } from './cli/ink-ui';

const agent = new ProjectAgent(...);
await agent.loadConfig();

startInkUI({ agent });
```

### 方式2：渐进式迁移

保留现有代码，逐步迁移：

```typescript
// 在 HybridModeManager 中添加选项
const hybrid = createHybridModeManager(agent, {
  useInkUI: true,  // 使用 Ink UI
});
```

## 优势对比

| 特性 | 当前方案 | Ink |
|------|---------|-----|
| 组件化 | ❌ | ✅ React 组件 |
| 布局系统 | 手动 | ✅ Flexbox |
| 状态管理 | 手动 | ✅ React Hooks |
| 调试工具 | ❌ | ✅ React DevTools |
| 生态组件 | 少 | ✅ 丰富的组件库 |
| 性能 | 一般 | ✅ 增量渲染 |
| 学习曲线 | 低 | 中（需要 React 知识） |

## 运行示例

```bash
# 运行 Ink UI 演示
npx tsx examples/ink-ui-demo.tsx
```

## 参考资源

- [Ink 官方文档](https://github.com/vadimdemedes/ink)
- [Ink 组件库](https://github.com/vadimdemedes/ink#useful-components)
- [Claude Code 源码](https://github.com/anthropics/claude-code)（参考实现）

## 迁移建议

1. **小步迁移**：先在一个功能上试用 Ink
2. **保留兼容**：保持现有 API 兼容
3. **逐步替换**：逐步将交互界面迁移到 Ink
4. **测试充分**：确保所有功能正常工作

## 下一步

- [ ] 安装 Ink 和相关组件
- [ ] 创建基础的 Ink UI 组件
- [ ] 集成到 HybridModeManager
- [ ] 迁移现有功能到 Ink
- [ ] 添加更多交互组件（表格、选择器等）
