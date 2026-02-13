# Task 02：PluginSandbox 安全隔离

**优先级**: P0
**预计工时**: 3h
**阶段**: Phase 1
**依赖**: Task 01（`src/types/plugin.ts` 中的接口定义）

---

## 目标

实现轻量级插件安全沙箱，通过模块黑名单检查、执行超时保护、异常隔离和环境变量过滤，防止插件意外破坏宿主系统。

---

## 输入

- `docs/v9/01-requirements.md` §3.1.3（插件沙箱需求）
- `docs/v9/02-architecture.md`（PluginSandbox 设计、关键架构决策 1）
- `src/types/plugin.ts`（Task 01 输出，PluginManifest.sandbox 配置）

---

## 输出文件

| 文件 | 说明 |
|------|------|
| `src/plugins/sandbox.ts` | PluginSandbox 主类 |
| `tests/v9/plugin-sandbox.test.ts` | 单元测试 |

---

## 实现步骤

### 步骤 1：定义沙箱配置和错误类型

```typescript
interface SandboxConfig {
  // 默认禁止的模块（黑名单）
  blockedModules: string[]     // 默认: ['child_process', 'cluster', 'worker_threads']
  // 插件额外允许的模块（白名单追加）
  allowedModules: string[]
  // 插件初始化超时（毫秒）
  initTimeout: number          // 默认: 5000
  // 工具执行超时（毫秒）
  execTimeout: number          // 默认: 30000
  // 需要过滤的敏感环境变量键（前缀匹配）
  sensitiveEnvKeys: string[]   // 默认: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'AWS_SECRET', ...]
}

// 插件尝试访问黑名单模块时抛出
class PluginSandboxError extends Error {
  readonly type: 'blocked-module' | 'timeout' | 'env-access-denied'
  readonly blockedModule?: string
  readonly pluginName: string
}
```

### 步骤 2：实现模块黑名单检查

核心策略：提供一个受限的 import 包装函数，在实际执行 ESM `import()` 前检查模块名。

```typescript
class PluginSandbox {
  // 创建受限的 import 函数，注入给插件上下文
  createRestrictedImport(
    manifest: PluginManifest
  ): (moduleName: string) => Promise<unknown> {
    const effectiveBlocked = this.config.blockedModules.filter(
      m => !allowedModules.includes(m)  // 白名单追加可解除黑名单
    )

    return async (moduleName: string) => {
      // 检查是否为黑名单内置模块
      if (effectiveBlocked.includes(moduleName)) {
        this.logger.warn('plugin-sandbox', `插件 ${manifest.name} 尝试访问黑名单模块: ${moduleName}`)
        throw new PluginSandboxError({
          type: 'blocked-module',
          blockedModule: moduleName,
          pluginName: manifest.name
        })
      }
      return import(moduleName)
    }
  }
}
```

**注意**：ESM 插件通过 `import` 语句直接导入模块时无法拦截（这是 ESM 规范的特性）。实际拦截点在 PluginLoader 加载插件后，通过 `PluginContext` 注入受限的辅助 import 函数；如果插件遵循通过 `context.import()` 引入依赖的约定，则可以拦截。对于静态 `import`，v9.0 的策略是"依赖插件作者诚信 + 加载后审计"，符合需求文档的"轻量隔离"定位。

### 步骤 3：实现超时保护

```typescript
async execute<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  pluginName: string
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new PluginSandboxError({
        type: 'timeout',
        pluginName,
        message: `插件执行超时 (${timeoutMs}ms)`
      }))
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([fn(), timeoutPromise])
    clearTimeout(timeoutHandle!)
    return result
  } catch (err) {
    clearTimeout(timeoutHandle!)
    throw err
  }
}
```

### 步骤 4：实现环境变量安全代理

```typescript
createSafeEnv(
  manifest: PluginManifest
): NodeJS.ProcessEnv {
  const sensitiveKeys = this.config.sensitiveEnvKeys
  return new Proxy(process.env, {
    get(target, prop: string) {
      // 敏感键：完整匹配 or 前缀匹配
      if (sensitiveKeys.some(k => prop === k || prop.startsWith(k + '_'))) {
        // 记录访问尝试但不抛出错误（符合需求：插件无法"读取"但不报错）
        return undefined
      }
      return target[prop]
    },
    set() {
      // 禁止修改 process.env
      return false
    }
  })
}
```

### 步骤 5：异常捕获包装

```typescript
async safeCall<T>(
  fn: () => Promise<T>,
  pluginName: string,
  hookName: string
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof PluginSandboxError) {
      // 沙箱错误已有完整信息，直接记录
      this.logger.error('plugin-sandbox', err.message, { pluginName, hookName })
    } else {
      // 未知异常：记录并隔离
      this.logger.error('plugin-sandbox', `插件 ${pluginName} 在 ${hookName} 中抛出未捕获异常`, {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      })
    }
    return undefined  // 不向上传播
  }
}
```

### 步骤 6：集成到 PluginLoader

更新 Task 01 中的 `PluginLoader`，在加载和调用插件时使用 `PluginSandbox`：

```typescript
// PluginLoader.load() 中：
const pluginContext: PluginContext = {
  manifest,
  pluginDir,
  logger: this.logger,
  env: this.sandbox.createSafeEnv(manifest)
}

// 初始化插件时包裹超时保护
await this.sandbox.execute(
  () => pluginModule.activate?.(pluginContext),
  manifest.sandbox?.timeout ?? 5000,  // 初始化用 5 秒
  manifest.name
)
```

### 步骤 7：编写单元测试（`tests/v9/plugin-sandbox.test.ts`）

测试覆盖：
- 访问黑名单模块（`child_process`）时抛出 `PluginSandboxError`
- 访问白名单追加的模块（`sandbox.allowedModules`）不抛出错误
- 插件初始化超时（超过 5 秒）后返回超时错误
- 插件执行超时（超过配置的 execTimeout）
- 插件抛出未捕获异常时，`safeCall` 返回 `undefined`，不向上传播
- `createSafeEnv` 过滤 `ANTHROPIC_API_KEY` 返回 `undefined`
- `createSafeEnv` 允许访问非敏感环境变量
- `createSafeEnv` 禁止修改 `process.env`

---

## 验收标准

- [ ] 插件尝试通过 `context.import('child_process')` 时，抛出 `PluginSandboxError` 并记录警告日志
- [ ] 同理禁止 `cluster`、`worker_threads`
- [ ] 插件 `sandbox.allowedModules` 中声明的模块可以通过黑名单检查
- [ ] 插件初始化超过 5 秒时，自动终止并返回超时错误，不阻塞主线程
- [ ] 工具执行超过 `sandbox.timeout`（或默认 30 秒）时，返回超时错误
- [ ] 插件内的未捕获异常被 `safeCall` 捕获，系统继续正常运行
- [ ] 插件无法读取 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY`（返回 `undefined`）
- [ ] 插件可以读取非敏感环境变量（如 `NODE_ENV`、`HOME`）
- [ ] 单元测试覆盖率 >= 80%
- [ ] TypeScript 编译无错误

---

## 技术注意事项

1. **ESM 静态 import 无法拦截**：v9.0 定位是"轻量隔离"，主要防止意外，不防止恶意。静态 `import` 绕过是已知局限，在设计决策文档中已说明
2. **Proxy 兼容性**：Node.js >= 18 完整支持 Proxy，无需 polyfill
3. **超时 clearTimeout**：务必在 Promise.race resolve/reject 后清理计时器，避免内存泄漏
4. **错误信息质量**：`PluginSandboxError` 的 message 应包含插件名称和具体原因，便于调试
