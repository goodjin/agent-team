import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 测试配置文件
 * 
 * 配置说明：
 * - testDir: 测试文件目录
 * - fullyParallel: 是否并行运行测试
 * - forbidOnly: 是否禁止运行 only 标记的测试
 * - retries: 失败重试次数
 * - workers: 并行工作进程数
 * - reporter: 测试报告格式
 * - use: 默认测试选项
 * - projects: 多浏览器/设备配置
 */
export default defineConfig({
  testDir: './tests',
  
  // 并行运行测试
  fullyParallel: true,
  
  // CI 环境下禁止运行 only 标记的测试
  forbidOnly: !!process.env.CI,
  
  // 失败重试次数
  retries: process.env.CI ? 2 : 0,
  
  // 并行工作进程数
  workers: process.env.CI ? 1 : undefined,
  
  // 测试报告配置
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
    ['list']
  ],
  
  // 全局配置
  use: {
    // 基础 URL
    baseURL: 'https://example.com',
    
    // 追踪配置（失败时记录）
    trace: 'on-first-retry',
    
    // 截图配置（失败时截图）
    screenshot: 'only-on-failure',
    
    // 视频配置（失败时录制）
    video: 'retain-on-failure',
    
    // 动作超时时间（毫秒）
    actionTimeout: 10000,
    
    // 导航超时时间（毫秒）
    navigationTimeout: 30000,
  },
  
  // 多浏览器/设备配置
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  
  // 开发服务器配置（如需要启动本地服务器）
  // webServer: {
  //   command: 'npm run start',
  //   port: 3000,
  //   timeout: 120 * 1000,
  //   reuseExistingServer: !process.env.CI,
  // },
});
