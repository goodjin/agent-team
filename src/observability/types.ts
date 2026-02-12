export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  event?: string;
  traceId?: string;
  taskId?: string;
  agentId?: string;
  message: string;
  data?: Record<string, unknown>;
  durationMs?: number;
  error?: { name: string; message: string; stack?: string };
}

export type SpanKind = 'task' | 'agent' | 'llm' | 'tool' | 'pipeline';
export type SpanStatus = 'running' | 'success' | 'error';

export interface Span {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  status: SpanStatus;
  attributes: Record<string, unknown>;
  events: Array<{ time: string; name: string; attributes?: Record<string, unknown> }>;
  error?: { name: string; message: string };
}

export interface TraceContext {
  traceId: string;
  currentSpanId?: string;
  taskId?: string;
  agentId?: string;
}

export interface MetricSummary {
  name: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50?: number;
  p95?: number;
  p99?: number;
  labels?: Record<string, string>;
  windowStart: string;
  windowEnd: string;
}

// ─── Workflow Checkpoint Types ─────────────────────────────────────────────

export type WorkflowStatus =
  | 'pending' | 'running' | 'paused'
  | 'completed' | 'failed' | 'recovering';

export interface CompletedStep {
  stepId: string;
  agentId: string;
  completedAt: string;
  output: unknown;
  durationMs: number;
}

export interface PendingStep {
  stepId: string;
  description: string;
  dependsOn: string[];
}

export interface WorkflowCheckpointData {
  workflowId: string;
  checkpointSeq: number;
  createdAt: string;
  status: WorkflowStatus;
  checksum: string;
  taskInput: Record<string, unknown>;
  completedSteps: CompletedStep[];
  pendingSteps: PendingStep[];
  metadata: {
    totalSteps: number;
    completedCount: number;
    traceId: string;
    lastActiveAt: string;
    [key: string]: unknown;
  };
}

export interface WorkflowSummary {
  workflowId: string;
  status: WorkflowStatus;
  lastCheckpointSeq: number;
  completedCount: number;
  totalSteps: number;
  lastActiveAt: string;
}
