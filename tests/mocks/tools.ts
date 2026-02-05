import { vi } from 'vitest';

export interface MockToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export function createMockToolRegistry() {
  const tools = new Map<string, unknown>();
  const execute = vi.fn();
  const register = vi.fn();
  const get = vi.fn();
  const list = vi.fn();
  const has = vi.fn();

  return {
    tools,
    execute,
    register,
    get,
    list,
    has,
    _registerTool: (name: string, tool: unknown) => {
      tools.set(name, tool);
      register(name, tool);
    },
  };
}

export function createMockFileTool() {
  return {
    readFile: vi.fn().mockResolvedValue({ success: true, data: 'file content' }),
    writeFile: vi.fn().mockResolvedValue({ success: true }),
    deleteFile: vi.fn().mockResolvedValue({ success: true }),
    exists: vi.fn().mockResolvedValue(true),
    listFiles: vi.fn().mockResolvedValue({ success: true, data: ['file1.ts', 'file2.ts'] }),
    createDir: vi.fn().mockResolvedValue({ success: true }),
    copyFile: vi.fn().mockResolvedValue({ success: true }),
    moveFile: vi.fn().mockResolvedValue({ success: true }),
  };
}

export function createMockGitTool() {
  return {
    init: vi.fn().mockResolvedValue({ success: true }),
    clone: vi.fn().mockResolvedValue({ success: true }),
    status: vi.fn().mockResolvedValue({ success: true, data: { modified: [], staged: [] } }),
    add: vi.fn().mockResolvedValue({ success: true }),
    commit: vi.fn().mockResolvedValue({ success: true }),
    push: vi.fn().mockResolvedValue({ success: true }),
    pull: vi.fn().mockResolvedValue({ success: true }),
    branch: vi.fn().mockResolvedValue({ success: true, data: ['main', 'develop'] }),
    checkout: vi.fn().mockResolvedValue({ success: true }),
    log: vi.fn().mockResolvedValue({ success: true, data: [{ hash: 'abc123', message: 'test commit' }] }),
    diff: vi.fn().mockResolvedValue({ success: true, data: '' }),
  };
}

export function createMockCodeAnalysisTool() {
  return {
    parseFile: vi.fn().mockResolvedValue({ success: true, data: { type: 'typescript', functions: [] } }),
    findReferences: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getTypeDefinition: vi.fn().mockResolvedValue({ success: true, data: null }),
    formatCode: vi.fn().mockResolvedValue({ success: true, data: 'formatted code' }),
    lintCode: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getImports: vi.fn().mockResolvedValue({ success: true, data: [] }),
  };
}
