import { describe, it, expect } from 'vitest';
import {
  AnalyzeCodeTool,
  DetectCodeSmellsTool,
  DiffTool,
  GetImportsTool,
} from '../src/tools/code-analysis.js';

describe('Code Analysis Tools', () => {
  describe('AnalyzeCodeTool', () => {
    it('should analyze code structure', async () => {
      const tool = new AnalyzeCodeTool();
      const code = `
function exampleFunction(param1: string, param2: number): void {
  console.log(param1, param2);
}

class ExampleClass {
  private prop1: string;
  public prop2: number;

  constructor() {}

  method1() {
    return true;
  }
}
`;

      const result = await tool.execute({ code });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('structure');
      expect(result.data.structure).toHaveProperty('functions');
      expect(result.data.structure).toHaveProperty('classes');
      expect(result.data.structure).toHaveProperty('imports');
      expect(result.data).toHaveProperty('complexity');
    });

    it('should analyze code from file path', async () => {
      const tool = new AnalyzeCodeTool();
      const result = await tool.execute({
        filePath: '/path/to/file.ts',
        code: 'const x = 1;',
      });

      expect(result.success).toBe(true);
      expect(result.data.filePath).toBe('/path/to/file.ts');
    });

    it('should calculate complexity metrics', async () => {
      const tool = new AnalyzeCodeTool();
      const result = await tool.execute({
        code: 'function test() { if (true) { while (false) { } } }',
      });

      expect(result.success).toBe(true);
      expect(result.data.complexity).toHaveProperty('cyclomatic');
      expect(result.data.complexity).toHaveProperty('cognitive');
    });
  });

  describe('DetectCodeSmellsTool', () => {
    it('should detect long files', async () => {
      const tool = new DetectCodeSmellsTool();
      const longCode = Array(1100).fill('// line').join('\n');

      const result = await tool.execute({ code: longCode });

      expect(result.success).toBe(true);
      expect(result.data.summary.total).toBeGreaterThan(0);
      expect(result.data.smells.some(s => s.type === 'long-file')).toBe(true);
    });

    it('should detect use of var or any', async () => {
      const tool = new DetectCodeSmellsTool();
      const code = 'var x: any = 1;';

      const result = await tool.execute({ code });

      expect(result.success).toBe(true);
      expect(result.data.smells.some(s => s.type === 'anti-pattern')).toBe(true);
    });

    it('should return empty smells for clean code', async () => {
      const tool = new DetectCodeSmellsTool();
      const cleanCode = `
function calculateSum(a: number, b: number): number {
  return a + b;
}

const result = calculateSum(1, 2);
console.log(result);
`;

      const result = await tool.execute({ code: cleanCode });

      expect(result.success).toBe(true);
      expect(result.data.summary.total).toBe(0);
    });

    it('should categorize smells by severity', async () => {
      const tool = new DetectCodeSmellsTool();
      const code = Array(1100).fill('var x: any = 1;').join('\n');

      const result = await tool.execute({ code });

      expect(result.success).toBe(true);
      expect(result.data.summary.bySeverity).toHaveProperty('high');
      expect(result.data.summary.bySeverity).toHaveProperty('medium');
      expect(result.data.summary.bySeverity).toHaveProperty('low');
    });
  });

  describe('DiffTool', () => {
    it('should compare two code snippets', async () => {
      const tool = new DiffTool();
      const result = await tool.execute({
        oldCode: 'const x = 1;',
        newCode: 'const x = 2;',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('hunks');
      expect(result.data).toHaveProperty('stats');
      expect(result.data.stats.additions).toBe(0);
      expect(result.data.stats.deletions).toBe(0);
      expect(result.data.stats.modifications).toBe(1);
    });

    it('should detect additions', async () => {
      const tool = new DiffTool();
      const result = await tool.execute({
        oldCode: 'const x = 1;',
        newCode: 'const x = 1;\nconst y = 2;',
      });

      expect(result.success).toBe(true);
      expect(result.data.stats.additions).toBe(1);
    });

    it('should detect deletions', async () => {
      const tool = new DiffTool();
      const result = await tool.execute({
        oldCode: 'const x = 1;\nconst y = 2;',
        newCode: 'const x = 1;',
      });

      expect(result.success).toBe(true);
      expect(result.data.stats.deletions).toBe(1);
    });

    it('should report identical when no changes', async () => {
      const tool = new DiffTool();
      const code = 'const x = 1;';
      const result = await tool.execute({
        oldCode: code,
        newCode: code,
      });

      expect(result.success).toBe(true);
      expect(result.data.stats.totalChanges).toBe(0);
    });

    it('should require both old and new code', async () => {
      const tool = new DiffTool();

      const result = await tool.execute({
        oldCode: 'test',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('GetImportsTool', () => {
    it('should extract default imports', async () => {
      const tool = new GetImportsTool();
      const code = `
import React from 'react';
import lodash from 'lodash';
`;

      const result = await tool.execute({ code });

      expect(result.success).toBe(true);
      expect(result.data.imports.length).toBe(2);
      expect(result.data.imports[0].module).toBe('react');
    });

    it('should extract named imports', async () => {
      const tool = new GetImportsTool();
      const code = `
import { useState, useEffect } from 'react';
import { Component } from 'react';
`;

      const result = await tool.execute({ code });

      expect(result.success).toBe(true);
      expect(result.data.imports[0].named).toContain('useState');
      expect(result.data.imports[0].named).toContain('useEffect');
    });

    it('should detect type-only imports', async () => {
      const tool = new GetImportsTool();
      const code = "import type { User } from './types';";

      const result = await tool.execute({ code });

      expect(result.success).toBe(true);
      expect(result.data.imports[0].isTypeOnly).toBe(true);
    });

    it('should extract wildcard imports', async () => {
      const tool = new GetImportsTool();
      const code = "import * as utilities from './utils';";

      const result = await tool.execute({ code });

      expect(result.success).toBe(true);
      expect(result.data.imports.length).toBe(1);
    });

    it('should handle mixed imports', async () => {
      const tool = new GetImportsTool();
      const code = `
import React, { useState } from 'react';
import * as lodash from 'lodash';
import MyClass from './my-class';
`;

      const result = await tool.execute({ code });

      expect(result.success).toBe(true);
      expect(result.data.imports.length).toBe(3);
    });
  });

  describe('Tool Definitions', () => {
    it('should have correct category', () => {
      expect(new AnalyzeCodeTool().getDefinition().category).toBe('code');
      expect(new DetectCodeSmellsTool().getDefinition().category).toBe('code');
      expect(new DiffTool().getDefinition().category).toBe('code');
      expect(new GetImportsTool().getDefinition().category).toBe('code');
    });
  });
});
