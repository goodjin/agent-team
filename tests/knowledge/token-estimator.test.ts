import { describe, expect, it } from 'vitest';
import { TokenEstimator } from '../../src/knowledge/token-estimator.js';

describe('TokenEstimator', () => {
  it('estimateText uses ~4 chars per token', () => {
    expect(TokenEstimator.estimateText('abcd')).toBe(1);
    expect(TokenEstimator.estimateText('')).toBe(0);
    expect(TokenEstimator.estimateText('x')).toBe(1);
  });

  it('estimateMessages sums content and tool calls', () => {
    const n = TokenEstimator.estimateMessages([
      { role: 'user', content: 'hello' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: '1', name: 'read_file', arguments: { path: 'a' } },
        ],
      },
    ]);
    expect(n).toBeGreaterThan(0);
  });

  it('compareWithUsage returns delta', () => {
    expect(TokenEstimator.compareWithUsage(100, 150)).toBe(50);
    expect(TokenEstimator.compareWithUsage(100, 0)).toBe(0);
  });
});
