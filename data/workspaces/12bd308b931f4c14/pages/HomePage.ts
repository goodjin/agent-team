import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * 首页页面对象模型（POM）
 * 封装首页的所有元素定位和操作方法
 */
export class HomePage extends BasePage {
  // 页面元素定位器
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly navigationMenu: Locator;
  
  constructor(page: Page) {
    super(page);
    
    // 使用数据定位器（更稳定的定位方式）
    this.heading = page.getByRole('heading', { name: /welcome|首页/i });
    this.searchInput = page.getByPlaceholder(/search|搜索/i);
    this.searchButton = page.getByRole('button', { name: /search|搜索/i });
    this.navigationMenu = page.getByRole('navigation');
  }
  
  /**
   * 导航到首页
   */
  async goto() {
    await this.page.goto('/');
    await this.waitForLoadState();
  }
  
  /**
   * 执行搜索
   */
  async search(keyword: string) {
    await this.fill(this.searchInput, keyword);
    await this.click(this.searchButton);
  }
  
  /**
   * 获取标题文本
   */
  async getHeadingText(): Promise<string> {
    await this.waitForVisible(this.heading);
    return await this.getText(this.heading);
  }
  
  /**
   * 检查导航菜单是否存在
   */
  async isNavigationMenuVisible(): Promise<boolean> {
    return await this.navigationMenu.isVisible();
  }
}
