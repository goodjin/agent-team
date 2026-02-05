# 2.1.4 ProjectAgent 主入口

## 任务描述
实现 ProjectAgent 主入口类，协调各组件工作。

## 输入
- 无

## 输出
- `src/core/project-agent.ts` - ProjectAgent 类

## 验收标准
1. 提供统一的 API 接口
2. 协调 TaskManager 和 AgentMgr
3. 提供任务执行入口
4. 加载角色提示词和规则

## 依赖任务
- 2.1.1 TaskManager 任务管理模块
- 2.1.2 AgentMgr 智能体管理模块
- 2.1.3 EventSystem 事件系统
- 3.2.1 RoleManager 角色提示词管理器
- 3.3.1 RuleManager 规则管理器

## 估计工时
3h

## 优先级
高

## 任务内容
1. 创建 `src/core/project-agent.ts`
   - ProjectAgent 类
     - constructor(projectId): 初始化项目
     - taskManager: TaskManager 实例
     - agentMgr: AgentMgr 实例
     - eventSystem: EventSystem 实例

     - createTask(description): 创建任务
     - getTask(id): 获取任务
     - getTasks(filters): 获取任务列表
     - startTask(id): 开始任务
     - completeTask(id): 完成任务

     - createAgent(roleId): 创建智能体
     - getAgent(id): 获取智能体
     - getAgents(filters): 获取智能体列表
     - restartAgent(id): 重启智能体

     - getRolePrompt(roleId): 获取角色提示词
     - getRules(scope): 获取规则

     - on(event, handler): 监听事件
     - emit(event, data): 派发事件

2. 任务执行流程
   - createTask 接收自然语言描述
   - 自动分配任务编号和分类
   - 创建智能体执行任务
   - 监听任务完成事件
