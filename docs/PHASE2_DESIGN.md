# Phase 2: 协作能力增强 - 设计文档

## 概述

Phase 2 旨在为 AgentOS 增加多 Agent 协作能力，实现动态角色分配、能力注册表、冲突解决和进度聚合。

## 1. 动态角色分配系统

### 1.1 设计目标
- 根据任务类型自动识别并分配最合适的 Agent
- 支持任务优先级和紧急程度评估
- 实现负载均衡，避免单点过载

### 1.2 核心组件

```
src/collaboration/
├── role-assigner/
│   ├── role-assigner.ts      # 角色分配器
│   ├── task-analyzer.ts      # 任务分析器
│   ├── role-registry.ts      # 角色注册表
│   └── types.ts              # 类型定义
```

### 1.3 关键接口

```typescript
interface Role {
  id: string;
  name: string;
  capabilities: string[];
  maxConcurrentTasks: number;
  currentLoad: number;
}

interface TaskAssignment {
  taskId: string;
  assignedRole: Role;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimatedDuration: number;
}

class RoleAssigner {
  // 分析任务并返回最佳角色
  analyzeTask(task: Task): Role[];
  
  // 分配任务到角色
  assign(task: Task, role: Role): TaskAssignment;
  
  // 重新平衡负载
  rebalance(): void;
}
```

## 2. Agent 能力注册表

### 2.1 设计目标
- 集中管理所有 Agent 的能力描述
- 支持能力发现和查询
- 支持能力版本管理

### 2.2 核心组件

```
src/collaboration/
├── capability-registry/
│   ├── capability-registry.ts  # 能力注册表
│   ├── capability-matcher.ts   # 能力匹配器
│   └── index.ts
```

### 2.3 关键接口

```typescript
interface Capability {
  name: string;
  description: string;
  tags: string[];
  version: string;
  deprecated: boolean;
}

interface AgentCapability {
  agentId: string;
  capabilities: Capability[];
  registeredAt: Date;
  lastUpdated: Date;
}

class CapabilityRegistry {
  // 注册 Agent 能力
  register(agentId: string, capabilities: Capability[]): void;
  
  // 查询匹配的能力
  findMatching(query: string): AgentCapability[];
  
  // 更新能力
  update(agentId: string, capabilities: Capability[]): void;
  
  // 注销 Agent
  unregister(agentId: string): void;
}
```

## 3. 协作冲突解决机制

### 3.1 设计目标
- 检测多 Agent 任务冲突
- 实现多种冲突解决策略
- 支持自定义冲突处理器

### 3.2 冲突类型
- **资源冲突**: 多个 Agent 竞争同一资源
- **任务依赖冲突**: 循环依赖、死锁
- **状态冲突**: 并发修改同一数据

### 3.3 核心组件

```
src/collaboration/
├── conflict-resolver/
│   ├── conflict-detector.ts    # 冲突检测器
│   ├── conflict-strategy.ts    # 解决策略
│   ├── conflict-manager.ts     # 冲突管理器
│   └── index.ts
```

### 3.4 关键接口

```typescript
type ConflictStrategy = 'priority' | 'round-robin' | 'first-come' | 'custom';

interface Conflict {
  id: string;
  type: 'resource' | 'dependency' | 'state';
  involvedAgents: string[];
  resource?: string;
  timestamp: Date;
}

interface ConflictResolver {
  // 检测冲突
  detect(task1: Task, task2: Task): Conflict | null;
  
  // 解决冲突
  resolve(conflict: Conflict, strategy: ConflictStrategy): Resolution;
  
  // 注册自定义冲突处理器
  registerHandler(type: string, handler: ConflictHandler): void;
}
```

## 4. 实时进度聚合

### 4.1 设计目标
- 聚合多个 Agent 的任务进度
- 提供统一的进度视图
- 支持进度事件订阅

### 4.2 核心组件

```
src/collaboration/
├── progress-aggregator/
│   ├── progress-aggregator.ts  # 进度聚合器
│   ├── progress-tracker.ts     # 进度跟踪器
│   └── index.ts
```

### 4.3 关键接口

```typescript
interface TaskProgress {
  taskId: string;
  agentId: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  progress: number; // 0-100
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

interface AggregatedProgress {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  inProgressTasks: number;
  averageProgress: number;
  byAgent: Map<string, TaskProgress[]>;
}

class ProgressAggregator {
  // 更新单个任务进度
  updateProgress(progress: TaskProgress): void;
  
  // 获取聚合进度
  getAggregatedProgress(): AggregatedProgress;
  
  // 订阅进度变化
  subscribe(callback: (progress: AggregatedProgress) => void): Unsubscribe;
}
```

## 5. 集成架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Collaboration Layer                      │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│ RoleAssigner│ Capability  │  Conflict   │ Progress         │
│             │ Registry    │  Resolver   │ Aggregator        │
├─────────────┴─────────────┴─────────────┴──────────────────┤
│                    Event Bus (Existing)                      │
├─────────────────────────────────────────────────────────────┤
│                    Core Modules (Existing)                   │
└─────────────────────────────────────────────────────────────┘
```

## 6. 实施计划

| 阶段 | 任务 | 产出 |
|------|------|------|
| 1 | 基础框架搭建 | 目录结构、类型定义 |
| 2 | 能力注册表 | 实现注册、查询功能 |
| 3 | 动态角色分配 | 实现任务分析和分配 |
| 4 | 冲突解决 | 实现检测和解决策略 |
| 5 | 进度聚合 | 实现实时进度跟踪 |
| 6 | 集成测试 | 端到端测试 |

## 7. 验收标准

- [ ] 能力注册表支持增删改查
- [ ] 动态角色分配准确率 > 90%
- [ ] 冲突检测无漏报
- [ ] 进度聚合延迟 < 100ms
- [ ] 所有新模块测试覆盖率 > 80%
