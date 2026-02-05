# 2.1.2 AgentMgr 智能体管理模块

## 任务描述
实现智能体管理模块，负责智能体的创建、状态检查、重启。

## 输入
- 无

## 输出
- `src/core/agent-mgr.ts` - AgentMgr 类
- `src/core/types/agent.ts` - 智能体类型定义

## 验收标准
1. 智能体状态为 idle/running/stopped
2. 支持根据角色创建智能体
3. 支持检查智能体状态
4. 支持重启停止的智能体
5. 记录智能体创建时间和最后活跃时间

## 依赖任务
- 2.1.1 TaskManager 任务管理模块
- 4.4.1 类型定义基础

## 估计工时
3h

## 优先级
高

## 任务内容
1. 创建 `src/core/types/agent.ts`
   - 定义 AgentStatus 类型：'idle' | 'running' | 'stopped'
   - 定义 Agent 接口：id、roleId、projectId、name、status、currentTaskId、llmProvider、llmModel、metadata
   - 导出 Agent 和 AgentStatus 类型

2. 创建 `src/core/agent-mgr.ts`
   - AgentMgr 类
     - 构造函数：接收 projectId，初始化智能体存储
     - createAgent(roleId): 创建智能体
     - getAgent(id): 通过 ID 获取智能体
     - getAgentsByRole(roleId): 获取指定角色的所有智能体
     - getAgentsByStatus(status): 获取指定状态的智能体
     - setAgentStatus(id, status): 设置智能体状态
     - setCurrentTask(id, taskId): 设置当前任务
     - restartAgent(id): 重启智能体
     - checkAgentStatus(id): 检查智能体是否停止
     - incrementRestartCount(id): 增加重启次数

3. 智能体停止检测
   - 定期检查智能体心跳
   - 标记超过阈值未活跃的智能体为 stopped

4. 智能体重启逻辑
   - 重置状态为 idle
   - 清空当前任务
   - 增加重启计数
