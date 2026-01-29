# 国内 LLM 服务商配置指南

本文档介绍如何在 Project Agent 中配置国内主流 LLM 服务商。

## 支持的国内服务商

| 服务商 | 特点 | 适用场景 |
|--------|------|----------|
| **通义千问 Qwen** | 阿里云出品，多模型选择 | 通用场景 |
| **智谱 GLM** | 清华大学，性能优秀 | 中文场景 |
| **MiniMax** | 对话能力强，速度快 | 聊天对话 |
| **Kimi (月之暗面)** | 长文本处理，20万+上下文 | 长文档分析 |
| **DeepSeek** | 代码能力强，性价比高 | 编程开发 |
| **Involer (英码)** | 专业代码模型 | 代码生成 |

## 快速配置

### 1. 设置环境变量

在 `.env` 文件中添加相应的 API Key：

```bash
# 通义千问
DASHSCOPE_API_KEY=sk-xxxxx

# 智谱 GLM
ZHIPU_API_KEY=xxxxx

# MiniMax
MINIMAX_API_KEY=xxxxx

# Kimi
MOONSHOT_API_KEY=xxxxx

# DeepSeek
DEEPSEEK_API_KEY=xxxxx

# Involer
INVADA_API_KEY=xxxxx
```

### 2. 使用配置文件

在 `llm.config.json` 中已经预配置了所有国内服务商，只需要：

1. 设置对应的环境变量
2. 启用相应服务商（`enabled: true`）

### 3. 代码中使用

```typescript
import { ProjectAgent } from 'agent-team';

const agent = new ProjectAgent(
  {
    projectName: 'my-app',
    projectPath: process.cwd(),
    llmConfig: {
      provider: 'openai',
      apiKey: process.env.DASHSCOPE_API_KEY,
      model: 'qwen-max',
    },
  },
  {
    llm: './llm.config.json',
  }
);

await agent.loadConfig();

// 切换到国内服务商
agent.switchLLMProvider('qwen-primary');
// 或
agent.switchLLMProvider('zhipu-primary');
// 或
agent.switchLLMProvider('kimi-primary');
```

## 各服务商详细配置

### 通义千问 Qwen

**官网**: https://tongyi.aliyun.com/

**API 文档**: https://help.aliyun.com/zh/dashscope/

**模型列表**:

| 模型 | 描述 | 最大 Token | 价格 |
|------|------|------------|------|
| `qwen-max` | 超大规模语言模型，最强版本 | 6,000 | ¥ |
| `qwen-plus` | 增强版，平衡性能和成本 | 6,000 | ¥ |
| `qwen-turbo` | 高速版，响应速度快 | 8,000 | ¥ |
| `qwen-long` | 长文本版，支持30k上下文 | 10,000 | ¥ |

**配置示例**:

```typescript
const agent = new ProjectAgent({
  projectName: 'my-app',
  projectPath: process.cwd(),
  llmConfig: {
    provider: 'openai',
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-max',
  },
});
```

**角色专属配置**:

```typescript
// 产品经理使用 Qwen Plus
agent.setRoleLLMProvider('product-manager', 'qwen-primary', 'qwen-plus');

// 开发者使用 Qwen Turbo
agent.setRoleLLMProvider('developer', 'qwen-primary', 'qwen-turbo');

// 架构师使用 Qwen Max（最强）
agent.setRoleLLMProvider('architect', 'qwen-primary', 'qwen-max');
```

### 智谱 GLM

**官网**: https://open.bigmodel.cn/

**API 文档**: https://open.bigmodel.cn/dev/api

**模型列表**:

| 模型 | 描述 | 最大 Token | 特点 |
|------|------|------------|------|
| `glm-4` | GLM-4，最新版本 | 8,192 | 综合性能强 |
| `glm-4-plus` | GLM-4 Plus | 128,000 | 更强能力 |
| `glm-4-air` | GLM-4 Air | 128,000 | 轻量高效 |
| `glm-4-flash` | GLM-4 Flash | 128,000 | 极速响应 |
| `glm-3-turbo` | GLM-3 Turbo | 8,192 | 高速版 |

**配置示例**:

```typescript
const agent = new ProjectAgent({
  projectName: 'my-app',
  projectPath: process.cwd(),
  llmConfig: {
    provider: 'openai',
    apiKey: process.env.ZHIPU_API_KEY,
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4',
  },
});
```

**推荐使用场景**:

```typescript
// 中文场景首选
agent.switchLLMProvider('zhipu-primary');

// 中文文档编写
agent.setRoleLLMProvider('doc-writer', 'zhipu-primary', 'glm-4-flash');

// 中文代码开发
agent.setRoleLLMProvider('developer', 'zhipu-primary', 'glm-4-air');
```

### MiniMax

**官网**: https://www.minimaxi.com/

**API 文档**: https://www.minimaxi.com/document/

**模型列表**:

| 模型 | 描述 | 最大 Token | 特点 |
|------|------|------------|------|
| `abab6.5s-chat` | ABAB6.5s | 8,192 | 高速版 |
| `abab6.5-chat` | ABAB6.5 | 8,192 | 标准版 |
| `abab5.5-chat` | ABAB5.5 | 8,192 | 经济版 |

**配置示例**:

```typescript
const agent = new ProjectAgent({
  projectName: 'my-app',
  projectPath: process.cwd(),
  llmConfig: {
    provider: 'openai',
    apiKey: process.env.MINIMAX_API_KEY,
    baseURL: 'https://api.minimax.chat/v1',
    model: 'abab6.5s-chat',
  },
});
```

**推荐使用场景**:

```typescript
// 聊天对话场景
agent.switchLLMProvider('minimax-primary');

// 测试工程师使用 MiniMax
agent.setRoleLLMProvider('tester', 'minimax-primary', 'abab6.5s-chat');
```

### Kimi (月之暗面)

**官网**: https://www.moonshot.cn/

**API 文档**: https://platform.moonshot.cn/docs

**模型列表**:

| 模型 | 描述 | 最大 Token | 特点 |
|------|------|------------|------|
| `moonshot-v1-128k` | Kimi v1 128k | 8,192 | **超长上下文** |
| `moonshot-v1-32k` | Kimi v1 32k | 8,192 | 长上下文 |
| `moonshot-v1-8k` | Kimi v1 8k | 8,192 | 标准版 |

**配置示例**:

```typescript
const agent = new ProjectAgent({
  projectName: 'my-app',
  projectPath: process.cwd(),
  llmConfig: {
    provider: 'openai',
    apiKey: process.env.MOONSHOT_API_KEY,
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-128k',
  },
});
```

**推荐使用场景**:

```typescript
// 长文档分析
agent.switchLLMProvider('kimi-primary');

// 产品经理分析长文档
agent.setRoleLLMProvider('product-manager', 'kimi-primary', 'moonshot-v1-128k');

// 文档编写者使用 Kimi
agent.setRoleLLMProvider('doc-writer', 'kimi-primary', 'moonshot-v1-32k');
```

### DeepSeek

**官网**: https://www.deepseek.com/

**API 文档**: https://platform.deepseek.com/api-docs/

**模型列表**:

| 模型 | 描述 | 最大 Token | 特点 |
|------|------|------------|------|
| `deepseek-chat` | DeepSeek Chat | 8,192 | 通用对话 |
| `deepseek-coder` | DeepSeek Coder | 8,192 | **代码专用** |

**配置示例**:

```typescript
const agent = new ProjectAgent({
  projectName: 'my-app',
  projectPath: process.cwd(),
  llmConfig: {
    provider: 'openai',
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-coder',
  },
});
```

**推荐使用场景**:

```typescript
// 代码开发首选
agent.switchLLMProvider('deepseek-primary');

// 开发者使用 DeepSeek Coder
agent.setRoleLLMProvider('developer', 'deepseek-primary', 'deepseek-coder');

// 代码审查使用 DeepSeek
agent.setRoleLLMProvider('code-reviewer', 'deepseek-primary', 'deepseek-coder');
```

### Involer (英码)

**官网**: https://www.invoda.cn/

**API 文档**: https://www.invoda.cn/docs

**模型列表**:

| 模型 | 描述 | 最大 Token | 特点 |
|------|------|------------|------|
| `invada-lite` | Involer Lite | 4,096 | 轻量版 |
| `invada-pro` | Involer Pro | 8,192 | 专业版 |

**配置示例**:

```typescript
const agent = new ProjectAgent({
  projectName: 'my-app',
  projectPath: process.cwd(),
  llmConfig: {
    provider: 'openai',
    apiKey: process.env.INVADA_API_KEY,
    baseURL: 'https://api.invoda.cn/v1',
    model: 'invada-pro',
  },
});
```

## 成本对比

### 开发场景成本优化

| 角色 | 推荐服务商 | 推荐模型 | 原因 |
|------|------------|----------|------|
| 架构师 | Qwen / GLM | qwen-max / glm-4 | 强大的推理能力 |
| 产品经理 | Kimi | moonshot-v1-128k | 长文档分析 |
| 开发者 | DeepSeek | deepseek-coder | 代码专用，性价比高 |
| 测试工程师 | MiniMax | abab6.5s-chat | 快速测试 |
| 文档编写 | GLM | glm-4-flash | 中文文档，快速生成 |

### 完整配置示例

```json
{
  "roleMapping": {
    "architect": {
      "providerName": "qwen-primary",
      "modelName": "qwen-max"
    },
    "product-manager": {
      "providerName": "kimi-primary",
      "modelName": "moonshot-v1-128k"
    },
    "developer": {
      "providerName": "deepseek-primary",
      "modelName": "deepseek-coder"
    },
    "tester": {
      "providerName": "minimax-primary",
      "modelName": "abab6.5s-chat"
    },
    "doc-writer": {
      "providerName": "zhipu-primary",
      "modelName": "glm-4-flash"
    }
  }
}
```

## 国内专属配置示例

创建 `llm.config.domestic.json`：

```json
{
  "version": "1.0.0",
  "defaultProvider": "qwen-primary",
  "fallbackOrder": [
    "qwen-primary",
    "zhipu-primary",
    "kimi-primary",
    "deepseek-primary"
  ],
  "providers": {
    "qwen-primary": {
      "name": "通义千问",
      "provider": "openai",
      "apiKey": "${DASHSCOPE_API_KEY}",
      "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "models": {
        "qwen-max": {
          "model": "qwen-max",
          "maxTokens": 6000,
          "temperature": 0.7,
          "description": "最强版本"
        },
        "qwen-plus": {
          "model": "qwen-plus",
          "maxTokens": 6000,
          "temperature": 0.7,
          "description": "增强版"
        },
        "qwen-turbo": {
          "model": "qwen-turbo",
          "maxTokens": 8000,
          "temperature": 0.7,
          "description": "高速版"
        }
      },
      "enabled": true
    },
    "zhipu-primary": {
      "name": "智谱 GLM",
      "provider": "openai",
      "apiKey": "${ZHIPU_API_KEY}",
      "baseURL": "https://open.bigmodel.cn/api/paas/v4",
      "models": {
        "glm-4": {
          "model": "glm-4",
          "maxTokens": 8192,
          "temperature": 0.7
        },
        "glm-4-flash": {
          "model": "glm-4-flash",
          "maxTokens": 128000,
          "temperature": 0.7
        }
      },
      "enabled": true
    },
    "kimi-primary": {
      "name": "Kimi",
      "provider": "openai",
      "apiKey": "${MOONSHOT_API_KEY}",
      "baseURL": "https://api.moonshot.cn/v1",
      "models": {
        "moonshot-v1-128k": {
          "model": "moonshot-v1-128k",
          "maxTokens": 8192,
          "temperature": 0.7
        }
      },
      "enabled": true
    },
    "deepseek-primary": {
      "name": "DeepSeek",
      "provider": "openai",
      "apiKey": "${DEEPSEEK_API_KEY}",
      "baseURL": "https://api.deepseek.com",
      "models": {
        "deepseek-coder": {
          "model": "deepseek-coder",
          "maxTokens": 8192,
          "temperature": 0.7
        }
      },
      "enabled": true
    }
  },
  "roleMapping": {
    "product-manager": {
      "providerName": "kimi-primary",
      "modelName": "moonshot-v1-128k"
    },
    "architect": {
      "providerName": "qwen-primary",
      "modelName": "qwen-max"
    },
    "developer": {
      "providerName": "deepseek-primary",
      "modelName": "deepseek-coder"
    },
    "tester": {
      "providerName": "zhipu-primary",
      "modelName": "glm-4-flash"
    },
    "doc-writer": {
      "providerName": "zhipu-primary",
      "modelName": "glm-4-flash"
    }
  }
}
```

使用方式：

```typescript
const agent = new ProjectAgent(config, {
  llm: './llm.config.domestic.json',  // 国内配置
});

await agent.loadConfig();
```

## 性能建议

### 按场景选择服务商

**场景 1: 中文开发**
- 默认: 智谱 GLM-4
- 代码: DeepSeek Coder
- 文档: 通义千问 Turbo

**场景 2: 长文本处理**
- 首选: Kimi 128k
- 备选: 通义千问 Long

**场景 3: 成本优化**
- 简单任务: MiniMax ABAB5.5
- 常规任务: 智谱 GLM-3 Turbo
- 复杂任务: 通义千问 Plus

**场景 4: 速度优先**
- 极速: 智谱 GLM-4 Flash
- 快速: MiniMax ABAB6.5s
- 平衡: 通义千问 Turbo

### 混合使用策略

```typescript
// 为不同角色使用不同国内服务商
agent.setRoleLLMProvider('architect', 'qwen-primary', 'qwen-max');
agent.setRoleLLMProvider('developer', 'deepseek-primary', 'deepseek-coder');
agent.setRoleLLMProvider('product-manager', 'kimi-primary', 'moonshot-v1-128k');
agent.setRoleLLMProvider('tester', 'zhipu-primary', 'glm-4-flash');
agent.setRoleLLMProvider('doc-writer', 'minimax-primary', 'abab6.5-chat');
```

## 常见问题

### Q: 如何获取 API Key？

**通义千问**: https://dashscope.console.aliyun.com/apiKey
**智谱 GLM**: https://open.bigmodel.cn/usercenter/apikeys
**MiniMax**: https://www.minimaxi.com/user-center/basic-information/interface-key
**Kimi**: https://platform.moonshot.cn/console/api-keys
**DeepSeek**: https://platform.deepseek.com/login
**Involer**: https://www.invoda.cn/console

### Q: 国内服务商有兼容性问题吗？

所有国内服务商都使用 OpenAI 兼容的 API 格式，只需要配置正确的 `baseURL` 和 `apiKey` 即可。

### Q: 如何测试配置是否正确？

```typescript
const agent = new ProjectAgent(config, {
  llm: './llm.config.json',
});

await agent.loadConfig();

// 执行一个简单任务测试
const result = await agent.execute({
  type: 'development',
  title: '测试',
  description: '输出 "Hello World"',
  assignedRole: 'developer',
});

console.log(result.success ? '配置正确' : '配置失败');
```

### Q: 支持故障转移吗？

是的，配置 `fallbackOrder` 后，如果主服务商失败，会自动尝试备用服务商。

```json
{
  "fallbackOrder": [
    "qwen-primary",
    "zhipu-primary",
    "deepseek-primary"
  ]
}
```

## 相关文档

- [LLM 配置指南](LLM_CONFIG_GUIDE.md) - 完整配置说明
- [快速入门指南](QUICK_START.md) - 基础使用教程
- [配置文件](../llm.config.json) - 完整配置示例
