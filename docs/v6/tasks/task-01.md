# Task 01：ToolRegistry 增强

**优先级**: P0
**预估工时**: 3h
**依赖**: 无
**状态**: 待开发

---

## 目标

在 v5 ToolRegistry 基础上增加权限控制、多维工具发现、健康检查和调用统计能力，为 v6 所有新工具提供基础设施支撑。

---

## 输入

- 现有文件：`src/tools/tool-registry.ts`（v5 版本）
- 现有文件：`src/tools/base.ts`（BaseTool 抽象类）
- 架构文档：`docs/v6/02-architecture.md`（ToolRegistry 接口定义章节）

---

## 输出

**修改文件**：
- `src/tools/tool-registry.ts` - 增强版本

**新增内容**：
- `ToolPermission` 枚举（6 个权限级别）
- `ToolCategory` 枚举（6 个工具类别）
- `V6ToolDefinition` 接口（扩展 v5 ToolDefinition）
- `ToolRegistryQuery` 接口（多维查询条件）
- `ToolCallStats` 接口（调用统计数据）
- `query(q: ToolRegistryQuery): BaseTool[]` 方法
- `execute()` 方法增加可选的 `agentPermissions` 参数
- `startHealthChecks(intervalMs: number)` 方法
- `stopHealthChecks()` 方法
- `getToolStats(name: string): ToolCallStats` 方法

---

## 实现步骤

### Step 1：定义新类型（0.5h）

在 `tool-registry.ts` 顶部或独立类型文件中添加：

```typescript
export enum ToolPermission {
  READ_ONLY    = 'read_only',
  WRITE        = 'write',
  NETWORK      = 'network',
  SHELL        = 'shell',
  CODE_EXEC    = 'code_exec',
  SYSTEM       = 'system',
}

export enum ToolCategory {
  WEB    = 'web',
  SHELL  = 'shell',
  CODE   = 'code',
  FILE   = 'file',
  LLM    = 'llm',
  GIT    = 'git',
}

export interface V6ToolDefinition extends ToolDefinition {
  version?: string;
  tags?: string[];
  permissions?: ToolPermission[];
  examples?: Array<{ description: string; params: any }>;
  healthCheck?: () => Promise<boolean>;
}

export interface ToolRegistryQuery {
  keyword?: string;
  category?: string;
  tags?: string[];
  permissions?: ToolPermission[];
}

export interface ToolCallStats {
  name: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  totalDurationMs: number;
  avgDurationMs: number;
  lastCalledAt?: Date;
}
```

### Step 2：统计数据收集（0.5h）

在 `ToolRegistry` 类中：
1. 新增私有属性 `private stats: Map<string, ToolCallStats> = new Map()`
2. 在 `execute()` 方法成功/失败分支中更新统计
3. 在 `register()` 时初始化工具的统计条目

### Step 3：权限检查（0.5h）

修改 `execute()` 方法签名：

```typescript
async execute(
  name: string,
  params: any,
  agentPermissions?: ToolPermission[]
): Promise<ToolResult>
```

在现有可用性检查后、工具执行前插入权限检查逻辑：
- 获取工具定义的 `permissions` 字段
- 如果 `agentPermissions` 传入，检查是否所有必需权限都被包含
- 权限不足时返回 `{ success: false, error: 'Permission denied: ...' }`

### Step 4：多维查询方法（0.5h）

实现 `query(q: ToolRegistryQuery): BaseTool[]` 方法：
1. 从所有工具中过滤，支持 keyword（名称/描述/标签模糊匹配）
2. 支持 category 精确匹配
3. 支持 tags 包含匹配（工具标签需包含查询标签的所有项）
4. 支持 permissions 过滤（只返回具有指定权限的工具）

### Step 5：健康检查机制（0.5h）

实现定时健康检查：
1. 新增私有属性 `private healthCheckTimer: NodeJS.Timeout | null = null`
2. 新增私有属性 `private toolHealthStatus: Map<string, boolean> = new Map()`
3. `startHealthChecks(intervalMs: number)` - 启动定时器，遍历所有带 `healthCheck` 函数的工具，更新状态
4. `stopHealthChecks()` - 清除定时器
5. 在 `isAvailable()` 中参考 healthStatus（若工具有 healthCheck 函数且状态为 false，返回不可用）

### Step 6：单元测试（0.5h）

在 `tests/tools/tool-registry.test.ts` 中补充测试：
- 权限过滤：低权限 Agent 无法获取高权限工具
- query() 关键词搜索返回正确结果
- 调用统计数据准确
- 健康检查状态正确更新

---

## 验收标准

- [ ] `ToolPermission` 枚举包含 6 个级别，与架构文档一致
- [ ] `query()` 按 keyword 搜索正确（不区分大小写，匹配名称/描述）
- [ ] `query()` 按 category 过滤正确
- [ ] `query()` 按 permissions 过滤：传入 `[NETWORK]` 只返回有 NETWORK 权限的工具
- [ ] `execute()` 权限检查：`agentPermissions = []` 时，有权限要求的工具返回 Permission denied
- [ ] `execute()` 权限检查：`agentPermissions = undefined` 时，跳过权限检查（向后兼容）
- [ ] 调用统计：成功/失败次数、平均耗时记录准确
- [ ] 健康检查：自动更新不可用工具的状态
- [ ] 所有 v5 的现有测试仍通过（零破坏性）
- [ ] 单元测试覆盖率 > 80%

---

## 注意事项

- `execute()` 新增的 `agentPermissions` 参数必须是可选的（`?`），确保不破坏现有调用方
- `V6ToolDefinition` 中所有新字段均为可选，确保 v5 工具无需修改即可继续工作
- 健康检查定时器在进程退出时需要被清理（监听 `process.on('exit')`）
