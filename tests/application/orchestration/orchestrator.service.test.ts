import { describe, expect, it } from 'vitest';

import type { Agent } from '../../../src/domain/agent/agent.entity.js';
import type { IAgentRepository } from '../../../src/domain/agent/agent.repository.js';
import type { Task } from '../../../src/domain/task/task.entity.js';
import type { ITaskRepository } from '../../../src/domain/task/task.repository.js';
import { EventBus } from '../../../src/infrastructure/event-bus/index.js';
import { WebSocketManager } from '../../../src/infrastructure/websocket/index.js';
import { WorkerMailbox } from '../../../src/application/orchestration/mailbox.js';
import { OrchestratorService } from '../../../src/application/orchestration/orchestrator.service.js';
import type { ProgressReport } from '../../../src/application/orchestration/progress-report.js';

class InMemoryTaskRepo implements ITaskRepository {
  constructor(private tasks = new Map<string, Task>()) {}
  async save(task: Task): Promise<void> {
    this.tasks.set(task.id, JSON.parse(JSON.stringify(task)) as Task);
  }
  async findById(id: string): Promise<Task | null> {
    return this.tasks.get(id) ?? null;
  }
  async findAll(): Promise<Task[]> {
    return [...this.tasks.values()];
  }
  async findByParentId(parentId: string): Promise<Task[]> {
    return [...this.tasks.values()].filter((task) => task.parentId === parentId);
  }
  async delete(id: string): Promise<void> {
    this.tasks.delete(id);
  }
}

class InMemoryAgentRepo implements IAgentRepository {
  constructor(private agents = new Map<string, Agent>()) {}
  async save(agent: Agent): Promise<void> {
    this.agents.set(agent.id, JSON.parse(JSON.stringify(agent)) as Agent);
  }
  async findById(id: string): Promise<Agent | null> {
    return this.agents.get(id) ?? null;
  }
  async findByTaskId(taskId: string): Promise<Agent[]> {
    return [...this.agents.values()].filter((agent) => agent.taskId === taskId);
  }
  async delete(id: string): Promise<void> {
    this.agents.delete(id);
  }
}

function makeTask(): Task {
  return {
    id: 'task-1',
    title: 'test',
    description: 'desc',
    status: 'running',
    role: 'task-master',
    taskKind: 'epic',
    depth: 0,
    decompositionStatus: 'decomposing',
    dependencies: [],
    createdAt: new Date(),
    artifactIds: [],
    logIds: [],
    subtaskIds: [],
    orchestrationMode: 'v10-master',
    orchestrationState: 'executing_workers',
    masterAgentId: 'master-1',
    planVersion: 0,
  };
}

function makeAgent(id: string, kind: Agent['kind'], masterAgentId?: string): Agent {
  return {
    id,
    taskId: 'task-1',
    roleId: kind === 'worker' ? 'backend-dev' : 'task-master',
    kind,
    displayName: id,
    masterAgentId,
    status: 'idle',
    context: {
      systemPrompt: '',
      history: [],
      variables: {},
    },
    createdAt: new Date(),
  };
}

describe('OrchestratorService subplan expansion', () => {
  it('expands a submaster module node into child nodes under the same active plan', async () => {
    const taskRepo = new InMemoryTaskRepo();
    const agentRepo = new InMemoryAgentRepo();
    const task = makeTask();
    await taskRepo.save(task);
    await agentRepo.save(makeAgent('master-1', 'master'));
    await agentRepo.save(makeAgent('sm-1', 'submaster', 'master-1'));
    await agentRepo.save(makeAgent('w-1', 'worker', 'sm-1'));

    const orchestrator = new OrchestratorService(
      taskRepo,
      agentRepo,
      new EventBus(),
      new WebSocketManager(),
      new WorkerMailbox()
    );

    const rootPlan = await orchestrator.submitPlan(task.id, {
      version: 1,
      nodes: [
        {
          id: 'module-a',
          executorType: 'submaster',
          executorId: 'sm-1',
          nodeKind: 'module',
        },
      ],
    });
    expect(rootPlan.ok).toBe(true);

    const active = (orchestrator as unknown as { active: Map<string, any> }).active.get(task.id);
    active.nodes.get('module-a').status = 'running';

    const subplan = await orchestrator.submitSubplan(
      task.id,
      'module-a',
      'sm-1',
      {
        version: 1,
        nodes: [
          {
            id: 'worker-task',
            executorType: 'worker',
            executorId: 'w-1',
            nodeKind: 'atomic',
          },
        ],
      },
      { expectedPlanVersion: 1 }
    );

    expect(subplan.ok).toBe(true);
    expect(orchestrator.hasSubmittedSubplan(task.id, 'module-a')).toBe(true);

    const snapshot = await orchestrator.getSnapshot(task.id);
    const nodeIds = snapshot.activePlan?.nodes.map((node) => node.id) ?? [];
    expect(nodeIds).toContain('module-a');
    expect(nodeIds).toContain('module-a/worker-task');

    const child = snapshot.activePlan?.nodes.find((node) => node.id === 'module-a/worker-task');
    expect(child).toMatchObject({
      parentNodeId: 'module-a',
      executorType: 'worker',
      executorId: 'w-1',
      nodeKind: 'atomic',
    });
  });

  it('routes successful module finalization through review before completion', async () => {
    const taskRepo = new InMemoryTaskRepo();
    const agentRepo = new InMemoryAgentRepo();
    const task = makeTask();
    await taskRepo.save(task);
    await agentRepo.save(makeAgent('master-1', 'master'));
    await agentRepo.save(makeAgent('sm-1', 'submaster', 'master-1'));

    const eventBus = new EventBus();
    const completedEvents: Array<Record<string, unknown>> = [];
    eventBus.subscribe('orch.node.completed', (event) => {
      completedEvents.push(event.payload as Record<string, unknown>);
    });

    const orchestrator = new OrchestratorService(
      taskRepo,
      agentRepo,
      eventBus,
      new WebSocketManager(),
      new WorkerMailbox()
    );

    const rootPlan = await orchestrator.submitPlan(task.id, {
      version: 1,
      nodes: [
        {
          id: 'module-a',
          executorType: 'submaster',
          executorId: 'sm-1',
          nodeKind: 'module',
        },
      ],
    });
    expect(rootPlan.ok).toBe(true);

    const active = (orchestrator as unknown as { active: Map<string, any> }).active.get(task.id);
    active.nodes.get('module-a').status = 'running';

    const report: ProgressReport = {
      status: 'done',
      scope: '模块节点 module-a',
      outputs: ['完成模块收口'],
      risks: [],
      nextStep: '等待模块审查',
    };
    await orchestrator.onSubmasterNodeDone(task.id, 'module-a', true, report);

    const midSnapshot = await orchestrator.getSnapshot(task.id);
    expect(midSnapshot.activePlan?.nodes.find((node) => node.id === 'module-a')?.status).toBe('reviewing');
    expect(completedEvents).toHaveLength(1);
    expect(completedEvents[0]).toMatchObject({
      nodeId: 'module-a',
      executorType: 'submaster',
      nodeKind: 'module',
      success: true,
      report,
    });

    await orchestrator.onNodeReviewDone(task.id, 'module-a', {
      passed: true,
      notes: '模块审查通过',
    });

    const doneSnapshot = await orchestrator.getSnapshot(task.id);
    expect(doneSnapshot.activePlan?.nodes.find((node) => node.id === 'module-a')?.status).toBe('completed');
  });
});
