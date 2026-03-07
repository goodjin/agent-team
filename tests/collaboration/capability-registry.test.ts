// 能力注册表测试
// Phase 2: 协作能力增强

import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityRegistry } from '../../src/collaboration/capability-registry/capability-registry';

describe('CapabilityRegistry', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
  });

  it('should register agent capabilities', () => {
    const capabilities = [
      { name: 'coding', description: 'Code implementation', tags: ['dev'], version: '1.0', deprecated: false },
      { name: 'testing', description: 'Test writing', tags: ['qa'], version: '1.0', deprecated: false }
    ];

    registry.register('agent-001', capabilities);

    const agent = registry.get('agent-001');
    expect(agent).toBeDefined();
    expect(agent?.capabilities).toHaveLength(2);
    expect(agent?.agentId).toBe('agent-001');
  });

  it('should find matching capabilities', () => {
    registry.register('agent-001', [
      { name: 'typescript', description: 'TypeScript development', tags: ['dev'], version: '1.0', deprecated: false }
    ]);

    const matches = registry.findMatching('typescript');
    expect(matches).toHaveLength(1);
    expect(matches[0].agentId).toBe('agent-001');
  });

  it('should exclude deprecated capabilities from search', () => {
    registry.register('agent-001', [
      { name: 'old-skill', description: 'Deprecated skill', tags: ['old'], version: '1.0', deprecated: true }
    ]);

    const matches = registry.findMatching('old-skill');
    expect(matches).toHaveLength(0);
  });

  it('should update existing capabilities', () => {
    registry.register('agent-001', [
      { name: 'coding', description: 'Old description', tags: ['dev'], version: '1.0', deprecated: false }
    ]);

    registry.update('agent-001', [
      { name: 'coding', description: 'New description', tags: ['dev'], version: '2.0', deprecated: false }
    ]);

    const agent = registry.get('agent-001');
    expect(agent?.capabilities[0].description).toBe('New description');
    expect(agent?.capabilities[0].version).toBe('2.0');
  });

  it('should unregister agent', () => {
    registry.register('agent-001', [
      { name: 'coding', description: 'Code implementation', tags: ['dev'], version: '1.0', deprecated: false }
    ]);

    const result = registry.unregister('agent-001');
    expect(result).toBe(true);
    expect(registry.get('agent-001')).toBeUndefined();
  });

  it('should get statistics', () => {
    registry.register('agent-001', [
      { name: 'coding', description: 'Code', tags: ['dev'], version: '1.0', deprecated: false },
      { name: 'testing', description: 'Test', tags: ['qa'], version: '1.0', deprecated: false }
    ]);
    registry.register('agent-002', [
      { name: 'design', description: 'Design', tags: ['ux'], version: '1.0', deprecated: false }
    ]);

    const stats = registry.getStats();
    expect(stats.totalAgents).toBe(2);
    expect(stats.totalCapabilities).toBe(3);
  });
});
