---
status: pending
priority: P3
estimated_hours: 4
created: 2026-02-04
updated: 2026-02-04
---

# P3.1 项目数据结构

## 任务信息

| 属性 | 值 |
|------|-----|
| 状态 | pending |
| 优先级 | P3 |
| 预估工时 | 4h |
| 负责人 | - |
| 关联任务 | P3.2, P3.3 |

## 描述

定义完整的项目数据结构和存储方案。

## 数据结构

### Project

```typescript
interface Project {
  id: string;
  name: string;
  path: string;              // 本地路径
  description: string;
  status: 'active' | 'archived';
  config: ProjectConfig;
  members: ProjectMember[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

### ProjectConfig

```typescript
interface ProjectConfig {
  defaultRole?: string;      // 默认角色
  llmProvider?: string;      // 默认 LLM
  llmModel?: string;        // 默认模型
  constraints?: Record<string, any>;  // 项目约束
  environment?: Record<string, string>;  // 环境变量
}
```

### ProjectMember

```typescript
interface ProjectMember {
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: Date;
}
```

## 存储方案

- [ ] 文件存储：`~/.agent-team/projects/{projectId}.json`
- [ ] 项目路径自动扫描
- [ ] Git 仓库集成

## 修改文件

- [ ] `src/types/project.ts` (新建)

---

## 完成记录

| 日期 | 操作 | 负责人 |
|------|------|--------|
| - | - | - |
