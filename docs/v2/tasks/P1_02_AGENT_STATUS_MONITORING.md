---
status: pending
priority: P1
estimated_hours: 6
created: 2026-02-04
updated: 2026-02-04
---

# P1.2 智能体状态监控

## 任务信息

| 属性 | 值 |
|------|-----|
| 状态 | pending |
| 优先级 | P1 |
| 预估工时 | 6h |
| 负责人 | - |
| 关联任务 | P1.1, P1.3 |

## 描述

实现智能体实时状态监控和健康检查机制。

## 功能需求

- 心跳机制（定时上报状态）
- 状态持久化
- 自动重启失败智能体
- 状态变更事件通知

## 心跳协议

### 心跳请求

```json
{
  "agentId": "agent-xxx",
  "status": "running",
  "currentTask": "task-xxx",
  "completedTasks": 5,
  "memoryUsage": 102400000,
  "timestamp": "2026-02-04T10:00:00.000Z"
}
```

### 心跳响应

```json
{
  "success": true,
  "action": "continue" | "restart" | "stop",
  "message": "继续执行"
}
```

## 状态定义

| 状态 | 描述 |
|------|------|
| idle | 空闲，等待任务 |
| running | 执行中 |
| error | 错误 |
| starting | 启动中 |
| stopping | 停止中 |

## 监控规则

- 心跳超时：60 秒
- 连续失败 3 次：自动重启
- 内存 > 500MB：告警
- CPU > 90%：告警

## 修改文件

- [ ] `src/core/agent-mgr.ts`
- [ ] `src/core/events.ts`
- [ ] `src/server/routes/agents.ts`

## 验收标准

- [ ] 智能体定时发送心跳
- [ ] 心跳超时时能检测
- [ ] 失败智能体自动重启
- [ ] 状态变更有事件通知

## 技术备注

使用 EventSystem 进行状态变更通知。

---

## 完成记录

| 日期 | 操作 | 负责人 |
|------|------|--------|
| - | - | - |
