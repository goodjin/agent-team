# Task 1: 更新 LLM 配置系统

**优先级**: P0
**预计工时**: 4 小时
**依赖**: 无
**状态**: 待执行

---

## 目标

1. 更新 `config/llm.yaml` 配置文件，增加权重配置
2. 添加 MiniMax 和 BigModel 服务商配置
3. 实现权重选择逻辑
4. 实现配置验证脚本

---

## 输入

- 现有配置文件：`config/llm.yaml`
- 需求文档：`docs/v5/03-llm-providers.md`

---

## 输出

- 更新后的配置文件：`config/llm.yaml`
- 配置验证脚本：`scripts/validate-llm-config.ts`
- 更新的配置管理器：`src/services/llm-config.ts`

---

## 实现步骤

### 步骤 1: 更新配置文件

编辑 `config/llm.yaml`，添加以下内容：

```yaml
version: "5.0.0"

# 默认服务商
defaultProvider: "openai"

# 服务商配置
providers:
  openai:
    name: "OpenAI"
    provider: "openai"
    apiKey: "${OPENAI_API_KEY}"
    baseURL: ""
    weight: 10
    enabled: true
    timeout: 60000
    maxRetries: 3
    models:
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
    provider: "openai"
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
    provider: "openai"
    apiKey: "${QWEN_API_KEY}"
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
    weight: 6
    enabled: false
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
    provider: "openai"
    apiKey: "${MINIMAX_API_KEY}"
    baseURL: ""
    weight: 5
    enabled: false
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
    provider: "bigmodel"
    apiKey: "${BIGMODEL_API_KEY}"
    baseURL: "https://open.bigmodel.cn/api/paas/v4"
    weight: 5
    enabled: false
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

### 步骤 2: 实现配置管理器

创建或更新 `src/services/llm-config.ts`：

```typescript
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

export interface ModelConfig {
  model: string;
  maxTokens: number;
  contextWindow: number;
}

export interface ProviderConfig {
  name: string;
  provider: string;
  apiKey: string;
  baseURL?: string;
  weight: number;
  enabled: boolean;
  timeout: number;
  maxRetries: number;
  models: Record<string, ModelConfig>;
}

export interface RoleMappingConfig {
  provider: string;
  model: string;
}

export interface LLMConfig {
  version: string;
  defaultProvider: string;
  providers: Record<string, ProviderConfig>;
  roleMapping: Record<string, RoleMappingConfig>;
}

export class LLMConfigManager {
  private config: LLMConfig | null = null;

  async loadFromFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const rawConfig = yaml.load(content) as any;

    // 替换环境变量
    this.config = this.resolveEnvVars(rawConfig);
  }

  private resolveEnvVars(config: any): LLMConfig {
    const resolved = JSON.parse(
      JSON.stringify(config).replace(
        /\$\{([^}]+)\}/g,
        (_, key) => process.env[key] || ''
      )
    );
    return resolved;
  }

  /**
   * 获取可用的服务商列表
   */
  getAvailableProviders(): ProviderConfig[] {
    if (!this.config) {
      throw new Error('Config not loaded');
    }

    return Object.values(this.config.providers).filter(
      (provider) =>
        provider.enabled &&
        provider.weight > 0 &&
        provider.apiKey !== ''
    );
  }

  /**
   * 按权重随机选择服务商
   */
  selectProvider(): ProviderConfig {
    const available = this.getAvailableProviders();

    if (available.length === 0) {
      throw new Error('No available providers');
    }

    // 计算总权重
    const totalWeight = available.reduce((sum, p) => sum + p.weight, 0);

    // 随机选择
    let random = Math.random() * totalWeight;

    for (const provider of available) {
      random -= provider.weight;
      if (random <= 0) {
        return provider;
      }
    }

    // 兜底返回第一个
    return available[0];
  }

  /**
   * 获取指定服务商
   */
  getProvider(providerName: string): ProviderConfig | null {
    if (!this.config) {
      throw new Error('Config not loaded');
    }

    const provider = this.config.providers[providerName];

    if (!provider) {
      return null;
    }

    // 检查是否可用
    if (!provider.enabled || provider.weight === 0 || provider.apiKey === '') {
      return null;
    }

    return provider;
  }

  /**
   * 获取角色专属服务商
   */
  getProviderForRole(role: string): ProviderConfig | null {
    if (!this.config) {
      throw new Error('Config not loaded');
    }

    const mapping = this.config.roleMapping[role];
    if (!mapping) {
      return null;
    }

    return this.getProvider(mapping.provider);
  }

  /**
   * 验证配置
   */
  async validateConfig(): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    summary: {
      totalProviders: number;
      enabledProviders: number;
      readyToUse: number;
    };
    providers: Array<{
      name: string;
      enabled: boolean;
      hasApiKey: boolean;
      weight: number;
      readyToUse: boolean;
    }>;
    recommendations: string[];
  }> {
    if (!this.config) {
      throw new Error('Config not loaded');
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    const providerDetails: Array<any> = [];

    let totalProviders = 0;
    let enabledProviders = 0;
    let readyToUse = 0;

    for (const [key, provider] of Object.entries(this.config.providers)) {
      totalProviders++;

      const hasApiKey = provider.apiKey !== '';
      const isEnabled = provider.enabled;
      const hasWeight = provider.weight > 0;
      const isReady = isEnabled && hasApiKey && hasWeight;

      if (isEnabled) {
        enabledProviders++;
      }

      if (isReady) {
        readyToUse++;
      }

      providerDetails.push({
        name: provider.name,
        enabled: isEnabled,
        hasApiKey,
        weight: provider.weight,
        readyToUse: isReady,
      });

      // 检查错误
      if (isEnabled && !hasApiKey) {
        warnings.push(`${provider.name}: enabled but missing API key`);
      }

      if (isEnabled && provider.weight === 0) {
        warnings.push(`${provider.name}: enabled but weight is 0`);
      }

      // 检查模型配置
      if (Object.keys(provider.models).length === 0) {
        errors.push(`${provider.name}: no models configured`);
      }
    }

    // 建议
    if (readyToUse === 0) {
      recommendations.push('No providers ready to use. Please configure at least one provider with API key.');
    } else if (readyToUse === 1) {
      recommendations.push('Only one provider available. Consider configuring backup providers.');
    }

    if (readyToUse < totalProviders / 2) {
      recommendations.push('More than half of providers are disabled. Consider enabling more providers for redundancy.');
    }

    return {
      valid: errors.length === 0 && readyToUse > 0,
      errors,
      warnings,
      summary: {
        totalProviders,
        enabledProviders,
        readyToUse,
      },
      providers: providerDetails,
      recommendations,
    };
  }
}
```

### 步骤 3: 创建验证脚本

创建 `scripts/validate-llm-config.ts`：

```typescript
import { LLMConfigManager } from '../src/services/llm-config.js';
import path from 'path';

async function main() {
  const configPath = path.join(process.cwd(), 'config/llm.yaml');

  console.log('🔍 Validating LLM configuration...\n');
  console.log(`Config file: ${configPath}\n`);

  const manager = new LLMConfigManager();

  try {
    await manager.loadFromFile(configPath);
    console.log('✅ Config file loaded successfully\n');
  } catch (error) {
    console.error('❌ Failed to load config file:', error);
    process.exit(1);
  }

  const validation = await manager.validateConfig();

  // 打印摘要
  console.log('📊 Summary:');
  console.log(`  Total providers: ${validation.summary.totalProviders}`);
  console.log(`  Enabled: ${validation.summary.enabledProviders}`);
  console.log(`  Ready to use: ${validation.summary.readyToUse}\n`);

  // 打印服务商详情
  console.log('📋 Providers:');
  validation.providers.forEach((p) => {
    const status = p.readyToUse ? '✅' : '⚠️';
    console.log(`  ${status} ${p.name}`);
    console.log(`     Enabled: ${p.enabled}, API Key: ${p.hasApiKey ? 'Yes' : 'No'}, Weight: ${p.weight}`);
  });
  console.log();

  // 打印错误
  if (validation.errors.length > 0) {
    console.log('❌ Errors:');
    validation.errors.forEach((err) => console.log(`  - ${err}`));
    console.log();
  }

  // 打印警告
  if (validation.warnings.length > 0) {
    console.log('⚠️  Warnings:');
    validation.warnings.forEach((warn) => console.log(`  - ${warn}`));
    console.log();
  }

  // 打印建议
  if (validation.recommendations.length > 0) {
    console.log('💡 Recommendations:');
    validation.recommendations.forEach((rec) => console.log(`  - ${rec}`));
    console.log();
  }

  // 最终结果
  if (validation.valid) {
    console.log('✅ Configuration is valid and ready to use!\n');
    process.exit(0);
  } else {
    console.log('❌ Configuration has issues. Please fix them before using.\n');
    process.exit(1);
  }
}

main();
```

### 步骤 4: 更新 package.json

添加验证脚本到 `package.json`：

```json
{
  "scripts": {
    "validate-config": "tsx scripts/validate-llm-config.ts"
  }
}
```

---

## 验收标准

- ✅ 配置文件包含所有服务商（OpenAI, Claude, DeepSeek, Qwen, MiniMax, BigModel）
- ✅ 每个服务商都有 weight 配置
- ✅ 权重选择逻辑正确（按权重比例随机选择）
- ✅ `weight: 0` 或 `apiKey` 为空的服务商被过滤
- ✅ 配置验证脚本可以正常运行

---

## 测试用例

### 测试 1: 权重选择

```typescript
// 测试权重选择逻辑
const manager = new LLMConfigManager();
await manager.loadFromFile('config/llm.yaml');

const selections = new Map<string, number>();

// 运行 1000 次，统计选择分布
for (let i = 0; i < 1000; i++) {
  const provider = manager.selectProvider();
  selections.set(provider.name, (selections.get(provider.name) || 0) + 1);
}

// 验证分布接近权重比例
console.log(selections);
// 预期: OpenAI ~40%, Claude ~32%, DeepSeek ~28%
```

### 测试 2: 过滤不可用服务商

```typescript
// 设置环境变量为空
process.env.QWEN_API_KEY = '';

const manager = new LLMConfigManager();
await manager.loadFromFile('config/llm.yaml');

const available = manager.getAvailableProviders();

// 验证 Qwen 不在可用列表中
const hasQwen = available.some(p => p.name.includes('Qwen'));
console.assert(!hasQwen, 'Qwen should not be available');
```

### 测试 3: 配置验证

```bash
npm run validate-config
```

预期输出：
```
🔍 Validating LLM configuration...

Config file: /path/to/config/llm.yaml

✅ Config file loaded successfully

📊 Summary:
  Total providers: 6
  Enabled: 3
  Ready to use: 3

📋 Providers:
  ✅ OpenAI
     Enabled: true, API Key: Yes, Weight: 10
  ✅ Anthropic Claude
     Enabled: true, API Key: Yes, Weight: 8
  ✅ DeepSeek
     Enabled: true, API Key: Yes, Weight: 7
  ⚠️  Qwen (通义千问)
     Enabled: false, API Key: No, Weight: 6
  ⚠️  MiniMax
     Enabled: false, API Key: No, Weight: 5
  ⚠️  BigModel (智谱 GLM)
     Enabled: false, API Key: No, Weight: 5

✅ Configuration is valid and ready to use!
```

---

## 相关文档

- 需求文档：`docs/v5/01-requirements.md`
- 架构设计：`docs/v5/02-architecture.md`
- LLM 配置说明：`docs/v5/03-llm-providers.md`
- 任务拆分：`docs/v5/04-task-breakdown.md`

---

## 注意事项

1. **环境变量**：API Key 应该通过环境变量设置，不要硬编码在配置文件中
2. **权重配置**：权重为 0 表示服务商不可用，即使 `enabled: true`
3. **空 API Key**：如果 `apiKey` 为空字符串，服务商也不可用
4. **配置验证**：每次修改配置后都应运行 `npm run validate-config` 验证

---

**任务完成标志**：

- [ ] 配置文件更新完成
- [ ] 配置管理器实现完成
- [ ] 验证脚本实现完成
- [ ] 所有测试用例通过
- [ ] 验证脚本运行正常
