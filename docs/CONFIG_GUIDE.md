# Project Agent 配置文件

Project Agent 使用统一的配置文件来管理所有配置。默认配置文件位于 `~/.agent-team/config.yaml`。

## 配置文件位置

配置文件按以下优先级查找：

1. `~/.agent-team/config.yaml`（默认）
2. `./.agent-team.yaml`
3. `./agent.config.yaml`
4. 如果以上都不存在，将使用默认配置

也可以通过环境变量 `AGENT_CONFIG_PATH` 指定自定义路径：

```bash
export AGENT_CONFIG_PATH=/path/to/your/config.yaml
```

## 环境变量覆盖

配置支持通过环境变量覆盖，优先级高于配置文件：

| 配置项 | 环境变量 | 示例 |
|--------|---------|------|
| 默认提供商 | `AGENT_LLM_PROVIDER` | `export AGENT_LLM_PROVIDER=anthropic-primary` |
| API Keys | 见下方表格 | `export ANTHROPIC_API_KEY=sk-ant-xxx` |
| 项目名称 | `AGENT_PROJECT_NAME` | `export AGENT_PROJECT_NAME=my-project` |
| 项目路径 | `AGENT_PROJECT_PATH` | `export AGENT_PROJECT_PATH=/path/to/project` |
| 自动分析 | `AGENT_AUTO_ANALYZE` | `export AGENT_AUTO_ANALYZE=true` |
| 最大迭代 | `AGENT_MAX_ITERATIONS` | `export AGENT_MAX_ITERATIONS=20` |
| 历史长度 | `AGENT_MAX_HISTORY` | `export AGENT_MAX_HISTORY=100` |
| 自动确认 | `AGENT_AUTO_CONFIRM` | `export AGENT_AUTO_CONFIRM=true` |
| 显示思考 | `AGENT_SHOW_THOUGHTS` | `export AGENT_SHOW_THOUGHTS=true` |
| 允许删除 | `AGENT_ALLOW_DELETE` | `export AGENT_ALLOW_DELETE=true` |
| 代码执行 | `AGENT_CODE_ENABLED` | `export AGENT_CODE_ENABLED=true` |

## API Key 环境变量

| 服务商 | 环境变量 |
|--------|---------|
| Anthropic 主服务 | `ANTHROPIC_API_KEY` |
| Anthropic 备用 | `ANTHROPIC_BACKUP_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` |
| 通义千问 | `DASHSCOPE_API_KEY` |
| 智谱 GLM | `ZHIPU_API_KEY` |
| MiniMax | `MINIMAX_API_KEY` |
| Kimi | `MOONSHOT_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| Involer | `INVADA_API_KEY` |

## 配置文件结构

```yaml
# 版本号
version: "1.0.0"

# 大模型配置
llm:
  # 默认提供商
  defaultProvider: "zhipu-primary"
  
  # 提供商配置
  providers:
    anthropic-primary:
      name: "Anthropic 主服务"
      provider: "anthropic"
      # 使用环境变量引用
      apiKey: "${ANTHROPIC_API_KEY}"
      enabled: false
      models:
        opus:
          model: "claude-3-opus-20240229"
          maxTokens: 4000
          temperature: 0.7
          description: "最强大的模型，适合复杂任务"
        sonnet:
          model: "claude-3-sonnet-20240229"
          maxTokens: 4000
          temperature: 0.7
          description: "平衡性能和成本"
        haiku:
          model: "claude-3-haiku-20240307"
          maxTokens: 4000
          temperature: 0.7
          description: "快速且经济，适合简单任务"
    
    zhipu-primary:
      name: "智谱 GLM"
      provider: "openai"
      apiKey: "${ZHIPU_API_KEY}"
      baseURL: "https://open.bigmodel.cn/api/coding/paas/v4"
      enabled: true
      models:
        glm-4:
          model: "glm-4"
          maxTokens: 8192
          temperature: 0.7
        glm-4-plus:
          model: "glm-4-plus"
          maxTokens: 128000
          temperature: 0.7
        glm-4-air:
          model: "glm-4-air"
          maxTokens: 128000
          temperature: 0.7
        glm-4-flash:
          model: "glm-4-flash"
          maxTokens: 128000
          temperature: 0.7
  
  # 角色与提供商映射
  roleMapping:
    product-manager: zhipu-primary/glm-4
    architect: zhipu-primary/glm-4-plus
    developer: zhipu-primary/glm-4
    tester: zhipu-primary/glm-4-flash
    doc-writer: zhipu-primary/glm-4-air
  
  # 故障转移顺序（当首选提供商失败时）
  fallbackOrder:
    - anthropic-primary
    - anthropic-secondary
    - openai-primary
    - qwen-primary
    - zhipu-primary
    - deepseek-primary

# 项目配置
project:
  name: "my-project"
  path: "/path/to/project"
  autoAnalyze: true

# Agent 配置
agent:
  maxIterations: 10
  maxHistory: 50
  autoConfirm: false
  showThoughts: false

# 工具配置
tools:
  file:
    allowDelete: false
    allowOverwrite: true
  git:
    autoCommit: false
    confirmPush: true
  code:
    enabled: false

# 规则配置
rules:
  enabled:
    - coding-standards
    - security-rules
  disabled:
    - best-practices
    - project-rules
```

## 配置说明

### LLM 配置

#### providers

配置可用的 LLM 服务商。每个提供商包含：

- `name`: 显示名称
- `provider`: 提供商类型（`anthropic`, `openai`, `ollama`, `custom`）
- `apiKey`: API Key，支持 `${VAR_NAME}` 格式的环境变量引用
- `baseURL`: API 基础 URL（部分提供商需要）
- `enabled`: 是否启用
- `models`: 可用模型列表

#### roleMapping

配置每个角色使用的默认提供商和模型。

格式：`providerName/modelName`

#### fallbackOrder

当首选提供商不可用时的故障转移顺序。

### 项目配置

- `name`: 项目名称
- `path`: 项目路径
- `autoAnalyze`: 是否自动分析项目结构

### Agent 配置

- `maxIterations`: 最大迭代次数
- `maxHistory`: 对话历史最大长度
- `autoConfirm`: 是否自动确认操作
- `showThoughts`: 是否显示 AI 思考过程

### 工具配置

#### file

- `allowDelete`: 是否允许删除文件
- `allowOverwrite`: 是否允许覆盖文件

#### git

- `autoCommit`: 是否自动提交
- `confirmPush`: 推送时是否确认

#### code

- `enabled`: 是否启用代码执行功能（默认关闭，出于安全考虑）

## 使用示例

### 最小配置

```yaml
version: "1.0.0"

llm:
  defaultProvider: "zhipu-primary"
  providers: {}
  roleMapping: {}
  fallbackOrder: []

project:
  name: "my-project"
  path: "."
  autoAnalyze: true

agent:
  maxIterations: 10
  maxHistory: 50
  autoConfirm: false
  showThoughts: false

tools:
  file:
    allowDelete: false
    allowOverwrite: true
  git:
    autoCommit: false
    confirmPush: true
  code:
    enabled: false

rules:
  enabled: []
  disabled: []
```

### 多提供商配置

```yaml
version: "1.0.0"

llm:
  defaultProvider: "anthropic-primary"
  providers:
    anthropic-primary:
      name: "Anthropic 主服务"
      provider: "anthropic"
      apiKey: "${ANTHROPIC_API_KEY}"
      enabled: true
      models:
        sonnet:
          model: "claude-3-sonnet-20240229"
          maxTokens: 4000
          temperature: 0.7
    
    zhipu-primary:
      name: "智谱 GLM"
      provider: "openai"
      apiKey: "${ZHIPU_API_KEY}"
      enabled: true
      models:
        glm-4:
          model: "glm-4"
          maxTokens: 8192
  
  roleMapping:
    developer: anthropic-primary/sonnet
    architect: zhipu-primary/glm-4
  
  fallbackOrder:
    - anthropic-primary
    - zhipu-primary

project:
  name: "my-project"
  path: "."
  autoAnalyze: true

agent:
  maxIterations: 10
  maxHistory: 50
  autoConfirm: false
  showThoughts: false

tools:
  file:
    allowDelete: false
    allowOverwrite: true
  git:
    autoCommit: false
    confirmPush: true
  code:
    enabled: false

rules:
  enabled: []
  disabled: []
```

## 配置验证

运行以下命令验证配置：

```bash
npx agent-team config test
```

## 从旧配置迁移

如果之前使用 `llm.config.json`，可以运行迁移命令：

```bash
npx agent-team config migrate --from llm.config.json
```

## 常见问题

### Q: 配置文件不生效？
A: 确保配置文件路径正确，文件格式为有效的 YAML。

### Q: API Key 无效？
A: 检查环境变量是否设置正确，确认 API Key 不是占位符。

### Q: 如何禁用某个提供商？
A: 将提供商的 `enabled` 设为 `false`，或直接删除提供商配置。

### Q: 如何添加自定义提供商？
A: 在 `providers` 下添加新的提供商配置块。

## 相关文档

- [角色管理指南](ROLES_GUIDE.md)
- [提示词管理指南](PROMPTS_GUIDE.md)
- [规则管理指南](RULES_GUIDE.md)
- [AI Agent 使用指南](AI_AGENT_GUIDE.md)
