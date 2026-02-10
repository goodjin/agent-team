# Agent Team v5.0 - LLM 服务商配置

**版本**: 5.0.0
**日期**: 2025-02-07

---

## 一、支持的服务商

| 服务商 | 接入方式 | SDK | 优先级 |
|--------|---------|-----|--------|
| OpenAI | 官方 SDK | `openai` | P0 |
| Anthropic (Claude) | 官方 SDK | `@anthropic-ai/sdk` | P0 |
| DeepSeek | 兼容 OpenAI | `openai` | P0 |
| Qwen (通义千问) | 兼容 OpenAI | `openai` | P1 |
| MiniMax | 兼容 OpenAI/Anthropic | `openai` | P1 |
| BigModel (智谱 GLM) | HTTP 调用 | 无（自行实现） | P1 |

---

## 二、配置文件格式

### 2.1 配置文件位置

```
config/llm.yaml
```

### 2.2 配置文件结构

```yaml
version: "5.0.0"

# 默认服务商
defaultProvider: "openai"

# 服务商配置
providers:
  openai:
    name: "OpenAI"
    provider: "openai"
    apiKey: "${OPENAI_API_KEY}"        # 从环境变量读取
    baseURL: ""                        # 留空使用默认
    weight: 10                         # 权重，0 表示不可用
    enabled: true                      # 是否启用
    timeout: 60000                     # 超时时间（毫秒）
    maxRetries: 3                      # 最大重试次数
    models:                            # 支持的模型
      gpt-4-turbo:
        model: "gpt-4-turbo-preview"
        maxTokens: 128000
        contextWindow: 128000
      gpt-4o:
        model: "gpt-4o"
        maxTokens: 128000
        contextWindow: 128000
      gpt-4o-mini:
        model: "gpt-4o-mini"
        maxTokens: 128000
        contextWindow: 128000

  claude:
    name: "Anthropic Claude"
    provider: "anthropic"
    apiKey: "${ANTHROPIC_API_KEY}"
    weight: 8
    enabled: true
    timeout: 60000
    maxRetries: 3
    models:
      claude-3-5-sonnet:
        model: "claude-3-5-sonnet-20241022"
        maxTokens: 200000
        contextWindow: 200000
      claude-3-5-haiku:
        model: "claude-3-5-haiku-20241022"
        maxTokens: 200000
        contextWindow: 200000

  deepseek:
    name: "DeepSeek"
    provider: "openai"                 # 兼容 OpenAI SDK
    apiKey: "${DEEPSEEK_API_KEY}"
    baseURL: "https://api.deepseek.com/v1"
    weight: 7
    enabled: true
    timeout: 60000
    maxRetries: 3
    models:
      deepseek-chat:
        model: "deepseek-chat"
        maxTokens: 64000
        contextWindow: 64000

  qwen:
    name: "Qwen (通义千问)"
    provider: "openai"                 # 兼容 OpenAI SDK
    apiKey: "${QWEN_API_KEY}"
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
    weight: 6
    enabled: false                     # 默认禁用
    timeout: 60000
    maxRetries: 3
    models:
      qwen-max:
        model: "qwen-max"
        maxTokens: 8000
        contextWindow: 30000
      qwen-turbo:
        model: "qwen-turbo"
        maxTokens: 8000
        contextWindow: 8000

  minimax:
    name: "MiniMax"
    provider: "openai"                 # 兼容 OpenAI/Anthropic SDK
    apiKey: "${MINIMAX_API_KEY}"
    baseURL: ""                        # 需要填写实际的 endpoint
    weight: 5
    enabled: false                     # 默认禁用
    timeout: 60000
    maxRetries: 3
    models:
      minimax-m2-1:
        model: "MiniMax-M2.1"
        maxTokens: 204800
        contextWindow: 204800
      minimax-m2-1-lightning:
        model: "MiniMax-M2.1-lightning"
        maxTokens: 204800
        contextWindow: 204800

  bigmodel:
    name: "BigModel (智谱 GLM)"
    provider: "bigmodel"               # 自定义适配器
    apiKey: "${BIGMODEL_API_KEY}"
    baseURL: "https://open.bigmodel.cn/api/paas/v4"
    weight: 5
    enabled: false                     # 默认禁用
    timeout: 60000
    maxRetries: 3
    models:
      glm-4:
        model: "glm-4"
        maxTokens: 128000
        contextWindow: 128000
      glm-4-flash:
        model: "glm-4-flash"
        maxTokens: 128000
        contextWindow: 128000

# 角色专属服务商配置
roleMapping:
  master-agent:
    provider: "claude"
    model: "claude-3-5-sonnet-20241022"

  developer:
    provider: "openai"
    model: "gpt-4-turbo-preview"

  tester:
    provider: "deepseek"
    model: "deepseek-chat"

  architect:
    provider: "claude"
    model: "claude-3-5-sonnet-20241022"
```

---

## 三、权重配置说明

### 3.1 权重含义

**权重（weight）**：用于负载均衡和服务商选择

- `weight > 0`：可用，权重越高，被选中的概率越高
- `weight = 0`：不可用，不会被选择
- 权重是相对值，不是绝对值

### 3.2 选择策略

当未指定服务商时，系统按以下策略选择：

1. **过滤不可用的服务商**
   - `enabled: false` → 过滤掉
   - `weight: 0` → 过滤掉
   - `apiKey` 为空 → 过滤掉

2. **按权重比例随机选择**
   ```
   假设配置：
   - openai: weight = 10
   - claude: weight = 8
   - deepseek: weight = 7

   总权重 = 10 + 8 + 7 = 25

   选中概率：
   - openai: 10/25 = 40%
   - claude: 8/25 = 32%
   - deepseek: 7/25 = 28%
   ```

3. **Fallback 机制**
   - 如果首选服务商失败，尝试下一个
   - 按权重从高到低尝试
   - 全部失败后抛出错误

### 3.3 权重配置建议

| 场景 | 建议权重分配 |
|------|-------------|
| **主要使用 OpenAI** | openai: 10, 其他: 3-5 |
| **主要使用 Claude** | claude: 10, 其他: 3-5 |
| **平均分配** | 所有: 5 |
| **备用服务商** | 主: 10, 备: 3 |
| **禁用某服务商** | weight: 0 或 enabled: false |

---

## 四、环境变量配置

### 4.1 .env 文件

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...

# DeepSeek
DEEPSEEK_API_KEY=sk-...

# Qwen (通义千问)
QWEN_API_KEY=sk-...

# MiniMax
MINIMAX_API_KEY=...

# BigModel (智谱 GLM)
BIGMODEL_API_KEY=...
```

### 4.2 环境变量说明

- 配置文件中使用 `${ENV_VAR}` 引用环境变量
- 如果环境变量未设置，`apiKey` 为空字符串
- `apiKey` 为空的服务商不会被选择

---

## 五、服务商接入详情

### 5.1 OpenAI

**SDK**：`openai`

**安装**：
```bash
npm install openai
```

**特点**：
- ✅ 官方 SDK，稳定可靠
- ✅ 支持流式输出
- ✅ 自动重试
- ✅ TypeScript 类型支持

**模型推荐**：
- 高质量：`gpt-4-turbo` 或 `gpt-4o`
- 性价比：`gpt-4o-mini`

**API Endpoint**：
- 默认：`https://api.openai.com/v1`

---

### 5.2 Anthropic (Claude)

**SDK**：`@anthropic-ai/sdk`

**安装**：
```bash
npm install @anthropic-ai/sdk
```

**特点**：
- ✅ 官方 SDK
- ✅ 上下文窗口最大（200K tokens）
- ✅ 支持流式输出
- ✅ 工具调用能力强

**模型推荐**：
- 高质量：`claude-3-5-sonnet-20241022`
- 快速：`claude-3-5-haiku-20241022`

**API Endpoint**：
- 默认：Anthropic 官方 API

---

### 5.3 DeepSeek

**SDK**：兼容 OpenAI SDK

**安装**：
```bash
npm install openai
```

**配置**：
```typescript
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com/v1',
});
```

**特点**：
- ✅ 完全兼容 OpenAI API
- ✅ 性价比高
- ✅ 代码能力强

**模型推荐**：
- `deepseek-chat`

**API Endpoint**：
- `https://api.deepseek.com/v1`

---

### 5.4 Qwen (通义千问)

**SDK**：兼容 OpenAI SDK

**安装**：
```bash
npm install openai
```

**配置**：
```typescript
const client = new OpenAI({
  apiKey: process.env.QWEN_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});
```

**特点**：
- ✅ 兼容 OpenAI API
- ✅ 中文能力强
- ✅ 国内访问快

**模型推荐**：
- 高质量：`qwen-max`
- 快速：`qwen-turbo`

**API Endpoint**：
- `https://dashscope.aliyuncs.com/compatible-mode/v1`

**文档**：
- https://help.aliyun.com/zh/dashscope/

---

### 5.5 MiniMax

**SDK**：兼容 OpenAI SDK 或 Anthropic SDK

**安装**：
```bash
npm install openai
# 或
npm install @anthropic-ai/sdk
```

**配置**（需要根据实际情况调整）：
```typescript
const client = new OpenAI({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.chat/v1', // 示例，需确认实际 endpoint
});
```

**特点**：
- ✅ 支持 Anthropic SDK 或 OpenAI SDK 接入
- ✅ 上下文窗口大（204K tokens）
- ✅ 编程能力强

**模型推荐**：
- 高质量：`MiniMax-M2.1`
- 快速：`MiniMax-M2.1-lightning`

**API Endpoint**：
- 需要查看官方文档确认

**文档**：
- https://platform.minimaxi.com/docs/api-reference/api-overview

---

### 5.6 BigModel (智谱 GLM)

**SDK**：无官方 JS SDK，自行实现 HTTP 调用

**安装**：无需额外安装

**实现示例**：
```typescript
class BigModelAdapter implements LLMService {
  private apiKey: string;
  private baseURL: string = 'https://open.bigmodel.cn/api/paas/v4';

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model || 'glm-4',
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`BigModel API error: ${response.statusText}`);
    }

    return await response.json();
  }
}
```

**特点**：
- ✅ 中文能力强
- ✅ 国内访问快
- ⚠️ 需要自行实现 HTTP 调用

**模型推荐**：
- 高质量：`glm-4`
- 快速：`glm-4-flash`

**API Endpoint**：
- `https://open.bigmodel.cn/api/paas/v4`

**文档**：
- https://docs.bigmodel.cn/cn/api/introduction

---

## 六、配置验证

### 6.1 验证脚本

```typescript
// scripts/validate-llm-config.ts
import { LLMConfigManager } from '../src/services/llm-config.js';

async function validateConfig() {
  const manager = new LLMConfigManager();
  await manager.loadFromFile('config/llm.yaml');

  const validation = await manager.validateConfig();

  console.log('配置验证结果：');
  console.log(`总服务商数: ${validation.summary.totalProviders}`);
  console.log(`已启用: ${validation.summary.enabledProviders}`);
  console.log(`可用: ${validation.summary.readyToUse}`);

  if (validation.recommendations.length > 0) {
    console.log('\n建议：');
    validation.recommendations.forEach(rec => console.log(`  - ${rec}`));
  }

  if (validation.summary.readyToUse > 0) {
    console.log('\n可用服务商：');
    validation.providers
      .filter(p => p.readyToUse)
      .forEach(p => console.log(`  ✓ ${p.name}`));
  }
}

validateConfig();
```

### 6.2 运行验证

```bash
npm run validate-config
```

---

## 七、常见问题

### Q1: 如何禁用某个服务商？

**A**: 有三种方式：
1. 设置 `enabled: false`
2. 设置 `weight: 0`
3. 将 `apiKey` 留空或删除环境变量

### Q2: 如何指定某个任务使用特定服务商？

**A**: 在创建任务时指定 `preferredProvider`：
```typescript
taskManager.createTask({
  title: '任务标题',
  description: '任务描述',
  preferredProvider: 'claude',  // 指定使用 Claude
});
```

### Q3: 权重如何设置最合理？

**A**: 建议：
- 主力服务商：10
- 备用服务商：5-7
- 测试服务商：3
- 禁用：0

### Q4: 如何添加新的服务商？

**A**:
1. 在 `config/llm.yaml` 添加配置
2. 实现对应的适配器（`src/services/llm/adapters/xxx.ts`）
3. 在 `LLMServiceFactory` 中注册

---

**文档结束**
