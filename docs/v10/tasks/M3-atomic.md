# v10 M3 原子任务详单（已实现 / 跟踪）

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| C1 | `TokenEstimator` | 文本/消息/对话历史估算 | 完成 |
| C2 | `ContextCompressor` | 主会话超软阈值摘要；ReAct 超硬阈值压一条 user | 完成 |
| C3 | `NamespaceMemoryService` + `memory_*` 工具 | `taskId/agentId` 命名空间；Worker 可调用 | 完成 |
| C4 | 主控工具增加 memory_* | `MasterToolExecutor` 与 Worker 共用 `MemoryToolHandlers` | 完成 |
| C5 | `ProjectKnowledgeBase` 镜像 | `memory_append` 同步写入 `projectId=taskId` store（失败忽略） | 完成 |
| C6 | 双轨摘要 | `track` / `memory_summarize` 写 userFacing+internal；主 system 注入 `internalDigest` 与 `memorySummaryInternal` | 完成 |

完成后在上方「状态」列改为 **完成**。

**配置**：压缩阈值见项目根 `context-compression.config.json`（示例：`context-compression.config.example.json`）及环境变量 `AGENT_CONTEXT_*`（见 `AGENTS.md`）。
