import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHealthRouter } from '../src/server/routes/health.js';
import { requestLogger } from '../src/server/middleware/logger.js';
import { errorHandler, notFoundHandler } from '../src/server/middleware/error.js';
import { createProjectRouter } from '../src/server/routes/projects.js';
import { createTaskRouter } from '../src/server/routes/tasks.js';
import { createRoleRouter } from '../src/server/routes/roles.js';
import { createAgentRouter } from '../src/server/routes/agents.js';

describe('Server Routes', () => {
  describe('Health Router', () => {
    it('should return healthy status', async () => {
      const app = express();
      app.use('/health', createHealthRouter());

      const response = await request(app)
        .get('/health/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
    });
  });

  describe('Middleware', () => {
    it('should log requests', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const req = {
        method: 'GET',
        path: '/test',
      } as express.Request;
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') {
            callback();
          }
        }),
      } as unknown as express.Response;
      const next = vi.fn();

      requestLogger(req, res, next);

      expect(next).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle errors', () => {
      const req = {} as express.Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as express.Response;
      const next = vi.fn();

      const error = new Error('Test error');
      (error as any).statusCode = 500;

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
    });

    it('should handle not found', () => {
      const req = {
        method: 'GET',
        path: '/unknown',
      } as express.Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as express.Response;

      notFoundHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('Project Router', () => {
    it('should create a project', async () => {
      const mockTaskManager = {
        getTasks: vi.fn().mockReturnValue([]),
      } as any;
      const mockAgentMgr = {
        getAgents: vi.fn().mockReturnValue([]),
      } as any;

      const router = createProjectRouter(mockTaskManager, mockAgentMgr);
      const app = express();
      app.use(express.json());
      app.use('/api/projects', router);

      const response = await request(app)
        .post('/api/projects/')
        .send({ name: 'Test Project', path: '/test/path' })
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Task Router', () => {
    it('should create a task', async () => {
      const router = createTaskRouter();
      const app = express();
      app.use(express.json());
      app.use('/api/projects/:projectId/tasks', router);

      const response = await request(app)
        .post('/api/projects/test-project/tasks')
        .send({ description: 'Test task description' })
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Role Router', () => {
    it('should list roles', async () => {
      const router = createRoleRouter();
      const app = express();
      app.use(express.json());
      app.use('/api/roles', router);

      const response = await request(app)
        .get('/api/roles/')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('Agent Router', () => {
    it('should list agents', async () => {
      const router = createAgentRouter();
      const app = express();
      app.use(express.json());
      app.use('/api/agents', router);

      const response = await request(app)
        .get('/api/agents/')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });
});
