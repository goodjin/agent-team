---
status: pending
priority: P3
estimated_hours: 6
created: 2026-02-04
updated: 2026-02-04
---

# P3.2 项目 API

## 任务信息

| 属性 | 值 |
|------|-----|
| 状态 | pending |
| 优先级 | P3 |
| 预估工时 | 6h |
| 负责人 | - |
| 关联任务 | P3.1, P3.3 |

## 描述

完善项目 CRUD 接口。

## API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/projects` | 列出项目 |
| POST | `/api/projects` | 创建项目 |
| GET | `/api/projects/:id` | 获取项目详情 |
| PUT | `/api/projects/:id` | 更新项目 |
| DELETE | `/api/projects/:id` | 删除项目 |
| PATCH | `/api/projects/:id/status` | 更新状态 |
| GET | `/api/projects/:id/stats` | 获取项目统计 |
| GET | `/api/projects/:id/members` | 获取成员列表 |
| POST | `/api/projects/:id/members` | 添加成员 |
| DELETE | `/api/projects/:id/members/:userId` | 移除成员 |

## 请求/响应格式

### 创建项目请求

```json
{
  "name": "我的项目",
  "path": "/path/to/project",
  "description": "项目描述",
  "config": {
    "defaultRole": "developer",
    "llmProvider": "zhipu-primary"
  }
}
```

### 项目响应

```json
{
  "success": true,
  "data": {
    "id": "proj-xxx",
    "name": "我的项目",
    "path": "/path/to/project",
    "description": "项目描述",
    "status": "active",
    "taskCount": 10,
    "memberCount": 3,
    "createdAt": "2026-02-04T10:00:00.000Z"
  }
}
```

## 修改文件

- [ ] `src/server/routes/projects.ts`
- [ ] `src/core/project-store.ts` (新建)

---

## 完成记录

| 日期 | 操作 | 负责人 |
|------|------|--------|
| - | - | - |
