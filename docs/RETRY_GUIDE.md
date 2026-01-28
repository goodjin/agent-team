# LLM 配置错误处理指南

## 概述

Project Agent 现在支持智能的 LLM 服务商选择和友好的错误提示：

1. **自动服务商切换**：如果配置的服务商没有有效的 API key，系统会自动选择其他可用的服务商
2. **友好的错误提示**：当 LLM 调用失败时，系统会显示详细的错误信息和配置建议
3. **非阻塞式错误处理**：错误会直接输出，程序继续执行，不会进入交互式重试模式

## 工作流程

### 1. 智能服务商选择

当为角色分配 LLM 服务时，系统会按以下优先级选择：

```
角色专属服务商 → 默认服务商 → 第一个有有效 API key 的服务商
```

**示例：**
```typescript
// 配置文件中定义了角色专属服务商
{
  "roleMapping": {
    "product-manager": {
      "providerName": "anthropic-primary",  // 首选
      "modelName": "sonnet"
    }
  }
}

// 如果 anthropic-primary 没有有效的 API key
// 系统会尝试：
// 1. 默认服务商 (minimax-primary)
// 2. 按照 fallbackOrder 顺序查找第一个可用的
```

### 2. API key 验证

系统会自动检查 API key 是否有效，无效的 key 包括：

- 空字符串
- 占位符（如 `your_anthropic_api_key_here`）
- 通用占位符（如 `sk-xxxxx`）
- 环境变量占位符（如 `${ANTHROPIC_API_KEY}` 未展开）

### 3. 交互式重试

当所有 LLM 调用都失败时，系统会显示：

```
============================================================
❌ LLM 服务调用失败
============================================================

原因: Anthropic API key 无效或未配置

请检查以下配置项:
  1. .env 文件是否存在并包含有效的 API Key
  2. llm.config.json 中的服务商配置是否正确
  3. 环境变量是否正确设置

示例配置:
  # .env
  ANTHROPIC_API_KEY=sk-ant-xxxxx
  OPENAI_API_KEY=sk-xxxxx
  DASHSCOPE_API_KEY=sk-xxxxx
  ZHIPU_API_KEY=xxxxx
  DEEPSEEK_API_KEY=sk-xxxxx

修改完成后，按回车键重新加载配置并重试...
或按 Ctrl+C 退出程序
```

**用户操作：**
1. 修改 `.env` 文件，添加有效的 API key
2. 按回车键
3. 系统自动重新加载配置并重试

## 配置示例

### .env 文件

```bash
# 国际服务商
ANTHROPIC_API_KEY=sk-ant-xxxxx
OPENAI_API_KEY=sk-xxxxx

# 国内服务商
DASHSCOPE_API_KEY=sk-xxxxx
ZHIPU_API_KEY=xxxxx
MINIMAX_API_KEY=xxxxx
MOONSHOT_API_KEY=sk-xxxxx
DEEPSEEK_API_KEY=sk-xxxxx
```

### llm.config.json

```json
{
  "version": "1.0.0",
  "defaultProvider": "minimax-primary",
  "fallbackOrder": [
    "anthropic-primary",
    "qwen-primary",
    "zhipu-primary",
    "minimax-primary",
    "deepseek-primary"
  ],
  "providers": {
    "anthropic-primary": {
      "name": "Anthropic 主服务",
      "provider": "anthropic",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "models": {
        "opus": {
          "model": "claude-3-opus-20240229",
          "maxTokens": 4000,
          "temperature": 0.7
        }
      },
      "enabled": true
    }
  }
}
```

## 在你的代码中支持重试

### 方法 1: 使用 runWithRetry 包装器

```typescript
import { config } from 'dotenv';

async function runWithRetry(taskFn: () => Promise<void>): Promise<void> {
  while (true) {
    try {
      await taskFn();
      break;
    } catch (error) {
      if (error instanceof Error && error.message === 'USER_RETRY') {
        console.log('\n🔄 重新加载配置...\n');
        config(); // 重新加载 .env
        continue;
      }
      throw error;
    }
  }
}

// 使用
async function myTask() {
  const agent = new ProjectAgent(config, { llm: './llm.config.json' });
  await agent.loadConfig();
  await agent.developFeature({ ... });
}

runWithRetry(myTask);
```

### 方法 2: 手动捕获错误

```typescript
import { config } from 'dotenv';

async function main() {
  while (true) {
    try {
      // 你的代码
      const agent = new ProjectAgent(...);
      await agent.loadConfig();
      await agent.developFeature({ ... });

      break; // 成功，退出循环
    } catch (error) {
      if (error instanceof Error && error.message === 'USER_RETRY') {
        config(); // 重新加载环境变量
        continue; // 重试
      }
      throw error; // 其他错误，抛出
    }
  }
}
```

## 测试重试机制

运行测试脚本：

```bash
npx tsx test-retry.ts
```

这个脚本会：
1. 加载配置
2. 尝试执行一个简单任务
3. 如果 API key 无效，显示错误提示
4. 等待用户修改后重试

## 故障转移顺序

当配置的服务商不可用时，系统会按照 `fallbackOrder` 中定义的顺序尝试：

```json
{
  "fallbackOrder": [
    "anthropic-primary",    // 1. 先尝试 Anthropic
    "qwen-primary",         // 2. 再尝试通义千问
    "zhipu-primary",        // 3. 再尝试智谱
    "minimax-primary",      // 4. 再尝试 MiniMax
    "deepseek-primary"      // 5. 最后尝试 DeepSeek
  ]
}
```

**建议：**
- 将最可靠的服务商放在前面
- 将经济实惠的服务商放在前面（如 DeepSeek、Qwen）
- 按服务质量排序（如 Opus → Sonnet → Haiku）

## 常见问题

### Q: 如何知道系统正在使用哪个服务商？

A: 系统会在切换服务商时输出警告信息：

```
⚠️  角色 product-manager 指定的服务商 anthropic-primary 没有有效的 API key
⚠️  默认服务商没有有效的 API key，使用 qwen-primary
```

### Q: 所有服务商都不可用时怎么办？

A: 系统会提示用户配置并等待重试，不会退出程序。用户只需：
1. 打开 `.env` 文件
2. 添加至少一个有效的 API key
3. 按回车键

### Q: 如何禁用重试机制？

A: 在你的代码中捕获 `USER_RETRY` 错误并直接退出：

```typescript
try {
  await agent.developFeature({ ... });
} catch (error) {
  if (error instanceof Error && error.message === 'USER_RETRY') {
    console.log('配置错误，请检查 API key');
    process.exit(1);
  }
  throw error;
}
```

### Q: 环境变量没有生效怎么办？

A: 确保：
1. `.env` 文件在项目根目录
2. 环境变量名称正确（注意大小写）
3. 在代码中调用了 `config()` 加载环境变量
4. `llm.config.json` 中使用 `${VAR_NAME}` 格式引用

## 总结

新的重试机制让 Project Agent 更加健壮和用户友好：

✅ **自动服务商切换** - 无需手动修改配置
✅ **友好的错误提示** - 清晰的配置指南
✅ **交互式重试** - 修改后即可重试，无需重启
✅ **零停机时间** - 配置错误不会导致程序崩溃
