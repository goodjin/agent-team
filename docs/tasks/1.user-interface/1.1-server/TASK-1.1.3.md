# 1.1.3 任务管理 API 路由

## 任务描述
实现任务管理的 REST API 路由，包括任务列表、任务详情、任务状态更新等接口。

## 输入
- 无

## 输出
- `src/server/routes/tasks.ts` - 任务相关路由

## 验收标准
1. `GET /api/projects/:projectId/tasks` - 返回项目任务列表
2. `GET /api/projects/:projectId/tasks/:taskId` - 返回任务详情
3. `POST /api/projects/:projectId/tasks` - 创建新任务（自然语言描述）
4. `PATCH /api/projects/:projectId/tasks/:taskId/status` - 更新任务状态
5. `DELETE /api/projects/:projectId/tasks/:taskId` - 删除任务
6. 支持按分类筛选任务

## 依赖任务
- 1.1.2 REST API 路由实现
- 2.1.1 TaskManager 任务管理模块

## 估计工时
3h

## 优先级
高

## 任务内容
1. 创建 `src/server/routes/tasks.ts`
   - 实现 GET /api/projects/:projectId/tasks 路由
     - 支持 category、status 查询参数筛选
     - 调用 TaskManager 获取任务列表
     - 返回任务基本信息（不含详细内容）

   - 实现 GET /api/projects/:projectId/tasks/:taskId 路由
     - 调用 TaskManager 获取任务详情
     - 返回任务完整信息（描述、进度、执行记录）

   - 实现 POST /api/projects/:projectId/tasks 路由
     - 接收自然语言任务描述
     - 调用 TaskManager 创建任务
     - 返回创建的任务信息（含编号）

   - 实现 PATCH /api/projects/:projectId/tasks/:taskId/status 路由
     - 接收新状态（pending/running/done）
     - 调用 TaskManager 更新任务状态
     - 返回更新结果

   - 实现 DELETE /api/projects/:projectId/tasks/:taskId 路由
     - 调用 TaskManager 删除任务
     - 返回删除结果
