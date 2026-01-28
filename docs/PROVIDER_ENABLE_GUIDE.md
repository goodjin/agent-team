# 服务商启用/禁用配置指南

## 概述

Project Agent 允许在配置文件中配置多个 LLM 服务商，但可以通过 `enabled` 字段控制哪些服务商实际参与自动切换。未启用的服务商配置会保留，方便随时切换。

## enabled 字段说明

每个服务商配置中都有一个 `enabled` 字段：

```json
{
  "providers": {
    "anthropic-primary": {
      "name": "Anthropic 主服务",
      "provider": "anthropic",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "models": { ... },
      "enabled": false  // 设为 false 时不参与自动切换
    },
    "minimax-primary": {
      "name": "MiniMax",
      "provider": "openai",
      "apiKey": "...",
      "models": { ... },
      "enabled": true   // 设为 true 时参与自动切换
    }
  }
}
```

## enabled 字段的行为

### `enabled: true` (默认)
- 服务商参与自动切换
- 系统会检查该服务商是否有有效的 API key
- 如果 `fallbackOrder` 中包含该服务商且 API key 有效，会被使用

### `enabled: false`
- 服务商不参与自动切换
- 配置仍然保留，可以随时启用
- 角色专属配置可以指向该服务商，但会被系统自动替换为启用的服务商

### `enabled` 字段不存在
- 默认视为 `true`（向后兼容）

## 使用场景

### 场景 1：只使用一个服务商

```json
{
  "defaultProvider": "minimax-primary",
  "fallbackOrder": ["minimax-primary"],
  "providers": {
    "minimax-primary": {
      "enabled": true,
      ...
    },
    "anthropic-primary": {
      "enabled": false,
      ...
    },
    "qwen-primary": {
      "enabled": false,
      ...
    }
  }
}
```

**效果**：只使用 MiniMax，其他服务商配置保留但不会使用

### 场景 2：使用多个服务商作为备选

```json
{
  "defaultProvider": "deepseek-primary",
  "fallbackOrder": [
    "deepseek-primary",
    "qwen-primary",
    "minimax-primary"
  ],
  "providers": {
    "deepseek-primary": {
      "enabled": true,
      ...
    },
    "qwen-primary": {
      "enabled": true,
      ...
    },
    "minimax-primary": {
      "enabled": false,
      ...
    }
  }
}
```

**效果**：
- 优先使用 DeepSeek
- DeepSeek 不可用时切换到 Qwen
- MiniMax 不会被使用（未启用）
- 其他配置保留，随时可以启用

### 场景 3：按需切换服务商

假设你想在不同时间使用不同的服务商，但不想同时启用多个：

**步骤 1**：初始配置只启用 DeepSeek
```json
{
  "defaultProvider": "deepseek-primary",
  "fallbackOrder": ["deepseek-primary"],
  "providers": {
    "deepseek-primary": { "enabled": true, ... },
    "qwen-primary": { "enabled": false, ... },
    "minimax-primary": { "enabled": false, ... }
  }
}
```

**步骤 2**：切换到 Qwen
```json
{
  "defaultProvider": "qwen-primary",
  "fallbackOrder": ["qwen-primary"],
  "providers": {
    "deepseek-primary": { "enabled": false, ... },
    "qwen-primary": { "enabled": true, ... },
    "minimax-primary": { "enabled": false, ... }
  }
}
```

**步骤 3**：切换到 MiniMax
```json
{
  "defaultProvider": "minimax-primary",
  "fallbackOrder": ["minimax-primary"],
  "providers": {
    "deepseek-primary": { "enabled": false, ... },
    "qwen-primary": { "enabled": false, ... },
    "minimax-primary": { "enabled": true, ... }
  }
}
```

### 场景 4：测试新服务商

当测试新服务商时，可以保留现有配置，只启用新服务商进行测试：

```json
{
  "defaultProvider": "test-new-provider",
  "fallbackOrder": ["test-new-provider", "deepseek-primary"],
  "providers": {
    "deepseek-primary": {
      "enabled": true,
      "apiKey": "${DEEPSEEK_API_KEY}",
      ...
    },
    "test-new-provider": {
      "enabled": true,
      "apiKey": "test-key-here",
      ...
    }
  }
}
```

测试完成后，可以将新服务商设为 `enabled: false`，或更新 API key 后保留启用。

## 自动切换逻辑

系统按以下顺序选择服务商：

```
1. 角色专属服务商（如果启用且有有效 API key）
   ↓ (未启用或无有效 API key)
2. 默认服务商（如果启用且有有效 API key）
   ↓ (未启用或无有效 API key)
3. 按照 fallbackOrder 顺序查找第一个启用的服务商且有有效 API key
   ↓
4. 如果都不可用，返回 null 并输出警告
```

## 启用/禁用最佳实践

### 开发环境
- 启用经济实惠的服务商：DeepSeek、Qwen Turbo、MiniMax ABAB5.5
- 禁用昂贵的服务商：GPT-4、Claude Opus

```json
{
  "providers": {
    "deepseek-primary": { "enabled": true },
    "qwen-primary": { "enabled": true },
    "minimax-primary": { "enabled": true },
    "anthropic-primary": { "enabled": false }
  }
}
```

### 生产环境
- 启用高质量的服务商：Claude Opus、GPT-4、Qwen Max
- 配置多个服务商作为备份

```json
{
  "fallbackOrder": [
    "anthropic-primary",
    "qwen-primary",
    "deepseek-primary"
  ],
  "providers": {
    "anthropic-primary": { "enabled": true },
    "qwen-primary": { "enabled": true },
    "deepseek-primary": { "enabled": true }
  }
}
```

### 测试环境
- 启用本地服务商：Ollama
- 或启用测试专用 API key

```json
{
  "defaultProvider": "ollama-local",
  "fallbackOrder": ["ollama-local"],
  "providers": {
    "ollama-local": { "enabled": true },
    "anthropic-primary": { "enabled": false }
  }
}
```

## 示例：完整配置

以下是一个完整的配置示例，只启用了 MiniMax：

```json
{
  "version": "1.0.0",
  "defaultProvider": "minimax-primary",
  "fallbackOrder": [
    "minimax-primary",
    "deepseek-primary",
    "qwen-primary"
  ],
  "providers": {
    "anthropic-primary": {
      "name": "Anthropic 主服务",
      "provider": "anthropic",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "enabled": false,
      "models": { ... }
    },
    "qwen-primary": {
      "name": "通义千问 Qwen",
      "provider": "openai",
      "apiKey": "${DASHSCOPE_API_KEY}",
      "enabled": false,
      "models": { ... }
    },
    "deepseek-primary": {
      "name": "DeepSeek",
      "provider": "openai",
      "apiKey": "${DEEPSEEK_API_KEY}",
      "enabled": false,
      "models": { ... }
    },
    "minimax-primary": {
      "name": "MiniMax",
      "provider": "openai",
      "apiKey": "your-minimax-key",
      "enabled": true,
      "models": { ... }
    }
  },
  "roleMapping": {
    "product-manager": {
      "providerName": "minimax-primary",
      "modelName": "abab6.5s-chat"
    }
  }
}
```

## 切换服务商的快速方法

### 方法 1：修改 enabled 字段

只需修改 `enabled` 字段，无需修改 API key：

```json
// 从 DeepSeek 切换到 Qwen
"deepseek-primary": { "enabled": false }
"qwen-primary": { "enabled": true }
```

### 方法 2：修改 defaultProvider 和 fallbackOrder

```json
"defaultProvider": "qwen-primary",
"fallbackOrder": ["qwen-primary", "deepseek-primary"]
```

### 方法 3：使用环境变量

```bash
# 启用 Qwen，禁用其他
export ENABLE_QWEN=true
export ENABLE_DEEPSEEK=false
export ENABLE_MINIMAX=false
```

然后在配置文件中使用条件配置。

## 注意事项

1. **至少启用一个服务商**：如果所有服务商都设置为 `enabled: false`，系统无法找到可用的服务商
2. **API key 仍然需要验证**：即使 `enabled: true`，如果 API key 无效，系统也会跳过该服务商
3. **角色映射不受影响**：角色映射可以指向未启用的服务商，系统会自动替换为启用的服务商
4. **fallbackOrder 自动过滤**：`fallbackOrder` 中未启用的服务商会自动被跳过

## 常见问题

### Q: 如果所有服务商都禁用了会怎样？

A: 系统会在调用 LLM 时输出错误，提示没有可用的服务商。

### Q: 启用/禁用会影响 API key 验证吗？

A: 不会。API key 验证是独立的检查。服务商需要同时满足 `enabled: true` 和有有效的 API key 才会被使用。

### Q: 可以为不同角色启用不同的服务商吗？

A: 可以。通过 `roleMapping` 为每个角色指定不同的服务商，然后在全局配置中启用这些服务商。

### Q: 如何快速切换到备用服务商？

A: 只需将主服务商设为 `enabled: false`，备用服务商设为 `enabled: true` 即可，无需修改 fallbackOrder 或 API key。
