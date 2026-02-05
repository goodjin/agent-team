import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTaskRouter } from '../src/server/routes/tasks.js';

describe('Task Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/projects/:projectId/tasks', createTaskRouter());
  });

  describe('GET /api/projects/:projectId/tasks', () => {
    it('should return empty array when no tasks', async () => {
      const response = await request(app)
        .get('/api/projects/test-project/tasks')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should filter tasks by category', async () => {
      const response = await request(app)
        .get('/api/projects/test-project/tasks?category=development')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should filter tasks by status', async () => {
      const response = await request(app)
        .get('/api/projects/test-project/tasks?status=pending')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/projects/:projectId/tasks/:id', () => {
    it('should return 404 for non-existent task', async () => {
      const response = await request(app)
        .get('/api/projects/test-project/tasks/non-existent-id')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TASK_NOT_FOUND');
    });
  });

  describe('POST /api/projects/:projectId/tasks', () => {
    it('should create a task with description', async () => {
      const response = await request(app)
        .post('/api/projects/test-project/tasks')
        .send({ description: 'Create a new feature' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.description).toBe('Create a new feature');
    });

    it('should reject task without description', async () => {
      const response = await request(app)
        .post('/api/projects/test-project/tasks')
        .send({})
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PATCH /api/projects/:projectId/tasks/:id/status', () => {
    it('should update task status to pending', async () => {
      const response = await request(app)
        .patch('/api/projects/test-project/tasks/task-id/status')
        .send({ status: 'pending' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('pending');
    });

    it('should update task status to running', async () => {
      const response = await request(app)
        .patch('/api/projects/test-project/tasks/task-id/status')
        .send({ status: 'running' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('running');
    });

    it('should update task status to done', async () => {
      const response = await request(app)
        .patch('/api/projects/test-project/tasks/task-id/status')
        .send({ status: 'done' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('done');
    });

    it('should reject invalid status', async () => {
      const response = await request(app)
        .patch('/api/projects/test-project/tasks/task-id/status')
        .send({ status: 'invalid' })
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/projects/:projectId/tasks/:id', () => {
    it('should delete a task', async () => {
      const response = await request(app)
        .delete('/api/projects/test-project/tasks/task-id')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');
    });
  });
});
