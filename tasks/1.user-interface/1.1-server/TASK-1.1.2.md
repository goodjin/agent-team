# 1.1.2 REST API 路由实现

## 任务描述
实现项目的 REST API 路由，包括项目列表、项目切换、项目创建等接口。

## 输入
- 无

## 输出
- `src/server/routes/projects.ts` - 项目相关路由

## 验收标准
1. `GET /api/projects` - 返回项目列表
2. `GET /api/projects/:id` - 返回指定项目详情
3. `POST /api/projects` - 创建新项目
4. `DELETE /api/projects/:id` - 删除项目（需确认）
5. `PATCH /api/projects/:id/status` - 更新项目状态（active/archive）
6. 所有接口返回统一的 JSON 格式

## 依赖任务
- 1.1.1 Express 服务器基础架构
- 4.3.1 配置管理器实现

## 估计工时
3h

## 优先级
高

## 任务内容
1. 创建 `src/server/routes/projects.ts`
   - 实现 GET /api/projects 路由
     - 调用 ProjectManager 获取项目列表
     - 返回项目基本信息

   - 实现 GET /api/projects/:id 路由
     - 调用 ProjectManager 获取项目详情
     - 返回项目配置、统计信息

   - 实现 POST /api/projects 路由
     - 接收项目名称、路径、描述
     - 调用 ProjectManager 创建项目
     - 返回创建的项目信息

   - 实现 DELETE /api/projects/:id 路由
     - 检查项目状态
     - 返回确认提示信息（不直接删除）

   - 实现 PATCH /api/projects/:id/status 路由
     - 接收新状态（active/archive）
     - 更新项目状态
     - 返回更新结果

2. 创建 `src/server/routes/schemas.ts`
   - 定义请求参数验证 Schema
   - 使用 Zod 进行参数验证

3. 创建路由索引文件
   - `src/server/routes/index.ts` 导出所有路由
