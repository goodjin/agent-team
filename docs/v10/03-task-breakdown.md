# Agent Team v10.0 任务拆分

**基于**: [01-requirements.md](./01-requirements.md)、[02-architecture.md](./02-architecture.md)

---

## 总览

| 阶段 | 主题 | 关键产出 |
|------|------|----------|
| M1 | 主会话 + 叫停 | Master WS、主轻量循环、AbortSignal、planVersion 占位 |
| M2 | 角色/工人/信箱/DAG | RoleRepository、Worker 元数据、Orchestrator、事件契约落地 |
| M3 | 上下文与记忆工具 | Compressor、memory_* 工具、命名空间 |
| M4 | 巩固与观测 | 指标、审计、可选 UI |

---

## M1：主会话与可中止执行（P0）

| ID | 任务 | 说明 |
|----|------|------|
| T1.1 | `Task` / 状态机扩展 | `intake`、`awaiting_user` 等；与现有 `pending/running` 映射文档化 |
| T1.2 | `MasterSession` 存储 | 消息列表 CRUD，绑定 `taskId` + `masterAgentId` |
| T1.3 | WebSocket：`user.message` | 见 [04](./04-api-events-contracts.md)；广播 `master.thinking` / `master.reply` |
| T1.4 | `MasterAgentService` 骨架 | 轻量 ReAct（少工具），默认工具：回复用户、（stub）`submit_plan` |
| T1.5 | Intent Gate | 用户意图/复杂度轻量分类，提示是否进入规划模式 |
| T1.6 | Plan Review 工具 | 对规划文档做质量门禁（JSON 输出） |
| T1.7 | `AgentExecutionEngine` 支持 `AbortSignal` | Worker 路径可中断循环；与现有 v9 引擎兼容 |
| T1.8 | `TaskService.start` 分支 | `v10` 模式：不调用原 `execute` 整树，改为 `startMasterSession` |

**验收**：新任务创建后，用户 WS 多轮对话有持久化；演示一次 Worker 级 abort（可单 Worker  stub）。

---

## M2：持久化角色、具名工人、信箱与 DAG（P0）

| ID | 任务 | 说明 |
|----|------|------|
| T2.1 | `Role` 实体 + `RoleRepository` | 目录 `data/roles` 或等效；种子内置角色迁移脚本 |
| T2.2 | `Agent` 扩展 + 迁移 | `kind`, `displayName`, `masterAgentId`；兼容旧 agent JSON |
| T2.3 | `Mailbox` 实现 | FIFO + 可选优先队列；落盘可选 |
| T2.4 | 领域事件 | `master.to.worker.*`, `worker.to.master.*`（见 04） |
| T2.5 | `OrchestratorService` | 解析 `submit_plan`、拓扑调度、并行层、完成检测 |
| T2.6 | 主工具实现 | `create_role`, `create_worker`, `send_worker_command`, `query_orchestration_state` |
| T2.7 | `WorkerRunner` | 循环：取信 → 更新 brief → `executionEngine.execute(..., { signal })` |
| T2.8 | `planVersion` / `correlationId` | 指令结构体贯穿；过期指令丢弃逻辑 |

**验收**：一主两工人，工人 A/B 并行后 C 依赖 A/B；中途 `PATCH_BRIEF` 与 `CANCEL` 单工人可用。

---

## M3：压缩与记忆工具（P1）

| ID | 任务 | 说明 |
|----|------|------|
| T3.1 | `TokenEstimator` | 基于消息近似；与 LLM usage 对齐（若可用） |
| T3.2 | `ContextCompressor` | 软/硬阈值；摘要写回 `AgentMemory` 或专用 store |
| T3.3 | 工具：`memory_search` / `memory_append` / `memory_summarize` | 绑定命名空间；主/Worker 可不同白名单 |
| T3.4 | 与 `ProjectKnowledgeBase` 对齐 | 可选 `projectId = taskId`；文档化隔离策略 |
| T3.5 | 主会话双轨摘要 | `userFacing` vs `internal` 字段或前缀 |

**验收**：长对话压测下窗口稳定；Worker 完成后记忆可检索。

---

## M4：观测、审计、可选前端（P2）

| T4.1 | Metrics / Trace | 见 02 可观测性 |
| T4.2 | 审计日志 | 谁在何时 `create_role` / `CANCEL` |
| T4.3 | （可选）DAG JSON API | 只读，供未来 UI |

---

## 依赖关系（简图）

```
T1.* → T2.* （主会话稳定后再接工人）
T2.1 ─┬→ T2.6
T2.2 ─┤
T2.3 ─┼→ T2.5 → T2.7
T2.4 ─┘
T2.* → T3.* （执行稳定后再压内存）
```

---

## 测试建议

- 单测：`PlanDAG` 环检测、`Orchestrator` 层序、mailbox 顺序、`planVersion` 过滤。  
- 集成：WS 多用户隔离、两 Worker 并行 mock LLM。  
- E2E（可选 Playwright）：创建任务 → 对话 → 触发计划（mock）→ 看事件流。

---

## 文档维护

变更 API/事件时**同步**更新 [04-api-events-contracts.md](./04-api-events-contracts.md)。
