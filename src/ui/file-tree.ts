import { FileTreeNode } from './results-ui.js';

export interface FileTreeOptions {
  showFileSizes: boolean;
  showIcons: boolean;
  expandedByDefault: boolean;
  maxDepth: number;
}

export interface FileTreeRenderOptions {
  indentSize: number;
  connectorChar: string;
  expandChar: string;
  collapseChar: string;
}

export class FileTree {
  private options: FileTreeOptions;
  private renderOptions: FileTreeRenderOptions;
  private expandedPaths: Set<string>;

  constructor(options?: Partial<FileTreeOptions>) {
    this.options = {
      showFileSizes: false,
      showIcons: true,
      expandedByDefault: true,
      maxDepth: 3,
      ...options,
    };
    this.renderOptions = {
      indentSize: 2,
      connectorChar: '│',
      expandChar: '├─',
      collapseChar: '└─',
    };
    this.expandedPaths = new Set();
  }

  render(nodes: FileTreeNode[]): string {
    this.expandedPaths.clear();
    if (this.options.expandedByDefault) {
      this.expandAll(nodes);
    }
    return this.renderNodes(nodes, 0, false);
  }

  renderWithDepth(nodes: FileTreeNode[], maxDepth?: number): string {
    const originalMaxDepth = this.options.maxDepth;
    if (maxDepth !== undefined) {
      this.options.maxDepth = maxDepth;
    }
    const result = this.render(nodes);
    this.options.maxDepth = originalMaxDepth;
    return result;
  }

  toggleNode(path: string): boolean {
    if (this.expandedPaths.has(path)) {
      this.expandedPaths.delete(path);
      return false;
    } else {
      this.expandedPaths.add(path);
      return true;
    }
  }

  isExpanded(path: string): boolean {
    return this.expandedPaths.has(path);
  }

  expandAll(nodes: FileTreeNode[], currentPath: string = ''): void {
    for (const node of nodes) {
      const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name;
      if (node.type === 'directory') {
        this.expandedPaths.add(nodePath);
        if (node.children) {
          this.expandAll(node.children, nodePath);
        }
      }
    }
  }

  collapseAll(): void {
    this.expandedPaths.clear();
  }

  findNodeByPath(nodes: FileTreeNode[], path: string): FileTreeNode | null {
    const parts = path.split('/');
    let currentNodes: FileTreeNode[] = nodes;

    for (const part of parts) {
      let found: FileTreeNode | null = null;
      for (const node of currentNodes) {
        if (node.name === part) {
          found = node;
          break;
        }
      }
      if (!found) {
        return null;
      }
      if (part === parts[parts.length - 1]) {
        return found;
      }
      if (found.type === 'directory' && found.children) {
        currentNodes = found.children;
      } else {
        return null;
      }
    }
    return null;
  }

  filterNodes(nodes: FileTreeNode[], filter: (node: FileTreeNode) => boolean): FileTreeNode[] {
    const filterRecursive = (nodeList: FileTreeNode[]): FileTreeNode[] => {
      const result: FileTreeNode[] = [];
      for (const node of nodeList) {
        const matches = filter(node);
        if (node.type === 'directory' && node.children) {
          const filteredChildren = filterRecursive(node.children);
          if (filteredChildren.length > 0) {
            result.push({
              ...node,
              children: filteredChildren,
            });
          } else if (matches) {
            result.push(node);
          }
        } else if (matches) {
          result.push(node);
        }
      }
      return result;
    };

    return filterRecursive(nodes);
  }

  getDirectoryCount(nodes: FileTreeNode[]): number {
    let count = 0;
    const countRecursive = (nodeList: FileTreeNode[]) => {
      for (const node of nodeList) {
        if (node.type === 'directory') {
          count++;
          if (node.children) {
            countRecursive(node.children);
          }
        }
      }
    };
    countRecursive(nodes);
    return count;
  }

  getFileCount(nodes: FileTreeNode[]): number {
    let count = 0;
    const countRecursive = (nodeList: FileTreeNode[]) => {
      for (const node of nodeList) {
        if (node.type === 'file') {
          count++;
        } else if (node.type === 'directory' && node.children) {
          countRecursive(node.children);
        }
      }
    };
    countRecursive(nodes);
    return count;
  }

  getTotalSize(nodes: FileTreeNode[]): number {
    let total = 0;
    const sizeRecursive = (nodeList: FileTreeNode[]) => {
      for (const node of nodeList) {
        if (node.size) {
          total += node.size;
        }
        if (node.type === 'directory' && node.children) {
          sizeRecursive(node.children);
        }
      }
    };
    sizeRecursive(nodes);
    return total;
  }

  private renderNodes(nodes: FileTreeNode[], depth: number, isLast: boolean): string {
    if (depth > this.options.maxDepth) {
      return '';
    }

    let result = '';
    const indent = ' '.repeat(depth * this.renderOptions.indentSize);
    const prefix = depth === 0 ? '' : (isLast ? this.renderOptions.collapseChar : this.renderOptions.expandChar);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const isLastNode = i === nodes.length - 1;
      const nodePrefix = i === 0 ? prefix : (isLastNode ? this.renderOptions.collapseChar : this.renderOptions.expandChar);
      const nodeIndent = i === 0 ? indent : indent + ' '.repeat(this.renderOptions.indentSize);

      result += this.renderNode(node, nodeIndent, nodePrefix, isLastNode);

      if (node.type === 'directory' && node.children && this.expandedPaths.has(node.path)) {
        result += this.renderNodes(node.children, depth + 1, isLastNode);
      }
    }

    return result;
  }

  private renderNode(node: FileTreeNode, indent: string, prefix: string, isLast: boolean): string {
    let line = `${indent}${prefix}`;

    if (this.options.showIcons) {
      line += node.type === 'directory' ? '📁 ' : '📄 ';
    }

    line += node.name;

    if (this.options.showFileSizes && node.size) {
      line += ` (${this.formatSize(node.size)})`;
    }

    if (node.type === 'directory') {
      const isExpanded = this.expandedPaths.has(node.path);
      line += isExpanded ? '/' : '';
    }

    line += '\n';
    return line;
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }
}
