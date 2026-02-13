# Task 07：示例插件 + Schema 验证器

**优先级**: P1
**预计工时**: 3h
**阶段**: Phase 3
**依赖**: Task 01（PluginLoader，validator 接口）、Task 02（PluginSandbox，安全配置）

---

## 目标

创建三种类型的完整示例插件，覆盖 `tool`/`role`/`hook` 所有插件类型，并完善 `PluginValidator` 的 Schema 验证逻辑（支持 semver 约束检查和完整字段验证）。示例插件既是开发参考，也是 E2E 测试的依赖。

---

## 输入

- `docs/v9/01-requirements.md` §4（plugin.json Schema 和入口文件规范）
- `docs/v9/02-architecture.md`（文件结构，插件目录规划）
- `src/plugins/validator.ts`（Task 01 中的初始 validator，本任务完善）
- `src/plugins/loader.ts`（Task 01 输出，了解加载流程）

---

## 输出文件

### 验证器

| 文件 | 说明 |
|------|------|
| `src/plugins/validator.ts` | PluginValidator（完善 semver 约束检查） |

### 示例插件

| 目录 | 类型 | 说明 |
|------|------|------|
| `plugins/http-request/` | tool | HTTP 请求工具插件（GET/POST 支持） |
| `plugins/code-reviewer/` | role | 代码审查角色插件 |
| `plugins/audit-logger/` | hook | 审计日志钩子插件 |

---

## 实现步骤

### 步骤 1：完善 PluginValidator

在 Task 01 的基础上，增强以下验证：

```typescript
class PluginValidator {
  // 完整 Schema 验证
  validate(raw: unknown): ValidationResult {
    // 基础类型检查
    if (!raw || typeof raw !== 'object') {
      return { valid: false, errors: [{ field: 'root', message: '必须是 JSON 对象' }] }
    }

    const errors: ValidationError[] = []
    const manifest = raw as Record<string, unknown>

    // 必填字段检查
    const required = ['name', 'version', 'type', 'description', 'author', 'main']
    for (const field of required) {
      if (!manifest[field]) {
        errors.push({ field, message: `字段 "${field}" 是必填项` })
      }
    }

    // name：kebab-case 格式
    if (typeof manifest.name === 'string') {
      if (!/^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/.test(manifest.name)) {
        errors.push({ field: 'name', message: '必须是 kebab-case 格式（小写字母、数字、连字符）' })
      }
    }

    // version：semver 格式
    if (typeof manifest.version === 'string') {
      if (!this.isValidSemver(manifest.version)) {
        errors.push({ field: 'version', message: '必须是有效的 semver 版本号，如 "1.0.0"' })
      }
    }

    // type：枚举值
    if (manifest.type && !['tool', 'role', 'hook'].includes(manifest.type as string)) {
      errors.push({ field: 'type', message: '必须是 "tool"、"role" 或 "hook" 之一' })
    }

    // description：长度限制
    if (typeof manifest.description === 'string' && manifest.description.length > 200) {
      errors.push({ field: 'description', message: '不能超过 200 字符' })
    }

    // 类型专属字段验证
    if (errors.length === 0) {
      errors.push(...this.validateTypeSpecific(manifest as any))
    }

    // dependencies：semver 约束格式验证
    if (manifest.dependencies && typeof manifest.dependencies === 'object') {
      for (const [dep, constraint] of Object.entries(manifest.dependencies)) {
        if (!this.isValidSemverRange(constraint as string)) {
          errors.push({
            field: `dependencies.${dep}`,
            message: `版本约束格式无效: "${constraint}"（应为 semver range，如 ">=1.0.0 <2.0.0"）`
          })
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }

  private validateTypeSpecific(manifest: PluginManifest): ValidationError[] {
    const errors: ValidationError[] = []
    if (manifest.type === 'tool' && !manifest.tool?.toolName) {
      errors.push({ field: 'tool.toolName', message: 'type=tool 时 tool.toolName 是必填项' })
    }
    if (manifest.type === 'role' && !manifest.role?.roleName) {
      errors.push({ field: 'role.roleName', message: 'type=role 时 role.roleName 是必填项' })
    }
    if (manifest.type === 'hook' && (!manifest.hook?.events || manifest.hook.events.length === 0)) {
      errors.push({ field: 'hook.events', message: 'type=hook 时 hook.events 是必填项且不能为空' })
    }
    return errors
  }

  private isValidSemver(version: string): boolean {
    return /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(version)
  }

  private isValidSemverRange(range: string): boolean {
    // 支持：*、>=1.0.0、>=1.0.0 <2.0.0、^1.0.0、~1.0.0
    return /^(\*|[~^]?\d+\.\d+\.\d+|[><]=?\d+\.\d+\.\d+( [><]=?\d+\.\d+\.\d+)?)$/.test(range.trim())
  }
}
```

### 步骤 2：创建工具插件示例（`plugins/http-request/`）

**`plugins/http-request/plugin.json`**：
```json
{
  "name": "http-request",
  "version": "1.2.0",
  "type": "tool",
  "description": "发送 HTTP 请求并返回响应结果，支持 GET/POST/PUT/DELETE",
  "author": "team-internal",
  "main": "index.js",
  "dependencies": {},
  "sandbox": {
    "timeout": 10000
  },
  "tool": {
    "toolName": "http_request",
    "category": "network"
  },
  "license": "MIT",
  "keywords": ["http", "network", "api"]
}
```

**`plugins/http-request/index.js`**：
```javascript
// ESM 格式工具插件示例
export default {
  name: 'http_request',
  description: '发送 HTTP 请求，支持 GET/POST/PUT/DELETE 方法',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '目标 URL（必须以 http:// 或 https:// 开头）'
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        default: 'GET',
        description: 'HTTP 方法'
      },
      headers: {
        type: 'object',
        description: '请求头（可选）',
        additionalProperties: { type: 'string' }
      },
      body: {
        type: 'string',
        description: '请求体（POST/PUT 时使用）'
      }
    },
    required: ['url']
  },
  async execute(params) {
    const { url, method = 'GET', headers = {}, body } = params

    // 使用 Node.js 内置 fetch（Node.js >= 18）
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? body : undefined
    })

    const responseText = await response.text()

    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseText
    }
  }
}
```

**`plugins/http-request/README.md`**：
工具说明文档（功能、参数说明、使用示例）。

### 步骤 3：创建角色插件示例（`plugins/code-reviewer/`）

**`plugins/code-reviewer/plugin.json`**：
```json
{
  "name": "code-reviewer",
  "version": "1.0.0",
  "type": "role",
  "description": "专注于代码质量审查的 SubAgent 角色，覆盖安全、性能、可读性三个维度",
  "author": "team-internal",
  "main": "index.js",
  "role": {
    "roleName": "CodeReviewer",
    "agentTypes": ["sub"],
    "promptFile": "prompts/code-reviewer.md"
  },
  "license": "MIT",
  "keywords": ["code-review", "quality", "security"]
}
```

**`plugins/code-reviewer/index.js`**：
```javascript
// 角色插件：向系统注册自定义 Agent 角色
export default {
  // 插件激活时被调用（由 PluginLoader 调用）
  async activate(context) {
    const { manifest, logger } = context
    logger.info('code-reviewer', `角色插件已激活: ${manifest.role.roleName}`)

    // 读取 prompt 文件
    const promptPath = new URL('./prompts/code-reviewer.md', import.meta.url)
    // 实际读取逻辑由宿主系统处理，这里仅声明
  },

  async deactivate(context) {
    context.logger.info('code-reviewer', '角色插件已停用')
  }
}
```

**`plugins/code-reviewer/prompts/code-reviewer.md`**：
代码审查角色的 system prompt 文件（覆盖安全、性能、可读性三个维度的审查指引）。

### 步骤 4：创建钩子插件示例（`plugins/audit-logger/`）

**`plugins/audit-logger/plugin.json`**：
```json
{
  "name": "audit-logger",
  "version": "1.0.0",
  "type": "hook",
  "description": "在每次工具调用前后记录审计日志，用于合规审查",
  "author": "team-internal",
  "main": "index.js",
  "hook": {
    "events": ["tool:before", "tool:after"],
    "priority": 10
  },
  "license": "MIT",
  "keywords": ["audit", "logging", "compliance"]
}
```

**`plugins/audit-logger/index.js`**：
```javascript
// 钩子插件：在工具调用前后记录审计日志
export default {
  async activate(context) {
    const { logger } = context
    logger.info('audit-logger', '审计日志钩子已激活')
  },

  // 工具调用前触发
  async onToolBefore(event, context) {
    const { toolName, params, taskId } = event
    context.logger.info('audit-logger', '工具调用开始', {
      audit: true,
      toolName,
      taskId,
      timestamp: new Date().toISOString(),
      // 注意：不记录 params 中的敏感数据
      paramKeys: Object.keys(params ?? {})
    })
  },

  // 工具调用后触发
  async onToolAfter(event, context) {
    const { toolName, taskId, duration, success } = event
    context.logger.info('audit-logger', '工具调用完成', {
      audit: true,
      toolName,
      taskId,
      duration,
      success,
      timestamp: new Date().toISOString()
    })
  },

  async deactivate(context) {
    context.logger.info('audit-logger', '审计日志钩子已停用')
  }
}
```

### 步骤 5：创建 `plugins/registry.yaml` 初始文件

```yaml
version: "1.0"
updated_at: "2026-02-13T00:00:00Z"
plugins: []
```

### 步骤 6：编写验证器单元测试

测试覆盖（与 `tests/v9/plugin-loader.test.ts` 合并或独立）：
- 合法 `plugin.json`（三种类型）均验证通过
- `name` 非 kebab-case 格式返回错误
- `version` 非 semver 格式返回错误
- `description` 超过 200 字符返回错误
- `type=tool` 缺少 `tool.toolName` 返回错误
- `type=role` 缺少 `role.roleName` 返回错误
- `type=hook` 缺少 `hook.events` 返回错误
- `dependencies` 版本约束格式无效返回错误
- 空对象（`{}`）返回包含所有必填字段错误的列表

---

## 验收标准

- [ ] `PluginValidator.validate()` 对三种类型的合法 `plugin.json` 均返回 `valid: true`
- [ ] `plugin.json` 格式验证失败时，加载器拒绝加载并输出明确错误信息
- [ ] `http-request` 工具插件可成功加载，`execute` 方法可调用
- [ ] `code-reviewer` 角色插件可成功加载，`activate` 被调用
- [ ] `audit-logger` 钩子插件可成功加载，`onToolBefore`/`onToolAfter` 可被调用
- [ ] 三个示例插件的 `plugin.json` 均通过 `PluginValidator.validate()` 验证
- [ ] 示例插件遵循 ESM 格式（`export default`）
- [ ] `plugins/registry.yaml` 初始文件格式正确
- [ ] 单元测试覆盖所有 validation 错误路径，覆盖率 >= 80%

---

## 技术注意事项

1. **ESM `import.meta.url`**：角色插件读取 prompt 文件时使用 `import.meta.url` 获取当前文件路径，这是 ESM 环境中的标准做法
2. **Node.js fetch**：`http-request` 插件使用 Node.js >= 18 内置的 `fetch`，无需额外依赖
3. **示例插件的真实可用性**：`http-request` 应实际可调用（执行真实 HTTP 请求），而非 mock 实现，以确保 E2E 测试可用
4. **钩子事件注册机制**：`audit-logger` 的 `onToolBefore`/`onToolAfter` 方法命名约定需与 PluginLoader 中的钩子调度机制一致
