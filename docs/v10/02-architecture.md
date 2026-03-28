# Agent Team v10.0 架构设计

**基于**: [01-requirements.md](./01-requirements.md)  
**关联契约**: [04-api-events-contracts.md](./04-api-events-contracts.md)

---

## 1. 逻辑架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户（HTTP / WebSocket）                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ 仅主会话消息
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  MasterAgentService                                              │
│  · 会话持久化 · 轻量 ReAct · 规划/创角色/创工人/发指令             │
└───────────────────────────────┬─────────────────────────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ RoleRepository   │  │ AgentRepository  │  │ Orchestrator      │
│ （持久化角色）     │  │ Master + Worker  │  │ DAG + 调度 + 信箱  │
└──────────────────┘  └────────┬─────────┘  └─────────┬─────────┘
                               │                       │
                               │ Worker 仅消费        │ planVersion
                               │ master 信箱           │
                               ▼                       ▼
                    ┌──────────────────────────────────────────┐
                    │ WorkerRunner（每 Worker 独立执行上下文）    │
                    │ · AgentExecutionEngine（或子类）            │
                    │ · AbortSignal · Role 工具白名单            │
                    │ · ContextBudget + Summarizer               │
                    └──────────────────────────────────────────┘
```

---

## 2. 模块划分（建议目录）

| 模块 | 职责 |
|------|------|
| `domain/orchestration/` | `PlanDAG`, `PlanNode`, `Edge`, `PlanVersion` 值对象；校验无环 |
| `domain/role/` | `Role` 实体、`IRoleRepository` |
| `domain/agent/` | 扩展 `Agent`：`kind`, `displayName`, `masterAgentId`, `mailboxSeq` |
| `application/master-agent/` | `MasterSession`, `MasterAgentService`, 主工具适配 |
| `application/orchestrator/` | `OrchestratorService`：下达节点、收集完成、触发并行层 |
| `application/worker-runner/` | 从信箱取指令、运行 ReAct、回写进度 |
| `application/context/` | `TokenEstimator`, `ContextCompressor`, `MemoryToolProvider` |
| `infrastructure/mailbox/` | 内存/文件队列；可选 Redis（后续） |

与现有 `container.ts` 关系：**新增**服务并注入；逐步替换 `TaskService.execute` 的树状硬编码路径为 **Orcalestrator + Master** 驱动（v10 可并行保留 `legacy` 开关）。

---

## 3. 通信序列（典型）

### 3.1 用户发起变更

```
用户 → WS: user.message
  → MasterAgentService.appendMessage + 触发主 ReAct
  → 主工具: send_worker_command(PATCH_BRIEF | CANCEL)
  → Orchestrator 写入目标 Worker 信箱 + bump planVersion（若结构性变更）
  → WorkerRunner 下轮循环读信箱 → Abort 或更新 brief → 继续/重跑
```

### 3.2 主 Agent 创建工人

```
主工具: create_role（可选）→ RoleRepository.save
主工具: create_worker(roleId, displayName, initialBrief)
  → AgentRepository.save(worker)
  → Orchestrator.registerWorker(workerId)
  → （计划就绪后）ASSIGN_WORK 入队
```

---

## 4. 编排与并发

- **输入**：主 Agent `submit_plan` 产出的 JSON（JSON Schema 校验失败则拒收并反馈主 Agent）。
- **调度**：
  - 构建邻接表与入度；
  - 每层入度为 0 的节点进入「就绪集」；同层默认并行，除非节点标记 `serialGroup`；
  - 节点完成事件：`worker.to.master.progress(COMPLETED)` → Orchestrator 减少后继入度。
- **取消**：`CANCEL` 广播或按 `workerId`；未启动节点直接移除；运行中节点 `AbortController.abort()`。

---

## 5. 上下文与记忆管道

```
┌─────────────┐    软/硬阈值     ┌──────────────┐
│  Raw 消息环  │ ───────────────► │ Summarizer   │
└──────────────┘                  │ (LLM 或规则)  │
        │                         └──────┬───────┘
        │                                │
        ▼                                ▼
┌─────────────┐                  ┌──────────────┐
│  Sliding    │                  │ memory_append │
│  Window     │                  │ VectorStore   │
└─────────────┘                  └──────────────┘
```

- **隔离键**：`namespace = taskId + '/' + agentId`（主 Agent 用固定 `master` id）。  
- **双轨摘要**（推荐）：`userFacingSummary` 与 `internalStateSummary` 分表或分表前缀，避免内部 DAG 细节默认暴露给用户。

---

## 6. 安全与权限

- **Role.allowedTools** 为 Worker 工具上限；系统级 `maxToolsPerRole`。  
- **主 Agent 工具** 单独列表，禁止未经审计的任意 open-ended shell（若保留 `execute_command` 须策略位）。  
- 插件：仍走 v9 `PluginSandbox`；动态 Role 引用插件工具须显式 allowlist。

---

## 7. 可观测性

- Span：`master.turn`, `worker.run`, `orchestrator.node`, `mailbox.deliver`。  
- Metrics：`mailbox_depth`, `worker_aborts_total`, `plan_version_bumps_total`, `summary_runs_total`。  
- 与现有 `attachObservability` 对齐：Worker 侧 `AgentExecutionEngine` 继续发 `loop:*`；Master 侧轻量引擎可发同类事件。

---

## 8. 迁移策略

1. `Task` 增加 `orchestrationMode: 'v9-legacy' | 'v10-master'`。  
2. 默认新任务 `v10-master`；旧集成可显式 legacy。  
3. `TaskService.start`：若 v10 → 仅 **初始化 Master 会话 + 状态 intake**；**不**直接 `executeDirectly`。

---

## 9. 文件结构（规划）

```
docs/v10/
├── 01-requirements.md
├── 02-architecture.md      # 本文件
├── 03-task-breakdown.md
└── 04-api-events-contracts.md
```

实现阶段建议在 `src/` 增加 `application/master-agent/`、`domain/orchestration/` 等（以实现 PR 为准）。
