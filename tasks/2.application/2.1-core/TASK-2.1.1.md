# 2.1.1 TaskManager 任务管理模块

## 任务描述
实现任务管理模块，负责任务的创建、查询、更新、状态追踪。

## 输入
- 无

## 输出
- `src/core/task-manager.ts` - TaskManager 类
- `src/core/types/task.ts` - 任务类型定义

## 验收标准
1. 任务编号格式为 T001，自动递增
2. 任务状态为 pending/running/done
3. 支持按项目、分类、状态筛选任务
4. 任务创建时自动分配编号和分类
5. 任务更新时记录时间戳

## 依赖任务
- 4.4.1 类型定义基础

## 估计工时
4h

## 优先级
高

## 任务内容
1. 创建 `src/core/types/task.ts`
   - 定义 TaskStatus 类型：'pending' | 'running' | 'done'
   - 定义 Task 接口：id、category、title、description、progress、status、agentId、createdAt、updatedAt、completedAt
   - 导出 Task 和 TaskStatus 类型

2. 创建 `src/core/task-manager.ts`
   - TaskManager 类
     - 构造函数：接收 projectId，初始化任务存储
     - createTask(request): 创建任务，自动分配 T001 编号
     - getTask(id): 通过 ID 获取任务
     - getTasks(filters): 按条件筛选任务
     - updateTask(id, updates): 更新任务
     - startTask(id): 开始执行任务
     - completeTask(id, result): 完成任务
     - failTask(id, error): 标记任务失败
     - deleteTask(id): 删除任务
     - getNextTaskId(): 生成下一个任务编号

3. 创建任务存储接口
   - 使用内存存储作为初步实现
   - 预留持久化接口

4. 任务分类逻辑
   - 根据任务描述自动分类
   - 支持的分类：REQ、ARCH、DEV、TEST、DOC

5. 进度标记更新
   - 提供 updateProgress 方法
   - 记录进度字符串
