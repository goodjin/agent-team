# v10 M1 原子任务详单（已实现 / 跟踪）

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| A1 | Task / CreateTaskParams 扩展 `orchestrationMode`、`masterAgentId`、`orchestrationState`、`planVersion` | 创建任务可写 v10 字段 | 完成 |
| A2 | `task-master` 角色内置 | `RoleMatcher.getRole('task-master')` 可返回 | 完成 |
| A3 | `MasterAgentService`：`ensureSessionStarted`、`handleUserMessage` | start v10 后落库 Master Agent；用户消息追加历史并调用 LLM | 完成 |
| A4 | `TaskService.start` 分支 `v10-master` | 不进入 complexity/split/scheduler.execute | 完成 |
| A5 | WebSocket `message` 解析 `user.message` | 回调到 MasterAgentService | 完成 |
| A6 | REST `POST /api/tasks/:id/master/messages` | body.content 同 WS | 完成 |
| A7 | `WebSocketEvent` 增加 `master_reply` | 客户端可收主 Agent 回复 | 完成 |
| A8 | `AgentExecutionEngine.execute` + `AbortSignal` | `signal.aborted` 退出循环 | 完成 |
| A9 | `AgentService.execute` 透传 options | 签名为第三参 | 完成 |
| A10 | `master.session.started` EventBus | container 或 Master 发布 | 完成 |

完成后在上方「状态」列改为 **完成**。
