import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { TestHelpers } from '../utils/testHelpers';

/**
 * 示例测试套件
 * 演示 Playwright 的基本用法和最佳实践
 */

test.describe('示例测试套件', () => {
  let homePage: HomePage;
  
  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
  });
  
  test.describe('基础功能测试', () => {
    test('页面加载测试', async ({ page }) => {
      // 导航到示例网站
      await page.goto('https://example.com');
      
      // 验证页面标题
      await TestHelpers.expectTitle(page, /Example Domain/i);
      
      // 验证 URL
      await TestHelpers.expectUrl(page, 'https://example.com');
      
      // 验证页面包含关键元素
      const heading = page.getByRole('heading');
      await TestHelpers.expectVisible(heading);
      await TestHelpers.expectText(heading, 'Example Domain');
    });
    
    test('元素定位测试', async ({ page }) => {
      await page.goto('https://example.com');
      
      // 使用多种方式定位元素
      const heading = page.locator('h1');
      const paragraph = page.locator('p');
      const link = page.getByRole('link', { name: 'More information' });
      
      // 验证元素存在
      await expect(heading).toBeVisible();
      await expect(paragraph).toBeVisible();
      await expect(link).toBeVisible();
      
      // 验证链接属性
      await expect(link).toHaveAttribute('href', 'https://www.iana.org/domains/example');
    });
    
    test('页面交互测试', async ({ page }) => {
      await page.goto('https://example.com');
      
      // 获取链接元素
      const link = page.getByRole('link');
      
      // 点击链接
      await link.click();
      
      // 验证导航到新页面
      await TestHelpers.expectUrl(page, 'https://www.iana.org/domains/example');
      await TestHelpers.expectTitle(page, /Example Domains/i);
    });
  });
  
  test.describe('表单操作测试', () => {
    test('搜索框交互', async ({ page }) => {
      await page.goto('https://example.com');
      
      // 这是一个演示测试，因为 example.com 没有搜索框
      // 在实际项目中，替换为真实的表单元素
      
      const text = 'Hello Playwright';
      
      // 演示如何操作输入框（如果存在的话）
      // await searchInput.fill(text);
      // await expect(searchInput).toHaveValue(text);
    });
  });
  
  test.describe('API 测试示例', () => {
    test('API 请求测试', async ({ page }) => {
      // 监听 API 响应
      const responsePromise = page.waitForResponse('https://example.com');
      
      await page.goto('https://example.com');
      const response = await responsePromise;
      
      // 验证响应状态
      expect(response.status()).toBe(200);
      expect(response.ok()).toBe(true);
    });
  });
  
  test.describe('页面对象模型示例', () => {
    test('使用 POM 进行测试', async ({ page }) => {
      await homePage.goto();
      await homePage.waitForLoadState();
      
      const title = await homePage.getTitle();
      expect(title).toBeTruthy();
    });
  });
  
  test.describe('截图和录制示例', () => {
    test('截图测试', async ({ page }) => {
      await page.goto('https://example.com');
      
      // 整页截图
      await page.screenshot({ path: 'screenshots/full-page.png', fullPage: true });
      
      // 元素截图
      const heading = page.getByRole('heading');
      await heading.screenshot({ path: 'screenshots/heading.png' });
    });
  });
  
  test.describe('网络拦截示例', () => {
    test('拦截 API 请求', async ({ page }) => {
      // 拦截并修改请求
      await page.route('**/*', async route => {
        const request = route.request();
        console.log('Request:', request.url());
        await route.continue();
      });
      
      await page.goto('https://example.com');
    });
  });
});
