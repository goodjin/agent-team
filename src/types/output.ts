import type { TokenUsage } from './index.js';

export interface TaskOutput {
  files: OutputFile[];
  summary?: string;
  webPreview?: WebPreview;
  metrics?: TaskMetrics;
}

export interface OutputFile {
  id: string;
  path: string;
  name: string;
  type: FileType;
  size: number;
  content?: string;
  mimeType?: string;
  preview?: 'code' | 'image' | 'markdown' | 'html' | 'json' | 'text';
}

export type FileType = 'source' | 'test' | 'doc' | 'config' | 'output' | 'other';

export interface WebPreview {
  type: 'iframe' | 'modal' | 'link';
  url?: string;
  content?: string;
  width?: string;
  height?: string;
}

export interface TaskMetrics {
  executionTime: number;
  tokenUsage?: TokenUsage;
  fileCount: number;
  totalSize: number;
}
