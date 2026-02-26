import { test, expect } from '@playwright/test';
import { BasePage } from '../pages/BasePage';
import { TestHelpers } from '../utils/testHelpers';

/**
 * 登录页面测试套件
 * 演示表单提交和用户认证相关的测试
 */

// 模拟登录页面类
class LoginPage extends BasePage {
  readonly usernameInput: any;
  readonly passwordInput: any;
  readonly loginButton: any;
  readonly errorMessage: any;
  readonly successMessage: any;
  
  constructor(page: any) {
    super(page);
    // 注意：这些定位器是示例，实际使用时需要根据真实页面调整
    this.usernameInput = page.getByLabel(/username|用户名/i);
    this.passwordInput = page.getByLabel(/password|密码/i);
    this.loginButton = page.getByRole('button', { name: /login|登录|sign in/i });
    this.errorMessage = page.getByText(/invalid|错误|失败/i);
    this.successMessage = page.getByText(/success|成功|welcome/i);
  }
  
  async goto() {
    await this.page.goto('/login');
  }
  
  async login(username: string, password: string) {
    await this.fill(this.usernameInput, username);
    await this.fill(this.passwordInput, password);
    await this.click(this.loginButton);
  }
  
  async getErrorMessage(): Promise<string> {
    return await this.getText(this.errorMessage);
  }
}

test.describe('登录功能测试', () => {
  let loginPage: LoginPage;
  
  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });
  
  test.describe('表单验证', () => {
    test('空字段验证', async () => {
      // 提交空表单
      await loginPage.login('', '');
      
      // 验证错误提示
      await TestHelpers.expectVisible(loginPage.errorMessage);
    });
    
    test('无效用户名验证', async () => {
      const invalidUsername = TestHelpers.randomString();
      await loginPage.login(invalidUsername, 'password123');
      
      // 验证错误提示
      await TestHelpers.expectVisible(loginPage.errorMessage);
    });
    
    test('无效密码验证', async () => {
      await loginPage.login('validuser', 'wrongpassword');
      
      // 验证错误提示
      await TestHelpers.expectVisible(loginPage.errorMessage);
    });
  });
  
  test.describe('成功登录场景', () => {
    test('有效凭证登录', async ({ page }) => {
      // 使用测试账号登录
      const username = 'testuser';
      const password = 'testpass123';
      
      await loginPage.login(username, password);
      
      // 验证登录成功
      await TestHelpers.expectUrl(page, /dashboard|home/i);
    });
    
    test('记住我功能', async ({ page, context }) => {
      const username = 'testuser';
      const password = 'testpass123';
      
      // 勾选"记住我"选项
      const rememberMeCheckbox = page.getByLabel(/remember|记住/i);
      await rememberMeCheckbox.check();
      
      await loginPage.login(username, password);
      
      // 验证 Cookie 是否设置
      const cookies = await context.cookies();
      const hasSessionCookie = cookies.some(cookie => cookie.name.includes('session'));
      expect(hasSessionCookie).toBeTruthy();
    });
  });
  
  test.describe('键盘操作测试', () => {
    test('Enter 键提交表单', async () => {
      await loginPage.fill(loginPage.usernameInput, 'testuser');
      await loginPage.fill(loginPage.passwordInput, 'testpass123');
      
      // 使用 Enter 键提交
      await loginPage.passwordInput.press('Enter');
      
      // 验证表单已提交
      // 这里可以添加相应的断言
    });
    
    test('Tab 键导航', async ({ page }) => {
      const usernameInput = loginPage.usernameInput;
      const passwordInput = loginPage.passwordInput;
      
      // 聚焦用户名输入框
      await usernameInput.focus();
      
      // 按 Tab 键导航到密码框
      await page.keyboard.press('Tab');
      
      // 验证焦点在密码框
      await expect(passwordInput).toBeFocused();
    });
  });
  
  test.describe('密码可见性切换', () => {
    test('显示/隐藏密码', async ({ page }) => {
      const passwordInput = loginPage.passwordInput;
      const toggleButton = page.getByRole('button', { name: /show|hide|显示|隐藏/i });
      
      // 输入密码
      await passwordInput.fill('mypassword');
      
      // 验证密码类型是 password
      await expect(passwordInput).toHaveAttribute('type', 'password');
      
      // 点击显示密码按钮
      await toggleButton.click();
      
      // 验证密码类型变为 text
      await expect(passwordInput).toHaveAttribute('type', 'text');
      
      // 再次点击隐藏密码
      await toggleButton.click();
      
      // 验证密码类型变回 password
      await expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });
  
  test.describe('响应式测试', () => {
    const viewports = [
      { name: 'Mobile', width: 375, height: 667 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Desktop', width: 1920, height: 1080 }
    ];
    
    viewports.forEach(({ name, width, height }) => {
      test(`${name} 视图测试`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await loginPage.goto();
        
        // 验证登录表单在不同视口下都可见
        await TestHelpers.expectVisible(loginPage.usernameInput);
        await TestHelpers.expectVisible(loginPage.passwordInput);
        await TestHelpers.expectVisible(loginPage.loginButton);
      });
    });
  });
  
  test.describe('性能测试', () => {
    test('页面加载性能', async ({ page }) => {
      const startTime = Date.now();
      await loginPage.goto();
      await loginPage.waitForLoadState();
      const loadTime = Date.now() - startTime;
      
      // 验证页面在合理时间内加载完成
      expect(loadTime).toBeLessThan(3000);
    });
    
    test('表单提交响应时间', async ({ page }) => {
      // 监听网络请求
      const responsePromise = page.waitForResponse('**/login');
      
      await loginPage.login('testuser', 'testpass123');
      const response = await responsePromise;
      
      // 验证响应时间
      const timing = response.timing();
      expect(timing.responseEnd).toBeLessThan(2000);
    });
  });
});
