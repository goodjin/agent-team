# Task 03：DynamicToolLoader + 热更新

**优先级**: P0
**预计工时**: 4h
**阶段**: Phase 1
**依赖**: Task 01（PluginLoader）、Task 02（PluginSandbox）

---

## 目标

实现工具插件的动态注册、热更新和版本管理。工具插件加载后自动注册到 v6 ToolRegistry，文件修改后 3 秒内自动热更新，同时保持正在执行的工具调用不受影响。

---

## 输入

- `docs/v9/01-requirements.md` §3.2（动态工具注册需求）
- `docs/v9/02-architecture.md`（DynamicToolLoader 设计，架构决策 2/5）
- `src/tools/tool-registry.ts`（v6 ToolRegistry 接口，了解 `register()` 方法签名）
- `src/tools/base.ts`（v6 `ITool` 接口）
- `src/plugins/loader.ts`（Task 01 输出）
- `src/plugins/sandbox.ts`（Task 02 输出）

---

## 输出文件

| 文件 | 说明 |
|------|------|
| `src/plugins/dynamic-tool-loader.ts` | DynamicToolLoader 主类 |
| `tests/v9/dynamic-tool-loader.test.ts` | 单元测试 |

---

## 实现步骤

### 步骤 1：定义版本化工具接口

在 `src/types/plugin.ts` 补充（Task 01 文件）：

```typescript
interface VersionedTool {
  version: string             // semver，如 "1.2.0"
  tool: ITool                 // v6 ITool 接口
  registeredAt: Date
  pluginName: string
  isActive: boolean           // 是否为默认版本（同名工具中版本最高的）
}

const MAX_TOOL_VERSIONS = 3   // 每个工具名最多保留版本数
```

### 步骤 2：实现 DynamicToolLoader 主体

```typescript
class DynamicToolLoader extends EventEmitter {
  // 版本历史：Map<toolName, VersionedTool[]>（按 semver 降序）
  private versions = new Map<string, VersionedTool[]>()
  private watcher?: fs.FSWatcher
  private debounceTimers = new Map<string, NodeJS.Timeout>()

  constructor(
    private registry: ToolRegistry,     // v6 ToolRegistry（组合，不继承）
    private loader: PluginLoader,
    private sandbox: PluginSandbox,
    private logger: StructuredLogger
  ) {
    super()
  }

  // 从已加载的插件实例注册工具
  async registerToolPlugin(plugin: PluginInstance): Promise<void>

  // 卸载工具插件（从 registry 移除）
  async unregisterToolPlugin(pluginName: string): Promise<void>

  // 启动 fs.watch 热更新监听
  startWatching(pluginsDir: string): void

  // 停止监听
  stopWatching(): void

  // 查询工具版本历史
  getVersionHistory(toolName: string): VersionedTool[]

  // 按版本号获取特定版本的工具（toolName@1.0.0 格式）
  getToolByVersion(toolName: string, version: string): ITool | undefined
}
```

### 步骤 3：实现工具注册逻辑

```typescript
async registerToolPlugin(plugin: PluginInstance): Promise<void> {
  const { manifest } = plugin
  if (manifest.type !== 'tool' || !manifest.tool) return

  // 从插件模块获取工具实现
  const toolImpl = plugin.module.default as ITool
  if (!toolImpl || typeof toolImpl.execute !== 'function') {
    throw new Error(`插件 ${manifest.name} 缺少有效的 tool 导出`)
  }

  const toolName = manifest.tool.toolName
  const newVersioned: VersionedTool = {
    version: manifest.version,
    tool: toolImpl,
    registeredAt: new Date(),
    pluginName: manifest.name,
    isActive: false
  }

  // 更新版本列表
  const existing = this.versions.get(toolName) ?? []
  existing.push(newVersioned)

  // 按 semver 降序排序
  existing.sort((a, b) => compareSemver(b.version, a.version))

  // 超出最大版本数时淘汰最旧版本
  if (existing.length > MAX_TOOL_VERSIONS) {
    const removed = existing.splice(MAX_TOOL_VERSIONS)
    removed.forEach(v => this.logger.info('dynamic-tool-loader',
      `淘汰旧版本工具 ${toolName}@${v.version}`))
  }

  // 标记最新版本为 active
  existing.forEach((v, i) => { v.isActive = i === 0 })
  this.versions.set(toolName, existing)

  // 注册到 v6 ToolRegistry（始终注册最新版本）
  await this.registry.register(existing[0].tool)

  this.logger.info('dynamic-tool-loader', `工具 ${toolName}@${manifest.version} 注册成功`)
  this.emit('tool:registered', { toolName, version: manifest.version })
}
```

### 步骤 4：实现 fs.watch 热更新（防抖 300ms）

```typescript
startWatching(pluginsDir: string): void {
  this.watcher = fs.watch(pluginsDir, { recursive: true }, (event, filename) => {
    if (!filename) return

    // 只关注 .js 文件变化
    if (!filename.endsWith('.js')) return

    // 提取插件名（plugins/http-request/index.js → http-request）
    const pluginName = filename.split(path.sep)[0]

    // 防抖：300ms 内的多次变化合并为一次重载
    if (this.debounceTimers.has(pluginName)) {
      clearTimeout(this.debounceTimers.get(pluginName)!)
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(pluginName)
      await this.hotReload(pluginName, pluginsDir)
    }, 300)

    this.debounceTimers.set(pluginName, timer)
  })
}

private async hotReload(pluginName: string, pluginsDir: string): Promise<void> {
  const pluginPath = path.join(pluginsDir, pluginName)
  const startTime = Date.now()

  try {
    // 重新加载插件（PluginLoader 使用时间戳破坏 ESM 缓存）
    const newInstance = await this.loader.load(pluginPath)

    // 重新注册工具（新引用，旧调用持有旧引用不受影响）
    await this.registerToolPlugin(newInstance)

    const elapsed = Date.now() - startTime
    this.logger.info('dynamic-tool-loader', `热更新完成: ${pluginName} (${elapsed}ms)`)
    this.emit('tool:hot-reloaded', { pluginName, elapsedMs: elapsed })
  } catch (err) {
    // 热更新失败：保留旧版本，记录错误
    this.logger.error('dynamic-tool-loader', `热更新失败: ${pluginName}`, {
      error: err instanceof Error ? err.message : String(err)
    })
    this.emit('tool:hot-reload-failed', { pluginName, error: err })
    // 旧版本工具继续可用（registry 未被修改）
  }
}
```

**热更新安全性说明**：

正在执行的工具调用持有对旧 `tool.execute` 函数的引用。热更新时，`registry.register()` 替换 registry 中的工具引用，但已经开始执行的调用的闭包引用不变，因此正在进行的调用会用旧实现正常完成。

### 步骤 5：工具版本化调用（可选 @version 语法）

```typescript
// 支持 "toolName@1.0.0" 格式按版本调用
getToolByVersion(nameWithVersion: string): ITool | undefined {
  const atIndex = nameWithVersion.lastIndexOf('@')
  if (atIndex === -1) {
    // 无版本指定，返回最新版本
    return this.versions.get(nameWithVersion)?.[0]?.tool
  }

  const toolName = nameWithVersion.slice(0, atIndex)
  const version = nameWithVersion.slice(atIndex + 1)
  const history = this.versions.get(toolName) ?? []
  return history.find(v => v.version === version)?.tool
}
```

### 步骤 6：编写单元测试（`tests/v9/dynamic-tool-loader.test.ts`）

测试覆盖：
- 工具插件加载后出现在 `registry.listTools()` 中
- 动态工具 `execute` 签名与 v6 `ITool` 接口兼容
- 热更新：文件变化 → 300ms 防抖 → 工具重载
- 热更新失败时旧版本工具保留
- 版本管理：加载第 4 个版本时最旧版本被淘汰
- 无版本调用返回最新版本
- `@version` 格式调用返回指定版本
- `unregisterToolPlugin` 从 registry 移除工具

---

## 验收标准

- [ ] 工具插件加载后，Agent 在下一次任务中可调用该工具
- [ ] 动态加载的工具出现在 `ToolRegistry.listTools()` 的返回列表中
- [ ] 动态工具的 `execute` 方法签名与 v6 `ITool` 接口完全兼容
- [ ] 修改工具插件的 `index.js` 后，3 秒内 `ToolRegistry` 中的工具实现更新
- [ ] 热更新期间正在进行的工具调用正常完成，不因更新中断
- [ ] 热更新失败（如语法错误）时，保留旧版本工具，输出错误日志
- [ ] 工具 v1.0.0 已注册时，加载 v1.1.0 后两个版本均可调用（通过 `@version` 语法）
- [ ] 不指定版本时调用最新版本（semver 最高版本）
- [ ] 第 4 个版本加载时，最旧版本自动从版本历史中移除
- [ ] 热更新事件通过 v7 `StructuredLogger` 记录
- [ ] 单元测试覆盖率 >= 80%

---

## 技术注意事项

1. **组合而非继承**：严格不修改 `src/tools/tool-registry.ts`，通过 `registry.register()` 接口注册工具
2. **ESM 缓存破坏**：热更新时 `PluginLoader.load()` 需要使用时间戳查询参数使 ESM import 绕过缓存
3. **semver 比较**：可使用 `semver` 库（需求文档已允许引入）进行版本排序
4. **fs.watch 平台差异**：macOS 的 `fs.watch` 在某些情况下行为与 Linux 不同，建议测试时使用 `fs.watchFile` 作为降级方案
5. **防抖清理**：`stopWatching()` 时需要清理所有 debounce timers
