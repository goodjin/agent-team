import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface EvaluationReport {
  id: string;
  taskId: string;
  timestamp: string;
  scores: {
    efficiency: number;   // 1-10, fewer tool calls = higher score
    quality: number;      // 1-10, task completion and output quality
    resource: number;     // 1-10, fewer tokens = higher score
    overall: number;      // weighted: efficiency*0.3 + quality*0.5 + resource*0.2
  };
  metrics: {
    toolCallCount: number;
    tokenUsed: number;
    duration: number;       // milliseconds
    iterationCount: number;
    success: boolean;
  };
  insights: string[];       // text suggestions
}

export interface EvaluationTrend {
  period: string;
  avgOverall: number;
  avgEfficiency: number;
  avgQuality: number;
  avgResource: number;
  totalTasks: number;
}

// Keep backward-compatible types for existing code
export interface EvaluationResult {
  taskId: string;
  agentId: string;
  compositeScore: number;
  dimensions: {
    efficiency?: number;
    quality?: number;
    resource?: number;
  };
  timestamp: string;
}

export interface DecliningEvent {
  agentId: string;
  decliningStreak: number;
  recentScores: number[];
}

export class SelfEvaluator extends EventEmitter {
  private evaluations: EvaluationReport[] = [];
  private storagePath: string;

  // backward-compat
  private recentScores = new Map<string, number[]>();
  private decliningThreshold: number;
  private decliningStreakMin: number;

  constructor(options?: {
    storagePath?: string;
    decliningThreshold?: number;
    decliningStreakMin?: number;
  }) {
    super();
    this.storagePath = options?.storagePath ?? path.join(process.cwd(), '.agent-memory', 'evaluations.jsonl');
    this.decliningThreshold = options?.decliningThreshold ?? 6;
    this.decliningStreakMin = options?.decliningStreakMin ?? 3;
  }

  /**
   * Evaluate a task execution and produce an EvaluationReport.
   */
  async evaluate(
    metrics: EvaluationReport['metrics'],
    taskId: string
  ): Promise<EvaluationReport> {
    const scores = this.calculateScores(metrics);
    const insights = this.generateInsights(scores, metrics);

    const report: EvaluationReport = {
      id: randomUUID(),
      taskId,
      timestamp: new Date().toISOString(),
      scores,
      metrics,
      insights,
    };

    this.evaluations.push(report);
    this.emit('evaluation:completed', report);

    // Check for declining trend across recent evaluations
    this.checkDeclineTrend(taskId, scores.overall);

    await this.save();

    return report;
  }

  /**
   * Get trend data for evaluations over the past N days.
   */
  getTrend(days: number = 7): EvaluationTrend {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const recent = this.evaluations.filter(e => new Date(e.timestamp) >= cutoff);

    if (recent.length === 0) {
      return {
        period: `${days}d`,
        avgOverall: 0,
        avgEfficiency: 0,
        avgQuality: 0,
        avgResource: 0,
        totalTasks: 0,
      };
    }

    const sum = recent.reduce(
      (acc, e) => ({
        overall: acc.overall + e.scores.overall,
        efficiency: acc.efficiency + e.scores.efficiency,
        quality: acc.quality + e.scores.quality,
        resource: acc.resource + e.scores.resource,
      }),
      { overall: 0, efficiency: 0, quality: 0, resource: 0 }
    );

    const count = recent.length;
    return {
      period: `${days}d`,
      avgOverall: Math.round((sum.overall / count) * 10) / 10,
      avgEfficiency: Math.round((sum.efficiency / count) * 10) / 10,
      avgQuality: Math.round((sum.quality / count) * 10) / 10,
      avgResource: Math.round((sum.resource / count) * 10) / 10,
      totalTasks: count,
    };
  }

  /**
   * Get historical evaluations, limited to the most recent N.
   */
  getHistory(limit: number = 20): EvaluationReport[] {
    return this.evaluations.slice(-limit);
  }

  /**
   * Attach to an EventEmitter to automatically evaluate tasks.
   * Listens for 'task:completed' and 'task:failed' events.
   */
  attachTo(emitter: EventEmitter): void {
    emitter.on('task:completed', async (data: {
      taskId: string;
      toolCallCount?: number;
      tokenUsed?: number;
      duration?: number;
      iterationCount?: number;
    }) => {
      try {
        await this.evaluate(
          {
            toolCallCount: data.toolCallCount ?? 0,
            tokenUsed: data.tokenUsed ?? 0,
            duration: data.duration ?? 0,
            iterationCount: data.iterationCount ?? 0,
            success: true,
          },
          data.taskId
        );
      } catch (err) {
        console.error('[SelfEvaluator] Evaluation failed:', err);
      }
    });

    emitter.on('task:failed', async (data: {
      taskId: string;
      toolCallCount?: number;
      tokenUsed?: number;
      duration?: number;
      iterationCount?: number;
    }) => {
      try {
        await this.evaluate(
          {
            toolCallCount: data.toolCallCount ?? 0,
            tokenUsed: data.tokenUsed ?? 0,
            duration: data.duration ?? 0,
            iterationCount: data.iterationCount ?? 0,
            success: false,
          },
          data.taskId
        );
      } catch (err) {
        console.error('[SelfEvaluator] Evaluation failed (task-failed case):', err);
      }
    });
  }

  /**
   * Persist evaluations to JSONL file.
   */
  async save(): Promise<void> {
    try {
      const dir = path.dirname(this.storagePath);
      await fs.mkdir(dir, { recursive: true });
      const lines = this.evaluations.map(e => JSON.stringify(e)).join('\n') + '\n';
      await fs.writeFile(this.storagePath, lines, 'utf-8');
    } catch (err) {
      console.error('[SelfEvaluator] Failed to save evaluations:', err);
    }
  }

  /**
   * Load evaluations from JSONL file.
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.storagePath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l.trim());
      this.evaluations = lines.map(line => JSON.parse(line) as EvaluationReport);
    } catch {
      // File may not exist yet
      this.evaluations = [];
    }
  }

  /**
   * Calculate efficiency, quality, resource, and overall scores from metrics.
   */
  private calculateScores(metrics: EvaluationReport['metrics']): EvaluationReport['scores'] {
    const efficiency = this.scoreEfficiency(metrics);
    const quality = this.scoreQuality(metrics);
    const resource = this.scoreResource(metrics);
    const overall = Math.round((efficiency * 0.3 + quality * 0.5 + resource * 0.2) * 10) / 10;

    return { efficiency, quality, resource, overall };
  }

  private scoreEfficiency(metrics: EvaluationReport['metrics']): number {
    // Fewer tool calls = higher efficiency
    const calls = metrics.toolCallCount;
    if (calls <= 2) return 10;
    if (calls <= 5) return 8;
    if (calls <= 10) return 6;
    if (calls <= 20) return 4;
    return 2;
  }

  private scoreQuality(metrics: EvaluationReport['metrics']): number {
    // Failed tasks get minimum score
    if (!metrics.success) return 1;

    // More iterations = slightly lower quality
    const baseScore = 7;
    const iterationPenalty = Math.min(3, Math.floor(metrics.iterationCount / 5));
    return Math.max(1, baseScore - iterationPenalty);
  }

  private scoreResource(metrics: EvaluationReport['metrics']): number {
    // Fewer tokens = higher resource score
    const tokens = metrics.tokenUsed;
    if (tokens <= 1000) return 10;
    if (tokens <= 5000) return 8;
    if (tokens <= 10000) return 6;
    if (tokens <= 50000) return 4;
    return 2;
  }

  /**
   * Generate human-readable insights based on scores and metrics.
   */
  private generateInsights(
    scores: EvaluationReport['scores'],
    metrics: EvaluationReport['metrics']
  ): string[] {
    const insights: string[] = [];

    if (!metrics.success) {
      insights.push('Task failed - quality score is minimum. Review task requirements and error handling.');
    }

    if (scores.efficiency < 5) {
      insights.push(
        `High tool call count (${metrics.toolCallCount}). Consider batching operations or simplifying the workflow.`
      );
    }

    if (scores.resource < 5) {
      insights.push(
        `High token usage (${metrics.tokenUsed}). Consider compressing prompts and reducing context size.`
      );
    }

    if (scores.overall >= 8) {
      insights.push('Excellent overall performance. Task completed efficiently with good quality.');
    } else if (scores.overall >= 6) {
      insights.push('Good performance. Minor optimizations possible.');
    } else if (scores.overall < 4) {
      insights.push('Performance needs improvement. Review efficiency, quality, and resource usage.');
    }

    if (metrics.iterationCount > 10) {
      insights.push(
        `High iteration count (${metrics.iterationCount}). Reduce redundant steps and improve task decomposition.`
      );
    }

    return insights;
  }

  /**
   * Check for declining trend in recent scores and emit event if detected.
   */
  private checkDeclineTrend(taskId: string, score: number): void {
    const scores = this.recentScores.get(taskId) ?? [];
    scores.push(score);
    if (scores.length > 10) scores.shift();
    this.recentScores.set(taskId, scores);

    if (scores.length >= this.decliningStreakMin) {
      const recent = scores.slice(-this.decliningStreakMin);
      const isDeclining = recent.every((s, i) => i === 0 || s <= recent[i - 1]);
      const belowThreshold = recent.every(s => s < this.decliningThreshold);

      if (isDeclining && belowThreshold) {
        const event: DecliningEvent = {
          agentId: taskId,
          decliningStreak: this.decliningStreakMin,
          recentScores: recent,
        };
        this.emit('evaluation:declining', event);
      }
    }
  }

  // Backward-compatible method for existing tests
  getRecentScores(agentId: string): number[] {
    return this.recentScores.get(agentId) ?? [];
  }
}
