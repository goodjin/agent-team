# LLM 多服务商配置指南

Project Agent 支持灵活的多服务商配置，可以为不同角色设置不同的 LLM 服务商和模型，支持故障转移，优化成本和性能。

## 配置文件结构

### 基本结构

```json
{
  "version": "1.0.0",
  "defaultProvider": "anthropic-primary",
  "fallbackOrder": ["anthropic-primary", "openai-primary", "ollama-local"],
  "providers": {
    "anthropic-primary": {
      "name": "Anthropic 主服务",
      "provider": "anthropic",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "models": {
        "opus": {
          "model": "claude-3-opus-20240229",
          "maxTokens": 4000,
          "temperature": 0.7,
          "description": "最强大的模型"
        }
      },
      "enabled": true
    }
  },
  "roleMapping": {
    "architect": {
      "providerName": "anthropic-primary",
      "modelName": "opus"
    }
  }
}
```

### 配置字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `version` | string | 是 | 配置文件版本 |
| `defaultProvider` | string | 是 | 默认服务商名称 |
| `fallbackOrder` | string[] | 否 | 故障转移顺序 |
| `providers` | object | 是 | 服务商配置对象 |
| `roleMapping` | object | 否 | 角色专属配置 |

### 服务商配置字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 服务商显示名称 |
| `provider` | string | 是 |服务商类型：`anthropic`、`openai` |
| `apiKey` | string | 是 | API 密钥（支持环境变量） |
| `baseURL` | string | 否 | 自定义 API 地址 |
| `models` | object | 是 | 模型配置对象 |
| `enabled` | boolean | 否 | 是否启用（默认 true） |

### 模型配置字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 是 | 模型名称 |
| `maxTokens` | number | 否 | 最大 token 数 |
| `temperature` | number | 否 | 温度参数（0-1） |
| `description` | string | 否 | 模型描述 |

## 使用方式

### 方式一：初始化时指定配置文件

```typescript
import { ProjectAgent } from 'agent-team';

const agent = new ProjectAgent(
  {
    projectName: 'my-app',
    projectPath: '/path/to/project',
    llmConfig: {
      // 默认配置（配置文件加载前）
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-opus-20240229',
    },
  },
  {
    prompts: './prompts',   // 提示词配置
    llm: './llm.config.json', // LLM 配置
  }
);

// 加载配置
await agent.loadConfig();
```

### 方式二：动态设置配置文件

```typescript
const agent = new ProjectAgent(config);

// 设置 LLM 配置文件
await agent.setLLMConfigPath('./llm.config.json');
```

### 方式三：编程方式配置

```typescript
import { getLLMConfigManager } from 'agent-team';

const manager = getLLMConfigManager();

manager.loadFromObject({
  version: '1.0.0',
  defaultProvider: 'anthropic',
  providers: {
    'anthropic': {
      name: 'Anthropic',
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      models: {
        'opus': {
          model: 'claude-3-opus-20240229',
          maxTokens: 4000,
        },
      },
    },
  },
});
```

## 角色专属配置

### 为角色指定服务商和模型

```typescript
const agent = new ProjectAgent(config, {
  llm: './llm.config.json',
});

await agent.loadConfig();

// 为架构师使用 Claude 3 Opus（最强）
agent.setRoleLLMProvider('architect', 'anthropic-primary', 'opus');

// 为开发者使用 Claude 3 Sonnet（平衡）
agent.setRoleLLMProvider('developer', 'anthropic-primary', 'sonnet');

// 为测试工程师使用 GPT-3.5（快速）
agent.setRoleLLMProvider('tester', 'openai-primary', 'gpt35');

// 为文档编写者使用 Claude 3 Haiku（经济）
agent.setRoleLLMProvider('doc-writer', 'anthropic-primary', 'haiku');
```

### 在配置文件中设置

```json
{
  "roleMapping": {
    "product-manager": {
      "providerName": "anthropic-primary",
      "modelName": "sonnet"
    },
    "architect": {
      "providerName": "anthropic-primary",
      "modelName": "opus"
    },
    "developer": {
      "providerName": "anthropic-primary",
      "modelName": "sonnet"
    },
    "tester": {
      "providerName": "openai-primary",
      "modelName": "gpt35"
    },
    "doc-writer": {
      "providerName": "anthropic-primary",
      "modelName": "haiku"
    }
  }
}
```

## 切换服务商

### 动态切换默认服务商

```typescript
// 切换到 OpenAI
agent.switchLLMProvider('openai-primary');

// 切换到本地 Ollama
agent.switchLLMProvider('ollama-local');
```

## 故障转移

### 配置故障转移顺序

```json
{
  "fallbackOrder": [
    "anthropic-primary",
    "anthropic-secondary",
    "openai-primary",
    "ollama-local"
  ]
}
```

### 工作原理

1. 尝试使用第一个服务商
2. 如果失败（API 错误、超时等），自动切换到下一个
3. 依次尝试所有服务商
4. 所有服务商都失败才报错

### 故障转移是自动的

```typescript
// 无需手动处理，系统自动完成
const result = await agent.execute({
  type: 'development',
  title: '开发功能',
  assignedRole: 'developer',
});

// 如果 anthropic-primary 失败，
// 自动尝试 anthropic-secondary，
// 然后是 openai-primary...
```

## 环境变量支持

API Key 支持环境变量替换：

```json
{
  "providers": {
    "anthropic": {
      "apiKey": "${ANTHROPIC_API_KEY}"
    },
    "openai": {
      "apiKey": "${OPENAI_API_KEY}"
    },
    "azure": {
      "apiKey": "${AZURE_OPENAI_API_KEY}"
    }
  }
}
```

在 `.env` 文件中设置：

```env
ANTHROPIC_API_KEY=sk-ant-xxxxx
OPENAI_API_KEY=sk-xxxxx
AZURE_OPENAI_API_KEY=xxxxx
```

## 成本优化策略

### 按角色复杂度分配模型

| 角色 | 推荐模型 | 原因 |
|------|----------|------|
| **架构师** | Claude 3 Opus / GPT-4 | 复杂架构设计需要最强推理能力 |
| **产品经理** | Claude 3 Sonnet / GPT-3.5 | 需求分析不需要最强模型 |
| **开发者** | Claude 3 Sonnet | 代码生成需要平衡性能和成本 |
| **测试工程师** | GPT-3.5 Turbo | 测试用例生成简单快速 |
| **文档编写者** | Claude 3 Haiku | 文档生成最简单任务 |

### 示例配置

```json
{
  "roleMapping": {
    "architect": {
      "providerName": "anthropic",
      "modelName": "opus"
    },
    "product-manager": {
      "providerName": "anthropic",
      "modelName": "sonnet"
    },
    "developer": {
      "providerName": "anthropic",
      "modelName": "sonnet"
    },
    "tester": {
      "providerName": "openai",
      "modelName": "gpt35"
    },
    "doc-writer": {
      "providerName": "anthropic",
      "modelName": "haiku"
    }
  }
}
```

## 支持的服务商

### Anthropic Claude

```json
{
  "anthropic": {
    "name": "Anthropic Claude",
    "provider": "anthropic",
    "apiKey": "${ANTHROPIC_API_KEY}",
    "models": {
      "opus": {
        "model": "claude-3-opus-20240229",
        "maxTokens": 4000
      },
      "sonnet": {
        "model": "claude-3-sonnet-20240229",
        "maxTokens": 4000
      },
      "haiku": {
        "model": "claude-3-haiku-20240307",
        "maxTokens": 4000
      }
    }
  }
}
```

### OpenAI

```json
{
  "openai": {
    "name": "OpenAI GPT",
    "provider": "openai",
    "apiKey": "${OPENAI_API_KEY}",
    "baseURL": "https://api.openai.com/v1",
    "models": {
      "gpt4": {
        "model": "gpt-4-turbo-preview",
        "maxTokens": 4000
      },
      "gpt35": {
        "model": "gpt-3.5-turbo",
        "maxTokens": 4000
      }
    }
  }
}
```

### Azure OpenAI

```json
{
  "azure-openai": {
    "name": "Azure OpenAI",
    "provider": "openai",
    "apiKey": "${AZURE_OPENAI_API_KEY}",
    "baseURL": "https://your-resource.openai.azure.com/openai/deployments/your-deployment",
    "models": {
      "gpt4": {
        "model": "gpt-4",
        "maxTokens": 4000
      }
    }
  }
}
```

### 本地 Ollama

```json
{
  "ollama": {
    "name": "本地 Ollama",
    "provider": "openai",
    "apiKey": "ollama",
    "baseURL": "http://localhost:11434/v1",
    "models": {
      "llama3": {
        "model": "llama3",
        "maxTokens": 4000
      },
      "mistral": {
        "model": "mistral",
        "maxTokens": 4000
      }
    },
    "enabled": false
  }
}
```

## 配置管理 API

### 查询配置信息

```typescript
const config = agent.getLLMConfig();

console.log('默认服务商:', config.defaultProvider);
console.log('可用服务商:', config.providers);
console.log('角色映射:', config.roleMapping);
```

### 保存配置

```typescript
import { getLLMConfigManager } from 'agent-team';

const manager = getLLMConfigManager();

// 修改配置
manager.switchDefaultProvider('openai');
manager.setRoleProvider('developer', 'anthropic', 'sonnet');

// 保存到文件
await manager.saveToFile('./llm.config.new.json');
```

## 完整示例

```typescript
import { ProjectAgent } from 'agent-team';

// 1. 创建 Agent 并加载配置
const agent = new ProjectAgent(
  {
    projectName: 'my-app',
    projectPath: process.cwd(),
    llmConfig: {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-opus-20240229',
    },
  },
  {
    prompts: './prompts',
    llm: './llm.config.json',
  }
);

await agent.loadConfig();

// 2. 查看配置
const llmConfig = agent.getLLMConfig();
console.log('默认服务商:', llmConfig.defaultProvider?.name);
console.log('角色专属配置:', llmConfig.roleMapping);

// 3. 动态调整
agent.setRoleLLMProvider('developer', 'openai-primary', 'gpt4');
agent.switchLLMProvider('openai-primary');

// 4. 执行任务（会自动使用配置的服务商）
const result = await agent.execute({
  type: 'development',
  title: '开发功能',
  assignedRole: 'developer',
  // 开发者角色现在使用 OpenAI GPT-4
});
```

## 最佳实践

1. **使用环境变量** - 不要在配置文件中硬编码 API Key
2. **配置故障转移** - 至少配置 2-3 个服务商确保可用性
3. **按角色分配** - 根据任务复杂度选择合适的模型
4. **成本优化** - 简单任务使用经济模型，复杂任务使用强大模型
5. **本地优先** - 开发环境可以使用 Ollama，生产环境使用云服务
6. **定期审查** - 根据使用情况和成本调整配置

## 故障排查

### 配置未生效

```typescript
// 确保加载了配置
await agent.loadConfig();

// 检查配置
console.log(agent.getLLMConfig());
```

### 环境变量未替换

```bash
# 确保设置了环境变量
export ANTHROPIC_API_KEY=sk-ant-xxxxx

# 或在 .env 文件中
echo "ANTHROPIC_API_KEY=sk-ant-xxxxx" > .env
```

### 服务商不可用

```typescript
// 检查服务商是否启用
const config = agent.getLLMConfig();
config.providers.forEach(p => {
  console.log(`${p.name}: ${p.enabled ? '启用' : '禁用'}`);
});
```

## 相关文档

- [快速入门指南](QUICK_START.md)
- [提示词配置指南](PROMPTS_GUIDE.md)
- [工作流程详解](WORKFLOW_GUIDE.md)
