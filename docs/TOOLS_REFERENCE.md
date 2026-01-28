# 工具参考

Project Agent 提供了丰富的工具集，用于文件操作、Git 管理、代码执行等。本文档详细描述每个工具的用法、参数和返回值。

## 目录

- [文件工具](#文件工具)
- [Git 工具](#git-工具)
- [工具分类统计](#工具分类统计)

---

## 文件工具

文件工具提供了对文件系统的基本操作能力，包括读取、写入、搜索、删除和列出目录等功能。

### read-file

读取文件内容。

**位置**: `src/tools/file-tools.ts:11-55`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| filePath | string | 是 | 文件路径，支持相对路径和绝对路径 |
| encoding | string | 否 | 编码格式，默认: 'utf-8' |

**返回值**:

```typescript
{
  success: boolean;
  data: {
    content: string;      // 文件内容
    size: number;         // 文件大小（字节）
    path: string;         // 文件路径
    encoding: string;     // 编码格式
  };
  metadata: {
    lastModified: Date;   // 最后修改时间
    created: Date;        // 创建时间
  };
}
```

**使用示例**:

```typescript
const result = await agent.useTool('read-file', {
  filePath: './src/index.ts',
  encoding: 'utf-8',
});

if (result.success) {
  console.log('文件内容:', result.data.content);
  console.log('文件大小:', result.data.size, 'bytes');
}
```

**注意事项**:
- 支持读取任意文本文件
- 二进制文件会返回 base64 编码
- 文件不存在时返回错误

---

### write-file

写入文件内容。如果文件不存在会创建新文件，如果已存在会覆盖原有内容。

**位置**: `src/tools/file-tools.ts:60-116`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| filePath | string | 是 | 文件路径 |
| content | string | 是 | 文件内容 |
| encoding | string | 否 | 编码格式，默认: 'utf-8' |
| createDirs | boolean | 否 | 是否自动创建父目录，默认: true |

**返回值**:

```typescript
{
  success: boolean;
  data: {
    path: string;         // 文件路径
    size: number;         // 文件大小（字节）
    bytesWritten: number; // 写入的字节数
  };
  metadata: {
    lastModified: Date;   // 最后修改时间
  };
}
```

**使用示例**:

```typescript
const result = await agent.useTool('write-file', {
  filePath: './src/new-file.ts',
  content: `export function hello() {
  console.log('Hello, World!');
}`,
  encoding: 'utf-8',
  createDirs: true,
});

if (result.success) {
  console.log('文件创建成功:', result.data.path);
  console.log('写入字节数:', result.data.bytesWritten);
}
```

**危险操作**: 是
**注意事项**:
- 此操作会覆盖已存在的文件
- 建议先读取文件再写入，或使用备份机制

---

### search-files

使用 glob 模式搜索匹配的文件。

**位置**: `src/tools/file-tools.ts:121-168`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 是 | 文件匹配模式（glob 语法） |
| cwd | string | 否 |  pattern | string |搜索根目录，默认当前项目目录 |
| ignore | string[] | 否 | 忽略模式列表 |

**返回值**:

```typescript
{
  success: boolean;
  data: {
    files: string[];      // 匹配的文件路径数组
    count: number;        // 匹配的文件数量
    pattern: string;      // 使用的搜索模式
  };
}
```

**使用示例**:

```typescript
const result = await agent.useTool('search-files', {
  pattern: '**/*.ts',
  cwd: './src',
  ignore: ['node_modules/**', 'dist/**', '*.test.ts'],
});

if (result.success) {
  console.log(`找到 ${result.data.count} 个 TypeScript 文件`);
  result.data.files.forEach(file => console.log(file));
}
```

**常用 glob 模式**:
- `**/*.ts` - 所有 TypeScript 文件
- `src/**/*.js` - src 目录下的所有 JavaScript 文件
- `**/*.json` - 所有 JSON 文件
- `!**/node_modules/**` - 排除 node_modules 目录

---

### delete-file

删除文件或目录。

**位置**: `src/tools/file-tools.ts:173-235`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| filePath | string | 是 | 要删除的文件或目录路径 |
| recursive | boolean | 否 | 是否递归删除目录，默认: false |

**返回值**:

```typescript
{
  success: boolean;
  data: {
    path: string;         // 删除的路径
    deletedSize: number;  // 删除的总大小（字节）
  };
}
```

**使用示例**:

```typescript
// 删除单个文件
await agent.useTool('delete-file', {
  filePath: './src/old-file.ts',
});

// 递归删除目录
await agent.useTool('delete-file', {
  filePath: './src/unused-directory',
  recursive: true,
});
```

**危险操作**: 是
**注意事项**:
- 此操作不可撤销，请谨慎使用
- 删除目录时使用 recursive: true 可以删除非空目录
- 建议先使用 list-directory 确认要删除的内容

---

### list-directory

列出目录内容。

**位置**: `src/tools/file-tools.ts:240-315`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| dirPath | string | 是 | 目录路径 |
| recursive | boolean | 否 | 是否递归列出，默认: false |
| includeStats | boolean | 否 | 是否包含文件统计信息，默认: false |

**返回值**:

```typescript
{
  success: boolean;
  data: {
    path: string;           // 目录路径
    items: Array<{
      name: string;         // 文件名/目录名
      path: string;         // 完整路径
      type: 'file' | 'directory';  // 类型
      level: number;        // 层级深度
      stats?: {             // 统计信息（如果 includeStats=true）
        size: number;       // 文件大小
        modified: Date;     // 修改时间
        created: Date;      // 创建时间
        mode: number;       // 文件权限
      };
    }>;
    count: number;          // 项目总数
  };
}
```

**使用示例**:

```typescript
// 简单列出目录
const result = await agent.useTool('list-directory', {
  dirPath: './src',
  recursive: false,
});

// 递归列出并包含统计信息
const detailedResult = await agent.useTool('list-directory', {
  dirPath: './src',
  recursive: true,
  includeStats: true,
});

if (detailedResult.success) {
  console.log(`目录包含 ${detailedResult.data.count} 个项目`);
  detailedResult.data.items.forEach(item => {
    console.log(`${item.type === 'directory' ? '[DIR]' : '[FILE]'} ${item.path}`);
  });
}
```

---

## Git 工具

Git 工具提供了对 Git 仓库的操作能力，包括查看状态、创建提交、管理分支、拉取和推送代码等功能。

### git-status

查看 Git 工作区状态。

**位置**: `src/tools/git-tools.ts:28-71`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| repoPath | string | 否 | 仓库路径，默认当前项目目录 |

**返回值**:

```typescript
{
  success: boolean;
  data: {
    currentBranch: string;  // 当前分支名
    changes: Array<{
      status: string;       // 状态码（如 'M ', '??', 'A ', 'D '）
      file: string;         // 文件名
    }>;
    totalChanges: number;   // 变更总数
  };
}
```

**状态码说明**:
- `M ` - 已修改 (Modified)
- `A ` - 已添加 (Added)
- `D ` - 已删除 (Deleted)
- `??` - 未跟踪 (Untracked)
- `R ` - 已重命名 (Renamed)
- `C ` - 已复制 (Copied)

**使用示例**:

```typescript
const result = await agent.useTool('git-status', {
  repoPath: '/path/to/repo',
});

if (result.success) {
  console.log(`当前分支: ${result.data.currentBranch}`);
  console.log(`变更数量: ${result.data.totalChanges}`);
  result.data.changes.forEach(change => {
    console.log(`${change.status} ${change.file}`);
  });
}
```

---

### git-commit

创建 Git 提交。

**位置**: `src/tools/git-tools.ts:76-133`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message | string | 是 | 提交信息 |
| repoPath | string | 否 | 仓库路径 |
| addAll | boolean | 否 | 是否暂存所有更改，默认: false |
| files | string[] | 否 | 要提交的文件列表 |

**返回值**:

```typescript
{
  success: boolean;
  data: {
    commitHash: string;  // 提交哈希
    message: string;     // 提交信息
    output: string;      // Git 命令输出
  };
}
```

**使用示例**:

```typescript
// 提交所有更改
await agent.useTool('git-commit', {
  message: 'feat: add new feature',
  addAll: true,
});

// 提交特定文件
await agent.useTool('git-commit', {
  message: 'fix: resolve login bug',
  files: ['src/auth/login.ts', 'tests/login.test.ts'],
});
```

**危险操作**: 是
**建议**:
- 使用规范化的提交信息格式（如 feat:, fix:, docs: 等）
- 提交前先使用 git-status 查看变更内容

---

### git-branch

管理 Git 分支，包括创建、删除、列出和切换分支。

**位置**: `src/tools/git-tools.ts:138-208`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | 'list' \| 'create' \| 'delete' \| 'switch' | 是 | 操作类型 |
| repoPath | string | 否 | 仓库路径 |
| branchName | string | 否 | 分支名称（create/delete/switch 时需要） |
| force | boolean | 否 | 是否强制操作，默认: false |

**返回值**:

```typescript
{
  success: boolean;
  data: {
    action: string;       // 执行的操作
    branchName?: string;  // 分支名称
    output: string;       // Git 命令输出
  };
}
```

**使用示例**:

```typescript
// 列出所有分支
const listResult = await agent.useTool('git-branch', {
  action: 'list',
});
console.log('所有分支:', listResult.data.output);

// 创建新分支
await agent.useTool('git-branch', {
  action: 'create',
  branchName: 'feature/new-login',
  startPoint: 'main',
});

// 切换分支
await agent.useTool('git-branch', {
  action: 'switch',
  branchName: 'feature/new-login',
});

// 删除分支
await agent.useTool('git-branch', {
  action: 'delete',
  branchName: 'feature/old-feature',
  force: true,
});
```

**危险操作**: 是（create、delete、switch 操作会修改仓库状态）

---

### git-pull

从远程仓库拉取更新。

**位置**: `src/tools/git-tools.ts:213-263`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| repoPath | string | 否 | 仓库路径 |
| remote | string | 否 | 远程仓库名，默认: 'origin' |
| branch | string | 否 | 分支名（默认当前分支） |
| rebase | boolean | 否 | 是否使用 rebase 模式，默认: false |

**返回值**:

```typescript
{
  success: boolean;
  data: {
    remote: string;      // 远程名称
    branch?: string;     // 分支名称
    rebase: boolean;     // 是否使用 rebase
    output: string;      // Git 命令输出
  };
}
```

**使用示例**:

```typescript
// 默认拉取（merge 模式）
await agent.useTool('git-pull');

// 使用 rebase 模式
await agent.useTool('git-pull', {
  rebase: true,
});

// 拉取指定远程和分支
await agent.useTool('git-pull', {
  remote: 'origin',
  branch: 'develop',
  rebase: true,
});
```

**危险操作**: 是
**注意事项**:
- 拉取前建议先使用 git-status 查看本地状态
- 如果有未提交的更改，建议先提交或stash

---

### git-push

推送到远程仓库。

**位置**: `src/tools/git-tools.ts:268-320`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| repoPath | string | 否 | 仓库路径 |
| remote | string | 否 | 远程仓库名，默认: 'origin' |
| branch | string | 否 | 分支名（默认当前分支） |
| force | boolean | 否 | 是否强制推送，默认: false |
| setUpstream | boolean | 否 | 是否设置上游分支，默认: false |

**返回值**:

```typescript
{
  success: boolean;
  data: {
    remote: string;      // 远程名称
    branch?: string;     // 分支名称
    output: string;      // Git 命令输出
  };
}
```

**使用示例**:

```typescript
// 默认推送
await agent.useTool('git-push');

// 设置上游分支并推送
await agent.useTool('git-push', {
  setUpstream: true,
});

// 强制推送（谨慎使用）
await agent.useTool('git-push', {
  force: true,
});
```

**危险操作**: 是（force 推送会覆盖远程历史）

---

## 工具分类统计

| 类别 | 工具数量 | 危险操作 |
|------|---------|---------|
| 文件工具 (file) | 5 | write-file, delete-file |
| Git 工具 (git) | 5 | git-commit, git-branch, git-pull, git-push |
| **总计** | **10** | **6** |

---

## 常用工具组合

### 批量文件操作

```typescript
// 搜索并读取多个配置文件
const files = await agent.useTool('search-files', {
  pattern: '**/*.config.ts',
  cwd: './src',
});

for (const file of files.data.files) {
  const content = await agent.useTool('read-file', {
    filePath: file,
  });
  if (content.success) {
    console.log(`[${file}] ${content.data.size} bytes`);
  }
}
```

### 完整的 Git 工作流程

```typescript
// 1. 查看状态
const status = await agent.useTool('git-status');
console.log('当前分支:', status.data.currentBranch);

// 2. 创建特性分支
await agent.useTool('git-branch', {
  action: 'create',
  branchName: 'feature/new-feature',
  startPoint: 'main',
});

// 3. 开发完成后提交
await agent.useTool('git-commit', {
  message: 'feat: implement new feature',
  addAll: true,
});

// 4. 拉取最新代码
await agent.useTool('git-pull', {
  rebase: true,
});

// 5. 推送到远程
await agent.useTool('git-push', {
  branch: 'feature/new-feature',
  setUpstream: true,
});
```

### 项目初始化

```typescript
// 创建项目结构
await agent.useTool('write-file', {
  filePath: './src/index.ts',
  content: '// 入口文件',
});

await agent.useTool('write-file', {
  filePath: './package.json',
  content: JSON.stringify({ name: 'my-project' }, null, 2),
});

// 初始化 Git 仓库
await agent.useTool('git-branch', {
  action: 'create',
  branchName: 'main',
});

// 初始提交
await agent.useTool('git-commit', {
  message: 'chore: initial project setup',
  addAll: true,
});
```
