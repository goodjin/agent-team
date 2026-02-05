# 2.1.3 EventSystem 事件系统

## 任务描述
实现简单的事件系统，支持事件派发和监听。

## 输入
- 无

## 输出
- `src/core/event-system.ts` - EventSystem 类
- `src/core/types/event.ts` - 事件类型定义

## 验收标准
1. 支持事件监听器注册
2. 支持同步事件派发
3. 支持事件数据传递
4. 定义常用事件类型

## 依赖任务
- 4.4.1 类型定义基础

## 估计工时
2h

## 优先级
中

## 任务内容
1. 创建 `src/core/types/event.ts`
   - 定义 EventType：task.created | task.started | task.completed | task.failed | agent.created | agent.stopped
   - 定义 Event 接口：type、data、timestamp
   - 定义 EventHandler 类型

2. 创建 `src/core/event-system.ts`
   - EventSystem 类
     - on(eventType, handler): 注册事件监听器
     - off(eventType, handler): 移除事件监听器
     - emit(eventType, data): 派发事件
     - once(eventType, handler): 只触发一次的事件监听器
     - removeAllListeners(eventType): 移除所有监听器

3. 定义常用事件
   - task.created: 任务创建事件
   - task.started: 任务开始事件
   - task.completed: 任务完成事件
   - task.failed: 任务失败事件
   - agent.created: 智能体创建事件
   - agent.stopped: 智能体停止事件
