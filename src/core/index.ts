/**
 * 核心模块索引
 */

export { ProjectAgent } from './project-agent.js';
export { TaskManager } from './task-manager.js';
export { OnboardingManager, createOnboardingManager } from './onboarding.js';
export { EventSystem, type EventType, type Event, type EventHandler } from './events.js';
export { AgentMgr, type AgentConfig, type AgentCheckResult } from './agent-mgr.js';
export { ProgressTracker, type ProgressCheckpoint, type ProgressTrackerConfig } from './progress-tracker.js';
export { TaskPersistence, type PersistenceConfig } from './task-persistence.js';
