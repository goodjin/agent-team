import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  Project,
  ProjectModule,
  ProjectVersion,
  ProjectTask,
  TaskStage
} from '../types/project.js';

// Base path for storing project data
const PROJECTS_BASE_PATH = path.join(os.homedir(), '.agent-team', 'projects');

export interface ProjectStorageData {
  projects: Project[];
  modules: ProjectModule[];
  versions: ProjectVersion[];
  tasks: ProjectTask[];
  stages: TaskStage[];
}

// Helper to convert dates in objects
function reviveDates(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(reviveDates);
  }
  if (obj instanceof Date) {
    return obj;
  }
  // Handle ISO date strings
  if (obj.$date) {
    return new Date(obj.$date);
  }
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = reviveDates(value);
  }
  return result;
}

// Generic JSON read/write helpers
async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    return reviveDates(parsed) as T;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeJsonFile(filePath: string, data: any): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Get project directory path
export function getProjectDir(projectId: string): string {
  return path.join(PROJECTS_BASE_PATH, projectId);
}

// Get .agentos directory path
export function getAgentosDir(projectId: string): string {
  return path.join(getProjectDir(projectId), '.agentos');
}

// Create project directory structure
export async function createProjectDirectories(projectId: string): Promise<void> {
  const dirs = [
    getProjectDir(projectId),
    path.join(getProjectDir(projectId), '.agentos'),
    path.join(getProjectDir(projectId), 'docs'),
    path.join(getProjectDir(projectId), 'src'),
    path.join(getProjectDir(projectId), 'config'),
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

// Delete project directory
export async function deleteProjectDirectory(projectId: string): Promise<void> {
  const projectDir = getProjectDir(projectId);
  try {
    await fs.rm(projectDir, { recursive: true, force: true });
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

// ============ Project File Operations ============

export async function saveProject(project: Project): Promise<void> {
  const agentosDir = getAgentosDir(project.id);
  const filePath = path.join(agentosDir, 'project.json');

  // Ensure directory exists
  await fs.mkdir(agentosDir, { recursive: true });

  await writeJsonFile(filePath, project);
}

export async function loadProject(projectId: string): Promise<Project | null> {
  const filePath = path.join(getAgentosDir(projectId), 'project.json');
  return readJsonFile<Project>(filePath);
}

export async function deleteProjectFile(projectId: string): Promise<void> {
  const filePath = path.join(getAgentosDir(projectId), 'project.json');
  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

// ============ Module File Operations ============

export async function saveModules(projectId: string, modules: ProjectModule[]): Promise<void> {
  const agentosDir = getAgentosDir(projectId);
  const filePath = path.join(agentosDir, 'modules.json');

  await fs.mkdir(agentosDir, { recursive: true });
  await writeJsonFile(filePath, modules);
}

export async function loadModules(projectId: string): Promise<ProjectModule[]> {
  const filePath = path.join(getAgentosDir(projectId), 'modules.json');
  const result = await readJsonFile<ProjectModule[]>(filePath);
  return result || [];
}

// ============ Version File Operations ============

export async function saveVersions(projectId: string, versions: ProjectVersion[]): Promise<void> {
  const agentosDir = getAgentosDir(projectId);
  const filePath = path.join(agentosDir, 'versions.json');

  await fs.mkdir(agentosDir, { recursive: true });
  await writeJsonFile(filePath, versions);
}

export async function loadVersions(projectId: string): Promise<ProjectVersion[]> {
  const filePath = path.join(getAgentosDir(projectId), 'versions.json');
  const result = await readJsonFile<ProjectVersion[]>(filePath);
  return result || [];
}

// ============ Task File Operations ============

export async function saveTasks(projectId: string, tasks: ProjectTask[]): Promise<void> {
  const agentosDir = getAgentosDir(projectId);
  const filePath = path.join(agentosDir, 'tasks.json');

  await fs.mkdir(agentosDir, { recursive: true });
  await writeJsonFile(filePath, tasks);
}

export async function loadTasks(projectId: string): Promise<ProjectTask[]> {
  const filePath = path.join(getAgentosDir(projectId), 'tasks.json');
  const result = await readJsonFile<ProjectTask[]>(filePath);
  return result || [];
}

// ============ Stage File Operations ============

export async function saveStages(projectId: string, stages: TaskStage[]): Promise<void> {
  const agentosDir = getAgentosDir(projectId);
  const filePath = path.join(agentosDir, 'stages.json');

  await fs.mkdir(agentosDir, { recursive: true });
  await writeJsonFile(filePath, stages);
}

export async function loadStages(projectId: string): Promise<TaskStage[]> {
  const filePath = path.join(getAgentosDir(projectId), 'stages.json');
  const result = await readJsonFile<TaskStage[]>(filePath);
  return result || [];
}

// ============ Bulk Operations ============

// Save all project data
export async function saveAllProjectData(
  projectId: string,
  data: {
    project: Project;
    modules: ProjectModule[];
    versions: ProjectVersion[];
    tasks: ProjectTask[];
    stages: TaskStage[];
  }
): Promise<void> {
  await Promise.all([
    saveProject(data.project),
    saveModules(projectId, data.modules),
    saveVersions(projectId, data.versions),
    saveTasks(projectId, data.tasks),
    saveStages(projectId, data.stages),
  ]);
}

// Load all project data
export async function loadAllProjectData(projectId: string): Promise<ProjectStorageData | null> {
  const project = await loadProject(projectId);
  if (!project) {
    return null;
  }

  const [modules, versions, tasks, stages] = await Promise.all([
    loadModules(projectId),
    loadVersions(projectId),
    loadTasks(projectId),
    loadStages(projectId),
  ]);

  return { projects: [project], modules, versions, tasks, stages };
}

// List all projects (by scanning directories)
export async function listAllProjects(): Promise<Project[]> {
  const projects: Project[] = [];

  try {
    const entries = await fs.readdir(PROJECTS_BASE_PATH, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const project = await loadProject(entry.name);
        if (project) {
          projects.push(project);
        }
      }
    }
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return projects;
}

// Get all modules for all projects
export async function loadAllModules(): Promise<ProjectModule[]> {
  const projects = await listAllProjects();
  const allModules: ProjectModule[] = [];

  for (const project of projects) {
    const modules = await loadModules(project.id);
    allModules.push(...modules);
  }

  return allModules;
}

// Get all versions for all projects
export async function loadAllVersions(): Promise<ProjectVersion[]> {
  const projects = await listAllProjects();
  const allVersions: ProjectVersion[] = [];

  for (const project of projects) {
    const versions = await loadVersions(project.id);
    allVersions.push(...versions);
  }

  return allVersions;
}

// Get all tasks for all projects
export async function loadAllTasks(): Promise<ProjectTask[]> {
  const projects = await listAllProjects();
  const allTasks: ProjectTask[] = [];

  for (const project of projects) {
    const tasks = await loadTasks(project.id);
    allTasks.push(...tasks);
  }

  return allTasks;
}

// Get all stages for all projects
export async function loadAllStages(): Promise<TaskStage[]> {
  const projects = await listAllProjects();
  const allStages: TaskStage[] = [];

  for (const project of projects) {
    const stages = await loadStages(project.id);
    allStages.push(...stages);
  }

  return allStages;
}

// Load all data for initializing the in-memory store
export async function loadAllData(): Promise<ProjectStorageData> {
  const [projects, modules, versions, tasks, stages] = await Promise.all([
    listAllProjects(),
    loadAllModules(),
    loadAllVersions(),
    loadAllTasks(),
    loadAllStages(),
  ]);

  return { projects, modules, versions, tasks, stages };
}

// Ensure base directory exists
export async function ensureBaseDirectory(): Promise<void> {
  await fs.mkdir(PROJECTS_BASE_PATH, { recursive: true });
}
