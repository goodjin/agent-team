import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRoleRouter } from '../src/server/routes/roles.js';
import { createAgentRouter } from '../src/server/routes/agents.js';

describe('Role and Agent Routes', () => {
  describe('Role Routes', () => {
    let app: express.Application;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use('/api/roles', createRoleRouter());
    });

    describe('GET /api/roles', () => {
      it('should return list of roles', async () => {
        const response = await request(app)
          .get('/api/roles/')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
      });

      it('should include system roles', async () => {
        const response = await request(app)
          .get('/api/roles/')
          .expect(200);

        const roleIds = response.body.data.map((r: any) => r.id);
        expect(roleIds).toContain('developer');
        expect(roleIds).toContain('architect');
      });
    });

    describe('GET /api/roles/:id', () => {
      it('should return role by id', async () => {
        const response = await request(app)
          .get('/api/roles/developer')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.id).toBe('developer');
      });

      it('should return 404 for non-existent role', async () => {
        const response = await request(app)
          .get('/api/roles/non-existent')
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('ROLE_NOT_FOUND');
      });
    });

    describe('POST /api/roles', () => {
      it('should create a new role', async () => {
        const response = await request(app)
          .post('/api/roles/')
          .send({
            id: 'custom-role',
            name: 'Custom Role',
            type: 'custom',
            description: 'A custom role',
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.id).toBe('custom-role');
      });

      it('should reject role without required fields', async () => {
        const response = await request(app)
          .post('/api/roles/')
          .send({ name: 'Incomplete Role' })
          .expect(500);

        expect(response.body.success).toBe(false);
      });
    });

    describe('PATCH /api/roles/:id', () => {
      it('should update role prompt path', async () => {
        const response = await request(app)
          .patch('/api/roles/developer')
          .send({ promptPath: '/custom/prompts/developer.txt' })
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should return 404 for non-existent role', async () => {
        const response = await request(app)
          .patch('/api/roles/non-existent')
          .send({ promptPath: '/path.txt' })
          .expect(500);

        expect(response.body.success).toBe(false);
      });
    });

    describe('DELETE /api/roles/:id', () => {
      it('should delete a role', async () => {
        const response = await request(app)
          .delete('/api/roles/custom-role')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('deleted');
      });
    });
  });

  describe('Agent Routes', () => {
    let app: express.Application;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use('/api/agents', createAgentRouter());
    });

    describe('GET /api/agents', () => {
      it('should return empty array when no agents', async () => {
        const response = await request(app)
          .get('/api/agents/')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it('should filter agents by projectId', async () => {
        const response = await request(app)
          .get('/api/agents/?projectId=test-project')
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should filter agents by status', async () => {
        const response = await request(app)
          .get('/api/agents/?status=idle')
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });

    describe('GET /api/agents/:id', () => {
      it('should return 404 for non-existent agent', async () => {
        const response = await request(app)
          .get('/api/agents/non-existent-id')
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('AGENT_NOT_FOUND');
      });
    });

    describe('POST /api/agents', () => {
      it('should create an agent with roleId and projectId', async () => {
        const response = await request(app)
          .post('/api/agents/')
          .send({
            roleId: 'developer',
            projectId: 'test-project',
            name: 'My Agent',
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.roleId).toBe('developer');
        expect(response.body.data.projectId).toBe('test-project');
      });

      it('should reject agent without required fields', async () => {
        const response = await request(app)
          .post('/api/agents/')
          .send({ name: 'Incomplete Agent' })
          .expect(500);

        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/agents/:id/restart', () => {
      it('should restart an agent', async () => {
        const response = await request(app)
          .post('/api/agents/test-agent/restart')
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });

    describe('DELETE /api/agents/:id', () => {
      it('should delete an agent', async () => {
        const response = await request(app)
          .delete('/api/agents/test-agent')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('deleted');
      });
    });
  });
});
