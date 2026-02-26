import { Page, Locator } from '@playwright/test';

/**
 * 基础页面类
 * 所有页面类的父类，提供通用方法和属性
 */
export class BasePage {
  readonly page: Page;
  
  constructor(page: Page) {
    this.page = page;
  }
  
  /**
   * 导航到指定 URL
   */
  async goto(url: string) {
    await this.page.goto(url);
  }
  
  /**
   * 等待页面加载完成
   */
  async waitForLoadState() {
    await this.page.waitForLoadState('networkidle');
  }
  
  /**
   * 等待元素可见
   */
  async waitForVisible(locator: Locator, timeout?: number) {
    await locator.waitFor({ state: 'visible', timeout });
  }
  
  /**
   * 点击元素
   */
  async click(locator: Locator, options?: { timeout?: number }) {
    await locator.click(options);
  }
  
  /**
   * 输入文本
   */
  async fill(locator: Locator, value: string, options?: { timeout?: number }) {
    await locator.fill(value, options);
  }
  
  /**
   * 获取元素文本
   */
  async getText(locator: Locator): Promise<string> {
    return await locator.textContent() || '';
  }
  
  /**
   * 等待指定时间
   */
  async sleep(ms: number) {
    await this.page.waitForTimeout(ms);
  }
  
  /**
   * 截图
   */
  async screenshot(path: string) {
    await this.page.screenshot({ path, fullPage: true });
  }
  
  /**
   * 获取页面标题
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }
  
  /**
   * 获取当前 URL
   */
  async getUrl(): Promise<string> {
    return this.page.url();
  }
}
