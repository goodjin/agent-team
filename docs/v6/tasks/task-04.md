# Task 04：ShellExecutorTool - Shell 命令执行

**优先级**: P0
**预估工时**: 5h
**依赖**: Task 01（ToolRegistry 增强）
**状态**: 待开发

---

## 目标

实现 ShellExecutorTool，允许 Agent 安全执行 Shell 命令，含命令黑名单过滤、工作目录限制、超时控制和审计日志。

---

## 输入

- 架构文档：`docs/v6/02-architecture.md`（ShellExecutorTool 章节）
- PRD：`docs/v6/01-requirements.md`（3.1.3 节）
- 现有工具示例：`src/tools/base.ts`（BaseTool 基类）
- 现有工具：`src/core/work-dir-manager.ts`（工作目录管理）
- Task 01 产出：`src/tools/tool-registry.ts`（V6ToolDefinition、ToolPermission）

---

## 输出

**新增文件**：
- `src/tools/builtin/shell-executor.ts` - ShellExecutorTool 主类
- `tests/tools/shell-executor.test.ts` - 单元测试

---

## 实现步骤

### Step 1：命令安全检查模块（1.5h）

在 `src/tools/builtin/shell-executor.ts` 中定义安全策略：

**黑名单（直接拒绝）**：
```typescript
const BLACKLIST_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\//,               // rm -rf /
  /rm\s+-rf\s+--no-preserve-root/, // rm -rf --no-preserve-root
  /\:\(\)\s*\{.*\:\|.*\&/,       // fork bomb :(){ :|:& };:
  /mkfs\./,                      // 格式化磁盘
  /dd\s+if=/,                    // dd 危险操作
  /chmod\s+-R\s+777\s+\//,       // chmod -R 777 /
  />\s*\/dev\/sda/,              // 写入裸磁盘
];

// 检查是否为黑名单命令
function isBlacklisted(command: string): boolean {
  return BLACKLIST_PATTERNS.some(pattern => pattern.test(command));
}
```

**警告列表（需确认）**：
```typescript
const WARNING_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /rm\s+-rf/, reason: '递归删除文件，可能导致数据丢失' },
  { pattern: /sudo\s+/, reason: '使用超级用户权限' },
  { pattern: /curl.*\|\s*sh/, reason: '从网络下载并直接执行脚本' },
  { pattern: /wget.*\|\s*sh/, reason: '从网络下载并直接执行脚本' },
  { pattern: /npm\s+install\s+-g/, reason: '全局安装 npm 包' },
  { pattern: /pip\s+install/, reason: '安装 Python 包' },
];

function getDangerousWarnings(command: string): string[] {
  return WARNING_PATTERNS
    .filter(w => w.pattern.test(command))
    .map(w => w.reason);
}
```

### Step 2：工作目录安全检查（0.5h）

```typescript
import * as path from 'path';

function resolveWorkDir(
  workspaceRoot: string,
  cwd?: string
): string {
  if (!cwd) return workspaceRoot;

  const resolved = path.resolve(workspaceRoot, cwd);

  // 防止路径穿越
  if (!resolved.startsWith(workspaceRoot)) {
    throw new Error(
      `Path traversal detected: cwd must be within workspace root`
    );
  }

  return resolved;
}
```

### Step 3：ShellExecutorTool 主类（2h）

创建 `src/tools/builtin/shell-executor.ts`，继承 `BaseTool`：

**构造函数**接受 `workDirManager: WorkDirManager`

**工具定义**：
```typescript
{
  name: 'shell_execute',
  description: '在工作空间目录内安全执行 Shell 命令，返回标准输出和错误输出',
  category: ToolCategory.SHELL,
  permissions: [ToolPermission.SHELL],
  version: '1.0.0',
  tags: ['shell', 'command', 'execute', 'bash'],
  dangerous: true,
  schema: z.object({
    command: z.string().min(1),
    cwd: z.string().optional(),
    env: z.record(z.string()).optional(),
    timeout: z.number().min(1).max(300).optional(),
    maxOutputSize: z.number().optional(),
  }),
}
```

**executeImpl 逻辑**：

1. 黑名单检查：调用 `isBlacklisted(command)`，命中则直接返回安全错误
2. 警告检查：调用 `getDangerousWarnings(command)`，生成警告信息（记录到审计日志，当前版本继续执行）
3. 工作目录解析：调用 `resolveWorkDir()` 确保在工作空间内
4. 使用 `child_process.spawn` 执行命令（shell 模式：`spawn('/bin/sh', ['-c', command])`）
5. 超时处理：
   ```typescript
   const timer = setTimeout(() => {
     child.kill('SIGKILL');
     timedOut = true;
   }, (params.timeout ?? 30) * 1000);
   ```
6. 收集 stdout/stderr（拼接 Buffer），超过 maxOutputSize 时截断
7. 等待进程结束（`on('close')`），返回 exitCode、stdout、stderr、timedOut、executionTime、truncated
8. 写入审计日志（结构化 JSON）

**审计日志格式**：
```typescript
interface ShellAuditLog {
  timestamp: string;
  command: string;
  cwd: string;
  exitCode: number;
  executionTime: number;
  timedOut: boolean;
  warnings: string[];
}
```

### Step 4：单元测试（1h）

在 `tests/tools/shell-executor.test.ts` 覆盖：
- 基础执行：`echo "hello"` 返回正确 stdout
- 退出码：失败命令返回非 0 exitCode
- 超时：长时间运行的命令在设定时间后被终止
- 黑名单：`rm -rf /` 被拒绝，返回安全错误
- 路径限制：`cwd: '../../'` 返回路径穿越错误
- 输出截断：超过 maxOutputSize 时 truncated = true
- 环境变量注入：通过 env 注入的变量在命令中可用

---

## 验收标准

- [ ] `echo "hello"` 正确返回 stdout = "hello\n"，exitCode = 0
- [ ] 超时命令在设定秒数后被强制终止，timedOut = true
- [ ] `rm -rf /` 被拒绝，返回安全错误，不执行命令
- [ ] `cwd: '../../etc'` 返回路径穿越错误
- [ ] 输出超过 maxOutputSize 时 truncated = true
- [ ] executionTime 字段正确反映实际执行毫秒数
- [ ] 通过 `ToolRegistry.execute('shell_execute', params)` 可正常调用
- [ ] 单元测试覆盖率 > 80%

---

## 注意事项

- 使用 `spawn('/bin/sh', ['-c', command])` 执行命令（支持 Shell 特性），但命令字符串本身不做拼接
- 审计日志文件位置：`{workspaceRoot}/.audit/shell-commands.jsonl`（每行一条 JSON）
- 当前版本：警告列表命令记录警告但不阻止执行（v7 可加入用户确认机制）
- 进程 kill 使用 `SIGKILL` 确保强制终止（防止进程忽略 SIGTERM）
- 测试时 Mock `child_process.spawn`，避免真实执行系统命令
