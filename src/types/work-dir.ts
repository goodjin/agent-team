export interface WorkDirConfig {
  taskId: string;
  basePath?: string;
  customPath?: string;
  template?: 'default' | 'minimal' | 'custom';
  customDirs?: string[];
  preserve?: boolean;
}

export interface WorkDirStructure {
  root: string;
  src: string;
  tests: string;
  docs: string;
  output: string;
  state: string;
}

export interface WorkDirState {
  taskId: string;
  rootPath: string;
  structure: WorkDirStructure;
  createdAt: Date;
  lastAccessedAt: Date;
  files: string[];
  metadata: {
    totalSize: number;
    fileCount: number;
  };
  preserve?: boolean;
}

export interface WorkDirMeta {
  taskId: string;
  createdAt: string;
  lastAccessedAt: string;
  template: string;
}

export interface PathValidationResult {
  valid: boolean;
  error?: string;
}
