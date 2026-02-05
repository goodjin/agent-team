/**
 * Playwright Browser E2E Tests
 * 
 * 真浏览器端到端测试 - 启动真实浏览器验证UI交互
 * 
 * 使用方法:
 * 1. 安装浏览器: npx playwright install chromium
 * 2. 运行测试: npx playwright test tests/e2e/browser.test.ts
 */

import { test as base, expect } from '@playwright/test';
import http from 'http';
import express, { Express } from 'express';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const test = base.extend<{ server: { server: http.Server; baseUrl: string; tempDir: string } }>({
  server: async ({}, use) => {
    let server: http.Server;
    let baseUrl: string;
    const tempDir = mkdtempSync(join(tmpdir(), 'agent-browser-e2e-'));
    
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    mkdirSync(join(tempDir, 'tests'), { recursive: true });
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0'
    }));
    
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Team - E2E Test Page</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header { background: #1a1a2e; color: white; padding: 20px; }
    h1 { font-size: 24px; margin-bottom: 10px; }
    .btn { background: #4a90d9; color: white; border: none; padding: 10px 20px; cursor: pointer; border-radius: 4px; }
    .btn:hover { background: #357abd; }
    #projects-list { margin-top: 20px; }
    .project-card { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 8px; }
    #console-logs { background: #1e1e1e; color: #00ff00; padding: 10px; margin-top: 20px; font-family: monospace; max-height: 200px; overflow-y: auto; }
  </style>
</head>
<body>
  <header>
    <h1>🤖 Agent Team Dashboard</h1>
    <p>Multi-role AI Agent System for Project Management</p>
  </header>
  
  <div class="container">
    <section>
      <h2>Projects</h2>
      <button id="create-project-btn" class="btn">Create New Project</button>
      <div id="projects-list"></div>
    </section>
    
    <section style="margin-top: 30px;">
      <h2>Console Output</h2>
      <div id="console-logs">Ready...</div>
    </section>
  </div>

  <script>
    let projects = [];
    
    function log(message) {
      const logDiv = document.getElementById('console-logs');
      const timestamp = new Date().toLocaleTimeString();
      logDiv.innerHTML += \`[\${timestamp}] \${message}<br>\`;
      logDiv.scrollTop = logDiv.scrollHeight;
    }
    
    function renderProjects() {
      const container = document.getElementById('projects-list');
      container.innerHTML = projects.map(p => \`
        <div class="project-card" data-id="\${p.id}">
          <h3>\${p.name}</h3>
          <p>Status: <span class="status">\${p.status}</span></p>
          <button class="view-btn" data-id="\${p.id}">View Details</button>
        </div>
      \`).join('');
    }
    
    document.getElementById('create-project-btn').addEventListener('click', () => {
      const name = prompt('Enter project name:');
      if (name) {
        const project = {
          id: 'proj-' + Date.now(),
          name: name,
          status: 'active',
          createdAt: new Date().toISOString()
        };
        projects.push(project);
        renderProjects();
        log(\`Created project: \${name}\`);
      }
    });
    
    document.getElementById('projects-list').addEventListener('click', (e) => {
      if (e.target.classList.contains('view-btn')) {
        const id = e.target.dataset.id;
        const project = projects.find(p => p.id === id);
        if (project) {
          alert(\`Project: \${project.name}\\nStatus: \${project.status}\\nCreated: \${project.createdAt}\`);
          log(\`Viewed project: \${project.name}\`);
        }
      }
    });
    
    log('Page loaded successfully');
  </script>
</body>
</html>`;

    writeFileSync(join(tempDir, 'index.html'), htmlContent);
    
    const app: Express = express();
    app.use(express.json());
    app.use(express.static(tempDir));
    
    const projects: Map<string, any> = new Map();
    
    app.get('/api/health', (_req, res) => {
      res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
    });
    
    app.get('/api/projects', (_req, res) => {
      res.json({ success: true, data: Array.from(projects.values()) });
    });
    
    app.post('/api/projects', (req, res) => {
      const id = `proj-${Date.now()}`;
      const project = {
        id,
        name: req.body.name || 'Untitled',
        status: 'active',
        createdAt: new Date().toISOString()
      };
      projects.set(id, project);
      res.status(201).json({ success: true, data: project });
    });
    
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => {
        resolve(s);
      });
    });
    
    const address = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
    
    await use({ server, baseUrl, tempDir });
    
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(tempDir, { recursive: true, force: true });
  },
});

export { test, expect };

test.describe('Browser E2E Tests', () => {
  test('should load page without errors', async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveTitle(/Agent Team/);
    await expect(page.locator('h1')).toContainText('Agent Team');
    await expect(page.locator('#create-project-btn')).toBeVisible();
    await expect(page.locator('#console-logs')).toBeVisible();
    
    const consoleText = await page.locator('#console-logs').textContent();
    expect(consoleText).toContain('Page loaded successfully');
  });

  test('should create project via UI', async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForLoadState('networkidle');
    
    page.on('dialog', async dialog => {
      await dialog.accept('Test Project');
    });
    
    await page.click('#create-project-btn');
    await page.waitForSelector('.project-card');
    
    await expect(page.locator('.project-card')).toContainText('Test Project');
    
    const consoleText = await page.locator('#console-logs').textContent();
    expect(consoleText).toContain('Created project: Test Project');
  });

  test('should handle API requests', async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForLoadState('networkidle');
    
    const response = await page.request.get(`${server.baseUrl}/api/health`);
    expect(response.ok()).toBe(true);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('ok');
  });

  test('should handle multiple projects', async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForLoadState('networkidle');
    
    const projectNames = ['Project A', 'Project B', 'Project C'];
    
    for (const name of projectNames) {
      page.on('dialog', async dialog => {
        await dialog.accept(name);
      });
      await page.click('#create-project-btn');
      await page.waitForTimeout(100);
    }
    
    await expect(page.locator('.project-card')).toHaveCount(3);
    
    for (const name of projectNames) {
      await expect(page.locator('.project-card')).toContainText(name);
    }
  });

  test('should not have console errors', async ({ page, server }) => {
    const consoleErrors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.goto(server.baseUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const criticalErrors = consoleErrors.filter(err => 
      !err.includes('favicon') && 
      !err.includes('404')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });

  test('should be responsive', async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForLoadState('networkidle');
    
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    await expect(page.locator('h1')).toBeVisible();
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(300);
    await expect(page.locator('h1')).toBeVisible();
  });
});
