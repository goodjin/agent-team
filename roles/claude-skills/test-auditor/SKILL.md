---
name: test-auditor
description: 测试审计技能 - 全流程测试验证，包括单元测试、集成测试、端到端测试。确保代码质量，生成测试报告和覆盖率分析。
---

# Test Auditor - 测试审计

全流程测试验证技能，覆盖单元测试、集成测试、端到端测试，确保代码质量。

## 核心原则

### 1. 分层测试策略

```
┌─────────────────────────────────────────────┐
│              E2E 测试（端到端）               │  ← 最外层，验证完整流程
│  ┌───────────────────────────────────────┐  │
│  │         集成测试（模块间）              │  │  ← 中间层，验证模块交互
│  │  ┌─────────────────────────────────┐  │  │
│  │  │      单元测试（函数/类）          │  │  │  ← 最内层，验证逻辑正确性
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 2. 测试金字塔

| 测试类型 | 数量占比 | 执行速度 | 成本 | 覆盖范围 |
|---------|---------|---------|------|---------|
| 单元测试 | 70% | 快（ms） | 低 | 函数/类 |
| 集成测试 | 20% | 中（s） | 中 | 模块/服务 |
| E2E测试 | 10% | 慢（min） | 高 | 完整流程 |

### 3. 质量门禁

- **单元测试覆盖率**: ≥ 80%
- **集成测试通过率**: 100%
- **E2E测试通过率**: 100%
- **无严重缺陷遗留**

---

## 测试类型详解

### 1. 单元测试（Unit Tests）

#### 1.1 测试范围

- 纯函数/工具函数
- 业务逻辑类
- 数据处理函数
- 状态管理

#### 1.2 测试原则

- **隔离性**: 不依赖外部系统（数据库、网络等）
- **快速性**: 毫秒级执行
- **可重复性**: 每次运行结果一致
- **Mock策略**: 外部依赖全部Mock

#### 1.3 测试框架

| 语言 | 框架 | 断言库 | Mock工具 |
|-----|------|-------|---------|
| TypeScript/JavaScript | Jest / Vitest | 内置 | jest.mock / vi.fn |
| Python | pytest | pytest-assert | unittest.mock |
| Go | go test | testify | gomock |
| Rust | cargo test | assert_eq! | mockall |

#### 1.4 测试模板

```typescript
/**
 * 单元测试模板
 * 测试目标: [函数/类名称]
 * 对应架构: [架构文档引用]
 */

import { functionToTest } from '../src/module';

// Mock外部依赖
jest.mock('../src/dependency');

describe('functionToTest', () => {
  // 测试前置条件
  beforeEach(() => {
    // 初始化测试数据
  });

  afterEach(() => {
    // 清理测试数据
    jest.clearAllMocks();
  });

  // 正常场景测试
  describe('正常场景', () => {
    it('should return expected result when input is valid', () => {
      // Arrange
      const input = 'valid-input';
      const expected = 'expected-output';

      // Act
      const result = functionToTest(input);

      // Assert
      expect(result).toBe(expected);
    });
  });

  // 边界条件测试
  describe('边界条件', () => {
    it('should handle empty input', () => {
      expect(() => functionToTest('')).toThrow('Input cannot be empty');
    });

    it('should handle max length input', () => {
      const maxInput = 'a'.repeat(1000);
      const result = functionToTest(maxInput);
      expect(result).toBeDefined();
    });
  });

  // 异常场景测试
  describe('异常场景', () => {
    it('should throw error when input is null', () => {
      expect(() => functionToTest(null)).toThrow();
    });
  });
});
```

#### 1.5 覆盖率要求

| 类型 | 最低覆盖率 | 目标覆盖率 |
|-----|-----------|-----------|
| 语句覆盖 | 80% | 90% |
| 分支覆盖 | 75% | 85% |
| 函数覆盖 | 85% | 95% |
| 行覆盖 | 80% | 90% |

---

### 2. 集成测试（Integration Tests）

#### 2.1 测试范围

- 模块间交互
- API接口调用
- 数据库操作
- 外部服务集成

#### 2.2 测试策略

**依赖处理**:
- 数据库: 使用测试数据库（Docker容器）
- 外部服务: 使用Mock服务器
- 缓存: 使用内存缓存

#### 2.3 测试框架

| 类型 | 工具 | 用途 |
|-----|------|------|
| API测试 | Supertest / TestClient | HTTP接口测试 |
| 数据库测试 | TestContainers | 数据库容器 |
| Mock服务 | MSW / WireMock | 服务Mock |

#### 2.4 测试模板

```typescript
/**
 * 集成测试模板
 * 测试目标: [模块名称]
 * 对应架构: [架构文档引用]
 * 对应接口: [API编号]
 */

import { TestClient } from '../test-utils/client';
import { setupTestDatabase, cleanupTestDatabase } from '../test-utils/db';

describe('API Integration: /api/users', () => {
  let client: TestClient;
  let testDb: TestDatabase;

  // 测试环境准备
  beforeAll(async () => {
    testDb = await setupTestDatabase();
    client = new TestClient({
      baseURL: 'http://localhost:3000',
      db: testDb
    });
  });

  // 测试环境清理
  afterAll(async () => {
    await cleanupTestDatabase(testDb);
    await client.close();
  });

  // 数据清理
  beforeEach(async () => {
    await testDb.reset();
  });

  describe('POST /api/users', () => {
    it('should create user successfully', async () => {
      // Arrange
      const userData = {
        name: 'Test User',
        email: 'test@example.com'
      };

      // Act
      const response = await client.post('/api/users', userData);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        name: userData.name,
        email: userData.email
      });

      // 验证数据库
      const dbUser = await testDb.findOne('users', { email: userData.email });
      expect(dbUser).toBeDefined();
    });

    it('should return 400 when email is invalid', async () => {
      const response = await client.post('/api/users', {
        name: 'Test',
        email: 'invalid-email'
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('email');
    });
  });

  describe('GET /api/users/:id', () => {
    it('should return user when exists', async () => {
      // 准备测试数据
      const user = await testDb.insert('users', {
        name: 'Test User',
        email: 'test@example.com'
      });

      const response = await client.get(`/api/users/${user.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(user.id);
    });

    it('should return 404 when user not found', async () => {
      const response = await client.get('/api/users/non-existent-id');

      expect(response.status).toBe(404);
    });
  });
});
```

---

### 3. 端到端测试（E2E Tests）

#### 3.1 测试范围

- 完整用户流程
- 跨系统交互
- 真实环境验证

#### 3.2 测试策略

**环境要求**:
- 使用独立的测试环境
- 真实数据库（测试实例）
- 真实外部服务（或高保真Mock）

**执行时机**:
- 合并到主分支前
- 发布前
- 定期回归测试

#### 3.3 测试框架

| 类型 | 工具 | 用途 |
|-----|------|------|
| Web E2E | Playwright / Cypress | 浏览器自动化 |
| API E2E | Newman / k6 | API流程测试 |
| 移动端 | Detox / Appium | 移动应用测试 |

#### 3.4 测试模板

```typescript
/**
 * E2E测试模板
 * 测试场景: [用户场景描述]
 * 对应PRD: [PRD用户故事编号]
 */

import { test, expect } from '@playwright/test';

test.describe('用户登录流程', () => {
  test.beforeEach(async ({ page }) => {
    // 导航到登录页
    await page.goto('/login');
  });

  test('用户可以使用正确凭据登录', async ({ page }) => {
    // 步骤1: 填写登录表单
    await page.fill('[name="email"]', 'user@example.com');
    await page.fill('[name="password"]', 'correct-password');

    // 步骤2: 点击登录按钮
    await page.click('button[type="submit"]');

    // 步骤3: 验证跳转到首页
    await expect(page).toHaveURL('/dashboard');

    // 步骤4: 验证用户信息显示
    await expect(page.locator('.user-name')).toContainText('Test User');
  });

  test('登录失败应显示错误提示', async ({ page }) => {
    // 填写错误凭据
    await page.fill('[name="email"]', 'user@example.com');
    await page.fill('[name="password"]', 'wrong-password');
    await page.click('button[type="submit"]');

    // 验证错误提示
    await expect(page.locator('.error-message')).toBeVisible();
    await expect(page.locator('.error-message')).toContainText('密码错误');
  });

  test('完整的用户操作流程', async ({ page }) => {
    // 登录
    await page.fill('[name="email"]', 'user@example.com');
    await page.fill('[name="password"]', 'correct-password');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    // 创建订单
    await page.click('text=新建订单');
    await page.fill('[name="orderName"]', '测试订单');
    await page.click('button:has-text("提交")');

    // 验证订单创建成功
    await expect(page.locator('.order-status')).toContainText('已创建');

    // 查看订单列表
    await page.click('text=订单列表');
    await expect(page.locator('.order-item').first()).toBeVisible();
  });
});
```

---

## 测试审计流程

### 阶段 1: 测试计划

#### 1.1 分析测试范围

```markdown
## 测试范围分析

### 功能模块

| 模块 | 单元测试 | 集成测试 | E2E测试 |
|-----|---------|---------|---------|
| 用户模块 | ✓ | ✓ | ✓ |
| 订单模块 | ✓ | ✓ | ✓ |
| 支付模块 | ✓ | ✓ | - |
```

#### 1.2 确定测试策略

```markdown
## 测试策略

### 优先级

| 优先级 | 模块 | 测试类型 | 覆盖率目标 |
|-------|------|---------|-----------|
| P0 | 用户认证 | 全部 | 90% |
| P1 | 订单管理 | 单元+集成 | 85% |
| P2 | 报表功能 | 单元 | 80% |
```

---

### 阶段 2: 测试执行

#### 2.1 单元测试执行

```bash
# 运行所有单元测试
npm run test:unit

# 运行特定模块测试
npm run test:unit -- --grep "UserService"

# 生成覆盖率报告
npm run test:unit -- --coverage
```

**输出**:
```
Test Suites: 25 passed, 25 total
Tests:       156 passed, 156 total
Coverage:
  Statements: 85.5%
  Branches: 78.2%
  Functions: 90.1%
  Lines: 86.3%
```

#### 2.2 集成测试执行

```bash
# 启动测试环境
docker-compose -f docker-compose.test.yml up -d

# 运行集成测试
npm run test:integration

# 清理测试环境
docker-compose -f docker-compose.test.yml down
```

**输出**:
```
Integration Tests:
  API /api/users
    ✓ POST /api/users (120ms)
    ✓ GET /api/users/:id (45ms)
    ✓ PUT /api/users/:id (78ms)
    ✓ DELETE /api/users/:id (35ms)

  API /api/orders
    ✓ POST /api/orders (150ms)
    ✓ GET /api/orders (200ms)

  6 passing (1.2s)
```

#### 2.3 E2E测试执行

```bash
# 运行E2E测试
npm run test:e2e

# 指定浏览器
npm run test:e2e -- --project=chromium

# 生成测试报告
npm run test:e2e -- --reporter=html
```

**输出**:
```
Running 12 tests using 1 worker

✓ [chromium] › login.spec.ts:3:1 › 用户可以使用正确凭据登录 (2.5s)
✓ [chromium] › login.spec.ts:15:1 › 登录失败应显示错误提示 (1.8s)
✓ [chromium] › order.spec.ts:5:1 › 完整的订单创建流程 (5.2s)

12 passed (30s)
```

---

### 阶段 3: 测试报告

#### 3.1 生成测试报告

**输出**: `docs/v{N}/05-test-report/report.md`

```markdown
# 测试审计报告

## 测试概况

- **项目**: [项目名称]
- **版本**: v{N}
- **测试日期**: [日期]
- **测试环境**: [环境描述]
- **总体状态**: ✅ 通过 / ❌ 失败

## 测试统计

### 测试用例统计

| 测试类型 | 用例数 | 通过 | 失败 | 跳过 | 通过率 |
|---------|-------|------|------|------|-------|
| 单元测试 | 156 | 156 | 0 | 0 | 100% |
| 集成测试 | 48 | 47 | 1 | 0 | 97.9% |
| E2E测试 | 12 | 12 | 0 | 0 | 100% |
| **总计** | 216 | 215 | 1 | 0 | 99.5% |

### 覆盖率统计

| 指标 | 实际值 | 目标值 | 状态 |
|-----|-------|-------|------|
| 语句覆盖 | 85.5% | 80% | ✅ |
| 分支覆盖 | 78.2% | 75% | ✅ |
| 函数覆盖 | 90.1% | 85% | ✅ |
| 行覆盖 | 86.3% | 80% | ✅ |

### 模块覆盖率明细

| 模块 | 语句 | 分支 | 函数 | 行 | 状态 |
|-----|------|------|------|-----|------|
| 用户模块 | 92% | 85% | 95% | 91% | ✅ |
| 订单模块 | 88% | 80% | 90% | 87% | ✅ |
| 支付模块 | 75% | 68% | 82% | 76% | ⚠️ |

## 失败用例详情

### 集成测试失败

| 用例 | 模块 | 失败原因 | 严重程度 | 建议 |
|-----|------|---------|---------|------|
| POST /api/orders | 订单 | 超时 | 中 | 增加超时时间或优化性能 |

## 质量评估

### 优点
1. 单元测试覆盖率高
2. E2E测试覆盖核心流程
3. 测试用例结构清晰

### 待改进
1. 支付模块覆盖率需提升
2. 集成测试需增加异常场景

## 质量门禁检查

| 门禁项 | 标准 | 实际 | 状态 |
|-------|------|------|------|
| 单元测试覆盖率 | ≥ 80% | 85.5% | ✅ |
| 集成测试通过率 | 100% | 97.9% | ❌ |
| E2E测试通过率 | 100% | 100% | ✅ |
| 严重缺陷数 | 0 | 0 | ✅ |

**结论**: ❌ 未通过质量门禁（集成测试有1个失败用例）

## 建议

1. **紧急**: 修复集成测试失败用例
2. **重要**: 提升支付模块测试覆盖率
3. **一般**: 增加边界条件测试用例
```

---

## 测试工具配置

### Jest配置示例

```javascript
// jest.config.js
module.exports = {
  // 测试环境
  testEnvironment: 'node',

  // 覆盖率配置
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 75,
      functions: 85,
      lines: 80
    }
  },

  // 测试文件匹配
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/*.spec.ts'
  ],

  // 覆盖率收集
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ]
};
```

### Playwright配置示例

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  // 测试目录
  testDir: './e2e',

  // 超时配置
  timeout: 30000,
  expect: {
    timeout: 5000
  },

  // 重试配置
  retries: process.env.CI ? 2 : 0,

  // 并行配置
  workers: process.env.CI ? 1 : undefined,

  // 报告配置
  reporter: [
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],

  // 浏览器配置
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } }
  ]
});
```

---

## 使用示例

```
用户: "运行测试审计"

AI: 正在执行测试审计...

    【阶段1】测试计划
    - 分析测试范围: 5个模块
    - 确定测试策略: P0模块全量测试

    【阶段2】测试执行

    === 单元测试 ===
    运行: npm run test:unit
    结果: 156 passed, 0 failed
    覆盖率: 85.5%
    ✅ 通过

    === 集成测试 ===
    运行: npm run test:integration
    结果: 47 passed, 1 failed
    ⚠️ 有失败用例

    === E2E测试 ===
    运行: npm run test:e2e
    结果: 12 passed, 0 failed
    ✅ 通过

    【阶段3】测试报告
    ✅ 生成报告: docs/v1/05-test-report/report.md

    质量门禁: ❌ 未通过
    原因: 集成测试有1个失败用例

    建议操作:
    1. 修复 POST /api/orders 失败用例
    2. 重新运行测试审计
```

---

## 检查清单

### 单元测试

- [ ] 所有函数都有对应测试
- [ ] 覆盖率达到目标值
- [ ] 边界条件已测试
- [ ] 异常场景已测试

### 集成测试

- [ ] API接口已测试
- [ ] 数据库操作已测试
- [ ] 外部服务Mock已配置
- [ ] 测试数据清理完成

### E2E测试

- [ ] 核心用户流程已覆盖
- [ ] 多浏览器兼容性已验证
- [ ] 测试环境独立
- [ ] 测试数据可重置

---

## 注意事项

1. **测试隔离**: 每个测试应该独立，不依赖其他测试
2. **数据清理**: 测试后必须清理测试数据
3. **Mock策略**: 合理使用Mock，不过度Mock
4. **性能考量**: E2E测试耗时，需控制数量
5. **持续集成**: 测试应集成到CI/CD流程

---

**分层测试 · 质量门禁 · 完整报告** 🧪
