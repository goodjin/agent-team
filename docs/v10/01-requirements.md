# Agent Team v10.0 产品需求文档（PRD）

**版本**: 10.0.0  
**状态**: 草案  
**上一版本**: v9.0（自进化与插件生态）  
**主题**: **主控会话编排（Master Session Orchestration）**

---

## 1. 背景与问题

v9 及以前主线为：**接单 → 启动任务 → 单次或树状子任务 ReAct 执行**，缺少：

- 与用户**持续对齐**的讨论阶段；
- **中途变更需求**的官方路径；
- **专责主控**与**具名工人**的显式分工与通信；
- **角色**在运行时可新建并**持久化**；
- 多 Agent 场景下**上下文窗口**与**可检索记忆**的系统化治理。

v10 在保留任务单据、工具生态、插件与记忆底座的前提下，引入 **每任务一主 Agent + 多 Worker Agent** 的编排模型。

---

## 2. 目标（可验收）

| ID | 目标 | 验收要点 |
|----|------|----------|
| G1 | 每任务有且仅有一个**主 Agent**，可与用户**多轮对话** | 任务创建后默认不「闷头执行」；用户消息进入主会话；有关闭/移交完成等状态 |
| G2 | 主 Agent **规划与拆分**，**创建** Worker（须带 **role + displayName**） | 创建 Worker 前校验 `roleId`；缺角色则**新建 Role 并持久化** |
| G3 | 用户 **仅**与主 Agent 对话；Worker **仅**响应主 Agent | 协议与 API 层禁止用户直联 Worker 会话（管理员/调试模式可另议） |
| G4 | 主 ↔ Worker **异步通信**：叫停、改需求、查进度 | 事件/信箱模型；Worker 可中止当前执行（见架构） |
| G5 | **并行/串行**由主 Agent 声明，系统执行 DAG/阶段调度 | 同层可并行；依赖边阻塞后续节点 |
| G6 | **上下文与记忆**：自动压缩 + 记忆工具，按 agent/task 隔离 | Token 超阈触发摘要；提供 `memory_*` 类工具（见契约） |

非目标（v10.0 可排除或标为后续）：

- 可视化 DAG 编辑器（可用 JSON/日志替代）；
- 跨任务全局主 Agent；
- 完全取代 v9 插件模型（**共存**）。

---

## 3. 用户故事（摘要）

1. **作为用户**，创建任务后我与主 Agent 对话，确认范围与约束，再让它开始派工。  
2. **作为用户**，执行中我随时说「先停后端那段」或「把验收标准改成…」，主 Agent 应能转译并下发给对应 Worker。  
3. **作为用户**，我问「现在谁在做、做到哪了」，主 Agent 应基于编排状态与 Worker 回报作答。  
4. **作为运维**，重启进程后**角色与工人元数据**仍在，新建任务可复用已有 Role。

---

## 4. 术语

| 术语 | 定义 |
|------|------|
| 主 Agent（Master） | 每任务一个，负责用户沟通、规划、建角色/工人、下发指令、监控 |
| Worker | 由主 Agent 创建，**displayName + roleId**；只处理主 Agent 信箱指令 |
| Role | 持久化实体：prompt、工具策略等；无则创建后保存 |
| 编排图（Plan/DAG） | 主 Agent 输出的有向执行计划（节点=工作单元，边=依赖） |
| 信箱（Mailbox） | 每 Agent 一个 FIFO（可扩展优先级），异步收发指令与回执 |

---

## 5. 功能需求

### 5.1 任务与生命周期

- 任务状态机扩展：`draft`, `intake`, `planning`, `executing`, `awaiting_user`, `replanning`, `completed`, `failed`, `cancelled`（具体枚举以实现为准，须与 v9 状态兼容或迁移表）。
- **禁止**：在未进入「用户确认或明确开始执行」前，自动跑满 Worker ReAct（可配置策略 `autoStartWorkers: false` 默认）。

### 5.2 主 Agent 会话

- 持久化：**taskId + masterAgentId** 绑定；消息列表可分区为 `user|assistant|system|tool`。
- 主 Agent 工具集（最小集）：`submit_plan`, `create_role`, `create_worker`, `send_worker_command`, `query_orchestration_state`, `memory_search`, `memory_append`, `request_user_clarification`（可选）等（详见 `04-api-events-contracts.md`）。

### 5.3 Role 持久化

- 存储：文件或现有 `FileStore` 下 `roles/` 命名空间。
- 字段：`id`, `name`, `description`, `systemPrompt`, `allowedTools[]`, `defaultParams`, `createdAt`, `source`（`builtin` | `user` | `master`）。
- **创建 Worker** 时：若 `roleId` 不存在 → 主 Agent 须先 `create_role`（或由系统根据结构化 payload 自动 upsert）。

### 5.4 Worker 与命名

- 字段：`id`, `taskId`, `kind: worker`, `masterAgentId`, `roleId`, **`displayName`**（用户可读，唯一建议：同 task 内唯一）, `status`, `mailboxCursor`, `currentPlanNodeId`（可选）。
- **displayName** 由主 Agent 生成或模板 `{roleSlug}-{序号}`。

### 5.5 异步通信

- **指令类型**（最小）：`ASSIGN_WORK` | `CANCEL` | `PATCH_BRIEF` | `QUERY_STATUS` | `PING`。  
- **回执类型**：`ACK` | `PROGRESS` | `COMPLETED` | `FAILED` | `QUESTION_TO_MASTER`。  
- 所有消息带 **`correlationId`**，计划变更时递增 **planVersion**，Worker 丢弃 `planVersion` 过期的指令（可配置）。

### 5.6 并行与串行

- 主 Agent 输出 **DAG 或阶段列表**：节点含 `nodeId`, `workerId` 或 `roleHint`, `dependsOn[]`, `parallelGroup`（可选）。
- 调度器：**拓扑排序**；同层无依赖节点可 `Promise.all`；`CANCEL` 清空未开始节点。

### 5.7 上下文压缩与记忆

- **每 Agent 独立** token 预算与摘要存储（命名空间：`taskId/agentId`）。
- **触发**：软阈预警、硬阈强制摘要；主会话可对用户可见摘要与内部摘要保持双轨（产品策略）。
- **记忆工具**：检索/追加/触发摘要（与 v8 `AgentMemory` / `ProjectKnowledgeBase` / VectorStore 打通，命名空间隔离）。

### 5.8 与 v9 兼容

- 插件工具仍进入共享 `ToolRegistry`；**Worker** 的工具范围由 **Role.allowedTools** 限制；**主 Agent** 工具集单独白名单。
- `SelfEvaluator` / `PromptOptimizer`：可对 **Worker 执行结束事件**继续评估（延续 v9），主会话单独指标可后续加。

---

## 6. 非功能需求

| 项 | 要求 |
|----|------|
| 可用性 | 主 Agent 须能解释「当前计划与进度」（自然语言 + 结构化状态 API） |
| 一致性 | `planVersion` + `correlationId` 防乱序；信箱 per-agent 串行消费 |
| 安全 | 动态 Role 的工具列表**不得**超过系统策略上限；敏感操作审计日志 |
| 性能 | 主 Agent 轮次宜轻量；Worker 重执行不与主会话阻塞同线程（实现上协程/队列） |

---

## 7. 里程碑（建议）

| 阶段 | 内容 | 周期（参考） |
|------|------|----------------|
| M1 | 主会话 + WS、单 Worker、Abort 叫停、`planVersion` 骨架 | 2w |
| M2 | Role/Worker 持久化、信箱、主指令、简单 DAG 两层并行 | 3w |
| M3 | 自动压缩 + memory_* 工具 + 命名空间记忆 | 2w |
| M4 | 复杂 DAG、可视/审计、指标看板 | 按需 |

---

## 8. 文档索引

- [架构设计](./02-architecture.md)  
- [任务拆分](./03-task-breakdown.md)  
- [API / 事件 / 契约](./04-api-events-contracts.md)

---

## 9. 开放问题

| # | 问题 | 备选 | 建议 |
|---|------|------|------|
| O1 | 旧任务迁移 | 保留 v9 一键执行路径作 `legacy` 模式 | v10 新模式默认；旧 API 加 `orchestration=v9` 参数 |
| O2 | 主 Agent 模型 | 与 Worker 同模型或独立小模型 | 默认同 provider，配置项 `masterModel` |
| O3 | 用户可见记忆 | 用户能否读 memory_search | 默认仅主 Agent；产品开关 |
