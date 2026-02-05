# 3.1.1 AI Agent 核心逻辑

## 任务描述
实现 AI Agent 核心逻辑，负责与大模型交互、执行任务。

## 输入
- 无

## 输出
- `src/ai/agent.ts` - Agent 类

## 验收标准
1. 能够加载角色提示词
2. 能够与大模型进行对话
3. 能够使用工具
4. 能够更新任务进度
5. 任务完成后向项目经理汇报

## 依赖任务
- 2.1.2 AgentMgr 智能体管理模块
- 4.1.1 LLMService 服务层

## 估计工时
4h

## 优先级
高

## 任务内容
1. 创建 `src/ai/types.ts`
   - 定义 AgentConfig 接口
   - 定义 AgentState 接口

2. 创建 `src/ai/agent.ts`
   - Agent 类
     - constructor(config): 初始化配置
     - loadRolePrompt(roleId): 加载角色提示词
     - loadRules(): 加载规则
     - executeTask(task): 执行任务
     - chat(messages): 与大模型对话
     - useTool(toolName, params): 使用工具
     - updateProgress(taskId, progress): 更新进度
     - reportToManager(task): 向项目经理汇报

3. 任务执行流程
   - 加载角色提示词和规则
   - 构建初始消息
   - 循环与大模型对话
   - 处理工具调用
   - 更新任务进度
   - 完成后汇报

4. 角色提示词注入
   - 从 RoleManager 获取提示词
   - 从 RuleManager 获取规则
   - 合并到系统消息中
