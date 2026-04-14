/**
 * Playwright：针对 public-react 构建产物（由 3000 端口托管）。
 * 运行前请启动后端并构建前端：
 *   npm run build:web && npm run server
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
  
test.describe('Web UI（React）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
  });

  test('首页加载与标题', async ({ page }) => {
    await expect(page).toHaveTitle(/Agent Team/);
    await expect(page.locator('.sidebar-title')).toContainText('Agent Team');
  });

  test('筛选 Tab', async ({ page }) => {
    for (const label of ['全部', '执行中', '已完成', '失败']) {
      await expect(page.locator('.filter-tab').filter({ hasText: label })).toBeVisible();
    }
  });

  test('侧栏新建按钮', async ({ page }) => {
    await expect(page.locator('.btn-create')).toBeVisible();
  });

  test('进入新建任务视图', async ({ page }) => {
    await page.locator('.btn-create').click();
    await expect(page.locator('.task-shell-title')).toContainText('新建任务');
  });

  test('从新建返回列表', async ({ page }) => {
    await page.locator('.btn-create').click();
    await page.locator('.task-shell-bar button').filter({ hasText: '列表' }).click();
    await expect(page.locator('.empty-detail')).toBeVisible();
  });

  test('空状态创建按钮', async ({ page }) => {
    await expect(page.locator('.empty-detail .btn-primary')).toContainText('创建新任务');
  });

  test('若有任务则打开详情并显示 Tab', async ({ page }) => {
    const first = page.locator('.task-item').first();
    if ((await first.count()) === 0) {
      test.skip();
      return;
    }
    await first.click();
    await expect(page.locator('.tabs .tab').filter({ hasText: '对话' })).toBeVisible();
    await expect(page.locator('.tabs .tab').filter({ hasText: '操作台' })).toBeVisible();
  });
});
