import { Router, Request, Response } from 'express';
import { TaskManager } from '../../core/task-manager.js';
import { AgentMgr } from '../../core/agent-mgr.js';
import type { Project, ProjectStatus, ProjectFilters, CreateProjectInput, UpdateProjectInput } from '../../types/project.js';

interface InMemoryProjectStore {
  projects: Map<string, Project>;
}

const projectStore: InMemoryProjectStore = {
  projects: new Map()
};

export interface ProjectRouter {
  getProjects(req: Request, res: Response): Promise<void>;
  getProject(req: Request, res: Response): Promise<void>;
  createProject(req: Request, res: Response): Promise<void>;
  updateProject(req: Request, res: Response): Promise<void>;
  updateProjectStatus(req: Request, res: Response): Promise<void>;
  deleteProject(req: Request, res: Response): Promise<void>;
  getProjectStats(req: Request, res: Response): Promise<void>;
}

export function createProjectRouter(
  taskManager: TaskManager,
  agentMgr: AgentMgr
): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const filters: ProjectFilters = {
        status: req.query.status as ProjectStatus | undefined,
        search: req.query.search as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };
      const projects = await getProjects(req, res, filters);
      res.json({
        success: true,
        data: projects,
        total: projectStore.projects.size
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_PROJECTS_FAILED',
          message: error.message || 'Failed to get projects',
        },
      });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const project = await getProject(req, res);
      if (!project) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: `Project not found: ${req.params.id}`,
          },
        });
      }
      res.json({
        success: true,
        data: project,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_PROJECT_FAILED',
          message: error.message || 'Failed to get project',
        },
      });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const input: CreateProjectInput = {
        name: req.body.name,
        path: req.body.path,
        description: req.body.description,
        visibility: req.body.visibility,
        config: req.body.config
      };
      const project = await createProject(req, res, input);
      res.status(201).json({
        success: true,
        data: project,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: {
          code: 'CREATE_PROJECT_FAILED',
          message: error.message || 'Failed to create project',
        },
      });
    }
  });

  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const input: UpdateProjectInput = {
        name: req.body.name,
        description: req.body.description,
        status: req.body.status,
        visibility: req.body.visibility,
        config: req.body.config
      };
      const project = await updateProject(req, res, input);
      if (!project) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: `Project not found: ${req.params.id}`,
          },
        });
      }
      res.json({
        success: true,
        data: project,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: {
          code: 'UPDATE_PROJECT_FAILED',
          message: error.message || 'Failed to update project',
        },
      });
    }
  });

  router.patch('/:id/status', async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      if (!['active', 'archived', 'draft'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: 'Invalid status. Must be active, archived, or draft',
          },
        });
      }
      const project = await updateProjectStatus(req, res, status);
      if (!project) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: `Project not found: ${req.params.id}`,
          },
        });
      }
      res.json({
        success: true,
        data: project,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_PROJECT_STATUS_FAILED',
          message: error.message || 'Failed to update project status',
        },
      });
    }
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const result = await deleteProject(req, res);
      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: `Project not found: ${req.params.id}`,
          },
        });
      }
      res.json({
        success: true,
        message: result.message,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'DELETE_PROJECT_FAILED',
          message: error.message || 'Failed to delete project',
        },
      });
    }
  });

  router.get('/:id/stats', async (req: Request, res: Response) => {
    try {
      const stats = await getProjectStats(req, res);
      res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_PROJECT_STATS_FAILED',
          message: error.message || 'Failed to get project stats',
        },
      });
    }
  });

  return router;
}

async function getProjects(_req: Request, _res: Response, filters?: ProjectFilters): Promise<Project[]> {
  let projects = Array.from(projectStore.projects.values());

  if (filters) {
    if (filters.status) {
      projects = projects.filter(p => p.status === filters.status);
    }
    if (filters.visibility) {
      projects = projects.filter(p => p.visibility === filters.visibility);
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      projects = projects.filter(p =>
        p.name.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower)
      );
    }
    if (filters.limit) {
      const offset = filters.offset || 0;
      projects = projects.slice(offset, offset + filters.limit);
    }
  }

  return projects.sort((a, b) =>
    new Date(b.metadata.updatedAt).getTime() - new Date(a.metadata.updatedAt).getTime()
  );
}

async function getProject(req: Request, _res: Response): Promise<Project | null> {
  const { id } = req.params;
  return projectStore.projects.get(id) || null;
}

async function createProject(req: Request, _res: Response, input: CreateProjectInput): Promise<Project> {
  const { name, path, description, visibility, config } = input;

  if (!name || !path) {
    throw new Error('Project name and path are required');
  }

  const id = `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const projectConfig = config
    ? { ...config, projectName: name, projectPath: path }
    : { projectName: name, projectPath: path };

  const project: Project = {
    id,
    name,
    path,
    description: description || '',
    status: 'active',
    visibility: visibility || 'private',
    config: projectConfig,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  projectStore.projects.set(id, project);
  return project;
}

async function updateProject(req: Request, _res: Response, input: UpdateProjectInput): Promise<Project | null> {
  const { id } = req.params;
  const existing = projectStore.projects.get(id);

  if (!existing) {
    return null;
  }

  const updatedConfig = input.config
    ? { ...existing.config, ...input.config }
    : existing.config;

  const updated: Project = {
    ...existing,
    name: input.name || existing.name,
    description: input.description !== undefined ? input.description : existing.description,
    status: input.status || existing.status,
    visibility: input.visibility || existing.visibility,
    config: updatedConfig,
    metadata: {
      ...existing.metadata,
      updatedAt: new Date(),
    },
  };

  projectStore.projects.set(id, updated);
  return updated;
}

async function updateProjectStatus(req: Request, _res: Response, status: ProjectStatus): Promise<Project | null> {
  const { id } = req.params;
  const existing = projectStore.projects.get(id);

  if (!existing) {
    return null;
  }

  const updated: Project = {
    ...existing,
    status,
    metadata: {
      ...existing.metadata,
      updatedAt: new Date(),
    },
  };

  projectStore.projects.set(id, updated);
  return updated;
}

async function deleteProject(req: Request, _res: Response): Promise<{ success: boolean; message: string }> {
  const { id } = req.params;

  if (!projectStore.projects.has(id)) {
    return { success: false, message: 'Project not found' };
  }

  projectStore.projects.delete(id);
  return { success: true, message: `Project ${id} deleted successfully` };
}

async function getProjectStats(req: Request, _res: Response): Promise<{
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  runningTasks: number;
  totalAgents: number;
}> {
  const { id: projectId } = req.params;

  let tasks: any[] = [];
  if (projectId) {
    tasks = [];
  }

  const stats = {
    totalTasks: tasks.length,
    completedTasks: tasks.filter((t: any) => t.status === 'completed').length,
    pendingTasks: tasks.filter((t: any) => t.status === 'pending').length,
    runningTasks: tasks.filter((t: any) => t.status === 'running').length,
    totalAgents: 0,
  };

  return stats;
}

export function addTestProject(project: Project): void {
  projectStore.projects.set(project.id, project);
}

export function clearProjectStore(): void {
  projectStore.projects.clear();
}
