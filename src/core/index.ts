/**
 * 核心模块索引
 */

export { ProjectAgent } from './project-agent.js';
export { TaskManager } from './task-manager.js';
export { OnboardingManager, createOnboardingManager } from './onboarding.js';
export { EventSystem, type EventType, type Event, type EventHandler } from './events.js';
export { AgentMgr, type AgentConfig, type AgentCheckResult } from './agent-mgr.js';
export { 
  TaskDecompositionEngine, 
  createTaskDecompositionEngine,
  type DecompositionResult,
  type SubTask,
  type DecompositionStrategy,
  type TaskDecompositionConfig,
} from './task-decomposition.js';
export { 
  AgentMessageBus, 
  createMessageBus,
  type AgentId,
  type Message,
  type MessageContent,
  type MessageDeliveryResult,
  type MessageStats,
  type MessageBusConfig,
  type MessagePriority,
  type MessageType,
} from './agent-message-bus.js';
export { createMessageContent } from './agent-message-bus.js';
