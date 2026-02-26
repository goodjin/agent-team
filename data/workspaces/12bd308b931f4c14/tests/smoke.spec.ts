import { test, expect } from '@playwright/test';

/**
 * 烟雾测试
 * 验证基础功能正常工作
 */

test.describe('烟雾测试', () => {
  test('基础页面访问', async ({ page }) => {
    await page.goto('https://example.com');
    await expect(page).toHaveTitle(/Example Domain/i);
  });
  
  test('元素定位', async ({ page }) => {
    await page.goto('https://example.com');
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Example Domain');
  });
});
