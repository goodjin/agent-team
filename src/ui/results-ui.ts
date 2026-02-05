import { OutputFile } from '../types/output.js';

export interface ResultsUIConfig {
  maxFileSizeForPreview: number;
  supportedPreviewTypes: string[];
  iframeSandbox: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children?: FileTreeNode[];
  mimeType?: string;
  size?: number;
  preview?: string;
}

export interface PreviewResult {
  type: 'code' | 'image' | 'markdown' | 'html' | 'text' | 'iframe' | 'download';
  content?: string;
  language?: string;
  sandbox?: string;
}

export class ResultsUI {
  private config: ResultsUIConfig;

  constructor(config?: Partial<ResultsUIConfig>) {
    this.config = {
      maxFileSizeForPreview: 1024 * 1024,
      supportedPreviewTypes: ['html', 'md', 'json', 'txt', 'py', 'js', 'ts'],
      iframeSandbox: 'allow-scripts allow-same-origin',
      ...config,
    };
  }

  buildFileTree(files: OutputFile[]): FileTreeNode[] {
    const root: FileTreeNode = { name: '', path: '', type: 'directory', children: [] };

    for (const file of files) {
      const parts = file.path.split('/');
      let current = root;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        let child = current.children?.find(c => c.name === part && c.type === 'directory');

        if (!child) {
          child = {
            name: part,
            path: parts.slice(0, i + 1).join('/'),
            type: 'directory',
            children: [],
          };
          current.children?.push(child!);
        }
        current = child;
      }

      current.children?.push({
        name: parts[parts.length - 1],
        path: file.path,
        type: 'file',
        mimeType: file.mimeType,
        size: file.size,
        preview: file.preview,
      });
    }

    return root.children || [];
  }

  getFilePreview(file: OutputFile): PreviewResult {
    if (!file.content) {
      return { type: 'download' };
    }

    const ext = file.path.split('.').pop()?.toLowerCase();

    if (ext === 'html' && this.config.iframeSandbox) {
      return {
        type: 'iframe',
        content: file.content,
        sandbox: this.config.iframeSandbox,
      };
    }

    if (['md', 'markdown'].includes(ext || '')) {
      return { type: 'markdown', content: file.content };
    }

    if (['json', 'yaml', 'yml'].includes(ext || '')) {
      return {
        type: 'code',
        content: this.formatJSON(file.content),
        language: ext === 'json' ? 'json' : 'yaml',
      };
    }

    if (['py', 'js', 'ts', 'css', 'html'].includes(ext || '')) {
      return {
        type: 'code',
        content: file.content,
        language: ext || 'text',
      };
    }

    if (file.mimeType?.startsWith('image/')) {
      return { type: 'image', content: file.content };
    }

    return { type: 'text', content: file.content };
  }

  private formatJSON(content: string): string {
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  }
}
