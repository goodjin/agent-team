import { z } from 'zod';

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
  visibility: ProjectVisibility;
  config: ProjectConfig;
  members?: ProjectMember[];
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    version?: string;
    tags?: string[];
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
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
  config?: Partial<ProjectConfig>;
}

export interface ProjectFilters {
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
  search?: string;
  limit?: number;
  offset?: number;
}
