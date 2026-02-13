# Task 01：PluginManifest Schema + PluginLoader 基础

**优先级**: P0
**预计工时**: 4h
**阶段**: Phase 1
**依赖**: 无（第一个任务）

---

## 目标

实现插件系统的基础设施：`plugin.json` Schema 定义、格式验证和插件加载器核心逻辑。这是所有后续任务的基础。

---

## 输入

- `docs/v9/01-requirements.md` §3.1、§4（插件格式规范）
- `docs/v9/02-architecture.md`（PluginLoader 和 PluginValidator 设计）
- `src/tools/tool-registry.ts`（v6 ToolRegistry，理解现有工具注册接口）
- `src/core/events.ts`（v5 事件系统，了解 EventEmitter 使用约定）

---

## 输出文件

| 文件 | 说明 |
|------|------|
| `src/plugins/loader.ts` | PluginLoader 主类 |
| `src/plugins/validator.ts` | PluginValidator：plugin.json 格式验证 |
| `src/types/plugin.ts` | 所有插件相关 TypeScript 接口定义 |
| `src/plugins/index.ts` | 插件模块统一导出 |
| `tests/v9/plugin-loader.test.ts` | 单元测试 |

---

## 实现步骤

### 步骤 1：定义 TypeScript 接口（`src/types/plugin.ts`）

定义以下接口（参考 `docs/v9/02-architecture.md` 中的"TypeScript 接口定义"章节）：
- `PluginManifest`
- `PluginType`
- `LifecycleEvent`
- `PluginContext`
- `PluginInstance`
- `LoadResult`

### 步骤 2：实现 PluginValidator（`src/plugins/validator.ts`）

```typescript
class PluginValidator {
  // 验证 plugin.json 内容是否符合 PluginManifest Schema
  validate(raw: unknown): ValidationResult
  // 验证名称格式（kebab-case）
  private validateName(name: string): boolean
  // 验证 semver 版本格式
  private validateVersion(version: string): boolean
  // 验证类型专属字段（type=tool 时 tool 字段必填等）
  private validateTypeSpecific(manifest: PluginManifest): ValidationError[]
}

interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

interface ValidationError {
  field: string
  message: string
}
```

不引入 JSON Schema 库，使用手写验证逻辑（轻量，与项目约束一致）。

### 步骤 3：实现 PluginLoader（`src/plugins/loader.ts`）

```typescript
class PluginLoader extends EventEmitter {
  constructor(
    private validator: PluginValidator,
    private logger: StructuredLogger
  ) {}

  // 扫描目录，加载所有合法插件
  async scanAndLoad(pluginsDir: string): Promise<LoadResult>

  // 运行时加载单个插件（无需重启）
  async load(pluginPath: string): Promise<PluginInstance>

  // 卸载插件（调用 deactivate 钩子）
  async unload(pluginName: string): Promise<void>

  // 已加载插件列表
  getLoaded(): Map<string, PluginInstance>
  getFailed(): Map<string, Error>

  // 拓扑排序（Kahn 算法）
  private topoSort(manifests: PluginManifest[]): PluginManifest[]

  // 检测循环依赖
  private detectCycle(manifests: PluginManifest[]): string[][] // 返回所有环
}
```

**拓扑排序实现要点**：
1. 构建邻接表（依赖图）
2. 计算入度表
3. BFS：将入度为 0 的节点入队
4. 每次出队一个节点，减少其依赖者的入度
5. 处理完毕后若剩余节点 > 0，则存在环形依赖

### 步骤 4：集成 ESM 动态加载

```typescript
private async importPlugin(entryPath: string): Promise<ESMModule> {
  // 使用绝对路径 + 时间戳缓存破坏（热更新时需要）
  const url = pathToFileURL(entryPath).href + `?t=${Date.now()}`
  return import(url)
}
```

注意：Node.js ESM 动态 import 对相同路径有模块缓存，热更新需要通过查询参数或其他方式破坏缓存。

### 步骤 5：编写单元测试（`tests/v9/plugin-loader.test.ts`）

测试覆盖：
- 扫描空目录返回空 LoadResult
- 合法插件正确加载（tool/role/hook 三种类型）
- `plugin.json` 格式错误时跳过插件并记录错误
- 缺少入口文件时加载失败
- 拓扑排序：A 依赖 B，B 先加载
- 循环依赖（A→B→A）：两个插件均拒绝加载
- 运行时 `load()` 加载新插件成功

---

## 验收标准

- [ ] `PluginValidator.validate()` 对所有必填字段缺失返回明确错误信息
- [ ] `PluginValidator.validate()` 验证 `name` 为 kebab-case 格式
- [ ] `PluginValidator.validate()` 验证 `type=tool` 时 `tool` 字段必填
- [ ] 合法插件目录下 3 个插件均能成功加载
- [ ] 启动时扫描 `plugins/` 目录，加载所有合法插件
- [ ] 单个插件 `plugin.json` 格式错误时，其他插件不受影响
- [ ] 循环依赖检测：A 依赖 B、B 依赖 A 时，两者均拒绝加载并输出明确错误
- [ ] 拓扑排序结果与依赖关系一致（被依赖的插件先加载）
- [ ] 运行时调用 `load(pluginPath)` 可加载新插件，无需重启
- [ ] 单元测试覆盖率 >= 80%
- [ ] TypeScript 编译无错误（`strict: true`）

---

## 技术注意事项

1. **ESM 缓存问题**：Node.js 的 `import()` 会缓存模块，热更新场景下需要考虑缓存破坏策略（查询参数或 `--experimental-vm-modules`）
2. **路径处理**：使用 `path.resolve()` 确保绝对路径；`plugin.json` 中的 `main` 字段是相对路径
3. **可选依赖**：`optionalDependencies` 缺失时不阻止加载，仅记录 warn 日志
4. **依赖版本检查**：Task 1 仅检查依赖插件是否存在，semver 版本约束验证可以是简单的存在性检查（完整 semver 在 Task 7 完善）
