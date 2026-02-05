import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createProjectRouter, addTestProject, clearProjectStore } from '../src/server/routes/projects.js';
import type { Project } from '../src/types/project.js';

describe('Project Routes API', () => {
  let app: express.Application;
  let mockTaskManager: any;
  let mockAgentMgr: any;

  beforeEach(() => {
    clearProjectStore();
    mockTaskManager = {
      getTasks: vi.fn().mockReturnValue([]),
    };
    mockAgentMgr = {
      getAgents: vi.fn().mockReturnValue([]),
    };
    app = express();
    app.use(express.json());
    app.use('/api/projects', createProjectRouter(mockTaskManager, mockAgentMgr));
  });

  afterEach(() => {
    clearProjectStore();
  });

  describe('GET /api/projects', () => {
    it('should return empty array when no projects', async () => {
      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it('should return all projects', async () => {
      const testProject: Project = {
        id: 'proj-test-1',
        name: 'Test Project 1',
        path: '/path/to/project1',
        description: 'Test description 1',
        status: 'active',
        visibility: 'private',
        config: { projectName: 'Test Project 1', projectPath: '/path/to/project1' },
        metadata: {
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      };
      addTestProject(testProject);

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].name).toBe('Test Project 1');
    });

    it('should filter projects by status', async () => {
      const activeProject: Project = {
        id: 'proj-active',
        name: 'Active Project',
        path: '/path/active',
        status: 'active',
        visibility: 'private',
        config: { projectName: 'Active Project', projectPath: '/path/active' },
        metadata: { createdAt: new Date(), updatedAt: new Date() },
      };
      const archivedProject: Project = {
        id: 'proj-archived',
        name: 'Archived Project',
        path: '/path/archived',
        status: 'archived',
        visibility: 'private',
        config: { projectName: 'Archived Project', projectPath: '/path/archived' },
        metadata: { createdAt: new Date(), updatedAt: new Date() },
      };
      addTestProject(activeProject);
      addTestProject(archivedProject);

      const response = await request(app)
        .get('/api/projects?status=active')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('active');
    });

    it('should search projects by name', async () => {
      const project1: Project = {
        id: 'proj-1',
        name: 'My Awesome Project',
        path: '/path/awesome',
        status: 'active',
        visibility: 'private',
        config: { projectName: 'My Awesome Project', projectPath: '/path/awesome' },
        metadata: { createdAt: new Date(), updatedAt: new Date() },
      };
      const project2: Project = {
        id: 'proj-2',
        name: 'Another Project',
        path: '/path/another',
        status: 'active',
        visibility: 'private',
        config: { projectName: 'Another Project', projectPath: '/path/another' },
        metadata: { createdAt: new Date(), updatedAt: new Date() },
      };
      addTestProject(project1);
      addTestProject(project2);

      const response = await request(app)
        .get('/api/projects?search=awesome')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].name).toBe('My Awesome Project');
    });

    it('should limit and offset results', async () => {
      for (let i = 0; i < 5; i++) {
        addTestProject({
          id: `proj-${i}`,
          name: `Project ${i}`,
          path: `/path/${i}`,
          status: 'active',
          visibility: 'private',
          config: { projectName: `Project ${i}`, projectPath: `/path/${i}` },
          metadata: { createdAt: new Date(), updatedAt: new Date() },
        });
      }

      const response = await request(app)
        .get('/api/projects?limit=2&offset=1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .get('/api/projects/non-existent-id')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PROJECT_NOT_FOUND');
    });

    it('should return project by id', async () => {
      const testProject: Project = {
        id: 'proj-get-test',
        name: 'Get Test Project',
        path: '/path/get-test',
        description: 'Test description',
        status: 'active',
        visibility: 'team',
        config: { projectName: 'Get Test Project', projectPath: '/path/get-test' },
        metadata: {
          createdAt: new Date('2024-01-15'),
          updatedAt: new Date('2024-01-20'),
        },
      };
      addTestProject(testProject);

      const response = await request(app)
        .get('/api/projects/proj-get-test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('proj-get-test');
      expect(response.body.data.name).toBe('Get Test Project');
      expect(response.body.data.description).toBe('Test description');
    });
  });

  describe('POST /api/projects', () => {
    it('should create a project with required fields', async () => {
      const response = await request(app)
        .post('/api/projects/')
        .send({ name: 'New Project', path: '/path/to/project' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('New Project');
      expect(response.body.data.path).toBe('/path/to/project');
      expect(response.body.data.status).toBe('active');
      expect(response.body.data.visibility).toBe('private');
      expect(response.body.data.id).toBeDefined();
    });

    it('should create a project with all fields', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({
          name: 'Full Project',
          path: '/path/full',
          description: 'Complete test project',
          visibility: 'public',
          config: {
            projectName: 'Full Project',
            projectPath: '/path/full',
            llmConfig: { provider: 'anthropic', model: 'claude-3' },
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Full Project');
      expect(response.body.data.visibility).toBe('public');
      expect(response.body.data.config.llmConfig.model).toBe('claude-3');
    });

    it('should reject project without name', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ path: '/path/to/project' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CREATE_PROJECT_FAILED');
    });

    it('should reject project without path', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ name: 'No Path Project' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/projects/:id', () => {
    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .put('/api/projects/non-existent')
        .send({ name: 'Updated Name' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PROJECT_NOT_FOUND');
    });

    it('should update project name', async () => {
      addTestProject({
        id: 'proj-update-test',
        name: 'Original Name',
        path: '/path/update',
        status: 'active',
        visibility: 'private',
        config: { projectName: 'Original Name', projectPath: '/path/update' },
        metadata: { createdAt: new Date(), updatedAt: new Date() },
      });

      const response = await request(app)
        .put('/api/projects/proj-update-test')
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Name');
    });

    it('should update project description', async () => {
      addTestProject({
        id: 'proj-desc-test',
        name: 'Desc Test',
        path: '/path/desc',
        description: 'Original description',
        status: 'active',
        visibility: 'private',
        config: { projectName: 'Desc Test', projectPath: '/path/desc' },
        metadata: { createdAt: new Date(), updatedAt: new Date() },
      });

      const response = await request(app)
        .put('/api/projects/proj-desc-test')
        .send({ description: 'New description' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.description).toBe('New description');
    });
  });

  describe('PATCH /api/projects/:id/status', () => {
    it('should update project status to active', async () => {
      addTestProject({
        id: 'proj-status-test',
        name: 'Status Test',
        path: '/path/status',
        status: 'draft',
        visibility: 'private',
        config: { projectName: 'Status Test', projectPath: '/path/status' },
        metadata: { createdAt: new Date(), updatedAt: new Date() },
      });

      const response = await request(app)
        .patch('/api/projects/proj-status-test/status')
        .send({ status: 'active' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('active');
    });

    it('should update project status to archived', async () => {
      addTestProject({
        id: 'proj-archive-test',
        name: 'Archive Test',
        path: '/path/archive',
        status: 'active',
        visibility: 'private',
        config: { projectName: 'Archive Test', projectPath: '/path/archive' },
        metadata: { createdAt: new Date(), updatedAt: new Date() },
      });

      const response = await request(app)
        .patch('/api/projects/proj-archive-test/status')
        .send({ status: 'archived' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('archived');
    });

    it('should reject invalid status', async () => {
      addTestProject({
        id: 'proj-invalid-test',
        name: 'Invalid Test',
        path: '/path/invalid',
        status: 'active',
        visibility: 'private',
        config: { projectName: 'Invalid Test', projectPath: '/path/invalid' },
        metadata: { createdAt: new Date(), updatedAt: new Date() },
      });

      const response = await request(app)
        .patch('/api/projects/proj-invalid-test/status')
        .send({ status: 'invalid-status' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_STATUS');
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .patch('/api/projects/non-existent/status')
        .send({ status: 'archived' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PROJECT_NOT_FOUND');
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('should delete existing project', async () => {
      addTestProject({
        id: 'proj-delete-test',
        name: 'Delete Test',
        path: '/path/delete',
        status: 'active',
        visibility: 'private',
        config: { projectName: 'Delete Test', projectPath: '/path/delete' },
        metadata: { createdAt: new Date(), updatedAt: new Date() },
      });

      const response = await request(app)
        .delete('/api/projects/proj-delete-test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .delete('/api/projects/non-existent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PROJECT_NOT_FOUND');
    });
  });

  describe('GET /api/projects/:id/stats', () => {
    it('should return project stats', async () => {
      const response = await request(app)
        .get('/api/projects/test-id/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalTasks');
      expect(response.body.data).toHaveProperty('completedTasks');
      expect(response.body.data).toHaveProperty('pendingTasks');
      expect(response.body.data).toHaveProperty('runningTasks');
      expect(response.body.data).toHaveProperty('totalAgents');
    });
  });
});

describe('Project CRUD Integration', () => {
  let app: express.Application;
  let mockTaskManager: any;
  let mockAgentMgr: any;

  beforeEach(() => {
    clearProjectStore();
    mockTaskManager = { getTasks: vi.fn().mockReturnValue([]) };
    mockAgentMgr = { getAgents: vi.fn().mockReturnValue([]) };
    app = express();
    app.use(express.json());
    app.use('/api/projects', createProjectRouter(mockTaskManager, mockAgentMgr));
  });

  afterEach(() => {
    clearProjectStore();
  });

  it('should perform full CRUD lifecycle', async () => {
    let projectId: string;

    const createResponse = await request(app)
      .post('/api/projects')
      .send({ name: 'Lifecycle Test', path: '/path/lifecycle' })
      .expect(201);

    expect(createResponse.body.success).toBe(true);
    projectId = createResponse.body.data.id;

    const readResponse = await request(app)
      .get(`/api/projects/${projectId}`)
      .expect(200);

    expect(readResponse.body.data.name).toBe('Lifecycle Test');

    const updateResponse = await request(app)
      .put(`/api/projects/${projectId}`)
      .send({ name: 'Updated Lifecycle Test', description: 'Updated description' })
      .expect(200);

    expect(updateResponse.body.data.name).toBe('Updated Lifecycle Test');
    expect(updateResponse.body.data.description).toBe('Updated description');

    const statusResponse = await request(app)
      .patch(`/api/projects/${projectId}/status`)
      .send({ status: 'archived' })
      .expect(200);

    expect(statusResponse.body.data.status).toBe('archived');

    const listResponse = await request(app)
      .get('/api/projects')
      .expect(200);

    expect(listResponse.body.data.length).toBe(1);

    const deleteResponse = await request(app)
      .delete(`/api/projects/${projectId}`)
      .expect(200);

    expect(deleteResponse.body.success).toBe(true);

    const finalListResponse = await request(app)
      .get('/api/projects')
      .expect(200);

    expect(finalListResponse.body.data.length).toBe(0);
  });
});
