# v10 M2 原子任务详单（已实现 / 跟踪）

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| B1 | `RoleRepository` + `data/roles/*.json` | `save`/`findById`/`list` | 完成 |
| B2 | `Agent` 扩展 `displayName`、`masterAgentId` | create_worker 写入 | 完成 |
| B3 | `RoleMatcher.getBuiltinRole` / `getRole` | 未知 id 回落 `backend-dev`（已移除 task-analyzer） | 完成 |
| B4 | `WorkerMailbox` FIFO + priority | 同 worker 串行消费 | 完成 |
| B5 | 领域事件 `master.to.worker.command`、`worker.to.master.progress`、`orch.plan.submitted` 等 | EventBus 可订阅 | 完成 |
| B6 | `OrchestratorService` submit_plan / start / DAG 推进 | `POST .../orchestration/start` 可跑层序 | 完成 |
| B7 | 主控工具 `create_role`、`create_worker`、`submit_plan`、`send_worker_command`、`query_orchestration_state`、`reply_user` | Master LLM 多轮 tool 循环 | 完成 |
| B8 | `WorkerRunner` ASSIGN_WORK → `AgentService.execute` + Abort（CANCEL） | 信箱驱动执行 | 完成 |
| B9 | REST `GET/POST /api/roles`、`GET /api/tasks/:id/workers` | 与契约对齐 | 完成 |
| B10 | WS `orchestration.plan_updated`、`worker.status` | 编排侧广播 | 完成 |
| B11 | `execution-engine` 注入 `workerBrief` | 工人首轮 user 消息含派工说明 | 完成 |

完成后在上方「状态」列改为 **完成**。
