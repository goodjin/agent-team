// 协作模块导出
// Phase 2: 协作能力增强

// 类型
export * from './types';

// 能力注册表
export { CapabilityRegistry, capabilityRegistry } from './capability-registry/capability-registry';

// 角色分配器
export { RoleAssigner, roleAssigner } from './role-assigner/role-assigner';

// 冲突解决器
export { ConflictResolver, conflictResolver } from './conflict-resolver/conflict-resolver';

// 进度聚合器
export { ProgressAggregator, progressAggregator } from './progress-aggregator/progress-aggregator';
