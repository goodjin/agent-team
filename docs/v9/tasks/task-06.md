# Task 06：PluginRegistry - 本地插件索引

**优先级**: P2
**预计工时**: 3h
**阶段**: Phase 3
**依赖**: Task 01（PluginLoader）、Task 03（DynamicToolLoader，工具使用统计）

---

## 目标

实现本地插件索引管理器，以 YAML 格式维护已安装插件的元数据和使用统计，提供安装、卸载、查询和统计接口。

---

## 输入

- `docs/v9/01-requirements.md` §3.5（PluginRegistry 需求）
- `docs/v9/02-architecture.md`（PluginRegistry 设计）
- `src/plugins/loader.ts`（Task 01 输出，PluginLoader 接口）
- `src/plugins/dynamic-tool-loader.ts`（Task 03 输出，工具调用事件）

---

## 输出文件

| 文件 | 说明 |
|------|------|
| `src/plugins/registry.ts` | PluginRegistry 主类 |
| `tests/v9/plugin-registry.test.ts` | 单元测试 |

**运行时生成**：
- `plugins/registry.yaml` — 本地插件索引（YAML 格式，可人工编辑）

---

## 实现步骤

### 步骤 1：定义 registry.yaml 数据结构

```typescript
// plugins/registry.yaml 对应的 TypeScript 类型
interface PluginIndexFile {
  version: string           // 索引格式版本，如 "1.0"
  updated_at: string        // ISO 8601 时间戳
  plugins: PluginIndexEntry[]
}

interface PluginIndexEntry {
  name: string
  version: string
  type: 'tool' | 'role' | 'hook'
  description: string
  author: string
  path: string              // 相对于项目根目录的路径，如 "./plugins/http-request"
  installed_at: string      // ISO 8601
  usage_count: number
  avg_score: number         // 滚动平均质量分（0-10），0 表示无数据
}

interface PluginStats {
  name: string
  version: string
  type: string
  usage_count: number
  avg_score: number
  installed_at: Date
  lastUsedAt?: Date
}

interface InstallOptions {
  overwrite?: boolean       // 是否覆盖同名插件（默认 false）
}
```

### 步骤 2：实现 PluginRegistry 主类

```typescript
class PluginRegistry {
  private indexPath: string           // plugins/registry.yaml 的绝对路径
  private index: PluginIndexFile      // 内存中的索引
  private scoreHistory = new Map<string, number[]>()  // 最近 100 次质量分
  private persistDebounce?: NodeJS.Timeout

  constructor(
    private pluginsDir: string,
    private loader: PluginLoader,
    private logger: StructuredLogger
  ) {
    this.indexPath = path.join(pluginsDir, 'registry.yaml')
  }

  // 初始化：加载已有索引或创建空索引
  async initialize(): Promise<void>

  // 查询已安装插件列表
  async list(): Promise<PluginIndexEntry[]>

  // 安装插件（从本地目录）
  async install(sourcePath: string, options?: InstallOptions): Promise<void>

  // 卸载插件
  async uninstall(pluginName: string): Promise<void>

  // 查询统计数据
  async getStats(pluginName: string): Promise<PluginStats | undefined>

  // 记录工具调用（由 DynamicToolLoader 调用）
  recordUsage(pluginName: string, qualityScore: number): void

  // 订阅 PluginLoader 事件，自动同步索引
  attachToLoader(loader: PluginLoader): void
}
```

### 步骤 3：实现 YAML 索引读写

```typescript
private async loadIndex(): Promise<PluginIndexFile> {
  try {
    const content = await fs.readFile(this.indexPath, 'utf-8')
    return yaml.parse(content) as PluginIndexFile
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // 文件不存在，返回空索引
      return {
        version: '1.0',
        updated_at: new Date().toISOString(),
        plugins: []
      }
    }
    throw err
  }
}

private async saveIndex(): Promise<void> {
  this.index.updated_at = new Date().toISOString()
  const content = yaml.stringify(this.index)
  // 原子写入：先写临时文件，再重命名
  const tmpPath = this.indexPath + '.tmp'
  await fs.writeFile(tmpPath, content, 'utf-8')
  await fs.rename(tmpPath, this.indexPath)
  this.logger.info('plugin-registry', '索引已更新', { path: this.indexPath })
}

// 防抖批量持久化（避免频繁写磁盘）
private schedulePersist(): void {
  if (this.persistDebounce) clearTimeout(this.persistDebounce)
  this.persistDebounce = setTimeout(() => this.saveIndex(), 500)
}
```

### 步骤 4：实现原子性安装

```typescript
async install(sourcePath: string, options: InstallOptions = {}): Promise<void> {
  const absSource = path.resolve(sourcePath)

  // 1. 验证源目录存在
  if (!await this.exists(absSource)) {
    throw new Error(`插件源目录不存在: ${sourcePath}`)
  }

  // 2. 读取并验证 plugin.json
  const manifestPath = path.join(absSource, 'plugin.json')
  const manifestRaw = await fs.readFile(manifestPath, 'utf-8')
  const manifest = JSON.parse(manifestRaw) as PluginManifest

  const validation = this.validator.validate(manifest)
  if (!validation.valid) {
    throw new Error(`plugin.json 格式无效:\n${validation.errors.map(e => `  ${e.field}: ${e.message}`).join('\n')}`)
  }

  // 3. 检查同名冲突
  const existing = this.index.plugins.find(p => p.name === manifest.name)
  if (existing && !options.overwrite) {
    throw new Error(`插件 "${manifest.name}" 已存在（版本 ${existing.version}）。若要覆盖，请使用 overwrite: true`)
  }

  // 4. 原子性复制（先复制到临时目录，成功后重命名）
  const destDir = path.join(this.pluginsDir, manifest.name)
  const tmpDir = destDir + '.installing'

  try {
    // 清理可能残留的临时目录
    await fs.rm(tmpDir, { recursive: true, force: true })

    // 复制到临时目录
    await fs.cp(absSource, tmpDir, { recursive: true })

    // 如果是覆盖安装，先备份旧目录
    const backupDir = destDir + '.backup'
    if (existing) {
      await fs.rename(destDir, backupDir)
    }

    // 重命名临时目录为正式目录
    await fs.rename(tmpDir, destDir)

    // 删除备份
    if (existing) {
      await fs.rm(backupDir, { recursive: true, force: true })
    }
  } catch (err) {
    // 安装失败：回滚（删除临时目录，恢复备份）
    await fs.rm(tmpDir, { recursive: true, force: true })
    const backupDir = destDir + '.backup'
    if (await this.exists(backupDir)) {
      await fs.rename(backupDir, destDir)
    }
    throw new Error(`安装失败（已回滚）: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 5. 加载插件
  const instance = await this.loader.load(destDir)

  // 6. 更新索引
  const entry: PluginIndexEntry = {
    name: manifest.name,
    version: manifest.version,
    type: manifest.type,
    description: manifest.description,
    author: manifest.author,
    path: `./${path.relative(process.cwd(), destDir)}`,
    installed_at: new Date().toISOString(),
    usage_count: existing?.usage_count ?? 0,
    avg_score: existing?.avg_score ?? 0
  }

  if (existing) {
    const idx = this.index.plugins.indexOf(existing)
    this.index.plugins[idx] = entry
  } else {
    this.index.plugins.push(entry)
  }

  await this.saveIndex()
  this.logger.info('plugin-registry', `插件 ${manifest.name}@${manifest.version} 安装成功`)
}
```

### 步骤 5：实现使用统计（滚动平均）

```typescript
recordUsage(pluginName: string, qualityScore: number): void {
  const entry = this.index.plugins.find(p => p.name === pluginName)
  if (!entry) return

  // 更新调用计数
  entry.usage_count++

  // 维护最近 100 次质量分的历史（滚动窗口）
  const history = this.scoreHistory.get(pluginName) ?? []
  history.push(qualityScore)
  if (history.length > 100) history.shift()
  this.scoreHistory.set(pluginName, history)

  // 计算滚动平均
  entry.avg_score = Math.round(
    (history.reduce((s, v) => s + v, 0) / history.length) * 10
  ) / 10

  // 防抖持久化（避免每次调用都写磁盘）
  this.schedulePersist()
}
```

### 步骤 6：事件订阅（自动同步索引）

```typescript
attachToLoader(loader: PluginLoader): void {
  // 插件加载成功时，确保索引中有记录
  loader.on('plugin:loaded', async (instance: PluginInstance) => {
    const { manifest } = instance
    const existing = this.index.plugins.find(p => p.name === manifest.name)
    if (!existing) {
      this.index.plugins.push({
        name: manifest.name,
        version: manifest.version,
        type: manifest.type,
        description: manifest.description,
        author: manifest.author,
        path: `./${path.relative(process.cwd(), instance.context.pluginDir)}`,
        installed_at: new Date().toISOString(),
        usage_count: 0,
        avg_score: 0
      })
      this.schedulePersist()
    }
  })

  // 插件卸载时，从索引中移除
  loader.on('plugin:unloaded', async (pluginName: string) => {
    this.index.plugins = this.index.plugins.filter(p => p.name !== pluginName)
    this.schedulePersist()
  })
}
```

### 步骤 7：编写单元测试（`tests/v9/plugin-registry.test.ts`）

测试覆盖：
- `initialize()` 在无 registry.yaml 时创建空索引
- `list()` 返回与 registry.yaml 一致的插件列表
- 从合法的插件目录安装，安装后立即可用
- 安装重复名称插件时（`overwrite: false`）输出冲突提示，不自动覆盖
- 安装失败时，不修改现有插件目录状态（原子性回滚验证）
- `recordUsage` 10 次调用后 `usage_count` 准确为 10
- `avg_score` 与最近质量分均值一致（误差 <= 0.1）
- 统计数据持久化（重启后通过重新加载 YAML 验证）
- `uninstall` 后插件从索引中移除

---

## 验收标准

- [ ] 插件加载/卸载时，`registry.yaml` 自动更新
- [ ] `list()` 返回与 `registry.yaml` 一致的插件列表
- [ ] 索引文件支持人工编辑（不依赖二进制格式）
- [ ] 从合法的插件目录安装，安装后立即可用（无需重启）
- [ ] 安装重复名称插件时，输出冲突提示，不自动覆盖
- [ ] 安装失败时，不修改现有插件目录状态（原子性）
- [ ] 工具调用 10 次后，`usage_count` 准确为 10
- [ ] `avg_score` 与最近 100 次调用的质量分均值一致（误差 <= 0.1）
- [ ] 统计数据持久化到 `registry.yaml`，重启后保留
- [ ] 单元测试覆盖率 >= 80%

---

## 技术注意事项

1. **yaml 库引入**：需求文档已允许引入 `yaml` 包。执行 `npm install yaml` 添加依赖
2. **原子写入**：使用临时文件 + `fs.rename` 保证写入原子性，避免写到一半时被读到
3. **使用统计联动**：`recordUsage` 应由 `DynamicToolLoader` 在工具执行后调用，传入 `SelfEvaluator` 返回的质量分
4. **索引初始化顺序**：`PluginLoader.scanAndLoad()` 完成后再调用 `attachToLoader()`，避免索引同步遗漏
