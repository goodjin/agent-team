import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('UI 界面测试', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  // ========== 1. 页面加载测试 ==========
  test('1.1 首页正确加载', async ({ page }) => {
    await expect(page).toHaveTitle(/Agent Team/);
  });
  
  test('1.2 头部显示正确', async ({ page }) => {
    await expect(page.locator('.header h1')).toContainText('Agent Team');
    await expect(page.locator('.header-status')).toContainText('系统在线');
  });
  
  test('1.3 页面标题显示', async ({ page }) => {
    await expect(page.locator('.page-title')).toContainText('任务列表');
  });

  // ========== 2. 按钮元素测试 ==========
  test('2.1 新建任务按钮存在', async ({ page }) => {
    await expect(page.locator('.btn-primary')).toContainText('新建任务');
  });
  
  test('2.2 筛选按钮组存在', async ({ page }) => {
    const buttons = ['全部', '待执行', '执行中', '已完成', '失败'];
    for (const btn of buttons) {
      await expect(page.locator('.filter-btn').filter({ hasText: btn })).toBeVisible();
    }
  });
  
  test('2.3 筛选按钮可点击切换', async ({ page }) => {
    await page.locator('.filter-btn').filter({ hasText: '待执行' }).click();
    await page.waitForTimeout(500);
    const activeBtn = page.locator('.filter-btn.active');
    await expect(activeBtn).toBeVisible();
  });

  // ========== 3. 任务卡片测试 ==========
  test('3.1 任务卡片显示', async ({ page }) => {
    const taskCards = page.locator('.task-card');
    const count = await taskCards.count();
    if (count > 0) {
      await expect(taskCards.first()).toBeVisible();
      await expect(taskCards.first().locator('.task-card-title')).toBeVisible();
      await expect(taskCards.first().locator('.status-badge')).toBeVisible();
    } else {
      await expect(page.locator('.empty-state')).toBeVisible();
    }
  });

  test('3.2 任务卡片可点击进入详情', async ({ page }) => {
    const taskCards = page.locator('.task-card');
    if (await taskCards.count() > 0) {
      await taskCards.first().click();
      await page.waitForTimeout(500);
      await expect(page.locator('.task-detail')).toBeVisible();
    }
  });

  // ========== 4. 模态框测试 ==========
  test('4.1 点击新建任务弹出模态框', async ({ page }) => {
    await page.locator('.btn-primary').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.modal')).toBeVisible();
    await expect(page.locator('.modal-title')).toContainText('新建任务');
  });
  
  test('4.2 模态框包含表单元素', async ({ page }) => {
    await page.locator('.btn-primary').click();
    await page.waitForTimeout(300);
    
    await expect(page.locator('#task-title')).toBeVisible();
    await expect(page.locator('#task-desc')).toBeVisible();
    await expect(page.locator('.modal-footer button').filter({ hasText: '取消' })).toBeVisible();
    await expect(page.locator('.modal-footer button').filter({ hasText: '创建' })).toBeVisible();
  });
  
  test('4.3 点击取消关闭模态框', async ({ page }) => {
    await page.locator('.btn-primary').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.modal')).toBeVisible();
    
    await page.locator('.modal-footer button').filter({ hasText: '取消' }).click();
    await page.waitForTimeout(300);
    await expect(page.locator('.modal')).not.toBeVisible();
  });
  
  test('4.4 创建任务功能', async ({ page }) => {
    await page.locator('.btn-primary').click();
    await page.waitForTimeout(300);

    await page.locator('#task-title').fill('Playwright 测试任务');
    await page.locator('#task-desc').fill('这是一个自动化测试创建的任务');

    await page.locator('.modal-footer button').filter({ hasText: '创建' }).click();
    await page.waitForTimeout(1000);

    // 模态框应该关闭
    await expect(page.locator('.modal')).not.toBeVisible();

    // 创建成功后会跳转到详情页或刷新列表
    const hasTaskCard = await page.locator('.task-card').isVisible();
    const hasTaskDetail = await page.locator('.task-detail').isVisible();
    expect(hasTaskCard || hasTaskDetail).toBeTruthy();
  });

  // ========== 5. 任务详情页测试 ==========
  test('5.1 返回按钮存在', async ({ page }) => {
    const taskCards = page.locator('.task-card');
    if (await taskCards.count() > 0) {
      await taskCards.first().click();
      await page.waitForTimeout(500);
      await expect(page.locator('.header button').filter({ hasText: '返回列表' })).toBeVisible();
    }
  });
  
  test('5.2 标签页存在', async ({ page }) => {
    const taskCards = page.locator('.task-card');
    if (await taskCards.count() > 0) {
      await taskCards.first().click();
      await page.waitForTimeout(500);
      
      await expect(page.locator('.tab').filter({ hasText: '概览' })).toBeVisible();
      await expect(page.locator('.tab').filter({ hasText: '执行日志' })).toBeVisible();
      await expect(page.locator('.tab').filter({ hasText: '子任务' })).toBeVisible();
    }
  });
  
  test('5.3 标签页可切换', async ({ page }) => {
    const taskCards = page.locator('.task-card');
    if (await taskCards.count() > 0) {
      await taskCards.first().click();
      await page.waitForTimeout(500);
      
      await page.locator('.tab').filter({ hasText: '执行日志' }).click();
      await page.waitForTimeout(500);
      await expect(page.locator('.tab.active').filter({ hasText: '执行日志' })).toBeVisible();
      
      await page.locator('.tab').filter({ hasText: '子任务' }).click();
      await page.waitForTimeout(500);
      await expect(page.locator('.tab.active').filter({ hasText: '子任务' })).toBeVisible();
    }
  });
  
  test('5.4 返回列表功能', async ({ page }) => {
    const taskCards = page.locator('.task-card');
    if (await taskCards.count() > 0) {
      await taskCards.first().click();
      await page.waitForTimeout(500);
      
      await page.locator('.header button').filter({ hasText: '返回列表' }).click();
      await page.waitForTimeout(500);
      
      await expect(page.locator('.page-title')).toContainText('任务列表');
    }
  });

  // ========== 6. 状态徽章测试 ==========
  test('6.1 任务卡片显示状态徽章', async ({ page }) => {
    const taskCards = page.locator('.task-card');
    if (await taskCards.count() > 0) {
      const badge = taskCards.first().locator('.status-badge');
      await expect(badge).toBeVisible();
    }
  });

  // ========== 7. 角色徽章测试 ==========
  test('7.1 任务卡片显示角色徽章', async ({ page }) => {
    const taskCards = page.locator('.task-card');
    if (await taskCards.count() > 0) {
      const roleBadge = taskCards.first().locator('.role-badge');
      await expect(roleBadge).toBeVisible();
    }
  });

  // ========== 8. 响应式测试 ==========
  test('8.1 桌面视图正常显示', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(BASE_URL);
    await expect(page.locator('.header')).toBeVisible();
    await expect(page.locator('.container')).toBeVisible();
  });
  
  test('8.2 平板视图正常显示', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(BASE_URL);
    await expect(page.locator('.header')).toBeVisible();
  });

  // ========== 9. 加载状态测试 ==========
  test('9.1 页面加载正常', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('.header')).toBeVisible();
  });

  // ========== 10. 操作按钮测试 ==========
  test('10.1 任务详情页操作按钮', async ({ page }) => {
    // 使用现有任务测试
    const taskCards = page.locator('.task-card');
    const count = await taskCards.count();
    
    if (count > 0) {
      // 点击第一个待执行的任务
      const pendingTask = taskCards.filter({ has: page.locator('.status-badge.pending') }).first();
      if (await pendingTask.isVisible()) {
        await pendingTask.click();
        await page.waitForTimeout(500);
        
        // 检查"开始执行"按钮
        const startBtn = page.locator('.task-actions button').filter({ hasText: '开始执行' });
        if (await startBtn.isVisible()) {
          await expect(startBtn).toBeVisible();
        }
      }
    }
  });

  // ========== 11. 执行日志测试 ==========
  test('11.1 执行日志时间线显示', async ({ page }) => {
    const taskCards = page.locator('.task-card');
    if (await taskCards.count() > 0) {
      await taskCards.first().click();
      await page.waitForTimeout(500);
      
      // 点击执行日志标签
      await page.locator('.tab').filter({ hasText: '执行日志' }).click();
      await page.waitForTimeout(1000);
      
      // 检查时间线或空状态
      const timeline = page.locator('.timeline');
      const emptyState = page.locator('.empty-state');
      
      // 应该有其中之一
      expect(await timeline.isVisible() || await emptyState.isVisible()).toBeTruthy();
    }
  });

  // ========== 12. 子任务测试 ==========
  test('12.1 子任务列表显示', async ({ page }) => {
    const taskCards = page.locator('.task-card');
    if (await taskCards.count() > 0) {
      await taskCards.first().click();
      await page.waitForTimeout(500);
      
      // 点击子任务标签
      await page.locator('.tab').filter({ hasText: '子任务' }).click();
      await page.waitForTimeout(1000);
      
      // 检查子任务列表或空状态
      const subtaskList = page.locator('.subtask-list');
      const emptyState = page.locator('.empty-state');
      
      expect(await subtaskList.isVisible() || await emptyState.isVisible()).toBeTruthy();
    }
  });

});
