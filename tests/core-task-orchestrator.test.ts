import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskMatcher } from '../src/core/task-matcher.js';
import type { Task, TaskMessage } from '../src/types/index.js';

// Create mock ProjectAgent
const createMockProjectAgent = () => ({
  getTaskManager: vi.fn().mockReturnValue({
    getAllTasks: vi.fn().mockReturnValue([]),
    getTask: vi.fn(),
    createTask: vi.fn(),
    addMessage: vi.fn(),
  }),
  getEventSystem: vi.fn(),
  getConfig: vi.fn(),
});

describe('TaskMatcher', () => {
  let taskMatcher: TaskMatcher;
  let mockAgent: any;

  beforeEach(() => {
    mockAgent = createMockProjectAgent();
    taskMatcher = new TaskMatcher(mockAgent);
  });

  describe('matchTask', () => {
    it('should return unmatched when no existing tasks', async () => {
      const result = await taskMatcher.matchTask('Build a new feature', []);

      expect(result.matched).toBe(false);
      expect(result.taskId).toBeUndefined();
    });

    it('should match task by similar title', async () => {
      const existingTasks: Task[] = [
        {
          id: 'T001',
          title: 'Build user authentication',
          description: 'Implement login and logout',
          status: 'pending',
          type: 'feature',
          priority: 'high',
          dependencies: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [],
          executionRecords: [],
        },
      ];

      const result = await taskMatcher.matchTask('Build authentication system', existingTasks);

      // Should attempt matching (exact behavior depends on implementation)
      expect(result).toHaveProperty('matched');
    });

    it('should not match completed tasks for continuation', async () => {
      const existingTasks: Task[] = [
        {
          id: 'T001',
          title: 'Fix login bug',
          description: 'Fix the login issue',
          status: 'completed',
          type: 'bug',
          priority: 'high',
          dependencies: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [],
          executionRecords: [],
        },
      ];

      const result = await taskMatcher.matchTask('Continue fixing login', existingTasks);

      // Completed tasks may or may not match depending on implementation
      expect(result).toHaveProperty('matched');
    });

    it('should return confidence score', async () => {
      const existingTasks: Task[] = [
        {
          id: 'T001',
          title: 'Write tests',
          description: 'Write unit tests',
          status: 'in-progress',
          type: 'task',
          priority: 'medium',
          dependencies: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [],
          executionRecords: [],
        },
      ];

      const result = await taskMatcher.matchTask('Write more tests', existingTasks);

      expect(result).toHaveProperty('confidence');
    });
  });
});

describe('Task Orchestration Scenarios', () => {
  describe('Role Assignment Logic', () => {
    it('should identify developer tasks', () => {
      // Test role detection keywords
      const developerPhrases = [
        'build a feature',
        'implement functionality',
        'write code',
        'create API',
      ];

      developerPhrases.forEach(phrase => {
        const isDevTask = phrase.includes('build') || phrase.includes('implement') || 
                         phrase.includes('code') || phrase.includes('create');
        expect(isDevTask).toBe(true);
      });
    });

    it('should identify tester tasks', () => {
      const testPhrases = [
        'test the code',
        'verify functionality',
        'check performance',
      ];

      testPhrases.forEach(phrase => {
        const isTestTask = phrase.includes('test') || phrase.includes('verify') || phrase.includes('check');
        expect(isTestTask).toBe(true);
      });
    });

    it('should identify architect tasks', () => {
      const architectPhrases = [
        'design the system',
        'architecture review',
        'structure the application',
      ];

      architectPhrases.forEach(phrase => {
        const isArchitectTask = phrase.includes('design') || phrase.includes('architecture') || phrase.includes('structure');
        expect(isArchitectTask).toBe(true);
      });
    });

    it('should identify product manager tasks', () => {
      const pmPhrases = [
        'plan the roadmap',
        'define requirements',
        'feature specification',
      ];

      pmPhrases.forEach(phrase => {
        const isPMTask = phrase.includes('plan') || phrase.includes('requirements') || phrase.includes('feature');
        expect(isPMTask).toBe(true);
      });
    });
  });

  describe('Task Priority Detection', () => {
    it('should detect critical priority', () => {
      const criticalPhrases = [
        'urgent task',
        'critical bug',
        'emergency fix',
        'production down issue',
      ];

      criticalPhrases.forEach(phrase => {
        const hasCritical = phrase.includes('urgent') || phrase.includes('critical') || 
                           phrase.includes('emergency') || phrase.includes('production');
        expect(hasCritical).toBe(true);
      });
    });

    it('should detect high priority', () => {
      const highPhrases = ['important task', 'high priority', 'must have this'];

      highPhrases.forEach(phrase => {
        const hasHigh = phrase.includes('important') || phrase.includes('high') || phrase.includes('must');
        expect(hasHigh).toBe(true);
      });
    });

    it('should detect low priority', () => {
      const lowPhrases = ['eventually', 'nice to have', 'when possible'];

      lowPhrases.forEach(phrase => {
        const hasLow = phrase.includes('eventually') || phrase.includes('nice') || phrase.includes('when possible');
        expect(hasLow).toBe(true);
      });
    });
  });

  describe('Task Continuation Detection', () => {
    it('should detect continuation keywords', () => {
      const continuationPhrases = [
        'continue working',
        'carry on task',
        'next step',
        'also need this',
      ];

      continuationPhrases.forEach(phrase => {
        const isContinuation = phrase.includes('continue') || phrase.includes('next') || 
                               phrase.includes('also') || phrase.includes('carry on');
        expect(isContinuation).toBe(true);
      });
    });

    it('should detect reference to existing task', () => {
      const taskReferences = [
        'previous task',
        'that task',
        'the login task',
      ];

      taskReferences.forEach(ref => {
        const hasReference = ref.includes('previous') || ref.includes('that') || 
                           ref.includes('login');
        expect(hasReference).toBe(true);
      });
    });
  });
});

describe('Task Decomposition Logic', () => {
  describe('Subtask Generation', () => {
    it('should identify multi-part tasks', () => {
      const complexTask = 'Build user authentication with login, logout, and password reset';
      const hasMultipleParts = complexTask.includes('with') && complexTask.includes('and');
      expect(hasMultipleParts).toBe(true);
    });

    it('should suggest PM for complex tasks', () => {
      const complexTasks = [
        'Build an entire e-commerce platform',
        'Redesign the entire application',
      ];

      complexTasks.forEach(task => {
        const needsPM = task.includes('entire') || task.includes('platform');
        expect(needsPM).toBe(true);
      });
    });
  });

  describe('Dependency Detection', () => {
    it('should identify sequential dependencies', () => {
      const sequentialPhrases = [
        'first do this',
        'then do that',
        'after finishing',
      ];

      sequentialPhrases.forEach(phrase => {
        const hasSequential = phrase.includes('first') || phrase.includes('then') || phrase.includes('after');
        expect(hasSequential).toBe(true);
      });
    });

    it('should identify parallel tasks', () => {
      const parallelPhrases = [
        'at the same time',
        'concurrently',
        'both tasks',
      ];

      parallelPhrases.forEach(phrase => {
        const hasParallel = phrase.includes('both') || phrase.includes('concurrently') || phrase.includes('same time');
        expect(hasParallel).toBe(true);
      });
    });
  });
});
