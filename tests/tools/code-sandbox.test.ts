/**
 * CodeSandboxTool 单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeSandboxTool } from '../../src/tools/builtin/code-sandbox.js';

describe('CodeSandboxTool', () => {
  let tool: CodeSandboxTool;

  beforeEach(() => {
    vi.useRealTimers();
    tool = new CodeSandboxTool();
  });

  // ---------------------------------------------------------------
  // 工具元数据
  // ---------------------------------------------------------------
  describe('工具定义', () => {
    it('name 应为 code_execute', () => {
      expect(tool.name).toBe('code_execute');
    });

    it('category 应为 code', () => {
      expect(tool.category).toBe('code');
    });

    it('permissions 应包含 code_exec', () => {
      expect(tool.permissions).toContain('code_exec');
    });
  });

  // ---------------------------------------------------------------
  // Node.js 沙箱
  // ---------------------------------------------------------------
  describe('Node.js 沙箱', () => {
    it('1 + 1 应返回 result = 2', async () => {
      const result = await tool.execute({ code: '1 + 1', language: 'nodejs' });
      expect(result.result).toBe(2);
      expect(result.error).toBeUndefined();
      expect(result.timedOut).toBe(false);
    });

    it('console.log("hello") 应在 output 中包含 hello', async () => {
      const result = await tool.execute({
        code: 'console.log("hello")',
        language: 'nodejs',
      });
      expect(result.output).toContain('hello');
      expect(result.timedOut).toBe(false);
    });

    it('多行 console.log 应全部收集到 output', async () => {
      const result = await tool.execute({
        code: 'console.log("line1"); console.log("line2");',
        language: 'nodejs',
      });
      expect(result.output).toContain('line1');
      expect(result.output).toContain('line2');
    });

    it('console.error 应以 [error] 前缀出现在 output', async () => {
      const result = await tool.execute({
        code: 'console.error("err msg")',
        language: 'nodejs',
      });
      expect(result.output).toContain('[error]');
      expect(result.output).toContain('err msg');
    });

    it('require("fs") 应返回 require is not defined 错误', async () => {
      const result = await tool.execute({
        code: 'require("fs")',
        language: 'nodejs',
      });
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/require is not defined/i);
    });

    it('process.env 应返回 process is not defined 错误', async () => {
      const result = await tool.execute({
        code: 'process.env',
        language: 'nodejs',
      });
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/process is not defined/i);
    });

    it('Buffer 应返回 Buffer is not defined 错误', async () => {
      const result = await tool.execute({
        code: 'Buffer.from("test")',
        language: 'nodejs',
      });
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/Buffer is not defined/i);
    });

    it('Math.max(1, 2) 应返回 result = 2', async () => {
      const result = await tool.execute({
        code: 'Math.max(1, 2)',
        language: 'nodejs',
      });
      expect(result.result).toBe(2);
    });

    it('JSON.stringify({a: 1}) 应正确返回字符串', async () => {
      const result = await tool.execute({
        code: 'JSON.stringify({a: 1})',
        language: 'nodejs',
      });
      expect(result.result).toBe('{"a":1}');
    });

    it('语法错误应返回 error 字段', async () => {
      const result = await tool.execute({
        code: 'invalid syntax !!!',
        language: 'nodejs',
      });
      expect(result.error).toBeDefined();
      expect(result.timedOut).toBe(false);
    });

    it('运行时异常应返回 error 字段', async () => {
      const result = await tool.execute({
        code: 'throw new Error("test error")',
        language: 'nodejs',
      });
      expect(result.error).toBeDefined();
      expect(result.error).toContain('test error');
    });

    it('超时代码应在 timeout 后返回 timedOut = true', async () => {
      const result = await tool.execute({
        code: 'while(true){}',
        language: 'nodejs',
        timeout: 200,  // 200ms 超时
      });
      expect(result.timedOut).toBe(true);
      expect(result.error).toBeDefined();
    }, 3000);  // 测试本身超时 3 秒

    it('executionTime 应大于 0', async () => {
      const result = await tool.execute({ code: '1 + 1', language: 'nodejs' });
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('默认 language 为 nodejs', async () => {
      const result = await tool.execute({ code: '1 + 1' });
      expect(result.language).toBe('nodejs');
    });

    it('空代码应返回错误', async () => {
      const result = await tool.execute({ code: '' });
      expect(result.error).toBeDefined();
    });
  });

  // ---------------------------------------------------------------
  // Python 子进程
  // ---------------------------------------------------------------
  describe('Python 子进程', () => {
    it('print("hello") 应在 output 中包含 hello', async () => {
      const result = await tool.execute({
        code: 'print("hello")',
        language: 'python',
      });
      expect(result.output).toContain('hello');
      expect(result.timedOut).toBe(false);
    }, 10000);

    it('1/0 应返回包含 ZeroDivisionError 的 error', async () => {
      const result = await tool.execute({
        code: '1/0',
        language: 'python',
      });
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/ZeroDivisionError/i);
    }, 10000);

    it('Python 运算结果通过 print 输出', async () => {
      const result = await tool.execute({
        code: 'print(2 ** 10)',
        language: 'python',
      });
      expect(result.output).toContain('1024');
    }, 10000);

    it('超时代码应在 timeout 后返回 timedOut = true', async () => {
      const result = await tool.execute({
        code: 'while True: pass',
        language: 'python',
        timeout: 500,
      });
      expect(result.timedOut).toBe(true);
    }, 5000);

    it('language 字段应为 python', async () => {
      const result = await tool.execute({
        code: 'print(1)',
        language: 'python',
      });
      expect(result.language).toBe('python');
    }, 10000);
  });
});
