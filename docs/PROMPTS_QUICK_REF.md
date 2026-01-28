# 提示词配置快速参考

## 配置位置速查

### 配置文件位置

```
project-agent/
├── prompts/                      # 提示词配置目录
│   ├── config.json              # 主配置
│   ├── roles/                   # 角色提示词
│   │   ├── product-manager.json
│   │   ├── architect.json
│   │   ├── developer.json
│   │   ├── tester.json
│   │   └── doc-writer.json
│   └── templates/               # 任务模板（可选）
│       ├── analysis.md
│       └── review.md
└── custom-prompts.json          # 单文件配置（可选）
```

### API Key 配置

```bash
# .env 文件
ANTHROPIC_API_KEY=sk-ant-xxxxx
OPENAI_API_KEY=sk-xxxxx
```

## 快速配置

### 方式一：使用配置目录（推荐）

```typescript
import { ProjectAgent } from 'project-agent';

const agent = new ProjectAgent(
  {
    projectName: 'my-app',
    projectPath: '/path/to/project',
    llmConfig: {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-opus-20240229',
    },
  },
  './prompts'  // ← 提示词配置目录
);

await agent.loadPrompts();  // 预加载提示词
```

### 方式二：使用单个配置文件

```typescript
const agent = new ProjectAgent(
  config,
  './prompts.json'  // ← 单个配置文件
);
```

### 方式三：动态设置

```typescript
const agent = new ProjectAgent(config);

agent.setPromptConfigPath('./prompts');
await agent.loadPrompts();
```

## 提示词文件格式

### roles/product-manager.json

```json
{
  "systemPrompt": "你是一位产品经理...",
  "temperature": 0.7,
  "maxTokens": 5000,
  "contexts": {
    "b2b": "B2B 场景提示词...",
    "b2c": "B2C 场景提示词..."
  },
  "templates": {
    "analysis": "需求分析模板...",
    "roadmap": "路线图模板..."
  }
}
```

### prompts/product-manager.md（简化版）

```markdown
你是一位产品经理...

## 专业领域
...

## 工作原则
...
```

## 使用场景变体

```typescript
import { RoleFactory } from 'project-agent';

// 创建 B2B 场景的产品经理
const b2bPM = RoleFactory.createRole(
  'product-manager',
  llmService,
  'b2b'  // ← 使用 b2b 上下文
);

// 创建 B2C 场景的产品经理
const b2cPM = RoleFactory.createRole(
  'product-manager',
  llmService,
  'b2c'  // ← 使用 b2c 上下文
);
```

## 使用任务模板

```typescript
import { getPromptLoader } from 'project-agent';

const loader = getPromptLoader();
await loader.loadFromDirectory('./prompts');

// 获取模板
const template = loader.getTemplate('product-manager', 'analysis');

// 渲染模板
const rendered = loader.renderTemplate(template, {
  title: '用户登录',
  requirements: '- 邮箱登录\n- 手机登录',
});

console.log(rendered);
```

## 配置优先级

1. 代码中的 `customPrompt` 参数（最高）
2. 配置文件中的 `contexts[contextName]`
3. 配置文件中的 `systemPrompt`
4. 默认内置提示词（最低）

## 预置角色

| 角色类型 | 配置文件 | 主要职责 |
|----------|----------|----------|
| `product-manager` | `product-manager.json` | 需求分析、产品设计 |
| `architect` | `architect.json` | 系统架构、技术选型 |
| `developer` | `developer.json` | 代码开发、测试 |
| `tester` | `tester.json` | 测试策略、用例编写 |
| `doc-writer` | `doc-writer.json` | 文档编写 |

## 配置文件字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `systemPrompt` | string | 系统提示词（必填） |
| `temperature` | number | LLM 温度（0-1） |
| `maxTokens` | number | 最大 token 数 |
| `contexts` | object | 场景变体 |
| `templates` | object | 任务模板 |

## 示例命令

```bash
# 安装依赖
npm install

# 构建项目
npm run build

# 运行示例
npm run example

# 运行带提示词配置的示例
tsx examples/with-prompts-config.ts run

# 创建自定义配置
tsx examples/with-prompts-config.ts create
```

## 文档

- [完整提示词配置指南](PROMPTS_GUIDE.md)
- [快速入门指南](QUICK_START.md)
- [README](../README.md)
