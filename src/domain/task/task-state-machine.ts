import { TaskStatus } from './task.entity.js';

export class InvalidStateTransitionError extends Error {
  constructor(from: TaskStatus, to: TaskStatus) {
    super(`Invalid state transition from ${from} to ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

export class TaskStateMachine {
  private transitions: Map<TaskStatus, TaskStatus[]> = new Map([
    ['pending', ['running']],
    ['running', ['paused', 'completed', 'failed']],
    ['paused', ['running']],
    ['failed', ['pending']]
  ]);

  canTransition(from: TaskStatus, to: TaskStatus): boolean {
    const allowed = this.transitions.get(from) || [];
    return allowed.includes(to);
  }

  validateTransition(from: TaskStatus, to: TaskStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidStateTransitionError(from, to);
    }
  }

  getValidTransitions(from: TaskStatus): TaskStatus[] {
    return this.transitions.get(from) || [];
  }
}
