---
status: pending
priority: P2
estimated_hours: 8
created: 2026-02-04
updated: 2026-02-04
---

# P2.2 工作流 API

## 任务信息

| 属性 | 值 |
|------|-----|
| 状态 | pending |
| 优先级 | P2 |
| 预估工时 | 8h |
| 负责人 | - |
| 关联任务 | P2.1, P2.3 |

## 描述

实现工作流 CRUD 和执行接口。

## API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/workflows` | 列出所有工作流 |
| POST | `/api/workflows` | 创建工作流 |
| GET | `/api/workflows/:id` | 获取工作流详情 |
| PUT | `/api/workflows/:id` | 更新工作流 |
| DELETE | `/api/workflows/:id` | 删除工作流 |
| POST | `/api/workflows/:id/execute` | 执行工作流 |
| GET | `/api/workflows/:id/executions` | 获取执行历史 |
| GET | `/api/workflows/executions/:executionId` | 获取单次执行详情 |
| POST | `/api/workflows/executions/:executionId/stop` | 停止执行 |

## 请求/响应格式

### 创建工作流请求

```json
{
  "name": "新功能开发流程",
  "description": "标准的新功能开发工作流",
  "steps": [
    {
      "id": "step-1",
      "name": "需求分析",
      "type": "role",
      "config": { "roleId": "product-manager" }
    },
    {
      "id": "step-2",
      "name": "技术设计",
      "type": "role",
      "config": { "roleId": "architect" },
      "next": ["step-3"]
    }
  ],
  "timeout": 3600000
}
```

### 工作流响应

```json
{
  "success": true,
  "data": {
    "id": "wf-xxx",
    "name": "新功能开发流程",
    "status": "active",
    "executionCount": 0,
    "lastExecutedAt": null,
    "createdAt": "2026-02-04T10:00:00.000Z"
  }
}
```

### 执行响应

```json
{
  "success": true,
  "data": {
    "executionId": "exec-xxx",
    "status": "running",
    "currentStep": "step-2",
    "progress": 33
  }
}
```

## 修改文件

- [ ] `src/server/routes/workflows.ts` (新建或修改)

## 验收标准

- [ ] 所有 API 端点按表格实现
- [ ] CRUD 操作正常
- [ ] 能成功发起执行
- [ ] 能查询执行状态和历史

---

## 完成记录

| 日期 | 操作 | 负责人 |
|------|------|--------|
| - | - | - |
