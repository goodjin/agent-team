# 3.1.2 Checkpoint 断点管理器

## 任务描述
实现任务断点管理，支持任务执行中断后的恢复。

## 输入
- 无

## 输出
- `src/ai/checkpoint.ts` - CheckpointManager 类

## 验收标准
1. 能够保存任务断点
2. 能够加载任务断点
3. 能够删除过期断点
4. 异常退出后能恢复到断点继续执行

## 依赖任务
- 2.1.1 TaskManager 任务管理模块
- 4.4.1 类型定义基础

## 估计工时
3h

## 优先级
高

## 任务内容
1. 创建 `src/ai/types/checkpoint.ts`
   - 定义 CheckpointType：'step-complete' | 'tool-before' | 'tool-after' | 'context-snapshot'
   - 定义 CheckpointData 接口
   - 定义 Checkpoint 接口

2. 创建 `src/ai/checkpoint.ts`
   - CheckpointManager 类
     - constructor(projectId): 初始化
     - saveCheckpoint(taskId, agentId, type, data): 保存断点
     - loadLatestCheckpoint(taskId): 加载最新断点
     - getCheckpoint(id): 获取指定断点
     - deleteCheckpoint(id): 删除断点
     - deleteCheckpointsByTask(taskId): 删除任务所有断点
     - cleanupExpiredCheckpoints(): 清理过期断点（保留7天）

3. 断点数据包含
   - 任务 ID
   - 智能体 ID
   - 断点类型
   - 上下文快照
   - 工具调用状态
   - 进度信息
   - 创建时间
