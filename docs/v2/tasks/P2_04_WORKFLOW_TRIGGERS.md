---
status: pending
priority: P3
estimated_hours: 8
created: 2026-02-04
updated: 2026-02-04
---

# P2.4 工作流触发器

## 任务信息

| 属性 | 值 |
|------|-----|
| 状态 | pending |
| 优先级 | P3 |
| 预估工时 | 8h |
| 负责人 | - |
| 关联任务 | P2.1 |

## 描述

实现工作流自动触发机制，支持定时、事件、Webhook 触发。

## 触发类型

### 1. 定时触发（Cron）

```json
{
  "type": "schedule",
  "cron": "0 0 * * *",  // 每天凌晨
  "timezone": "Asia/Shanghai",
  "inputs": {}
}
```

### 2. Webhook 触发

```json
{
  "type": "webhook",
  "path": "/webhooks/github/pull-request",
  "method": "POST",
  "signature": "sha256=..."
}
```

### 3. 事件触发

```json
{
  "type": "event",
  "event": "task.completed",
  "condition": "task.assignedRole == 'developer'"
}
```

## 功能需求

- [ ] Cron 表达式解析
- [ ] 定时任务调度器
- [ ] Webhook 接收端点
- [ ] 事件监听器
- [ ] 触发条件表达式
- [ ] 触发历史记录

## API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/workflows/:id/triggers` | 获取触发器列表 |
| POST | `/api/workflows/:id/triggers` | 添加触发器 |
| DELETE | `/api/triggers/:triggerId` | 删除触发器 |
| POST | `/api/webhooks/:path` | Webhook 端点 |

## 修改文件

- [ ] `src/core/scheduler.ts` (新建)
- [ ] `src/core/webhook-handler.ts` (新建)
- [ ] `src/server/routes/webhooks.ts` (新建)

---

## 完成记录

| 日期 | 操作 | 负责人 |
|------|------|--------|
| - | - | - |
