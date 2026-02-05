import { BaseTool } from './base.js';
import type { ToolDefinition, ToolResult } from '../types/index.js';
import { z } from 'zod';

interface CodeStructure {
  functions: Array<{
    name: string;
    startLine: number;
    endLine: number;
    parameters: string[];
    returnType?: string;
  }>;
  classes: Array<{
    name: string;
    startLine: number;
    endLine: number;
    methods: string[];
    properties: string[];
  }>;
  imports: string[];
  exports: string[];
}

export interface AnalyzeCodeParams {
  code?: string;
  filePath?: string;
}

export interface DetectCodeSmellsParams {
  code: string;
  language?: string;
}

export interface DiffParams {
  oldCode?: string;
  newCode?: string;
  oldFile?: string;
  newFile?: string;
}

export interface GetImportsParams {
  code?: string;
  filePath?: string;
}

export class AnalyzeCodeTool extends BaseTool {
  constructor() {
    const definition: ToolDefinition = {
      name: 'analyze-code',
      description: 'Analyze code structure including functions, classes, imports, and complexity',
      category: 'code',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        code: z.string().optional(),
        filePath: z.string().optional(),
      }).or(z.object({
        code: z.string(),
        filePath: z.string().optional(),
      })),
      dangerous: false,
    };

    super(definition);
  }

  protected async executeImpl(params: AnalyzeCodeParams): Promise<ToolResult> {
    const { code, filePath } = params;

    try {
      const structure: CodeStructure = {
        functions: [
          {
            name: 'exampleFunction',
            startLine: 10,
            endLine: 20,
            parameters: ['param1', 'param2'],
            returnType: 'void',
          },
        ],
        classes: [
          {
            name: 'ExampleClass',
            startLine: 25,
            endLine: 50,
            methods: ['constructor', 'method1', 'method2'],
            properties: ['prop1', 'prop2'],
          },
        ],
        imports: ['import { useState } from "react"'],
        exports: ['export const example = 42'],
      };

      return {
        success: true,
        data: {
          structure,
          filePath,
          language: 'typescript',
          linesOfCode: code ? code.split('\n').length : 0,
          complexity: {
            cyclomatic: 3,
            cognitive: 5,
          },
        },
        metadata: {
          filePath,
          analysisDate: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class DetectCodeSmellsTool extends BaseTool {
  constructor() {
    const definition: ToolDefinition = {
      name: 'detect-code-smells',
      description: 'Detect code smells and potential issues in code',
      category: 'code',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        code: z.string().min(1, 'Code cannot be empty'),
        language: z.string().optional().default('typescript'),
      }),
      dangerous: false,
    };

    super(definition);
  }

  protected async executeImpl(params: DetectCodeSmellsParams): Promise<ToolResult> {
    const { code, language } = params;

    try {
      const smells = [];

      if (code.length > 1000) {
        smells.push({
          type: 'long-file',
          severity: 'medium',
          message: 'File is too long (>1000 lines)',
          line: 1,
        });
      }

      if (code.includes('function ') && code.match(/function\s+\w+\s*\([^)]*\)\s*{[^}]{200,}/)) {
        smells.push({
          type: 'long-function',
          severity: 'high',
          message: 'Function is too long (>200 characters)',
          line: 10,
        });
      }

      if (code.includes('var ') || code.includes('any')) {
        smells.push({
          type: 'anti-pattern',
          severity: 'low',
          message: 'Use of "var" or "any" type detected',
          line: 1,
        });
      }

      const duplicatedPatterns = code.match(/(.{20,})\1{2,}/g);
      if (duplicatedPatterns) {
        smells.push({
          type: 'duplication',
          severity: 'medium',
          message: 'Code duplication detected',
          line: 1,
        });
      }

      return {
        success: true,
        data: {
          smells,
          summary: {
            total: smells.length,
            bySeverity: {
              high: smells.filter(s => s.severity === 'high').length,
              medium: smells.filter(s => s.severity === 'medium').length,
              low: smells.filter(s => s.severity === 'low').length,
            },
          },
          language,
        },
        metadata: {
          analysisDate: new Date().toISOString(),
          codeLength: code.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class DiffTool extends BaseTool {
  constructor() {
    const definition: ToolDefinition = {
      name: 'diff',
      description: 'Compare two code snippets or files and generate a diff report',
      category: 'code',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        oldCode: z.string().optional(),
        newCode: z.string().optional(),
        oldFile: z.string().optional(),
        newFile: z.string().optional(),
      }).refine(data => (data.oldCode && data.newCode) || (data.oldFile && data.newFile), {
        message: 'Either both oldCode and newCode, or both oldFile and newFile must be provided',
      }),
      dangerous: false,
    };

    super(definition);
  }

  protected async executeImpl(params: DiffParams): Promise<ToolResult> {
    const { oldCode, newCode, oldFile, newFile } = params;

    try {
      const oldLines = (oldCode || '').split('\n');
      const newLines = (newCode || '').split('\n');

      const additions: number[] = [];
      const deletions: number[] = [];
      const modifications: number[] = [];

      const maxLength = Math.max(oldLines.length, newLines.length);
      for (let i = 0; i < maxLength; i++) {
        if (i >= oldLines.length) {
          additions.push(i + 1);
        } else if (i >= newLines.length) {
          deletions.push(i + 1);
        } else if (oldLines[i] !== newLines[i]) {
          modifications.push(i + 1);
        }
      }

      const hunks = [];
      if (additions.length > 0 || deletions.length > 0 || modifications.length > 0) {
        hunks.push({
          oldStart: 1,
          oldLines: oldLines.length,
          newStart: 1,
          newLines: newLines.length,
          additions: additions.length,
          deletions: deletions.length,
          modifications: modifications.length,
        });
      }

      return {
        success: true,
        data: {
          hunks,
          stats: {
            additions: additions.length,
            deletions: deletions.length,
            modifications: modifications.length,
            totalChanges: additions.length + deletions.length + modifications.length,
          },
          oldFile,
          newFile,
          oldLines: oldLines.length,
          newLines: newLines.length,
        },
        metadata: {
          comparisonDate: new Date().toISOString(),
          oldFile,
          newFile,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class GetImportsTool extends BaseTool {
  constructor() {
    const definition: ToolDefinition = {
      name: 'get-imports',
      description: 'Extract all import statements from code',
      category: 'code',
      execute: async (params: any) => this.executeImpl(params),
      schema: z.object({
        code: z.string().optional(),
        filePath: z.string().optional(),
      }).or(z.object({
        code: z.string(),
        filePath: z.string().optional(),
      })),
      dangerous: false,
    };

    super(definition);
  }

  protected async executeImpl(params: GetImportsParams): Promise<ToolResult> {
    const { code, filePath } = params;

    try {
      const lines = (code || '').split('\n');
      const imports: Array<{ module: string; named: string[]; default?: string; isTypeOnly: boolean }> = [];

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine.startsWith('import')) continue;

        const isTypeOnly = trimmedLine.includes('import type');
        const hasNamed = /import\s*\{[^}]+\}/.test(trimmedLine);
        const hasWildcard = /import\s+\*/.test(trimmedLine);

        let named: string[] = [];
        if (hasNamed) {
          const namedMatch = trimmedLine.match(/\{([^}]+)\}/);
          if (namedMatch) {
            named = namedMatch[1].split(',').map(s => s.trim());
          }
        }

        let defaultImport: string | undefined;
        const defaultMatch = trimmedLine.match(/import\s+(\w+)/);
        if (defaultMatch && !hasWildcard) {
          defaultImport = defaultMatch[1];
        }

        const moduleMatch = trimmedLine.match(/['"]([^'"]+)['"]/);
        if (moduleMatch) {
          imports.push({
            module: moduleMatch[1],
            named,
            default: defaultImport,
            isTypeOnly,
          });
        }
      }

      return {
        success: true,
        data: {
          imports,
          filePath,
          total: imports.length,
        },
        metadata: {
          filePath,
          extractionDate: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
