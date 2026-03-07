import { Router, Request, Response } from 'express';
import { TaskManager } from '../../core/task-manager.js';
import { AgentMgr } from '../../core/agent-mgr.js';
import {
  ensureBaseDirectory,
  createProjectDirectories,
  deleteProjectDirectory,
  loadAllData,
  saveProject,
  saveModules,
  saveVersions,
  saveTasks,
  saveStages,
} from '../../core/project-storage.js';
import type {
  Project,
  ProjectStatus,
  ProjectLifecycleStatus,
  ProjectFilters,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectModule,
  CreateModuleInput,
  UpdateModuleInput,
  ProjectVersion,
  CreateVersionInput,
  ProjectTask,
  TaskStage,
  StageStatus
} from '../../types/project.js';

interface InMemoryProjectStore {
  projects: Map<string, Project>;
  modules: Map<string, ProjectModule>;
  versions: Map<string, ProjectVersion>;
  tasks: Map<string, ProjectTask>;
  stages: Map<string, TaskStage>;
}

const projectStore: InMemoryProjectStore = {
  projects: new Map(),
  modules: new Map(),
  versions: new Map(),
  tasks: new Map(),
  stages: new Map()
};

// Initialize storage and load data
let storageInitialized = false;

export async function initializeProjectStore(): Promise<void> {
  if (storageInitialized) return;

  await ensureBaseDirectory();

  const data = await loadAllData();

  for (const project of data.projects) {
    projectStore.projects.set(project.id, project);
  }
  for (const module of data.modules) {
    projectStore.modules.set(module.id, module);
  }
  for (const version of data.versions) {
    projectStore.versions.set(version.id, version);
  }
  for (const task of data.tasks) {
    projectStore.tasks.set(task.id, task);
  }
  for (const stage of data.stages) {
    projectStore.stages.set(stage.id, stage);
  }

  storageInitialized = true;
  console.log(`[ProjectStorage] Loaded ${data.projects.length} projects, ${data.modules.length} modules`);
}

// Auto-save helper functions
async function autoSaveProject(project: Project): Promise<void> {
  await saveProject(project);
}

async function autoSaveModules(projectId: string): Promise<void> {
  const modules = Array.from(projectStore.modules.values()).filter(m => m.projectId === projectId);
  await saveModules(projectId, modules);
}

async function autoSaveVersions(projectId: string): Promise<void> {
  const versions = Array.from(projectStore.versions.values()).filter(v => v.projectId === projectId);
  await saveVersions(projectId, versions);
}

async function autoSaveTasks(projectId: string): Promise<void> {
  const tasks = Array.from(projectStore.tasks.values()).filter(t => t.projectId === projectId);
  await saveTasks(projectId, tasks);
}

async function autoSaveStages(projectId: string): Promise<void> {
  const stages = Array.from(projectStore.stages.values());
  await saveStages(projectId, stages);
}

export interface ProjectRouter {
  getProjects(req: Request, res: Response): Promise<void>;
  getProject(req: Request, res: Response): Promise<void>;
  createProject(req: Request, res: Response): Promise<void>;
  updateProject(req: Request, res: Response): Promise<void>;
  updateProjectStatus(req: Request, res: Response): Promise<void>;
  updateProjectLifecycleStatus(req: Request, res: Response): Promise<void>;
  deleteProject(req: Request, res: Response): Promise<void>;
  getProjectStats(req: Request, res: Response): Promise<void>;
  // 模块管理
  getModules(req: Request, res: Response): Promise<void>;
  createModule(req: Request, res: Response): Promise<void>;
  updateModule(req: Request, res: Response): Promise<void>;
  deleteModule(req: Request, res: Response): Promise<void>;
  // 版本管理
  getVersions(req: Request, res: Response): Promise<void>;
  createVersion(req: Request, res: Response): Promise<void>;
  updateVersion(req: Request, res: Response): Promise<void>;
  deleteVersion(req: Request, res: Response): Promise<void>;
}

export function createProjectRouter(
  taskManager: TaskManager,
  agentMgr: AgentMgr
): Router {
  const router = Router();

  // Initialize storage on first router creation
  initializeProjectStore().catch(console.error);

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

  // ============ 生命周期状态更新 ============
  router.patch('/:id/lifecycle', async (req: Request, res: Response) => {
    try {
      const { lifecycleStatus } = req.body;
      const validStatuses: ProjectLifecycleStatus[] = ['draft', 'in-progress', 'review', 'completed'];
      if (!validStatuses.includes(lifecycleStatus)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_LIFECYCLE_STATUS',
            message: 'Invalid lifecycle status. Must be draft, in-progress, review, or completed',
          },
        });
      }
      const project = await updateProjectLifecycleStatus(req, res, lifecycleStatus);
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
          code: 'UPDATE_LIFECYCLE_STATUS_FAILED',
          message: error.message || 'Failed to update lifecycle status',
        },
      });
    }
  });

  // ============ 模块管理路由 ============
  router.get('/:id/modules', async (req: Request, res: Response) => {
    try {
      const modules = await getModules(req);
      res.json({
        success: true,
        data: modules,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_MODULES_FAILED',
          message: error.message || 'Failed to get modules',
        },
      });
    }
  });

  router.post('/:id/modules', async (req: Request, res: Response) => {
    try {
      const module = await createModule(req, res);
      res.status(201).json({
        success: true,
        data: module,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: {
          code: 'CREATE_MODULE_FAILED',
          message: error.message || 'Failed to create module',
        },
      });
    }
  });

  router.put('/:id/modules/:moduleId', async (req: Request, res: Response) => {
    try {
      const module = await updateModule(req, res);
      if (!module) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'MODULE_NOT_FOUND',
            message: `Module not found: ${req.params.moduleId}`,
          },
        });
      }
      res.json({
        success: true,
        data: module,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: {
          code: 'UPDATE_MODULE_FAILED',
          message: error.message || 'Failed to update module',
        },
      });
    }
  });

  router.delete('/:id/modules/:moduleId', async (req: Request, res: Response) => {
    try {
      const result = await deleteModule(req, res);
      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'MODULE_NOT_FOUND',
            message: `Module not found: ${req.params.moduleId}`,
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
          code: 'DELETE_MODULE_FAILED',
          message: error.message || 'Failed to delete module',
        },
      });
    }
  });

  // ============ 版本管理路由 ============
  router.get('/:id/versions', async (req: Request, res: Response) => {
    try {
      const versions = await getVersions(req);
      res.json({
        success: true,
        data: versions,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_VERSIONS_FAILED',
          message: error.message || 'Failed to get versions',
        },
      });
    }
  });

  router.post('/:id/versions', async (req: Request, res: Response) => {
    try {
      const version = await createVersion(req, res);
      res.status(201).json({
        success: true,
        data: version,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: {
          code: 'CREATE_VERSION_FAILED',
          message: error.message || 'Failed to create version',
        },
      });
    }
  });

  router.put('/:id/versions/:versionId', async (req: Request, res: Response) => {
    try {
      const version = await updateVersion(req, res);
      if (!version) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'VERSION_NOT_FOUND',
            message: `Version not found: ${req.params.versionId}`,
          },
        });
      }
      res.json({
        success: true,
        data: version,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: {
          code: 'UPDATE_VERSION_FAILED',
          message: error.message || 'Failed to update version',
        },
      });
    }
  });

  router.delete('/:id/versions/:versionId', async (req: Request, res: Response) => {
    try {
      const result = await deleteVersion(req, res);
      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'VERSION_NOT_FOUND',
            message: `Version not found: ${req.params.versionId}`,
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
          code: 'DELETE_VERSION_FAILED',
          message: error.message || 'Failed to delete version',
        },
      });
    }
  });

  // ============ 任务管理路由 ============
  router.get('/:id/modules/:moduleId/tasks', async (req: Request, res: Response) => {
    try {
      const tasks = await getModuleTasks(req);
      res.json({
        success: true,
        data: tasks,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_TASKS_FAILED',
          message: error.message || 'Failed to get tasks',
        },
      });
    }
  });

  router.post('/:id/modules/:moduleId/tasks', async (req: Request, res: Response) => {
    try {
      const task = await createModuleTask(req, res);
      res.status(201).json({
        success: true,
        data: task,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: {
          code: 'CREATE_TASK_FAILED',
          message: error.message || 'Failed to create task',
        },
      });
    }
  });

  router.put('/:id/modules/:moduleId/tasks/:taskId', async (req: Request, res: Response) => {
    try {
      const task = await updateModuleTask(req, res);
      if (!task) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TASK_NOT_FOUND',
            message: `Task not found: ${req.params.taskId}`,
          },
        });
      }
      res.json({
        success: true,
        data: task,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: {
          code: 'UPDATE_TASK_FAILED',
          message: error.message || 'Failed to update task',
        },
      });
    }
  });

  router.delete('/:id/modules/:moduleId/tasks/:taskId', async (req: Request, res: Response) => {
    try {
      const result = await deleteModuleTask(req, res);
      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TASK_NOT_FOUND',
            message: `Task not found: ${req.params.taskId}`,
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
          code: 'DELETE_TASK_FAILED',
          message: error.message || 'Failed to delete task',
        },
      });
    }
  });

  // ============ 阶段管理路由 ============
  router.get('/:id/modules/:moduleId/tasks/:taskId/stages', async (req: Request, res: Response) => {
    try {
      const stages = await getTaskStages(req);
      res.json({
        success: true,
        data: stages,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_STAGES_FAILED',
          message: error.message || 'Failed to get stages',
        },
      });
    }
  });

  router.post('/:id/modules/:moduleId/tasks/:taskId/stages', async (req: Request, res: Response) => {
    try {
      const stage = await createTaskStage(req, res);
      res.status(201).json({
        success: true,
        data: stage,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: {
          code: 'CREATE_STAGE_FAILED',
          message: error.message || 'Failed to create stage',
        },
      });
    }
  });

  router.patch('/:id/modules/:moduleId/tasks/:taskId/stages/:stageId', async (req: Request, res: Response) => {
    try {
      const stage = await updateTaskStage(req, res);
      if (!stage) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'STAGE_NOT_FOUND',
            message: `Stage not found: ${req.params.stageId}`,
          },
        });
      }
      res.json({
        success: true,
        data: stage,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: {
          code: 'UPDATE_STAGE_FAILED',
          message: error.message || 'Failed to update stage',
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
  const { name, path, description, visibility, config, modules } = input;

  if (!name || !path) {
    throw new Error('Project name and path are required');
  }

  const id = `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const projectConfig = config
    ? { ...config, projectName: name, projectPath: path }
    : { projectName: name, projectPath: path };

  // 创建项目目录结构
  await createProjectDirectories(id);

  // 创建初始模块
  const createdModules: ProjectModule[] = [];
  if (modules && modules.length > 0) {
    for (let i = 0; i < modules.length; i++) {
      const mod = modules[i];
      const moduleId = `mod-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 6)}`;
      const projectModule: ProjectModule = {
        id: moduleId,
        projectId: id,
        name: mod.name || 'Unnamed Module',
        description: mod.description,
        version: mod.version || '1.0.0',
        status: 'draft',
        dependencies: mod.dependencies,
        roles: mod.roles,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          order: i,
          tags: mod.tags
        }
      };
      createdModules.push(projectModule);
      projectStore.modules.set(moduleId, projectModule);
    }
  }

  const project: Project = {
    id,
    name,
    path,
    description: description || '',
    status: 'active',
    lifecycleStatus: 'draft', // 默认生命周期状态
    visibility: visibility || 'private',
    config: projectConfig,
    modules: createdModules,
    versions: [],
    currentVersion: '1.0.0',
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0'
    },
  };

  projectStore.projects.set(id, project);

  // 持久化保存
  await autoSaveProject(project);
  await autoSaveModules(id);

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
    lifecycleStatus: input.lifecycleStatus || existing.lifecycleStatus,
    visibility: input.visibility || existing.visibility,
    config: updatedConfig,
    metadata: {
      ...existing.metadata,
      updatedAt: new Date(),
    },
  };

  projectStore.projects.set(id, updated);

  // Auto-save to disk
  await autoSaveProject(updated);

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

  // Auto-save to disk
  await autoSaveProject(updated);

  return updated;
}

async function deleteProject(req: Request, _res: Response): Promise<{ success: boolean; message: string }> {
  const { id } = req.params;

  if (!projectStore.projects.has(id)) {
    return { success: false, message: 'Project not found' };
  }

  // Delete from in-memory store
  projectStore.projects.delete(id);

  // Delete associated data from store
  const modulesToDelete = Array.from(projectStore.modules.values()).filter(m => m.projectId === id);
  for (const mod of modulesToDelete) {
    projectStore.modules.delete(mod.id);
  }

  const versionsToDelete = Array.from(projectStore.versions.values()).filter(v => v.projectId === id);
  for (const ver of versionsToDelete) {
    projectStore.versions.delete(ver.id);
  }

  const tasksToDelete = Array.from(projectStore.tasks.values()).filter(t => t.projectId === id);
  for (const task of tasksToDelete) {
    projectStore.tasks.delete(task.id);
  }

  // Delete from disk
  await deleteProjectDirectory(id);

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
  projectStore.modules.clear();
  projectStore.versions.clear();
  projectStore.tasks.clear();
  projectStore.stages.clear();
}

// ============ 模块管理函数 ============
async function getModules(req: Request): Promise<ProjectModule[]> {
  const { id: projectId } = req.params;
  return Array.from(projectStore.modules.values()).filter(m => m.projectId === projectId);
}

async function createModule(req: Request, _res: Response): Promise<ProjectModule> {
  const { id: projectId } = req.params;
  const input: CreateModuleInput = req.body;

  if (!input.name) {
    throw new Error('Module name is required');
  }

  const existingModules = Array.from(projectStore.modules.values())
    .filter(m => m.projectId === projectId);
  const order = existingModules.length;

  const module: ProjectModule = {
    id: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    projectId,
    name: input.name,
    description: input.description,
    version: input.version || '1.0.0',
    status: 'draft',
    dependencies: input.dependencies,
    roles: input.roles,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      order,
      tags: input.tags
    }
  };

  projectStore.modules.set(module.id, module);

  // 更新项目的modules列表
  const project = projectStore.projects.get(projectId);
  if (project) {
    project.modules = [...(project.modules || []), module];
    projectStore.projects.set(projectId, project);
  }

  // Auto-save
  await autoSaveModules(projectId);
  await autoSaveProject(project!);

  return module;
}

async function updateModule(req: Request, _res: Response): Promise<ProjectModule | null> {
  const { id: projectId, moduleId } = req.params;
  const input: UpdateModuleInput = req.body;

  const existing = projectStore.modules.get(moduleId);
  if (!existing || existing.projectId !== projectId) {
    return null;
  }

  const updated: ProjectModule = {
    ...existing,
    name: input.name || existing.name,
    description: input.description !== undefined ? input.description : existing.description,
    status: input.status || existing.status,
    dependencies: input.dependencies || existing.dependencies,
    roles: input.roles || existing.roles,
    metadata: {
      ...existing.metadata,
      updatedAt: new Date(),
      tags: input.tags || existing.metadata.tags
    }
  };

  projectStore.modules.set(moduleId, updated);

  // Auto-save
  await autoSaveModules(projectId);

  return updated;
}

async function deleteModule(req: Request, _res: Response): Promise<{ success: boolean; message: string }> {
  const { id: projectId, moduleId } = req.params;

  const existing = projectStore.modules.get(moduleId);
  if (!existing || existing.projectId !== projectId) {
    return { success: false, message: 'Module not found' };
  }

  projectStore.modules.delete(moduleId);

  // 更新项目的modules列表
  const project = projectStore.projects.get(projectId);
  if (project) {
    project.modules = (project.modules || []).filter(m => m.id !== moduleId);
    projectStore.projects.set(projectId, project);
  }

  // Auto-save
  await autoSaveModules(projectId);
  await autoSaveProject(project!);

  return { success: true, message: `Module ${moduleId} deleted successfully` };
}

// ============ 版本管理函数 ============
async function getVersions(req: Request): Promise<ProjectVersion[]> {
  const { id: projectId } = req.params;
  return Array.from(projectStore.versions.values()).filter(v => v.projectId === projectId);
}

async function createVersion(req: Request, _res: Response): Promise<ProjectVersion> {
  const { id: projectId } = req.params;
  const input: CreateVersionInput = req.body;

  if (!input.version || !input.name) {
    throw new Error('Version and name are required');
  }

  const version: ProjectVersion = {
    id: `ver-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    projectId,
    version: input.version,
    name: input.name,
    description: input.description,
    createdAt: new Date(),
    changes: input.changes,
    status: 'active'
  };

  projectStore.versions.set(version.id, version);

  // 更新项目的versions列表和当前版本
  const project = projectStore.projects.get(projectId);
  if (project) {
    project.versions = [...(project.versions || []), version];
    project.currentVersion = input.version;
    projectStore.projects.set(projectId, project);
  }

  // Auto-save
  await autoSaveVersions(projectId);
  await autoSaveProject(project!);

  return version;
}

async function updateVersion(req: Request, _res: Response): Promise<ProjectVersion | null> {
  const { id: projectId, versionId } = req.params;
  const input: { name?: string; description?: string; status?: 'active' | 'archived' | 'deprecated' } = req.body;

  const existing = projectStore.versions.get(versionId);
  if (!existing || existing.projectId !== projectId) {
    return null;
  }

  const updated: ProjectVersion = {
    ...existing,
    name: input.name || existing.name,
    description: input.description !== undefined ? input.description : existing.description,
    status: input.status || existing.status
  };

  projectStore.versions.set(versionId, updated);

  // Auto-save
  await autoSaveVersions(projectId);

  return updated;
}

async function deleteVersion(req: Request, _res: Response): Promise<{ success: boolean; message: string }> {
  const { id: projectId, versionId } = req.params;

  const existing = projectStore.versions.get(versionId);
  if (!existing || existing.projectId !== projectId) {
    return { success: false, message: 'Version not found' };
  }

  projectStore.versions.delete(versionId);

  // 更新项目的versions列表
  const project = projectStore.projects.get(projectId);
  if (project) {
    project.versions = (project.versions || []).filter(v => v.id !== versionId);
    projectStore.projects.set(projectId, project);
  }

  // Auto-save
  await autoSaveVersions(projectId);
  await autoSaveProject(project!);

  return { success: true, message: `Version ${versionId} deleted successfully` };
}

async function updateProjectLifecycleStatus(
  req: Request,
  _res: Response,
  lifecycleStatus: ProjectLifecycleStatus
): Promise<Project | null> {
  const { id } = req.params;
  const existing = projectStore.projects.get(id);

  if (!existing) {
    return null;
  }

  const updated: Project = {
    ...existing,
    lifecycleStatus,
    metadata: {
      ...existing.metadata,
      updatedAt: new Date(),
    },
  };

  projectStore.projects.set(id, updated);

  // Auto-save
  await autoSaveProject(updated);

  return updated;
}

// ============ 任务管理函数 ============
async function getModuleTasks(req: Request): Promise<ProjectTask[]> {
  const { id: projectId, moduleId } = req.params;
  return Array.from(projectStore.tasks.values())
    .filter(t => t.projectId === projectId && t.moduleId === moduleId);
}

async function createModuleTask(req: Request, _res: Response): Promise<ProjectTask> {
  const { id: projectId, moduleId } = req.params;
  const { title, description, type, priority, assignedRoles, dependencies } = req.body;

  if (!title) {
    throw new Error('Task title is required');
  }

  const task: ProjectTask = {
    id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    projectId,
    moduleId,
    title,
    description: description || '',
    type: type || 'custom',
    status: 'draft',
    priority: priority || 'medium',
    assignedRoles,
    dependencies,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  };

  projectStore.tasks.set(task.id, task);

  // 更新模块的任务列表
  const module = projectStore.modules.get(moduleId);
  if (module) {
    module.tasks = [...(module.tasks || []), task];
    projectStore.modules.set(moduleId, module);
  }

  // Auto-save
  await autoSaveTasks(projectId);
  await autoSaveModules(projectId);

  return task;
}

async function updateModuleTask(req: Request, _res: Response): Promise<ProjectTask | null> {
  const { id: projectId, moduleId, taskId } = req.params;
  const { title, description, status, priority, assignedRoles, dependencies } = req.body;

  const existing = projectStore.tasks.get(taskId);
  if (!existing || existing.projectId !== projectId || existing.moduleId !== moduleId) {
    return null;
  }

  const updated: ProjectTask = {
    ...existing,
    title: title || existing.title,
    description: description !== undefined ? description : existing.description,
    status: status || existing.status,
    priority: priority || existing.priority,
    assignedRoles: assignedRoles || existing.assignedRoles,
    dependencies: dependencies || existing.dependencies,
    metadata: {
      ...existing.metadata,
      updatedAt: new Date(),
    }
  };

  projectStore.tasks.set(taskId, updated);

  // Auto-save
  await autoSaveTasks(projectId);

  return updated;
}

async function deleteModuleTask(req: Request, _res: Response): Promise<{ success: boolean; message: string }> {
  const { id: projectId, moduleId, taskId } = req.params;

  const existing = projectStore.tasks.get(taskId);
  if (!existing || existing.projectId !== projectId || existing.moduleId !== moduleId) {
    return { success: false, message: 'Task not found' };
  }

  // 删除关联的阶段
  const stagesToDelete = Array.from(projectStore.stages.values())
    .filter(s => s.taskId === taskId);
  for (const stage of stagesToDelete) {
    projectStore.stages.delete(stage.id);
  }

  projectStore.tasks.delete(taskId);

  // 更新模块的任务列表
  const module = projectStore.modules.get(moduleId);
  if (module) {
    module.tasks = (module.tasks || []).filter(t => t.id !== taskId);
    projectStore.modules.set(moduleId, module);
  }

  // Auto-save
  await autoSaveTasks(projectId);
  await autoSaveStages(projectId);
  await autoSaveModules(projectId);

  return { success: true, message: `Task ${taskId} deleted successfully` };
}

// ============ 阶段管理函数 ============
async function getTaskStages(req: Request): Promise<TaskStage[]> {
  const { taskId } = req.params;
  return Array.from(projectStore.stages.values())
    .filter(s => s.taskId === taskId)
    .sort((a, b) => a.order - b.order);
}

async function createTaskStage(req: Request, _res: Response): Promise<TaskStage> {
  const { id: projectId, moduleId, taskId } = req.params;
  const { name, description, roles, entryCriteria, exitCriteria, executionMode, nextStages } = req.body;

  if (!name) {
    throw new Error('Stage name is required');
  }

  // 验证任务存在
  const task = projectStore.tasks.get(taskId);
  if (!task || task.projectId !== projectId || task.moduleId !== moduleId) {
    throw new Error('Task not found');
  }

  const existingStages = Array.from(projectStore.stages.values())
    .filter(s => s.taskId === taskId);
  const order = existingStages.length;

  const stage: TaskStage = {
    id: `stage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    taskId,
    moduleId,
    name,
    description,
    status: 'pending',
    roles: roles || [],
    entryCriteria,
    exitCriteria,
    executionMode: executionMode || 'sequential',
    nextStages,
    order,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  };

  projectStore.stages.set(stage.id, stage);

  // Auto-save
  await autoSaveStages(projectId);

  return stage;
}

async function updateTaskStage(req: Request, _res: Response): Promise<TaskStage | null> {
  const { id: projectId, moduleId, taskId, stageId } = req.params;
  const { name, description, status, roles, entryCriteria, exitCriteria, executionMode, nextStages } = req.body;

  const existing = projectStore.stages.get(stageId);
  if (!existing || existing.taskId !== taskId || existing.moduleId !== moduleId) {
    return null;
  }

  const updated: TaskStage = {
    ...existing,
    name: name || existing.name,
    description: description !== undefined ? description : existing.description,
    status: status || existing.status,
    roles: roles || existing.roles,
    entryCriteria: entryCriteria || existing.entryCriteria,
    exitCriteria: exitCriteria || existing.exitCriteria,
    executionMode: executionMode || existing.executionMode,
    nextStages: nextStages || existing.nextStages,
    metadata: {
      ...existing.metadata,
      updatedAt: new Date(),
    }
  };

  // 更新执行时间
  if (status === 'in-progress' && existing.status !== 'in-progress') {
    updated.startedAt = new Date();
  } else if (status === 'completed' && existing.status !== 'completed') {
    updated.completedAt = new Date();
  }

  projectStore.stages.set(stageId, updated);

  // Auto-save
  await autoSaveStages(projectId);

  return updated;
}
