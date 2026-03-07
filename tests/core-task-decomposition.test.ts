import { describe, it, expect, beforeEach } from 'vitest';
import {
  TaskDecompositionEngine,
  createTaskDecompositionEngine,
  type DecompositionResult,
  type SubTask,
  type TaskDecompositionConfig,
} from '../src/core/task-decomposition.js';
import type { TaskType, RoleType } from '../src/types/index.js';

describe('TaskDecompositionEngine', () => {
  let engine: TaskDecompositionEngine;

  beforeEach(() => {
    engine = createTaskDecompositionEngine();
  });

  describe('constructor', () => {
    it('should create engine with default config', () => {
      expect(engine).toBeDefined();
    });

    it('should accept custom config', () => {
      const config: TaskDecompositionConfig = {
        enableParallelAnalysis: true,
        enableComplexityEstimation: true,
      };
      const customEngine = new TaskDecompositionEngine(config);
      expect(customEngine).toBeDefined();
    });
  });

  describe('decompose', () => {
    it('should decompose development task', () => {
      const result = engine.decompose('开发一个用户认证系统', {
        taskType: 'development',
      });

      expect(result.tasks.length).toBeGreaterThan(0);
      expect(result.originalTask).toBe('开发一个用户认证系统');
    });

    it('should decompose requirement analysis task', () => {
      const result = engine.decompose('分析电商平台需求', {
        taskType: 'requirement-analysis',
      });

      expect(result.tasks.length).toBeGreaterThan(0);
      expect(result.tasks[0].type).toBe('requirement-analysis');
    });

    it('should decompose architecture design task', () => {
      const result = engine.decompose('设计微服务架构', {
        taskType: 'architecture-design',
      });

      expect(result.tasks.length).toBeGreaterThan(0);
      expect(result.tasks.some(t => t.type === 'architecture-design')).toBe(true);
    });

    it('should decompose bug fix task', () => {
      const result = engine.decompose('修复登录页面崩溃问题', {
        taskType: 'bug-fix',
      });

      expect(result.tasks.length).toBeGreaterThan(0);
      // Bug fix should include reproduce, locate, fix, verify
      const taskTypes = result.tasks.map(t => t.type);
      expect(taskTypes).toContain('bug-fix');
      expect(taskTypes).toContain('testing');
    });

    it('should infer task type from description', () => {
      const result = engine.decompose('分析产品需求');
      expect(result.tasks[0].type).toBe('requirement-analysis');
    });

    it('should generate valid task IDs', () => {
      const result = engine.decompose('开发功能');
      
      const ids = result.tasks.map(t => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length); // All unique
    });

    it('should set correct dependencies', () => {
      const result = engine.decompose('开发一个完整功能');
      
      // 依赖关系应该是链式的，每个任务依赖其前面的任务
      // 验证：除了第一个任务外，其他任务都应该有依赖
      for (let i = 1; i < result.tasks.length; i++) {
        const task = result.tasks[i];
        expect(task.dependencies.length).toBeGreaterThan(0);
      }
    });
  });

  describe('metadata', () => {
    it('should include complexity in metadata', () => {
      const result = engine.decompose('开发一个完整功能');
      
      expect(result.metadata.complexity).toBeDefined();
      expect(['simple', 'moderate', 'complex']).toContain(result.metadata.complexity);
    });

    it('should include parallelizable tasks', () => {
      const result = engine.decompose('开发功能');
      
      expect(result.metadata.parallelizable).toBeDefined();
      expect(Array.isArray(result.metadata.parallelizable)).toBe(true);
    });

    it('should include critical path', () => {
      const result = engine.decompose('开发功能');
      
      expect(result.metadata.criticalPath).toBeDefined();
      expect(Array.isArray(result.metadata.criticalPath)).toBe(true);
    });

    it('should include estimated duration', () => {
      const result = engine.decompose('开发功能');
      
      expect(result.metadata.estimatedTotalDuration).toBeDefined();
      expect(result.metadata.estimatedTotalDuration).toBeGreaterThan(0);
    });
  });

  describe('toTasks', () => {
    it('should convert decomposition to Task array', () => {
      const result = engine.decompose('开发功能');
      const tasks = engine.toTasks(result);
      
      expect(tasks.length).toBe(result.tasks.length);
      expect(tasks[0].id).toBe(result.tasks[0].id);
      expect(tasks[0].status).toBe('pending');
    });
  });

  describe('toJSON', () => {
    it('should output JSON format with required fields', () => {
      const result = engine.decompose('开发功能');
      const json = engine.toJSON(result);
      
      expect(json.length).toBeGreaterThan(0);
      expect(json[0]).toHaveProperty('title');
      expect(json[0]).toHaveProperty('description');
      expect(json[0]).toHaveProperty('dependencies');
    });
  });

  describe('strategies', () => {
    it('should list available strategies', () => {
      const names = engine.getStrategyNames();
      expect(names).toContain('default');
    });
  });

  describe('decomposeRequirementAnalysis', () => {
    it('should create 3 subtasks for requirement analysis', () => {
      const result = engine.decompose('分析项目需求', { taskType: 'requirement-analysis' });
      
      // Should have: collect, feasibility, document
      expect(result.tasks.length).toBeGreaterThanOrEqual(3);
      expect(result.tasks.length).toBeLessThanOrEqual(5);
    });

    it('should assign correct roles', () => {
      const result = engine.decompose('分析项目需求', { taskType: 'requirement-analysis' });
      
      const roles = result.tasks.map(t => t.assignedRole);
      expect(roles.every(r => r === 'product-manager')).toBe(true);
    });
  });

  describe('decomposeDevelopment', () => {
    it('should include both development and testing tasks', () => {
      const result = engine.decompose('开发新功能', { taskType: 'development' });
      
      const types = result.tasks.map(t => t.type);
      expect(types).toContain('development');
      expect(types).toContain('testing');
    });

    it('should have proper dependency chain', () => {
      const result = engine.decompose('开发新功能', { taskType: 'development' });
      
      // 最后一个任务应该依赖之前的任务
      const lastTask = result.tasks[result.tasks.length - 1];
      expect(lastTask.dependencies.length).toBeGreaterThan(0);
    });
  });

  describe('decomposeBugFix', () => {
    it('should create bug fix workflow', () => {
      const result = engine.decompose('修复登录Bug', { taskType: 'bug-fix' });
      
      const titles = result.tasks.map(t => t.title);
      expect(titles.some(t => t.includes('复现') || t.includes('Reproduce'))).toBe(true);
      expect(titles.some(t => t.includes('定位') || t.includes('Locate'))).toBe(true);
      expect(titles.some(t => t.includes('修复') || t.includes('Fix'))).toBe(true);
      expect(titles.some(t => t.includes('验证') || t.includes('Verify'))).toBe(true);
    });
  });
});
