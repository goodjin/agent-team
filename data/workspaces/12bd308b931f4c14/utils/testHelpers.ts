import { Page, expect } from '@playwright/test';

/**
 * 测试辅助工具类
 * 提供测试中常用的辅助方法
 */
export class TestHelpers {
  /**
   * 等待并验证元素可见
   */
  static async expectVisible(locator: any, timeout = 5000) {
    await expect(locator).toBeVisible({ timeout });
  }
  
  /**
   * 等待并验证元素包含文本
   */
  static async expectText(locator: any, text: string, timeout = 5000) {
    await expect(locator).toContainText(text, { timeout });
  }
  
  /**
   * 验证元素数量
   */
  static async expectCount(locator: any, count: number) {
    await expect(locator).toHaveCount(count);
  }
  
  /**
   * 验证 URL
   */
  static async expectUrl(page: Page, urlPattern: string | RegExp) {
    await expect(page).toHaveURL(urlPattern);
  }
  
  /**
   * 验证页面标题
   */
  static async expectTitle(page: Page, titlePattern: string | RegExp) {
    await expect(page).toHaveTitle(titlePattern);
  }
  
  /**
   * 截屏并保存（用于调试）
   */
  static async debugScreenshot(page: Page, name: string) {
    await page.screenshot({ path: `debug-${name}-${Date.now()}.png` });
  }
  
  /**
   * 随机字符串生成器
   */
  static randomString(length = 8): string {
    return Math.random().toString(36).substring(2, 2 + length);
  }
  
  /**
   * 随机邮箱生成器
   */
  static randomEmail(): string {
    return `test-${this.randomString()}@example.com`;
  }
  
  /**
   * 随机数字生成器
   */
  static randomNumber(min = 1, max = 100): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
