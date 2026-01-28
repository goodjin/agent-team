# 更新日志

## [1.1.0] - 2025-01-24

### 🎉 新增功能

#### 智能服务商切换
- 当配置的服务商没有有效的 API key 时，自动选择其他可用的服务商
- 优先级顺序：角色专属服务商 → 默认服务商 → fallbackOrder 中的第一个可用服务商
- 在切换时输出友好的警告信息

#### 服务商启用/禁用控制
- 通过 `enabled` 字段控制哪些服务商参与自动切换
- 未启用的服务商配置保留，方便随时切换
- 只需修改 `enabled` 字段即可快速切换服务商
- 支持开发/测试/生产环境使用不同的服务商配置

#### 友好的错误提示
- 当 LLM 调用失败时，显示详细的错误信息
- 包含 HTTP 状态码、API 返回的完整错误信息
- 提供配置检查建议和示例
- 非阻塞式错误处理，程序继续执行

#### 环境变量自动展开
- `llm.config.json` 中的 `${VAR_NAME}` 格式会自动替换为环境变量值
- 支持在配置文件中使用环境变量占位符

#### API Key 验证
- 自动检测无效的 API key（空字符串、占位符等）
- 在调用 LLM 前验证，提前发现问题

### 📝 文档更新

- 新增 [docs/PROVIDER_ENABLE_GUIDE.md](docs/PROVIDER_ENABLE_GUIDE.md) - 服务商启用/禁用完整指南
- 新增 [docs/RETRY_GUIDE.md](docs/RETRY_GUIDE.md) - 配置错误处理指南
- 更新 [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - 添加新功能说明

### 📝 文档更新

- 新增 [docs/RETRY_GUIDE.md](docs/RETRY_GUIDE.md) - 配置重试机制完整指南
- 更新 [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - 添加新功能说明

### 🔧 改进

- **llm-config.ts**
  - 新增 `expandEnvVars()` 方法 - 自动展开环境变量
  - 新增 `hasValidApiKey()` 方法 - 检查 API key 是否有效
  - 新增 `getFirstAvailableProvider()` 方法 - 获取第一个可用的服务商
  - 改进 `getRoleLLMConfig()` - 自动选择有有效 API key 的服务商
  - 放宽验证规则 - 不再强制要求所有服务商都有 apiKey

- **llm.service.ts**
  - 新增 `isValidApiKey()` 函数 - 检查 API key 有效性
  - 新增 `promptUserToRetry()` 函数 - 显示友好的重试提示
  - 改进 `AnthropicService.complete()` - 添加 API key 验证和认证错误处理
  - 改进 `OpenAIService.complete()` - 添加 API key 验证和认证错误处理

- **examples/basic-usage.ts**
  - 新增 `runWithRetry()` 包装器 - 支持配置重试
  - 添加 dotenv 环境变量加载
  - 所有示例函数现在都支持重试

### 📦 依赖更新

- 新增 `dotenv` - 环境变量加载
- 新增 `@types/dotenv` - TypeScript 类型定义

### 🐛 修复

- 修复了示例文件中的 import 语句位置错误
- 所有 TypeScript 编译错误已解决

## 使用示例

### 基本使用（自动重试）

```typescript
import { ProjectAgent } from 'project-agent';
import { config } from 'dotenv';

config(); // 加载环境变量

async function runWithRetry(taskFn: () => Promise<void>) {
  while (true) {
    try {
      await taskFn();
      break;
    } catch (error) {
      if (error instanceof Error && error.message === 'USER_RETRY') {
        console.log('\n🔄 重新加载配置...\n');
        config();
        continue;
      }
      throw error;
    }
  }
}

async function myTask() {
  const agent = new ProjectAgent(config, {
    llm: './llm.config.json',
  });

  await agent.loadConfig();
  await agent.developFeature({ ... });
}

runWithRetry(myTask);
```

### 配置文件示例

**.env**
```bash
ANTHROPIC_API_KEY=sk-ant-xxxxx
OPENAI_API_KEY=sk-xxxxx
DASHSCOPE_API_KEY=sk-xxxxx
```

**llm.config.json**
```json
{
  "version": "1.0.0",
  "defaultProvider": "anthropic-primary",
  "providers": {
    "anthropic-primary": {
      "name": "Anthropic 主服务",
      "provider": "anthropic",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "models": {
        "sonnet": {
          "model": "claude-3-sonnet-20240229",
          "maxTokens": 4000,
          "temperature": 0.7
        }
      },
      "enabled": true
    }
  }
}
```

## 迁移指南

如果你已经在使用 Project Agent，需要做以下更改：

1. **安装依赖**
   ```bash
   npm install dotenv
   npm install --save-dev @types/dotenv
   ```

2. **在代码中加载环境变量**
   ```typescript
   import { config } from 'dotenv';
   config();
   ```

3. **（可选）使用环境变量**
   将 `llm.config.json` 中的 API key 改为：
   ```json
   "apiKey": "${ANTHROPIC_API_KEY}"
   ```

4. **（可选）添加重试支持**
   参考 `examples/basic-usage.ts` 中的 `runWithRetry()` 函数

## 测试

运行测试脚本验证新功能：

```bash
npx tsx test-retry.ts
```

这个脚本会演示配置错误时的重试流程。
