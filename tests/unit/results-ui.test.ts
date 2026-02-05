import { describe, it, expect, beforeEach } from 'vitest';
import { ResultsUI, FileTreeNode, PreviewResult } from '../../src/ui/results-ui.js';
import { FileTree } from '../../src/ui/file-tree.js';
import { FilePreview } from '../../src/ui/file-preview.js';
import { OutputFile } from '../../src/types/output.js';

describe('ResultsUI', () => {
  let resultsUI: ResultsUI;

  beforeEach(() => {
    resultsUI = new ResultsUI();
  });

  describe('constructor', () => {
    it('should use default config when no options provided', () => {
      expect(resultsUI['config'].maxFileSizeForPreview).toBe(1024 * 1024);
      expect(resultsUI['config'].supportedPreviewTypes).toContain('html');
      expect(resultsUI['config'].supportedPreviewTypes).toContain('json');
    });

    it('should override default config with provided options', () => {
      const customUI = new ResultsUI({
        maxFileSizeForPreview: 2048 * 1024,
        supportedPreviewTypes: ['py', 'js'],
        iframeSandbox: 'allow-scripts',
      });

      expect(customUI['config'].maxFileSizeForPreview).toBe(2048 * 1024);
      expect(customUI['config'].supportedPreviewTypes).toEqual(['py', 'js']);
      expect(customUI['config'].iframeSandbox).toBe('allow-scripts');
    });
  });

  describe('buildFileTree', () => {
    it('should build empty tree for empty file list', () => {
      const tree = resultsUI.buildFileTree([]);
      expect(tree).toEqual([]);
    });

    it('should build flat structure for single file in root', () => {
      const files: OutputFile[] = [{
        id: '1',
        path: 'file.txt',
        name: 'file.txt',
        type: 'source',
        size: 100,
        content: 'test',
      }];

      const tree = resultsUI.buildFileTree(files);

      expect(tree.length).toBe(1);
      expect(tree[0].name).toBe('file.txt');
      expect(tree[0].type).toBe('file');
      expect(tree[0].path).toBe('file.txt');
    });

    it('should build nested directory structure', () => {
      const files: OutputFile[] = [
        {
          id: '1',
          path: 'src/index.ts',
          name: 'index.ts',
          type: 'source',
          size: 200,
          content: 'export {}',
        },
        {
          id: '2',
          path: 'src/utils/helper.ts',
          name: 'helper.ts',
          type: 'source',
          size: 150,
          content: 'export const helper = () => {}',
        },
        {
          id: '3',
          path: 'tests/app.test.ts',
          name: 'app.test.ts',
          type: 'test',
          size: 100,
          content: 'test("app", () => {})',
        },
      ];

      const tree = resultsUI.buildFileTree(files);

      expect(tree.length).toBe(2);

      const srcNode = tree.find(n => n.name === 'src');
      expect(srcNode).toBeDefined();
      expect(srcNode?.type).toBe('directory');
      expect(srcNode?.children?.length).toBe(2);

      const testsNode = tree.find(n => n.name === 'tests');
      expect(testsNode).toBeDefined();
      expect(testsNode?.type).toBe('directory');
    });

    it('should preserve file metadata', () => {
      const files: OutputFile[] = [{
        id: '1',
        path: 'image.png',
        name: 'image.png',
        type: 'other',
        size: 1024,
        mimeType: 'image/png',
        preview: 'image',
      }];

      const tree = resultsUI.buildFileTree(files);

      expect(tree[0].mimeType).toBe('image/png');
      expect(tree[0].size).toBe(1024);
      expect(tree[0].preview).toBe('image');
    });
  });

  describe('getFilePreview', () => {
    it('should return download type for file without content', () => {
      const file: OutputFile = {
        id: '1',
        path: 'file.txt',
        name: 'file.txt',
        type: 'source',
        size: 100,
      };

      const preview = resultsUI.getFilePreview(file);

      expect(preview.type).toBe('download');
    });

    it('should return iframe type for HTML files', () => {
      const file: OutputFile = {
        id: '1',
        path: 'index.html',
        name: 'index.html',
        type: 'source',
        size: 200,
        content: '<html><body>Hello</body></html>',
      };

      const preview = resultsUI.getFilePreview(file);

      expect(preview.type).toBe('iframe');
      expect(preview.sandbox).toBe('allow-scripts allow-same-origin');
    });

    it('should return markdown type for markdown files', () => {
      const file: OutputFile = {
        id: '1',
        path: 'README.md',
        name: 'README.md',
        type: 'doc',
        size: 300,
        content: '# Title\n\nContent here.',
      };

      const preview = resultsUI.getFilePreview(file);

      expect(preview.type).toBe('markdown');
    });

    it('should return code type with json language for JSON files', () => {
      const file: OutputFile = {
        id: '1',
        path: 'config.json',
        name: 'config.json',
        type: 'config',
        size: 400,
        content: '{"key": "value"}',
      };

      const preview = resultsUI.getFilePreview(file);

      expect(preview.type).toBe('code');
      expect(preview.language).toBe('json');
      expect(preview.content).toBe('{\n  "key": "value"\n}');
    });

    it('should return code type with yaml language for YAML files', () => {
      const file: OutputFile = {
        id: '1',
        path: 'config.yaml',
        name: 'config.yaml',
        type: 'config',
        size: 300,
        content: 'key: value',
      };

      const preview = resultsUI.getFilePreview(file);

      expect(preview.type).toBe('code');
      expect(preview.language).toBe('yaml');
    });

    it('should return code type for source code files', () => {
      const files: OutputFile[] = [
        { id: '1', path: 'script.js', name: 'script.js', type: 'source', size: 200, content: 'console.log("test")' },
        { id: '2', path: 'main.ts', name: 'main.ts', type: 'source', size: 300, content: 'const x = 1' },
        { id: '3', path: 'app.py', name: 'app.py', type: 'source', size: 400, content: 'print("hello")' },
      ];

      for (const file of files) {
        const preview = resultsUI.getFilePreview(file);
        expect(preview.type).toBe('code');
        expect(preview.language).toBe(file.path.split('.').pop());
      }
    });

    it('should return image type for image files', () => {
      const file: OutputFile = {
        id: '1',
        path: 'photo.jpg',
        name: 'photo.jpg',
        type: 'other',
        size: 5000,
        mimeType: 'image/jpeg',
        content: 'binary-data',
      };

      const preview = resultsUI.getFilePreview(file);

      expect(preview.type).toBe('image');
    });

    it('should return text type for plain text files', () => {
      const file: OutputFile = {
        id: '1',
        path: 'readme.txt',
        name: 'readme.txt',
        type: 'doc',
        size: 100,
        content: 'Some text content',
      };

      const preview = resultsUI.getFilePreview(file);

      expect(preview.type).toBe('text');
    });

    it('should return original content if JSON is invalid', () => {
      const file: OutputFile = {
        id: '1',
        path: 'invalid.json',
        name: 'invalid.json',
        type: 'config',
        size: 100,
        content: 'not valid json',
      };

      const preview = resultsUI.getFilePreview(file);

      expect(preview.content).toBe('not valid json');
    });
  });
});

describe('FileTree', () => {
  let fileTree: FileTree;

  beforeEach(() => {
    fileTree = new FileTree();
  });

  describe('constructor', () => {
    it('should use default options', () => {
      expect(fileTree['options'].showFileSizes).toBe(false);
      expect(fileTree['options'].showIcons).toBe(true);
      expect(fileTree['options'].expandedByDefault).toBe(true);
      expect(fileTree['options'].maxDepth).toBe(3);
    });

    it('should override default options', () => {
      const customTree = new FileTree({
        showFileSizes: true,
        showIcons: false,
        expandedByDefault: false,
        maxDepth: 5,
      });

      expect(customTree['options'].showFileSizes).toBe(true);
      expect(customTree['options'].showIcons).toBe(false);
      expect(customTree['options'].expandedByDefault).toBe(false);
      expect(customTree['options'].maxDepth).toBe(5);
    });
  });

  describe('render', () => {
    it('should render empty tree', () => {
      const result = fileTree.render([]);
      expect(result).toBe('');
    });

    it('should render single file', () => {
      const nodes: FileTreeNode[] = [{
        name: 'file.txt',
        path: 'file.txt',
        type: 'file',
      }];

      const result = fileTree.render(nodes);

      expect(result).toContain('file.txt');
      expect(result).toContain('📄');
    });

    it('should render directory with children', () => {
      const nodes: FileTreeNode[] = [{
        name: 'src',
        path: 'src',
        type: 'directory',
        children: [
          { name: 'index.ts', path: 'src/index.ts', type: 'file' },
          { name: 'utils.ts', path: 'src/utils.ts', type: 'file' },
        ],
      }];

      const result = fileTree.render(nodes);

      expect(result).toContain('src');
      expect(result).toContain('index.ts');
      expect(result).toContain('utils.ts');
    });
  });

  describe('toggleNode', () => {
    it('should toggle node expanded state', () => {
      const nodes: FileTreeNode[] = [{
        name: 'src',
        path: 'src',
        type: 'directory',
        children: [],
      }];

      fileTree.expandAll(nodes);
      expect(fileTree.isExpanded('src')).toBe(true);

      const result = fileTree.toggleNode('src');
      expect(result).toBe(false);
      expect(fileTree.isExpanded('src')).toBe(false);

      const result2 = fileTree.toggleNode('src');
      expect(result2).toBe(true);
      expect(fileTree.isExpanded('src')).toBe(true);
    });
  });

  describe('expandAll and collapseAll', () => {
    it('should expand all directories', () => {
      const nodes: FileTreeNode[] = [
        {
          name: 'src',
          path: 'src',
          type: 'directory',
          children: [
            {
              name: 'utils',
              path: 'src/utils',
              type: 'directory',
              children: [{ name: 'helper.ts', path: 'src/utils/helper.ts', type: 'file' }],
            },
          ],
        },
        {
          name: 'tests',
          path: 'tests',
          type: 'directory',
          children: [],
        },
      ];

      fileTree.collapseAll();
      expect(fileTree.isExpanded('src')).toBe(false);
      expect(fileTree.isExpanded('src/utils')).toBe(false);

      fileTree.expandAll(nodes);

      expect(fileTree.isExpanded('src')).toBe(true);
      expect(fileTree.isExpanded('src/utils')).toBe(true);
      expect(fileTree.isExpanded('tests')).toBe(true);
    });

    it('should collapse all directories', () => {
      const nodes: FileTreeNode[] = [{
        name: 'src',
        path: 'src',
        type: 'directory',
        children: [],
      }];

      fileTree.collapseAll();

      expect(fileTree.isExpanded('src')).toBe(false);
    });
  });

  describe('findNodeByPath', () => {
    it('should find existing node', () => {
      const nodes: FileTreeNode[] = [{
        name: 'src',
        path: 'src',
        type: 'directory',
        children: [
          { name: 'index.ts', path: 'src/index.ts', type: 'file' },
        ],
      }];

      const result = fileTree.findNodeByPath(nodes, 'src/index.ts');

      expect(result).toBeDefined();
      expect(result?.name).toBe('index.ts');
    });

    it('should return null for non-existent path', () => {
      const nodes: FileTreeNode[] = [{
        name: 'src',
        path: 'src',
        type: 'directory',
        children: [],
      }];

      const result = fileTree.findNodeByPath(nodes, 'non/existent/path');

      expect(result).toBeNull();
    });
  });

  describe('filterNodes', () => {
    it('should filter nodes by predicate', () => {
      const nodes: FileTreeNode[] = [
        {
          name: 'src',
          path: 'src',
          type: 'directory',
          children: [
            { name: 'index.ts', path: 'src/index.ts', type: 'file' },
            { name: 'utils.ts', path: 'src/utils.ts', type: 'file' },
          ],
        },
        {
          name: 'tests',
          path: 'tests',
          type: 'directory',
          children: [
            { name: 'app.test.ts', path: 'tests/app.test.ts', type: 'file' },
          ],
        },
      ];

      const filtered = fileTree.filterNodes(nodes, n => n.type === 'file' && n.name.endsWith('.ts'));

      expect(filtered.length).toBe(2);
      expect(filtered[0].name).toBe('src');
      expect(filtered[0].children?.length).toBe(2);
    });
  });

  describe('getDirectoryCount and getFileCount', () => {
    it('should count directories and files correctly', () => {
      const nodes: FileTreeNode[] = [
        {
          name: 'src',
          path: 'src',
          type: 'directory',
          children: [
            {
              name: 'utils',
              path: 'src/utils',
              type: 'directory',
              children: [{ name: 'helper.ts', path: 'src/utils/helper.ts', type: 'file' }],
            },
            { name: 'index.ts', path: 'src/index.ts', type: 'file' },
          ],
        },
        { name: 'package.json', path: 'package.json', type: 'file' },
      ];

      expect(fileTree.getDirectoryCount(nodes)).toBe(2);
      expect(fileTree.getFileCount(nodes)).toBe(3);
    });
  });

  describe('getTotalSize', () => {
    it('should calculate total size correctly', () => {
      const nodes: FileTreeNode[] = [
        {
          name: 'src',
          path: 'src',
          type: 'directory',
          children: [
            { name: 'index.ts', path: 'src/index.ts', type: 'file', size: 100 },
            { name: 'utils.ts', path: 'src/utils.ts', type: 'file', size: 200 },
          ],
        },
        { name: 'package.json', path: 'package.json', type: 'file', size: 50 },
      ];

      expect(fileTree.getTotalSize(nodes)).toBe(350);
    });
  });
});

describe('FilePreview', () => {
  let filePreview: FilePreview;

  beforeEach(() => {
    filePreview = new FilePreview();
  });

  describe('constructor', () => {
    it('should use default config', () => {
      expect(filePreview['config'].maxImageWidth).toBe(1200);
      expect(filePreview['config'].maxImageHeight).toBe(800);
      expect(filePreview['config'].showLineNumbers).toBe(true);
      expect(filePreview['config'].theme).toBe('dark');
    });

    it('should override default config', () => {
      const customPreview = new FilePreview({
        maxImageWidth: 800,
        maxImageHeight: 600,
        showLineNumbers: false,
        theme: 'light',
      });

      expect(customPreview['config'].maxImageWidth).toBe(800);
      expect(customPreview['config'].maxImageHeight).toBe(600);
      expect(customPreview['config'].showLineNumbers).toBe(false);
      expect(customPreview['config'].theme).toBe('light');
    });
  });

  describe('canPreview', () => {
    it('should return false for file without content', () => {
      const file: OutputFile = {
        id: '1',
        path: 'file.txt',
        name: 'file.txt',
        type: 'source',
        size: 100,
      };

      expect(filePreview.canPreview(file)).toBe(false);
    });

    it('should return true for supported code files', () => {
      const files: OutputFile[] = [
        { id: '1', path: 'script.js', name: 'script.js', type: 'source', size: 100, content: 'console.log()' },
        { id: '2', path: 'main.ts', name: 'main.ts', type: 'source', size: 200, content: 'const x = 1' },
        { id: '3', path: 'app.py', name: 'app.py', type: 'source', size: 300, content: 'print()' },
      ];

      for (const file of files) {
        expect(filePreview.canPreview(file)).toBe(true);
      }
    });

    it('should return true for text files', () => {
      const file: OutputFile = {
        id: '1',
        path: 'README.txt',
        name: 'README.txt',
        type: 'doc',
        size: 500,
        content: 'Some documentation content',
      };

      expect(filePreview.canPreview(file)).toBe(true);
    });

    it('should return false for files larger than max preview length', () => {
      const file: OutputFile = {
        id: '1',
        path: 'large.txt',
        name: 'large.txt',
        type: 'other',
        size: 20000,
        content: 'x'.repeat(20000),
      };

      expect(filePreview.canPreview(file)).toBe(false);
    });
  });

  describe('getPreviewType', () => {
    it('should return download for file without content', () => {
      const file: OutputFile = {
        id: '1',
        path: 'file.txt',
        name: 'file.txt',
        type: 'source',
        size: 100,
      };

      expect(filePreview.getPreviewType(file)).toBe('download');
    });

    it('should return image for image files', () => {
      const file: OutputFile = {
        id: '1',
        path: 'photo.png',
        name: 'photo.png',
        type: 'other',
        size: 5000,
        mimeType: 'image/png',
        content: 'binary-data',
      };

      expect(filePreview.getPreviewType(file)).toBe('image');
    });

    it('should return iframe for HTML files', () => {
      const file: OutputFile = {
        id: '1',
        path: 'index.html',
        name: 'index.html',
        type: 'source',
        size: 200,
        content: '<html></html>',
      };

      expect(filePreview.getPreviewType(file)).toBe('iframe');
    });

    it('should return markdown for markdown files', () => {
      const file: OutputFile = {
        id: '1',
        path: 'README.md',
        name: 'README.md',
        type: 'doc',
        size: 300,
        content: '# Title',
      };

      expect(filePreview.getPreviewType(file)).toBe('markdown');
    });

    it('should return code for source files', () => {
      const file: OutputFile = {
        id: '1',
        path: 'script.js',
        name: 'script.js',
        type: 'source',
        size: 200,
        content: 'console.log()',
      };

      expect(filePreview.getPreviewType(file)).toBe('code');
    });

    it('should return text for plain text files', () => {
      const file: OutputFile = {
        id: '1',
        path: 'log.txt',
        name: 'log.txt',
        type: 'other',
        size: 100,
        content: 'Some log content',
      };

      expect(filePreview.getPreviewType(file)).toBe('text');
    });
  });

  describe('previewAsHtml', () => {
    it('should render download prompt for file without content', () => {
      const file: OutputFile = {
        id: '1',
        path: 'file.dat',
        name: 'file.dat',
        type: 'other',
        size: 100,
      };

      const result = filePreview.previewAsHtml(file);

      expect(result).toContain('download-prompt');
      expect(result).toContain('file.dat');
    });

    it('should render code preview with language badge', () => {
      const file: OutputFile = {
        id: '1',
        path: 'script.js',
        name: 'script.js',
        type: 'source',
        size: 200,
        content: 'console.log("hello");',
      };

      const result = filePreview.previewAsHtml(file);

      expect(result).toContain('code-preview');
      expect(result).toContain('JavaScript');
      expect(result).toContain('script.js');
    });

    it('should render markdown preview', () => {
      const file: OutputFile = {
        id: '1',
        path: 'README.md',
        name: 'README.md',
        type: 'doc',
        size: 300,
        content: '# Title\n\nContent here.',
      };

      const result = filePreview.previewAsHtml(file);

      expect(result).toContain('markdown-preview');
      expect(result).toContain('README.md');
    });

    it('should render text preview', () => {
      const file: OutputFile = {
        id: '1',
        path: 'notes.txt',
        name: 'notes.txt',
        type: 'other',
        size: 100,
        content: 'My notes',
      };

      const result = filePreview.previewAsHtml(file);

      expect(result).toContain('text-preview');
      expect(result).toContain('notes.txt');
    });
  });

  describe('previewAsTerminal', () => {
    it('should render download prompt for non-previewable files', () => {
      const file: OutputFile = {
        id: '1',
        path: 'image.png',
        name: 'image.png',
        type: 'other',
        size: 5000,
        mimeType: 'image/png',
        content: 'binary-data',
      };

      const result = filePreview.previewAsTerminal(file);

      expect(result).toContain('image.png');
    });

    it('should render code preview for source files', () => {
      const file: OutputFile = {
        id: '1',
        path: 'script.js',
        name: 'script.js',
        type: 'source',
        size: 200,
        content: 'console.log("test");\nconst x = 1;',
      };

      const result = filePreview.previewAsTerminal(file);

      expect(result).toContain('script.js');
      expect(result).toContain('console');
    });
  });
});
