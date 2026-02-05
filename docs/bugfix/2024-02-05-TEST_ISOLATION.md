# Bug Fix: 测试隔离问题

## 问题描述

**日期**: 2024-02-05
**严重程度**: Medium
**影响范围**: Vitest 并行测试执行

### 错误信息

当运行完整测试套件时，出现间歇性测试失败：

```
FAIL tests/server-projects.test.ts > POST /api/projects > should create a project with required fields
Error: expected 201 "Created", got 404 "Not Found"

FAIL tests/server-tasks.test.ts > Task Routes > GET /api/projects/:projectId/tasks/:id > should return 404
Error: expected undefined to be false // Object.is equality
```

### 问题表现

- 单独运行每个测试文件: ✅ 全部通过
- 运行完整测试套件: ❌ 偶发失败
- 使用 `--run` 参数: ✅ 全部通过

## 根因分析

### 问题位置

1. `src/server/routes/projects.ts:10` - module-level `projectStore`
2. `src/server/routes/tasks.ts` - 可能有类似的 module-level 状态

### 原因

Vitest 默认配置 `fullyParallel: true`，测试文件并行执行。Module-level 的 `projectStore` 被多个测试文件共享：

```typescript
// src/server/routes/projects.ts
const projectStore: InMemoryProjectStore = {
  projects: new Map()
};
```

当 `server-projects.test.ts` 在 `beforeEach` 中调用 `clearProjectStore()` 时，会清空共享的 `projectStore`，影响同时运行的 `server-tasks.test.ts`。

### 并行执行时序

```
时间轴:
T0: server-projects.test.ts.beforeEach() → clearProjectStore()
T1: server-tasks.test.ts 运行 → 读取 projectStore (已清空)
T2: server-projects.test.ts 添加测试数据
```

## 临时解决方案

### 方案 1: 使用 `--run` 参数

```bash
npx vitest run --run  # 单次运行，无并行
```

### 方案 2: 禁用并行执行

修改 `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/browser.test.ts'],
    pool: 'threads',  // 使用线程池
    poolOptions: {
      threads: {
        singleThread: true,  // 强制单线程
      },
    },
  },
});
```

## 永久解决方案

### 方案 1: 使用 `--run` 参数（已采用）

修改 `package.json`:

```json
{
  "scripts": {
    "test": "vitest run"
  }
}
```

### 方案 2: 禁用并行执行（已采用）

修改 `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    // ...
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
```

### 方案 3: 重构为实例级存储（待实现）

长期方案，将 module-level store 改为工厂模式。

## 相关文件

- `src/server/routes/projects.ts` - 需要重构
- `src/server/routes/tasks.ts` - 需要检查
- `vitest.config.ts` - 测试配置
- `tests/server-projects.test.ts` - 测试文件
- `tests/server-tasks.test.ts` - 测试文件

## 验证结果

```
$ npm run test
 ✓ tests/server-projects.test.ts  (22 tests) 76ms
 ✓ tests/server-roles-agents.test.ts  (17 tests) 64ms
 ✓ tests/server-tasks.test.ts  (11 tests) 30ms
 ✓ tests/integration/work-dir.integration.test.ts  (17 tests) 95ms
 ✓ ...

 Test Files  24 passed (24)
      Tests  383 passed (383)
      Duration: 2.47s
```

**状态**: ✅ 已修复
