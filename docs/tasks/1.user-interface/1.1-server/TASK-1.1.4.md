# 1.1.4 角色和智能体 API 路由

## 任务描述
实现角色和智能体管理的 REST API 路由。

## 输入
- 无

## 输出
- `src/server/routes/roles.ts` - 角色相关路由
- `src/server/routes/agents.ts` - 智能体相关路由

## 验收标准
1. `GET /api/roles` - 返回角色列表
2. `GET /api/roles/:id` - 返回角色详情（含提示词路径）
3. `POST /api/roles` - 创建新角色
4. `PATCH /api/roles/:id` - 更新角色（提示词路径）
5. `DELETE /api/roles/:id` - 删除角色
6. `GET /api/agents` - 返回智能体列表
7. `GET /api/agents/:id` - 返回智能体详情
8. `POST /api/agents` - 创建智能体
9. `POST /api/agents/:id/restart` - 重启智能体

## 依赖任务
- 1.1.2 REST API 路由实现
- 3.2.1 RoleManager 角色提示词管理器
- 2.1.2 AgentMgr 智能体管理模块

## 估计工时
3h

## 优先级
中

## 任务内容
1. 创建 `src/server/routes/roles.ts`
   - GET /api/roles - 列出所有角色
   - GET /api/roles/:id - 获取角色详情
   - POST /api/roles - 创建角色（仅保存ID和提示词路径）
   - PATCH /api/roles/:id - 更新角色提示词路径
   - DELETE /api/roles/:id - 删除角色

2. 创建 `src/server/routes/agents.ts`
   - GET /api/agents - 列出所有智能体
   - GET /api/agents/:id - 获取智能体详情
   - POST /api/agents - 创建智能体（绑定角色）
   - POST /api/agents/:id/restart - 重启智能体
