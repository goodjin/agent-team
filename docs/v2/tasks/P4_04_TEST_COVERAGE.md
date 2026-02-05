---
status: pending
priority: P4
estimated_hours: 16
created: 2026-02-04
updated: 2026-02-04
---

# P4.4 测试覆盖

## 任务信息

| 属性 | 值 |
|------|-----|
| 状态 | pending |
| 优先级 | P4 |
| 预估工时 | 16h |
| 负责人 | - |

## 描述

添加单元测试和集成测试。

## 测试框架

- **单元测试**: Vitest (已有)
- **E2E 测试**: Playwright (已有配置)
- **API 测试**: Supertest

## 测试覆盖要求

### 单元测试

- [ ] 角色解析 (roles/*)
- [ ] 任务管理 (task-manager, task-orchestrator)
- [ ] LLM 服务 (llm-service)
- [ ] 工作流引擎 (workflow-engine)
- [ ] 配置加载 (config-loader)

### API E2E 测试

- [ ] `/api/tasks` - 任务 CRUD
- [ ] `/api/tasks/chat` - 对话式任务
- [ ] `/api/projects` - 项目 CRUD
- [ ] `/api/agents` - 智能体管理
- [ ] `/api/workflows` - 工作流 CRUD

### 浏览器 E2E 测试

- [ ] 页面加载
- [ ] 任务创建流程
- [ ] 任务执行流程
- [ ] 错误处理

## 测试覆盖率目标

- 行覆盖率: > 70%
- 分支覆盖率: > 60%

---

## 完成记录

| 日期 | 操作 | 负责人 |
|------|------|--------|
| - | - | - |
