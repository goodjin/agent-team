# Playwright 自动化测试项目

这是一个基于 Playwright 的端到端自动化测试框架项目，提供了完整的测试基础设施和示例测试用例。

## 📋 目录

- [项目简介](#项目简介)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [核心功能](#核心功能)
- [使用说明](#使用说明)
- [编写测试](#编写测试)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

## 🚀 项目简介

本项目是一个功能完整的 Playwright 测试框架，包含：

- ✅ 页面对象模型（POM）架构
- ✅ 多浏览器支持（Chrome, Firefox, Safari）
- ✅ 移动端设备模拟
- ✅ 丰富的测试报告
- ✅ 截图和视频录制
- ✅ 网络请求监控
- ✅ API 测试支持

## 🛠️ 快速开始

### 安装依赖

```bash
npm install
```

### 安装浏览器

```bash
npm run test:install
```

### 运行测试

```bash
# 运行所有测试
npm test

# 有头模式运行
npm run test:headed

# 使用 UI 模式
npm run test:ui

# 调试模式
npm run test:debug
```

## 📁 项目结构

```
playwright-test-project/
├── playwright.config.ts    # Playwright 配置文件
├── package.json            # 项目依赖和脚本
├── README.md               # 项目文档
├── .gitignore              # Git 忽略文件
│
├── tests/                  # 测试文件目录
│   ├── example.spec.ts     # 示例测试套件
│   ├── login.spec.ts       # 登录功能测试
│   └── setup.ts            # 全局测试设置
│
├── pages/                  # 页面对象模型
│   ├── BasePage.ts         # 基础页面类
│   └── HomePage.ts         # 首页页面对象
│
└── utils/                  # 工具类
    └── testHelpers.ts      # 测试辅助工具
```

## ⭐ 核心功能

### 1. 页面对象模型（POM）

```typescript
import { HomePage } from '../pages/HomePage';

test('使用 POM 进行测试', async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.goto();
  await homePage.search('keyword');
});
```

### 2. 多浏览器支持

配置支持 Chromium, Firefox, WebKit 三种浏览器引擎。

### 3. 测试报告

自动生成 HTML、JSON 和列表格式的测试报告。

### 4. 截图和视频

测试失败时自动截图和录制视频，便于问题定位。

## 📖 使用说明

### 运行指定测试

```bash
# 运行单个测试文件
npx playwright test example.spec.ts

# 运行包含特定名称的测试
npx playwright test -g "搜索功能"
```

### 指定浏览器运行

```bash
npm run test:chromium
npm run test:firefox
npm run test:webkit
```

### 查看测试报告

```bash
npm run test:report
```

## ✏️ 编写测试

### 基础测试示例

```typescript
import { test, expect } from '@playwright/test';

test('示例测试', async ({ page }) => {
  await page.goto('https://example.com');
  
  // 元素定位
  const heading = page.getByRole('heading');
  
  // 断言
  await expect(heading).toBeVisible();
  await expect(heading).toContainText('Example');
});
```

### 使用页面对象

```typescript
import { HomePage } from '../pages/HomePage';

test.describe('首页测试', () => {
  test('搜索功能', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.search('keyword');
    
    const result = await homePage.getHeadingText();
    expect(result).toContain('keyword');
  });
});
```

### API 测试

```typescript
test('API 测试', async ({ page }) => {
  const responsePromise = page.waitForResponse('**/api/data');
  
  await page.goto('/');
  const response = await responsePromise;
  
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data).toHaveProperty('items');
});
```

## 💡 最佳实践

### 1. 使用数据定位器

```typescript
// ✅ 推荐：使用语义化定位器
page.getByRole('button', { name: '提交' });
page.getByLabel('用户名');
page.getByPlaceholder('搜索');

// ❌ 避免：使用脆弱的 CSS 选择器
page.locator('div.container > button.btn-primary');
```

### 2. 等待策略

```typescript
// ✅ 自动等待
await page.click('button');

// ✅ 显式等待特定条件
await page.waitForLoadState('networkidle');
await expect(locator).toBeVisible();

// ❌ 避免固定延迟
await page.waitForTimeout(5000);
```

### 3. 测试隔离

```typescript
test.beforeEach(async ({ page }) => {
  // 每个测试前重置状态
  await page.goto('/login');
});

test.afterEach(async ({ page }) => {
  // 每个测试后清理
  await page.context().clearCookies();
});
```

### 4. 环境配置

```typescript
// 使用 baseURL 简化 URL
await page.goto('/login'); // 使用 baseURL

// 使用环境变量
const apiUrl = process.env.API_URL || 'https://api.example.com';
```

## ❓ 常见问题

### Q: 如何处理弹窗？

```typescript
test('处理弹窗', async ({ page }) => {
  page.on('dialog', async dialog => {
    await dialog.accept();
  });
  await page.click('#show-dialog');
});
```

### Q: 如何上传文件？

```typescript
test('上传文件', async ({ page }) => {
  await page.setInputFiles('#file-input', 'path/to/file.pdf');
});
```

### Q: 如何模拟移动设备？

```typescript
test('移动端测试', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
});
```

### Q: 如何调试测试？

```bash
# 使用调试模式
npm run test:debug

# 或使用 Playwright Inspector
npx playwright test --debug
```

## 🔗 相关链接

- [Playwright 官方文档](https://playwright.dev/)
- [Playwright API 参考](https://playwright.dev/docs/api/class-playwright)
- [最佳实践指南](https://playwright.dev/docs/best-practices)

## 📄 许可证

ISC License
