# v10 API / WebSocket / 领域事件契约

**用途**: 前后端与实现共用的接口与载荷约定；**非最终实现**时可在 PR 中修订并回写本文。

---

## 1. REST（任务与资源）

### 1.1 任务

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/tasks` | 创建任务；body 可增 `orchestrationMode: 'v10-master' \| 'v9-legacy'`（默认 v10） |
| `GET` | `/api/tasks/:id` | 含扩展字段 `masterAgentId`, `orchestrationState`, `planVersion` |
| `POST` | `/api/tasks/:id/master/start` | **v10**：启动主会话（intake），不自动派工 |
| `POST` | `/api/tasks/:id/orchestration/start` | **v10**：与 `submit_plan` 成功后的自动启动逻辑相同；**正常路径无需调用**（进程重启导致内存计划丢失等排错时可手动调） |

### 1.2 角色（v10）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/roles` | 内置 + 持久化角色合并列表 |
| `POST` | `/api/roles` | 手动创建角色（可选；主 Agent 也可仅内部创建） |
| `GET` | `/api/roles/:id` | 详情 |

### 1.3 工人 Agent（v10）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/tasks/:id/workers` | 列出本任务 Worker（含 `displayName`, `status`） |
| `GET` | `/api/tasks/:taskId/workers/:workerId` | 元数据；**不含**用户直连接口 |

### 1.4 主会话消息（若不用 WS 的降级）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/tasks/:id/master/messages` | body: `{ role:'user'|'system', content: string }` |

---

## 2. WebSocket

### 2.1 连接

- 建议路径：`/ws` 或 `/api/ws`，query：`taskId` + `clientId`（可选）。
- 鉴权：与现有网关策略一致（本文件不规定）。

### 2.2 客户端 → 服务端

| type | payload | 说明 |
|------|---------|------|
| `user.message` | `{ taskId, content, clientMessageId? }` | 用户话进入主会话 |
| `user.ping` | `{}` | 心跳 |

### 2.3 服务端 → 客户端

| type | payload | 说明 |
|------|---------|------|
| `master.reply.delta` | `{ taskId, delta, messageId }` | 流式可选 |
| `master.reply.done` | `{ taskId, messageId, content }` | 完整回复 |
| `master.tool_call` | `{ taskId, name, argsRedacted }` | 可配置是否下发 |
| `orchestration.plan_updated` | `{ taskId, planVersion, summary }` | 计划变更 |
| `worker.status` | `{ taskId, workerId, displayName, status }` | 进度广播 |
| `error` | `{ code, message }` | |

---

## 3. 领域事件（EventBus `type` 字符串）

### 3.1 现有保留

- `task.status_changed`, `task.progress`, `task.created` …（与 v7/v9 兼容）

### 3.2 v10 新增（建议前缀 `orch.` / `master.`）

| type | payload 要点 |
|------|----------------|
| `master.session.started` | `{ taskId, masterAgentId }` |
| `master.message.appended` | `{ taskId, role, contentLength }` |
| `orch.plan.submitted` | `{ taskId, planVersion, nodeCount }` |
| `orch.node.ready` | `{ taskId, planVersion, nodeId }` |
| `orch.node.completed` | `{ taskId, planVersion, nodeId, workerId }` |
| `master.to.worker.command` | `{ taskId, targetWorkerId, command, correlationId, planVersion, body }` |
| `worker.to.master.progress` | `{ taskId, workerId, kind: 'PROGRESS'\|'COMPLETED'\|'FAILED', correlationId?, detail? }` |
| `worker.mailbox.deadletter` | `{ taskId, workerId, reason }` |

**command.body** 结构（示例，可 JSON Schema 化）：

```json
{
  "op": "ASSIGN_WORK",
  "brief": "…工作说明…",
  "successCriteria": ["…"]
}
```

```json
{ "op": "CANCEL", "reason": "user requested stop" }
```

```json
{ "op": "PATCH_BRIEF", "brief": "…修订后说明…" }
```

```json
{ "op": "QUERY_STATUS", "replyToCorrelationId": "…" }
```

---

## 4. 主 Agent 工具（LLM function 名建议）

| 工具名 | 作用 |
|--------|------|
| `reply_user` | 生成对用户的可见回复（写入主会话 + 可选 WS） |
| `create_role` | upsert 持久化 Role |
| `create_worker` | `roleId` + `displayName` + 可选 `initialBrief` |
| `submit_plan` | DAG JSON（经服务端校验） |
| `send_worker_command` | 封装 `master.to.worker.command` |
| `query_orchestration_state` | 读当前 DAG/工人状态 |
| `memory_search` | 检索（命名空间默认当前 task + master） |
| `memory_append` | 追加结构化条目 |
| `memory_summarize` | 触发当前 agent 上下文摘要 |

Worker 侧工具：**不**包含 `reply_user`、**不**包含 `create_worker`（除非产品明确打开，默认关闭）。

---

## 5. `submit_plan` JSON Schema（草案）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["version", "nodes"],
  "properties": {
    "version": { "type": "integer", "minimum": 1 },
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "workerId"],
        "properties": {
          "id": { "type": "string" },
          "workerId": { "type": "string" },
          "dependsOn": { "type": "array", "items": { "type": "string" } },
          "parallelGroup": { "type": "string" }
        }
      }
    }
  }
}
```

服务端：**校验 DAG 无环**、`workerId` 均属本任务已存在工人、**planVersion** 单调。

---

## 6. 错误码（HTTP / WS）

| code | 含义 |
|------|------|
| `TASK_NOT_FOUND` | |
| `ORCH_INVALID_PLAN` | DAG 校验失败 |
| `ROLE_NOT_FOUND` | 创建工人前缺角色且未自动创建 |
| `WORKER_NOT_FOUND` | |
| `STALE_PLAN_VERSION` | 指令过期 |
| `MASTER_NOT_STARTED` | |

---

## 7. 版本与修订

- 文档版本：与 **v10.0 PRD** 同级迭代。  
- 破坏性变更：`orch.*` / WS type 变更时在 `CHANGELOG` 与本文档打 **revision** 小节。
