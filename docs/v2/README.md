# Agent Team v2 开发文档

> 版本: 2.0 | 更新: 2026-02-04

## 目录结构

```
docs/v2/
├── README.md                    # 本文档
├── architecture/
│   └── SYSTEM_DESIGN.md        # 架构设计文档
└── tasks/
    ├── P0_01_FIX_ROLE_VALIDATION_WARNINGS.md
    ├── P0_02_ENHANCE_PRODUCT_MANAGER_OUTPUT.md
    ├── P1_01_COMPLETE_AGENTS_API.md
    ├── P1_02_AGENT_STATUS_MONITORING.md
    ├── P1_03_FRONTEND_AGENTS_PAGE.md
    ├── P2_01_WORKFLOW_ENGINE.md
    ├── P2_02_WORKFLOW_API.md
    ├── P2_03_FRONTEND_WORKFLOWS_PAGE.md
    ├── P2_04_WORKFLOW_TRIGGERS.md
    ├── P3_01_PROJECT_DATA_STRUCTURE.md
    ├── P3_02_PROJECT_API.md
    ├── P3_03_FRONTEND_PROJECTS_PAGE.md
    ├── P4_01_ENHANCE_ROLE_SYSTEM.md
    ├── P4_02_TASK_DEPENDENCIES.md
    ├── P4_03_PERFORMANCE_OPTIMIZATION.md
    ├── P4_04_TEST_COVERAGE.md
    └── P4_05_ERROR_HANDLING.md
```

## 任务概览

### 状态说明

| 状态 | 描述 |
|------|------|
| pending | 未开始 |
| in_progress | 进行中 |
| done | 已完成 |

### 优先级

| 优先级 | 描述 |
|--------|------|
| P0 | 核心修复（必须优先） |
| P1 | 重要功能 |
| P2 | 一般功能 |
| P3 | 增强功能 |
| P4 | 优化项 |

## 快速开始

### 1. 选择任务

查看 `tasks/` 目录，选择一个 `pending` 状态的任务。

### 2. 阅读任务文档

每个任务文档包含：
- 任务信息（优先级、工时）
- 功能需求
- API 格式
- 验收标准
- 完成记录表格

### 3. 开始开发

```bash
# 启动开发服务器
npm run dev

# 运行测试
npm run test

# 构建
npm run build
```

## 任务执行顺序建议

```
阶段一（P0）
├── P0.1 修复角色验证警告
└── P0.2 完善 ProductManager 输出

阶段二（P1）
├── P1.1 完善 /api/agents 接口
├── P1.2 智能体状态监控
└── P1.3 前端智能体页面

阶段三（P2）
├── P2.1 工作流引擎核心
├── P2.2 工作流 API
├── P2.3 前端工作流页面
└── P2.4 工作流触发器（可选）

阶段三（P3）
├── P3.1 项目数据结构
├── P3.2 项目 API
└── P3.3 前端项目页面

阶段四（P4）
├── P4.1 角色系统增强
├── P4.2 任务依赖与并行
├── P4.3 性能优化
├── P4.4 测试覆盖
└── P4.5 错误处理增强
```

## 完成一个任务

1. **更新状态**: 将任务文档的 `status` 改为 `in_progress`
2. **开发实现**: 按文档要求开发
3. **测试验证**: 编写/运行测试
4. **更新记录**: 在文档末尾的完成记录表格中添加记录
5. **提交代码**: 提交并 PR

### 任务文档模板

```markdown
---
status: pending | in_progress | done
priority: P0 | P1 | P2 | P3 | P4
estimated_hours: X
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# 任务标题

## 任务信息

| 属性 | 值 |
|------|-----|
| 状态 | pending |
| 优先级 | P1 |
| 预估工时 | 8h |

## 描述

任务描述...

## 修改文件

- [ ] file1.ts
- [ ] file2.ts

## 验收标准

- [ ] 验收项1
- [ ] 验收项2

## 完成记录

| 日期 | 操作 | 负责人 |
|------|------|--------|
| YYYY-MM-DD | 完成 | xxx |
```

## 相关链接

- 架构设计: [SYSTEM_DESIGN.md](./architecture/SYSTEM_DESIGN.md)
- 项目首页: [README.md](../../README.md)
- 使用指南: [docs/guides/](../../guides/)
