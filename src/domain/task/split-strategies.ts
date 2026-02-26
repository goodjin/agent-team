import { Task } from './task.entity.js';
import { generateId } from '../../infrastructure/utils/id.js';

export type SplitStrategy = 'role-based' | 'module-based' | 'step-based';

export interface ComplexityResult {
  level: 'simple' | 'medium' | 'complex';
  score: number;
  strategy: SplitStrategy | null;
}

export class ComplexityAnalyzer {
  analyze(task: Task): ComplexityResult {
    const indicators = [
      this.checkDescriptionLength(task.description),
      this.checkKeywords(task.description),
      this.checkFileReferences(task.description)
    ];

    const score = indicators.reduce((sum, i) => sum + i.score, 0);

    if (score < 30) {
      return { level: 'simple', score, strategy: null };
    } else if (score < 70) {
      return { level: 'medium', score, strategy: 'role-based' };
    } else {
      return { level: 'complex', score, strategy: 'module-based' };
    }
  }

  private checkDescriptionLength(desc: string): { score: number } {
    const length = desc.length;
    if (length < 100) return { score: 10 };
    if (length < 500) return { score: 30 };
    return { score: 50 };
  }

  private checkKeywords(desc: string): { score: number } {
    const complexKeywords = ['架构', '系统', '完整', '多个', '集成', '端到端'];
    const count = complexKeywords.filter(kw => desc.includes(kw)).length;
    return { score: count * 10 };
  }

  private checkFileReferences(desc: string): { score: number } {
    const fileMatches = desc.match(/\.\w+/g) || [];
    return { score: Math.min(fileMatches.length * 5, 20) };
  }
}

export interface ISplitStrategy {
  split(task: Task): Omit<Task, 'createdAt' | 'artifactIds' | 'logIds' | 'subtaskIds'>[];
}

export class RoleBasedSplitStrategy implements ISplitStrategy {
  private roleFlows: Record<string, string[]> = {
    'fullstack': ['task-analyzer', 'product-manager', 'architect', 'backend-dev', 'frontend-dev', 'tester']
  };

  split(task: Task): Omit<Task, 'createdAt' | 'artifactIds' | 'logIds' | 'subtaskIds'>[] {
    const roles = this.roleFlows[task.role] || ['task-analyzer', 'backend-dev'];

    return roles.map((role, index) => ({
      id: generateId(),
      title: `[${task.title}] ${role} 阶段`,
      description: `${role} 负责的工作`,
      role,
      status: 'pending' as const,
      parentId: task.id,
      dependencies: index > 0 ? [roles.slice(0, index).map((_, i) => `${task.id}-${i}`).pop()!] : []
    }));
  }
}

export class ModuleBasedSplitStrategy implements ISplitStrategy {
  split(task: Task): Omit<Task, 'createdAt' | 'artifactIds' | 'logIds' | 'subtaskIds'>[] {
    // 简化实现：基于描述中的模块关键词
    const moduleKeywords = ['用户', '订单', '支付', '商品', '库存', '通知'];
    const modules: string[] = [];

    for (const keyword of moduleKeywords) {
      if (task.description.includes(keyword)) {
        modules.push(keyword);
      }
    }

    if (modules.length === 0) {
      modules.push('核心');
    }

    return modules.map((moduleName, index) => ({
      id: generateId(),
      title: `[${task.title}] ${moduleName}模块`,
      description: `${moduleName}模块的开发工作`,
      role: 'backend-dev',
      status: 'pending' as const,
      parentId: task.id,
      dependencies: index > 0 ? [] : [] // 模块间无依赖，可并行
    }));
  }
}

export class StepBasedSplitStrategy implements ISplitStrategy {
  split(task: Task): Omit<Task, 'createdAt' | 'artifactIds' | 'logIds' | 'subtaskIds'>[] {
    const steps = ['需求分析', '设计', '实现', '测试', '文档'];

    return steps.map((step, index) => ({
      id: generateId(),
      title: `[${task.title}] ${step}`,
      description: `${step}阶段的工作`,
      role: this.getRoleForStep(step),
      status: 'pending' as const,
      parentId: task.id,
      dependencies: index > 0 ? [steps.slice(0, index).map((_, i) => `${task.id}-${i}`).pop()!] : []
    }));
  }

  private getRoleForStep(step: string): string {
    const roleMap: Record<string, string> = {
      '需求分析': 'task-analyzer',
      '设计': 'architect',
      '实现': 'backend-dev',
      '测试': 'tester',
      '文档': 'doc-writer'
    };
    return roleMap[step] || 'task-analyzer';
  }
}

export class DependencyManager {
  hasCycle(tasks: Task[]): boolean {
    const graph = this.buildGraph(tasks);
    const visited = new Set<string>();
    const recStack = new Set<string>();

    for (const task of tasks) {
      if (this.hasCycleDFS(task.id, graph, visited, recStack)) {
        return true;
      }
    }
    return false;
  }

  getExecutableTasks(tasks: Task[]): Task[] {
    const completedIds = new Set(
      tasks.filter(t => t.status === 'completed').map(t => t.id)
    );

    return tasks.filter(task =>
      task.status === 'pending' &&
      task.dependencies.every(depId => completedIds.has(depId))
    );
  }

  getExecutionOrder(tasks: Task[]): Task[][] {
    const result: Task[][] = [];
    const remaining = new Set(tasks.map(t => t.id));
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const completed = new Set<string>();

    while (remaining.size > 0) {
      const level: Task[] = [];

      for (const taskId of remaining) {
        const task = taskMap.get(taskId)!;
        if (task.dependencies.every(depId => completed.has(depId))) {
          level.push(task);
        }
      }

      if (level.length === 0) {
        // 存在循环依赖，按剩余顺序处理
        const taskId = remaining.values().next().value!;
        level.push(taskMap.get(taskId)!);
      }

      result.push(level);
      level.forEach(t => {
        remaining.delete(t.id);
        completed.add(t.id);
      });
    }

    return result;
  }

  private buildGraph(tasks: Task[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    for (const task of tasks) {
      graph.set(task.id, task.dependencies || []);
    }
    return graph;
  }

  private hasCycleDFS(
    nodeId: string,
    graph: Map<string, string[]>,
    visited: Set<string>,
    recStack: Set<string>
  ): boolean {
    if (recStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    recStack.add(nodeId);

    const deps = graph.get(nodeId) || [];
    for (const dep of deps) {
      if (this.hasCycleDFS(dep, graph, visited, recStack)) {
        return true;
      }
    }

    recStack.delete(nodeId);
    return false;
  }
}
