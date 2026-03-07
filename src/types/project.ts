import { z } from 'zod';

// ============ 项目生命周期状态 ============
export type ProjectLifecycleStatus = 'draft' | 'in-progress' | 'review' | 'completed';

export const ProjectLifecycleStatusEnum = {
  DRAFT: 'draft',
  IN_PROGRESS: 'in-progress',
  REVIEW: 'review',
  COMPLETED: 'completed'
} as const;

// ============ 版本管理 ============
export interface ProjectVersion {
  id: string;
  projectId: string;
  version: string;
  name: string;
  description?: string;
  createdAt: Date;
  createdBy?: string;
  changes: string[];
  status: 'active' | 'archived' | 'deprecated';
}

// ============ 阶段状态 ============
export type StageStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

// ============ 阶段管理 ============
export interface TaskStage {
  id: string;
  taskId: string;
  moduleId: string;
  name: string;
  description?: string;
  status: StageStatus;
  roles: string[]; // 分配的角色
  // 入口条件：什么必须完成才能进入此阶段
  entryCriteria?: string[];
  // 出口条件：什么定义了此阶段的完成
  exitCriteria?: string[];
  // 顺序或并行
  executionMode: 'sequential' | 'parallel';
  // 下一阶段配置
  nextStages?: string[];
  // 排序
  order: number;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    tags?: string[];
  };
  // 执行结果
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
}

// ============ 任务管理 ============
export interface ProjectTask {
  id: string;
  moduleId: string;
  projectId: string;
  type: string;
  title: string;
  description: string;
  status: ProjectLifecycleStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  // 分配的角色（支持多个）
  assignedRoles?: string[];
  // 依赖的任务
  dependencies?: string[];
  // 阶段列表
  stages?: TaskStage[];
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    tags?: string[];
  };
  startedAt?: Date;
  completedAt?: Date;
}

// ============ 模块管理 ============
export interface ProjectModule {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  version: string;
  status: ProjectLifecycleStatus;
  dependencies?: string[];
  roles?: string[];
  tasks?: ProjectTask[]; // 模块下的任务列表
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    order: number;
    tags?: string[];
  };
}

// ============ 增强的项目状态 ============
export type ProjectStatus = 'active' | 'archived' | 'draft';

export type ProjectVisibility = 'private' | 'team' | 'public';

export const ProjectMemberRole = {
  OWNER: 'owner',
  ADMIN: 'admin',
  DEVELOPER: 'developer',
  VIEWER: 'viewer',
} as const;

export type ProjectMemberRoleType = typeof ProjectMemberRole[keyof typeof ProjectMemberRole];

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  username: string;
  email?: string;
  role: ProjectMemberRoleType;
  joinedAt: Date;
  lastActiveAt?: Date;
}

export const ProjectConfigSchema = z.object({
  projectName: z.string().min(1, 'Project name is required'),
  projectPath: z.string().min(1, 'Project path is required'),
  llmConfig: z.object({
    provider: z.enum(['anthropic', 'openai', 'ollama', 'custom']),
    apiKey: z.string().optional(),
    model: z.string(),
    maxTokens: z.number().optional(),
    temperature: z.number().optional(),
    baseURL: z.string().optional(),
  }).optional(),
  tools: z.object({
    enableGit: z.boolean().optional(),
    enableTest: z.boolean().optional(),
    enableBuild: z.boolean().optional(),
    enableDeploy: z.boolean().optional(),
    customTools: z.array(z.string()).optional(),
  }).optional(),
  constraints: z.object({
    codeStyle: z.enum(['prettier', 'eslint', 'custom']).optional(),
    testFramework: z.enum(['jest', 'vitest', 'mocha', 'custom']).optional(),
    testCoverage: z.number().optional(),
    maxFileSize: z.number().optional(),
    forbiddenPatterns: z.array(z.string()).optional(),
    requiredPatterns: z.array(z.string()).optional(),
    customStandards: z.array(z.string()).optional(),
  }).optional(),
  roles: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    description: z.string(),
    responsibilities: z.array(z.string()),
    capabilities: z.array(z.string()),
    constraints: z.array(z.string()),
    outputFormat: z.string(),
    systemPrompt: z.string(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
  })).optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  status: ProjectStatus;
  lifecycleStatus: ProjectLifecycleStatus; // 新增：生命周期状态
  visibility: ProjectVisibility;
  config: ProjectConfig;
  members?: ProjectMember[];
  modules?: ProjectModule[]; // 新增：模块列表
  versions?: ProjectVersion[]; // 新增：版本列表
  currentVersion?: string; // 新增：当前版本
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    version?: string;
    tags?: string[];
    owner?: string;
  };
}

export interface ProjectSummary {
  totalProjects: number;
  activeProjects: number;
  archivedProjects: number;
}

export interface ProjectListItem {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  memberCount: number;
  taskCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectInput {
  name: string;
  path: string;
  description?: string;
  visibility?: ProjectVisibility;
  config?: Partial<ProjectConfig>;
  modules?: CreateModuleInput[]; // 新增：初始模块
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  lifecycleStatus?: ProjectLifecycleStatus; // 新增：生命周期状态
  visibility?: ProjectVisibility;
  config?: Partial<ProjectConfig>;
}

export interface ProjectFilters {
  status?: ProjectStatus;
  lifecycleStatus?: ProjectLifecycleStatus; // 新增：生命周期筛选
  visibility?: ProjectVisibility;
  search?: string;
  limit?: number;
  offset?: number;
}

// ============ 模块操作接口 ============
export interface CreateModuleInput {
  name: string;
  description?: string;
  version?: string;
  dependencies?: string[];
  roles?: string[];
  tags?: string[];
}

export interface UpdateModuleInput {
  name?: string;
  description?: string;
  status?: ProjectLifecycleStatus;
  dependencies?: string[];
  roles?: string[];
  tags?: string[];
}

// ============ 版本操作接口 ============
export interface CreateVersionInput {
  version: string;
  name: string;
  description?: string;
  changes: string[];
}

export interface UpdateVersionInput {
  name?: string;
  description?: string;
  status?: 'active' | 'archived' | 'deprecated';
}

// ============ 任务操作接口 ============
export interface CreateTaskInput {
  title: string;
  description?: string;
  type?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assignedRoles?: string[];
  dependencies?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: ProjectLifecycleStatus;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assignedRoles?: string[];
  dependencies?: string[];
}

// ============ 阶段操作接口 ============
export interface CreateStageInput {
  name: string;
  description?: string;
  roles?: string[];
  entryCriteria?: string[];
  exitCriteria?: string[];
  executionMode?: 'sequential' | 'parallel';
  nextStages?: string[];
}

export interface UpdateStageInput {
  name?: string;
  description?: string;
  status?: StageStatus;
  roles?: string[];
  entryCriteria?: string[];
  exitCriteria?: string[];
  executionMode?: 'sequential' | 'parallel';
  nextStages?: string[];
}
