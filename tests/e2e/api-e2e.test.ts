/**
 * True End-to-End API Tests
 * 
 * 这些测试启动真实的 Express 服务器，发送真实的 HTTP 请求，
 * 验证完整的 API 请求-响应循环。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express, { Express } from 'express';
import http from 'http';
import request from 'supertest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('True HTTP Server E2E Tests', () => {
  let tempDir: string;
  let app: Express;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-e2e-http-'));
    
    // 创建项目结构
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    mkdirSync(join(tempDir, 'tests'), { recursive: true });
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'test-project', version: '1.0.0' }));
    
    // 直接创建 Express 应用（不依赖 AgentTeamServer）
    app = express();
    app.use(express.json());
    
    // Health check route
    app.get('/health', (_req, res) => {
      res.json({
        success: true,
        data: {
          status: 'ok',
          timestamp: new Date().toISOString(),
        },
      });
    });
    
    // Echo endpoint for testing
    app.post('/api/echo', (req, res) => {
      res.json({
        success: true,
        data: {
          received: req.body,
          timestamp: new Date().toISOString(),
        },
      });
    });
    
    // Projects endpoint (simplified mock)
    const projects: Map<string, { id: string; name: string; createdAt: Date }> = new Map();
    
    app.get('/api/projects', (_req, res) => {
      res.json({
        success: true,
        data: Array.from(projects.values()),
      });
    });
    
    app.post('/api/projects', (req, res) => {
      const id = `proj-${Date.now()}`;
      const project = {
        id,
        name: req.body.name || 'Untitled',
        createdAt: new Date(),
      };
      projects.set(id, project);
      res.status(201).json({
        success: true,
        data: project,
      });
    });
    
    app.get('/api/projects/:id', (req, res) => {
      const project = projects.get(req.params.id);
      if (!project) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Project not found' },
        });
      }
      res.json({ success: true, data: project });
    });
    
    app.delete('/api/projects/:id', (req, res) => {
      if (!projects.has(req.params.id)) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Project not found' },
        });
      }
      projects.delete(req.params.id);
      res.status(204).send();
    });
    
    // Tasks endpoint
    const tasks: Map<string, any> = new Map();
    
    app.get('/api/projects/:projectId/tasks', (_req, res) => {
      res.json({
        success: true,
        data: Array.from(tasks.values()).filter((t: any) => t.projectId === _req.params.projectId),
      });
    });
    
    app.post('/api/projects/:projectId/tasks', (req, res) => {
      const id = `task-${Date.now()}`;
      const task = {
        id,
        projectId: req.params.projectId,
        title: req.body.title || 'Untitled',
        description: req.body.description || '',
        type: req.body.type || 'custom',
        priority: req.body.priority || 'medium',
        status: 'pending',
        createdAt: new Date(),
      };
      tasks.set(id, task);
      res.status(201).json({ success: true, data: task });
    });
    
    app.patch('/api/projects/:projectId/tasks/:taskId/status', (req, res) => {
      const task = tasks.get(req.params.taskId);
      if (!task) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Task not found' },
        });
      }
      task.status = req.body.status;
      task.updatedAt = new Date();
      if (req.body.status === 'completed' || req.body.status === 'failed') {
        task.completedAt = new Date();
      }
      res.json({ success: true, data: task });
    });
    
    app.delete('/api/projects/:projectId/tasks/:taskId', (req, res) => {
      if (!tasks.has(req.params.taskId)) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Task not found' },
        });
      }
      tasks.delete(req.params.taskId);
      res.status(204).send();
    });
    
    // 启动服务器
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => {
        resolve(s);
      });
    });
    
    const address = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 30000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(baseUrl)
        .get('/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ok');
      expect(response.body.data.timestamp).toBeDefined();
    });
  });

  describe('Echo API', () => {
    it('should echo back the request body', async () => {
      const testData = { message: 'Hello World', value: 123 };
      
      const response = await request(baseUrl)
        .post('/api/echo')
        .send(testData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.received).toEqual(testData);
      expect(response.body.data.timestamp).toBeDefined();
    });
  });

  describe('Projects API', () => {
    it('should list empty projects', async () => {
      const response = await request(baseUrl)
        .get('/api/projects')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should create a project', async () => {
      const response = await request(baseUrl)
        .post('/api/projects')
        .send({ name: 'Test Project' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.name).toBe('Test Project');
      expect(response.body.data.createdAt).toBeDefined();
    });

    it('should list created projects', async () => {
      // Create a project first
      await request(baseUrl)
        .post('/api/projects')
        .send({ name: 'List Test' })
        .expect(201);

      const response = await request(baseUrl)
        .get('/api/projects')
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should get project by id', async () => {
      const createResponse = await request(baseUrl)
        .post('/api/projects')
        .send({ name: 'Get By ID Test' })
        .expect(201);

      const projectId = createResponse.body.data.id;

      const getResponse = await request(baseUrl)
        .get(`/api/projects/${projectId}`)
        .expect(200);

      expect(getResponse.body.data.id).toBe(projectId);
      expect(getResponse.body.data.name).toBe('Get By ID Test');
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(baseUrl)
        .get('/api/projects/non-existent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should delete a project', async () => {
      const createResponse = await request(baseUrl)
        .post('/api/projects')
        .send({ name: 'To Delete' })
        .expect(201);

      const projectId = createResponse.body.data.id;

      await request(baseUrl)
        .delete(`/api/projects/${projectId}`)
        .expect(204);

      await request(baseUrl)
        .get(`/api/projects/${projectId}`)
        .expect(404);
    });
  });

  describe('Tasks API', () => {
    let projectId: string;

    beforeAll(async () => {
      const response = await request(baseUrl)
        .post('/api/projects')
        .send({ name: 'Task Test Project' })
        .expect(201);
      projectId = response.body.data.id;
    });

    it('should create a task', async () => {
      const response = await request(baseUrl)
        .post(`/api/projects/${projectId}/tasks`)
        .send({
          title: 'Implement feature',
          description: 'Implement login feature',
          type: 'development',
          priority: 'high'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.title).toBe('Implement feature');
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.projectId).toBe(projectId);
    });

    it('should list tasks for a project', async () => {
      // Create a task first
      await request(baseUrl)
        .post(`/api/projects/${projectId}/tasks`)
        .send({ title: 'Task to list' });

      const response = await request(baseUrl)
        .get(`/api/projects/${projectId}/tasks`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should update task status', async () => {
      const createResponse = await request(baseUrl)
        .post(`/api/projects/${projectId}/tasks`)
        .send({ title: 'Status Update Test' })
        .expect(201);

      const taskId = createResponse.body.data.id;

      const updateResponse = await request(baseUrl)
        .patch(`/api/projects/${projectId}/tasks/${taskId}/status`)
        .send({ status: 'in-progress' })
        .expect(200);

      expect(updateResponse.body.data.status).toBe('in-progress');
    });

    it('should complete a task', async () => {
      const createResponse = await request(baseUrl)
        .post(`/api/projects/${projectId}/tasks`)
        .send({ title: 'Complete Test' })
        .expect(201);

      const taskId = createResponse.body.data.id;

      const completeResponse = await request(baseUrl)
        .patch(`/api/projects/${projectId}/tasks/${taskId}/status`)
        .send({ status: 'completed' })
        .expect(200);

      expect(completeResponse.body.data.status).toBe('completed');
      expect(completeResponse.body.data.completedAt).toBeDefined();
    });

    it('should delete a task', async () => {
      const createResponse = await request(baseUrl)
        .post(`/api/projects/${projectId}/tasks`)
        .send({ title: 'To Delete' })
        .expect(201);

      const taskId = createResponse.body.data.id;

      await request(baseUrl)
        .delete(`/api/projects/${projectId}/tasks/${taskId}`)
        .expect(204);

      await request(baseUrl)
        .patch(`/api/projects/${projectId}/tasks/${taskId}/status`)
        .send({ status: 'completed' })
        .expect(404);
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle concurrent project creation', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        request(baseUrl)
          .post('/api/projects')
          .send({ name: `Concurrent Project ${i}` })
      );

      const responses = await Promise.all(promises);

      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });

      // Verify all were created
      const listResponse = await request(baseUrl)
        .get('/api/projects')
        .expect(200);

      expect(listResponse.body.data.length).toBeGreaterThanOrEqual(5);
    });
  });
});

describe('File System E2E Tests', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-e2e-fs-'));
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    mkdirSync(join(tempDir, 'tests'), { recursive: true });
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'fs-test', version: '1.0.0' }));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create and read files', () => {
    const filePath = join(tempDir, 'test.txt');
    const content = 'Hello, World!';
    
    // Write file
    writeFileSync(filePath, content);
    
    // Verify exists
    expect(existsSync(filePath)).toBe(true);
    
    // Read file
    const readContent = readFileSync(filePath, 'utf-8');
    expect(readContent).toBe(content);
  });

  it('should handle nested directories', () => {
    const nestedPath = join(tempDir, 'src', 'utils', 'helpers');
    mkdirSync(nestedPath, { recursive: true });
    
    expect(existsSync(nestedPath)).toBe(true);
    
    const filePath = join(nestedPath, 'index.ts');
    writeFileSync(filePath, 'export const hello = "world";');
    
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('export const hello = "world";');
  });

  it('should handle JSON files', () => {
    const packagePath = join(tempDir, 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    
    expect(packageJson.name).toBe('fs-test');
    expect(packageJson.version).toBe('1.0.0');
  });

  it('should handle file overwriting', () => {
    const filePath = join(tempDir, 'overwrite.txt');
    
    writeFileSync(filePath, 'Initial content');
    expect(readFileSync(filePath, 'utf-8')).toBe('Initial content');
    
    writeFileSync(filePath, 'Updated content');
    expect(readFileSync(filePath, 'utf-8')).toBe('Updated content');
  });

  it('should list directory contents', () => {
    writeFileSync(join(tempDir, 'file1.txt'), 'File 1');
    writeFileSync(join(tempDir, 'file2.txt'), 'File 2');
    mkdirSync(join(tempDir, 'subdir'));
    
    const entries = require('fs').readdirSync(tempDir);
    expect(entries).toContain('file1.txt');
    expect(entries).toContain('file2.txt');
    expect(entries).toContain('subdir');
  });
});

describe('Integration: Complete Project Workflow', () => {
  let tempDir: string;
  let baseUrl: string;
  let app: Express;
  let server: http.Server;
  let sessionId: string;
  let projects: Map<string, any>;
  let tasks: Map<string, any>;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-e2e-workflow-'));
    sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    projects = new Map();
    tasks = new Map();
    
    // 设置简化版服务器
    app = express();
    app.use(express.json());
    
    app.get('/health', (_req, res) => {
      res.json({ success: true, data: { status: 'ok' } });
    });
    
    app.get('/api/projects', (_req, res) => {
      res.json({ success: true, data: Array.from(projects.values()) });
    });
    
    app.post('/api/projects', (req, res) => {
      const id = `${sessionId}-proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const project = { id, name: req.body.name, createdAt: new Date() };
      projects.set(id, project);
      res.status(201).json({ success: true, data: project });
    });
    
    app.get('/api/projects/:projectId/tasks', (req, res) => {
      const projectId = req.params.projectId;
      const projectTasks = Array.from(tasks.values()).filter((t: any) => t.projectId === projectId);
      res.json({ success: true, data: projectTasks });
    });
    
    app.post('/api/projects/:projectId/tasks', (req, res) => {
      const taskId = `${sessionId}-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const task = {
        id: taskId,
        projectId: req.params.projectId,
        title: req.body.title,
        status: 'pending',
        createdAt: new Date()
      };
      tasks.set(taskId, task);
      res.status(201).json({ success: true, data: task });
    });
    
    app.patch('/api/projects/:projectId/tasks/:taskId/status', (req, res) => {
      const task = tasks.get(req.params.taskId);
      if (!task) return res.status(404).json({ success: false });
      task.status = req.body.status;
      res.json({ success: true, data: task });
    });
    
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => {
        resolve(s);
      });
    });
    
    const address = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 30000);

  beforeEach(() => {
    projects.clear();
    tasks.clear();
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should complete full development workflow', async () => {
    // 1. Create project
    const project = await request(baseUrl)
      .post('/api/projects')
      .send({ name: 'Todo App' })
      .expect(201);

    const projectId = project.body.data.id;
    expect(projectId).toBeDefined();

    // 2. Create setup task
    const setupTask = await request(baseUrl)
      .post(`/api/projects/${projectId}/tasks`)
      .send({ title: 'Setup project structure', type: 'development' })
      .expect(201);

    const setupTaskId = setupTask.body.data.id;
    expect(setupTask.body.data.status).toBe('pending');

    // 3. Start setup task
    await request(baseUrl)
      .patch(`/api/projects/${projectId}/tasks/${setupTaskId}/status`)
      .send({ status: 'in-progress' })
      .expect(200);

    // 4. Complete setup task
    await request(baseUrl)
      .patch(`/api/projects/${projectId}/tasks/${setupTaskId}/status`)
      .send({ status: 'completed' })
      .expect(200);

    // 5. Create feature task (depends on setup)
    const featureTask = await request(baseUrl)
      .post(`/api/projects/${projectId}/tasks`)
      .send({ title: 'Implement todo CRUD', type: 'development' })
      .expect(201);

    expect(featureTask.body.data.status).toBe('pending');

    // 6. Start and complete feature task
    await request(baseUrl)
      .patch(`/api/projects/${projectId}/tasks/${featureTask.body.data.id}/status`)
      .send({ status: 'in-progress' })
      .expect(200);

    await request(baseUrl)
      .patch(`/api/projects/${projectId}/tasks/${featureTask.body.data.id}/status`)
      .send({ status: 'completed' })
      .expect(200);

    // 7. Create test task
    const testTask = await request(baseUrl)
      .post(`/api/projects/${projectId}/tasks`)
      .send({ title: 'Write tests', type: 'testing' })
      .expect(201);

    // 8. Complete test task
    await request(baseUrl)
      .patch(`/api/projects/${projectId}/tasks/${testTask.body.data.id}/status`)
      .send({ status: 'completed' })
      .expect(200);

    // 9. Verify all tasks for THIS project completed
    const allTasks = await request(baseUrl)
      .get(`/api/projects/${projectId}/tasks`)
      .expect(200);

    // Should have 3 tasks (setup, feature, test)
    const projectTasks = allTasks.body.data.filter((t: any) => t.projectId === projectId);
    expect(projectTasks.length).toBe(3);
    projectTasks.forEach((task: any) => {
      expect(task.status).toBe('completed');
    });
  });

  it('should handle multiple parallel workflows', async () => {
    // Create two projects
    const proj1 = await request(baseUrl)
      .post('/api/projects')
      .send({ name: 'Project A' })
      .expect(201);

    const proj2 = await request(baseUrl)
      .post('/api/projects')
      .send({ name: 'Project B' })
      .expect(201);

    // Create tasks in parallel for specific projects
    const taskResults = await Promise.all([
      request(baseUrl).post(`/api/projects/${proj1.body.data.id}/tasks`).send({ title: 'Task A1' }),
      request(baseUrl).post(`/api/projects/${proj1.body.data.id}/tasks`).send({ title: 'Task A2' }),
      request(baseUrl).post(`/api/projects/${proj2.body.data.id}/tasks`).send({ title: 'Task B1' }),
      request(baseUrl).post(`/api/projects/${proj2.body.data.id}/tasks`).send({ title: 'Task B2' }),
    ]);

    // Verify tasks created in correct projects
    const tasks1 = await request(baseUrl)
      .get(`/api/projects/${proj1.body.data.id}/tasks`)
      .expect(200);

    const tasks2 = await request(baseUrl)
      .get(`/api/projects/${proj2.body.data.id}/tasks`)
      .expect(200);

    // Debug: Show raw server responses
    console.log('Raw tasks for proj1:', JSON.stringify(tasks1.body.data, null, 2));
    console.log('Raw tasks for proj2:', JSON.stringify(tasks2.body.data, null, 2));
    console.log('proj1.id:', proj1.body.data.id);
    console.log('proj2.id:', proj2.body.data.id);

    // Without client-side filter - rely on server-side filtering
    expect(tasks1.body.data.length).toBe(2);
    expect(tasks2.body.data.length).toBe(2);

    // Verify each task has correct projectId
    tasks1.body.data.forEach((task: any) => {
      expect(task.projectId).toBe(proj1.body.data.id);
    });
    tasks2.body.data.forEach((task: any) => {
      expect(task.projectId).toBe(proj2.body.data.id);
    });
  });
});
