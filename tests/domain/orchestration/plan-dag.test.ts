import { describe, expect, it } from 'vitest';
import { parsePlanPayload, topologicalLayers } from '../../../src/domain/orchestration/plan-dag.js';

describe('plan-dag', () => {
  it('rejects cycle', () => {
    const r = parsePlanPayload({
      version: 1,
      nodes: [
        { id: 'a', workerId: 'w1', dependsOn: ['b'] },
        { id: 'b', workerId: 'w1', dependsOn: ['a'] },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('cycle');
  });

  it('accepts diamond and layers A,B then C', () => {
    const r = parsePlanPayload({
      version: 1,
      nodes: [
        { id: 'a', workerId: 'w1' },
        { id: 'b', workerId: 'w2' },
        { id: 'c', workerId: 'w3', dependsOn: ['a', 'b'] },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const layers = topologicalLayers(r.plan.nodes);
    expect(layers[0].sort()).toEqual(['a', 'b'].sort());
    expect(layers[1]).toEqual(['c']);
  });

  it('rejects unknown dependency', () => {
    const r = parsePlanPayload({
      version: 1,
      nodes: [{ id: 'a', workerId: 'w1', dependsOn: ['x'] }],
    });
    expect(r.ok).toBe(false);
  });
});
