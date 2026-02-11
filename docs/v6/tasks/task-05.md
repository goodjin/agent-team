# Task 05：CodeSandboxTool - 代码沙箱

**优先级**: P1
**预估工时**: 5h
**依赖**: Task 01（ToolRegistry 增强）
**状态**: 待开发

---

## 目标

实现 CodeSandboxTool，在隔离的 Node.js vm 沙箱或 Python 子进程中安全执行代码片段，返回执行结果，含超时控制和模块访问限制。

---

## 输入

- 架构文档：`docs/v6/02-architecture.md`（CodeSandboxTool 章节）
- PRD：`docs/v6/01-requirements.md`（3.2.1 节）
- 现有工具示例：`src/tools/base.ts`（BaseTool 基类）
- Task 01 产出：`src/tools/tool-registry.ts`（V6ToolDefinition、ToolPermission）

---

## 输出

**新增文件**：
- `src/tools/builtin/code-sandbox.ts` - CodeSandboxTool 主类
- `tests/tools/code-sandbox.test.ts` - 单元测试

---

## 实现步骤

### Step 1：Node.js vm 沙箱实现（2h）

在 `src/tools/builtin/code-sandbox.ts` 中实现 `executeNodejs()` 私有方法：

```typescript
import * as vm from 'vm';

interface SandboxOutput {
  output: string;
  returnValue?: any;
  error?: string;
  executionTime: number;
  timedOut: boolean;
}

async function executeNodejs(
  code: string,
  timeout: number
): Promise<SandboxOutput> {
  const startTime = Date.now();
  const outputBuffer: string[] = [];

  // 构造安全的沙箱上下文
  const sandbox = {
    // 允许的全局对象
    console: {
      log: (...args: any[]) => outputBuffer.push(args.map(String).join(' ')),
      error: (...args: any[]) => outputBuffer.push('[error] ' + args.map(String).join(' ')),
      warn: (...args: any[]) => outputBuffer.push('[warn] ' + args.map(String).join(' ')),
    },
    Math,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Date,
    RegExp,
    Error,
    Map,
    Set,
    Promise,
    setTimeout: (fn: Function, ms: number) => {
      // 允许短时间的 setTimeout（最多 100ms）
      if (ms > 100) throw new Error('setTimeout delay too long in sandbox');
      return globalThis.setTimeout(fn, ms);
    },
    clearTimeout,
    // 明确禁止：不注入 require、process、__dirname、__filename、fetch
  };

  try {
    const script = new vm.Script(code, {
      filename: 'sandbox.js',
      lineOffset: 0,
    });

    const context = vm.createContext(sandbox);
    const returnValue = await Promise.race([
      Promise.resolve(script.runInContext(context, { timeout: timeout * 1000 })),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), timeout * 1000 + 100)
      ),
    ]);

    return {
      output: outputBuffer.join('\n'),
      returnValue,
      executionTime: Date.now() - startTime,
      timedOut: false,
    };
  } catch (err: any) {
    const isTimeout = err.message === 'TIMEOUT' ||
      err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT';
    return {
      output: outputBuffer.join('\n'),
      error: err.stack ?? err.message,
      executionTime: Date.now() - startTime,
      timedOut: isTimeout,
    };
  }
}
```

### Step 2：Python 子进程实现（1.5h）

实现 `executePython()` 私有方法：

```typescript
import { spawn } from 'child_process';

async function executePython(
  code: string,
  timeout: number,
  stdin?: string
): Promise<SandboxOutput> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    // 使用 python3 执行代码，--isolated 禁用用户级 site-packages
    const child = spawn('python3', ['--isolated', '-c', code], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH,
        // 不传递其他环境变量
      },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      timedOut = true;
    }, timeout * 1000);

    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', () => {
      clearTimeout(timer);
      resolve({
        output: stdout,
        error: stderr || undefined,
        executionTime: Date.now() - startTime,
        timedOut,
      });
    });
  });
}
```

### Step 3：CodeSandboxTool 主类（1h）

创建 CodeSandboxTool 类，继承 `BaseTool`：

**工具定义**：
```typescript
{
  name: 'code_execute',
  description: '在隔离沙箱中执行 Node.js 或 Python 代码，返回标准输出和执行结果',
  category: ToolCategory.CODE,
  permissions: [ToolPermission.CODE_EXEC],
  version: '1.0.0',
  tags: ['code', 'execute', 'sandbox', 'nodejs', 'python'],
  schema: z.object({
    code: z.string().min(1),
    language: z.enum(['nodejs', 'python']),
    timeout: z.number().min(1).max(30).optional(),
    memoryLimit: z.number().optional(),  // 预留，当前版本未实现
    stdin: z.string().optional(),
  }),
}
```

**executeImpl 逻辑**：
1. 根据 `language` 分发到 `executeNodejs()` 或 `executePython()`
2. 将结果转换为 `ToolResult` 格式

```typescript
return {
  success: !result.error || result.timedOut === false,
  data: {
    output: result.output,
    error: result.error,
    returnValue: result.returnValue,
    executionTime: result.executionTime,
    timedOut: result.timedOut,
  } as CodeExecuteResponse,
};
```

### Step 4：单元测试（0.5h）

在 `tests/tools/code-sandbox.test.ts` 覆盖：

**Node.js 场景**：
- `1 + 1` 表达式返回 returnValue = 2
- `console.log("hello")` 返回 output = "hello"
- `require('fs')` 抛出 "require is not defined" 错误
- `process.env` 抛出 "process is not defined" 错误
- 超时代码（`while(true){}`）在 timeout 后返回 timedOut = true

**Python 场景**：
- `print("hello")` 返回 output = "hello\n"
- `1/0` 返回包含 ZeroDivisionError 的 error 信息
- 超时代码（`while True: pass`）在 timeout 后返回 timedOut = true

---

## 验收标准

- [ ] Node.js：`1 + 1` 返回 returnValue = 2
- [ ] Node.js：`console.log("hello")` 返回 output 包含 "hello"
- [ ] Node.js：`require('fs')` 返回含 "require is not defined" 的错误
- [ ] Node.js：`process.env` 返回含 "process is not defined" 的错误
- [ ] Python：`print("hello")` 返回 output = "hello\n"
- [ ] Python：`import os; os.system("ls")` 被允许但受限（注：Python 沙箱相对宽松，主要靠超时和独立进程保护）
- [ ] 超时代码在设定时间后被终止，timedOut = true
- [ ] 运行时错误包含错误类型和行号信息
- [ ] 通过 `ToolRegistry.execute('code_execute', params)` 可正常调用
- [ ] 单元测试覆盖率 > 80%

---

## 注意事项

- Node.js vm 模块存在已知的沙箱逃逸风险（如通过 `({}).constructor.constructor` 访问 Function）。当前版本适用于受信任场景；生产环境建议升级为 Docker 隔离（v7 规划）
- Python 沙箱通过独立进程实现，隔离性比 Node.js vm 更强，但无法完全阻止系统调用
- `--isolated` 标志可禁用 Python 用户 site-packages，但系统标准库仍可访问（这是预期行为）
- vm 的 timeout 参数（毫秒）控制同步代码超时；异步代码需要额外的 Promise.race 超时
- 测试 Python 功能时需要系统安装 python3
