export { IntelligentAgent, createIntelligentAgent } from './intelligent-agent.js';
export type {
  AIAgentConfig,
  ChatMessage,
  ToolCall,
  TokenUsage,
  ChatResult
} from './intelligent-agent.js';
export { AIAgentSession, startAIAgentSession } from './agent-session.js';
export type { AIAgentSessionConfig } from './agent-session.js';
export { Agent, type AgentConfig, type AgentState, type AgentExecutionResult } from './agent.js';
export { CheckpointManager, type CheckpointType, type CheckpointData, type Checkpoint, type SaveCheckpointParams } from './checkpoint.js';

// Phase 3: Intelligent Enhancement
export {
  IntelligentEnhancementEngine,
  createIntelligentEnhancementEngine,
  SelfEvolutionEngine,
  createSelfEvolutionEngine,
  TaskPatternRecognizer,
  createTaskPatternRecognizer,
  SmartRetryStrategy,
  createSmartRetryStrategy,
  PerformancePredictor,
  createPerformancePredictor,
} from './intelligent-enhancement.js';

export type {
  IntelligentEnhancementConfig,
  TaskRecommendation,
  EvolutionConfig,
  EvolutionMetrics,
  RolePerformance,
  TaskPattern,
  PatternFeatures,
  RecognizedPattern,
  PatternMatchResult,
  RetryConfig,
  RetryDecision,
  RetryState,
  ErrorClassifier,
  PerformancePrediction,
  RiskFactor,
  HistoricalMetrics,
  PredictionModel,
} from './intelligent-enhancement.js';

// Phase 4: Engineering Capabilities
export { CodeReviewAgent, createCodeReviewAgent } from './code-review.js';
export type { ReviewIssue, CodeReviewResult, ReviewConfig } from './code-review.js';
