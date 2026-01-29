# Agent Team Web Server

Agent Team Web Server 提供了一个基于 Web 的界面来管理和监控 Agent Team 系统。

## 功能特性

- 📊 **仪表板**: 查看系统统计信息和最近任务
- 📋 **任务管理**: 创建、查看、执行和删除任务
- 👥 **角色管理**: 查看所有可用角色及其能力
- 🔄 **工作流管理**: 查看和执行工作流
- ⚙️ **配置查看**: 查看系统配置信息

## 启动服务器

### 方式一：使用 npm 脚本

```bash
npm run server
```

### 方式二：使用 tsx 直接运行

```bash
tsx src/server/index.ts
```

### 方式三：开发模式（自动重启）

```bash
npm run server:dev
```

## 配置选项

可以通过环境变量配置服务器：

- `PORT`: 服务器端口（默认: 3000）
- `HOST`: 服务器主机（默认: localhost）
- `PROJECT_PATH`: 项目路径（默认: 当前工作目录）

示例：

```bash
PORT=8080 HOST=0.0.0.0 npm run server
```

## 访问界面

启动服务器后，在浏览器中访问：

- 主页: http://localhost:3000
- 仪表板: http://localhost:3000/dashboard
- API: http://localhost:3000/api

## API 端点

### 角色相关

- `GET /api/roles` - 获取所有角色
- `GET /api/config` - 获取系统配置

### 任务相关

- `GET /api/tasks` - 获取所有任务
- `GET /api/tasks/:id` - 获取单个任务
- `POST /api/tasks` - 创建任务
- `PUT /api/tasks/:id/status` - 更新任务状态
- `POST /api/tasks/:id/execute` - 执行任务
- `DELETE /api/tasks/:id` - 删除任务

### 统计信息

- `GET /api/stats` - 获取统计信息

### 工作流相关

- `GET /api/workflows` - 获取所有工作流
- `POST /api/workflows/:id/execute` - 执行工作流

### 工具相关

- `GET /api/tools` - 获取可用工具列表

## 使用示例

### 创建任务

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "development",
    "title": "实现新功能",
    "description": "实现用户登录功能",
    "priority": "high",
    "assignedRole": "developer"
  }'
```

### 执行任务

```bash
curl -X POST http://localhost:3000/api/tasks/{task-id}/execute
```

### 获取统计信息

```bash
curl http://localhost:3000/api/stats
```

## 注意事项

1. 确保已配置 LLM 配置文件（`llm.config.json`）
2. 确保已配置提示词目录（`prompts/`）
3. 服务器会自动加载配置，如果配置加载失败，服务器将无法启动

## 开发

服务器使用 Express.js 构建，前端使用原生 JavaScript，无需构建步骤。

前端文件位于 `public/` 目录：
- `index.html` - 主页面
- `styles.css` - 样式文件
- `app.js` - 前端逻辑

API 路由位于 `src/server/api.ts`，服务器主文件位于 `src/server/index.ts`。