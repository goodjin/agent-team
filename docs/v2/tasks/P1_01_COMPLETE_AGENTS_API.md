---
status: pending
priority: P1
estimated_hours: 8
created: 2026-02-04
updated: 2026-02-04
---

# P1.1 完善 /api/agents 接口

## 任务信息

| 属性 | 值 |
|------|-----|
| 状态 | pending |
| 优先级 | P1 |
| 预估工时 | 8h |
| 负责人 | - |
| 关联任务 | P1.2, P1.3 |

## 描述

当前 `/api/agents` 返回空数组，需要实现真正的智能体生命周期管理。

## 功能需求

- 创建智能体（指定角色、LLM 配置）
- 查询智能体列表及状态
- 智能体心跳检测
- 智能体重启/停止

## API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/agents` | 列出所有智能体 |
| POST | `/api/agents` | 创建智能体 |
| GET | `/api/agents/:id` | 获取智能体详情 |
| PUT | `/api/agents/:id` | 更新智能体配置 |
| DELETE | `/api/agents/:id` | 删除智能体 |
| POST | `/api/agents/:id/restart` | 重启智能体 |
| POST | `/api/agents/:id/stop` | 停止智能体 |

## 请求/响应格式

### 创建智能体请求

```json
{
  "name": "my-agent",
  "roleId": "developer",
  "llmProvider": "zhipu-primary",
  "llmModel": "glm-4"
}
```

### 智能体响应

```json
{
  "id": "agent-xxx",
  "name": "my-agent",
  "roleId": "developer",
  "status": "idle",
  "llmProvider": "zhipu-primary",
  "llmModel": "glm-4",
  "completedTasks": 0,
  "createdAt": "2026-02-04T10:00:00.000Z",
  "lastActiveAt": "2026-02-04T10:00:00.000Z"
}
```

## 修改文件

- [ ] `src/server/routes/agents.ts`
- [ ] `src/core/agent-mgr.ts`
- [ ] `src/types/index.ts` (Agent 类型)

## 验收标准

- [ ] API 端点按表格实现
- [ ] 创建智能体成功
- [ ] 能查询智能体列表
- [ ] 能更新/删除智能体

## 技术备注

AgentMgr 已存在，需要扩展功能。

---

## 完成记录

| 日期 | 操作 | 负责人 |
|------|------|--------|
| - | - | - |
