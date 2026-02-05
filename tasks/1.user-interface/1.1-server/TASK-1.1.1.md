# 1.1.1 Express 服务器基础架构

## 任务描述
创建 Express 服务器基础架构，包括服务器初始化、中间件配置、请求路由框架。

## 输入
- 无

## 输出
- `src/server/index.ts` - 服务器入口文件
- `src/server/middleware/` - 中间件目录
- `src/server/routes/` - 路由目录

## 验收标准
1. 服务器能够成功启动并监听默认端口 3000
2. 支持通过环境变量配置端口和主机
3. 包含请求日志中间件
4. 包含错误处理中间件
5. 包含健康检查端点 `/health`

## 依赖任务
- 无

## 估计工时
2h

## 优先级
高

## 任务内容
1. 创建 `src/server/index.ts`
   - 使用 Express 创建服务器实例
   - 支持 PORT 和 HOST 环境变量配置
   - 导出服务器实例供启动使用

2. 创建 `src/server/middleware/logger.ts`
   - 请求日志中间件
   - 记录请求方法、路径、耗时

3. 创建 `src/server/middleware/error.ts`
   - 统一错误处理中间件
   - 返回友好的错误信息

4. 创建 `src/server/middleware/index.ts`
   - 中间件统一导出

5. 创建基础路由框架
   - `src/server/routes/index.ts` - 路由统一入口
   - `src/server/routes/health.ts` - 健康检查端点

6. 创建启动脚本
   - `src/server/start.ts` - 服务器启动入口
   - 包含优雅关闭处理
