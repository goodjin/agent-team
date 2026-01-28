# Project Agent 工作流程详解

## 工作流程架构

```
┌─────────────────────────────────────────────────────────────┐
│                     ProjectAgent                            │
│  (入口点，协调所有组件)                                       │
│  - src/core/project-agent.ts                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     TaskManager                             │
│  (任务管理器，负责任务调度和执行)                              │
│  - src/core/task-manager.ts                                 │
│  ├─ 创建任务 (createTask)                                   │
│  ├─ 执行任务 (executeTask)                                  │
│  └─ 管理依赖 (resolveDependencies)                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      RoleFactory                            │
│  (角色工厂，创建和管理角色)                                    │
│  - src/roles/index.ts                                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       BaseRole                              │
│  (角色基类，定义执行流程)                                      │
│  - src/roles/base.ts                                        │
│  ├─ 准备消息 (prepareMessages)                              │
│  ├─ 构建提示词 (buildSystemPrompt)                          │
│  ├─ 调用 LLM (callLLM)                                     │
│  ├─ 处理响应 (processResponse)                              │
│  └─ 验证输出 (validateOutput)                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      LLMService                             │
│  (LLM 服务，调用大模型)                                        │
│  - src/services/llm.service.ts                             │
└─────────────────────────────────────────────────────────────┘
```

## 完整工作流程

### 阶段 1: 初始化

```typescript
// 1. 创建 ProjectAgent 实例
const agent = new ProjectAgent({
  projectName: 'my-app',
  projectPath: '/path/to/project',
  llmConfig: {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-opus-20240229',
  },
}, './prompts');

// 2. 初始化组件
// - 创建 ToolRegistry（工具注册表）
// - 创建 TaskManager（任务管理器）
// - 设置事件监听器
// - 加载提示词配置（可选）
await agent.loadPrompts();
```

**对应代码位置**: [src/core/project-agent.ts:33-72](src/core/project-agent.ts#L33-L72)

### 阶段 2: 创建任务

```typescript
// 方式 1: 使用高级 API
await agent.developFeature({
  title: '实现用户认证',
  requirements: ['邮箱登录', 'JWT token'],
});

// 方式 2: 使用工作流
agent.registerWorkflow({
  id: 'feature-dev',
  steps: [/* ... */],
});
await agent.executeWorkflow('feature-dev');

// 方式 3: 直接执行任务
await agent.execute({
  type: 'development',
  title: '开发功能',
  assignedRole: 'developer',
});
```

**对应代码位置**: [src/core/project-agent.ts:74-250](src/core/project-agent.ts#L74-L250)

### 阶段 3: 任务执行流程

#### 3.1 任务创建

```typescript
// TaskManager.createTask()
const task = {
  id: uuidv4(),              // 生成唯一 ID
  type: 'development',
  title: '开发功能',
  description: '...',
  status: 'pending',
  priority: 'high',
  dependencies: [],          // 依赖的任务 ID
  assignedRole: 'developer',
  input: { /* ... */ },
  constraints: { /* ... */ },
  createdAt: new Date(),
  updatedAt: new Date(),
};
```

**对应代码位置**: [src/core/task-manager.ts:62-97](src/core/task-manager.ts#L62-L97)

#### 3.2 依赖检查

```typescript
// executeTask() 中检查依赖
if (task.dependencies && task.dependencies.length > 0) {
  for (const depId of task.dependencies) {
    const depTask = this.tasks.get(depId);
    if (!depTask || depTask.status !== 'completed') {
      this.updateTaskStatus(taskId, 'blocked');
      return {
        success: false,
        error: `Task dependencies not satisfied: ${depId}`,
      };
    }
  }
}
```

**对应代码位置**: [src/core/task-manager.ts:127-145](src/core/task-manager.ts#L127-L145)

#### 3.3 构建执行上下文

```typescript
// buildContext()
const context = {
  project: projectConfig,           // 项目配置
  currentTask: task,                // 当前任务
  history: taskResults,             // 历史任务结果
  variables: new Map(),             // 变量
  tools: toolMap,                   // 可用工具
};
```

**对应代码位置**: [src/core/task-manager.ts:227-247](src/core/task-manager.ts#L227-L247)

#### 3.4 创建角色实例

```typescript
// RoleFactory.createRole()
const role = RoleFactory.createRole(
  task.assignedRole,  // 'developer'
  llmService,         // LLM 服务
  context?            // 可选的上下文
);

// 如果配置了提示词文件，会加载自定义提示词
// prompts/roles/developer.json -> systemPrompt
```

**对应代码位置**: [src/roles/index.ts:61-86](src/roles/index.ts#L61-L86)

### 阶段 4: 角色执行（核心流程）

```typescript
// BaseRole.execute()
async execute(task, context) {
  // 步骤 1: 准备消息
  const messages = await this.prepareMessages(task, context);

  // 步骤 2: 调用 LLM
  const response = await this.callLLM(messages);

  // 步骤 3: 处理响应
  const result = await this.processResponse(response, task, context);

  // 步骤 4: 验证输出
  const validated = await this.validateOutput(result);

  return {
    success: true,
    data: validated,
    metadata: { /* ... */ },
  };
}
```

**对应代码位置**: [src/roles/base.ts:40-62](src/roles/base.ts#L40-L62)

#### 步骤 4.1: 准备消息

```typescript
// prepareMessages()
const messages = [
  {
    role: 'system',
    content: this.buildSystemPrompt(context),  // 系统提示词
  },
  // ... 历史对话（如果有）
  {
    role: 'user',
    content: this.buildTaskPrompt(task, context),  // 任务提示词
  },
];
```

**对应代码位置**: [src/roles/base.ts:73-93](src/roles/base.ts#L73-L93)

#### 步骤 4.2: 构建系统提示词

```typescript
// buildSystemPrompt()
let prompt = this.definition.systemPrompt;  // 从配置加载

// 添加项目信息
prompt += `
## 项目信息
- 项目名称: ${context.project.projectName}
- 项目路径: ${context.project.projectPath}
`;

// 添加项目约束
if (context.project.constraints) {
  prompt += `
## 项目约束
- 代码风格: ${context.project.constraints.codeStyle}
- 测试覆盖率: ${context.project.constraints.testCoverage}%
`;
}
```

**对应代码位置**: [src/roles/base.ts:106-133](src/roles/base.ts#L106-L133)

#### 步骤 4.3: 构建任务提示词

```typescript
// Developer.buildTaskPrompt()
const sections = [];

sections.push(`# 开发任务: ${task.title}`);
sections.push(task.description);

// 添加架构设计（如果有）
if (architecture) {
  sections.push('## 架构设计参考');
  sections.push(architecture.overview);
}

// 添加需求详情
if (task.input?.requirements) {
  sections.push('## 功能需求');
  task.input.requirements.forEach(req => {
    sections.push(`- ${req}`);
  });
}

// 添加代码规范
sections.push('## 代码规范');
sections.push('- 遵循 SOLID 原则');
sections.push('- 函数单一职责');

return sections.join('\n');
```

**对应代码位置**: [src/roles/developer.ts:61-113](src/roles/developer.ts#L61-L113)

#### 步骤 4.4: 调用 LLM

```typescript
// callLLM()
const response = await this.llmService.complete(messages, {
  temperature: this.definition.temperature ?? 0.7,
  maxTokens: this.definition.maxTokens ?? 4000,
});

// LLMService.complete() 实际调用
// Anthropic API 或 OpenAI API
const requestBody = {
  model: 'claude-3-opus-20240229',
  max_tokens: 4000,
  temperature: 0.7,
  system: systemMessage.content,
  messages: conversationMessages,
};

const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': this.apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify(requestBody),
});
```

**对应代码位置**:
- [src/roles/base.ts:141-149](src/roles/base.ts#L141-L149)
- [src/services/llm.service.ts:62-106](src/services/llm.service.ts#L62-L106)

#### 步骤 4.5: 处理响应

```typescript
// Developer.processResponse()
const content = response.content;  // LLM 返回的内容

const result = {
  code: this.extractCodeBlock(content),      // 提取代码
  tests: this.extractTestBlock(content),     // 提取测试
  explanation: this.extractSection(content, '说明'),
  changes: this.extractChanges(content),
  files: this.extractFiles(content),
};

return result;
```

**对应代码位置**: [src/roles/developer.ts:125-160](src/roles/developer.ts#L125-L160)

#### 步骤 4.6: 验证输出

```typescript
// validateOutput()
if (!output.code && !output.files) {
  throw new Error('必须生成代码或文件');
}

if (output.code && typeof output.code !== 'string') {
  throw new Error('代码格式不正确');
}

return output;
```

**对应代码位置**: [src/roles/developer.ts:162-171](src/roles/developer.ts#L162-L171)

### 阶段 5: 任务完成

```typescript
// TaskManager.executeTask() 中
// 设置结果
this.setTaskResult(taskId, result);

// 更新状态
this.updateTaskStatus(taskId, result.success ? 'completed' : 'failed');

// 触发事件
this.emit('task:completed', {
  event: 'task:completed',
  timestamp: new Date(),
  data: { task },
});

// 执行子任务（如果有）
if (task.subtasks && task.subtasks.length > 0) {
  for (const subtask of task.subtasks) {
    await this.executeTask(subtask.id);
  }
}
```

**对应代码位置**: [src/core/task-manager.ts:147-185](src/core/task-manager.ts#L147-L185)

## 工作流执行流程

当使用 `executeWorkflow()` 时：

```typescript
// ProjectAgent.executeWorkflow()
async executeWorkflow(workflowId) {
  const workflow = this.workflows.get(workflowId);

  // 1. 创建所有步骤的任务
  const taskMap = new Map();
  for (const step of workflow.steps) {
    const dependencies = step.dependencies
      ? step.dependencies.map(depId => taskMap.get(depId))
      : [];

    const task = this.taskManager.createTask({
      type: step.taskType,
      title: step.name,
      assignedRole: step.role,
      dependencies,  // 依赖的任务 ID
      constraints: step.constraints,
    });

    taskMap.set(step.id, task.id);
  }

  // 2. 并行执行所有任务（会自动处理依赖）
  const taskIds = Array.from(taskMap.values());
  const results = await this.taskManager.executeTasks(taskIds, true);

  return results;
}
```

**对应代码位置**: [src/core/project-agent.ts:217-262](src/core/project-agent.ts#L217-L262)

## 完整流程图

```
用户调用
    │
    ▼
┌──────────────────┐
│  developFeature  │  高级 API
│  execute         │  或
│  executeWorkflow │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  createTask      │  创建任务
│  (TaskManager)   │  生成唯一 ID
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  executeTask     │  开始执行
│  (TaskManager)   │  状态: in-progress
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  检查依赖         │  确保依赖任务已完成
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  buildContext    │  构建执行上下文
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  createRole      │  创建角色实例
│  (RoleFactory)   │  加载提示词配置
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  role.execute    │  角色执行
│  (BaseRole)      │
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│准备消息│ │调用 LLM│
└───┬────┘ └───┬────┘
    │          │
    ▼          ▼
┌────────┐ ┌────────┐
│系统提示│ │任务提示│
└───┬────┘ └───┬────┘
    │          │
    └────┬────┘
         ▼
┌──────────────────┐
│  LLM Service     │  API 调用
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  处理响应         │  解析结果
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  验证输出         │  检查格式
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  设置结果         │  task.result
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  更新状态         │  completed/failed
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  触发事件         │  task:completed
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  执行子任务       │  （如果有）
└────────┬─────────┘
         │
         ▼
      返回结果
```

## 关键代码位置总结

| 功能 | 文件 | 行号 |
|------|------|------|
| **任务创建** | [src/core/task-manager.ts](src/core/task-manager.ts) | 62-97 |
| **依赖检查** | [src/core/task-manager.ts](src/core/task-manager.ts) | 127-145 |
| **上下文构建** | [src/core/task-manager.ts](src/core/task-manager.ts) | 227-247 |
| **角色创建** | [src/roles/index.ts](src/roles/index.ts) | 61-86 |
| **消息准备** | [src/roles/base.ts](src/roles/base.ts) | 73-93 |
| **系统提示词** | [src/roles/base.ts](src/roles/base.ts) | 106-159 |
| **任务提示词** | [src/roles/developer.ts](src/roles/developer.ts) | 61-113 |
| **LLM 调用** | [src/services/llm.service.ts](src/services/llm.service.ts) | 62-106 |
| **响应处理** | [src/roles/developer.ts](src/roles/developer.ts) | 125-160 |
| **结果验证** | [src/roles/developer.ts](src/roles/developer.ts) | 162-171 |
| **任务完成** | [src/core/task-manager.ts](src/core/task-manager.ts) | 147-185 |
| **工作流执行** | [src/core/project-agent.ts](src/core/project-agent.ts) | 217-262 |

## 事件系统

在整个流程中，会触发以下事件：

```typescript
// 任务事件
'task:created'      // 任务创建
'task:started'      // 任务开始
'task:completed'    // 任务完成
'task:failed'       // 任务失败
'task:blocked'      // 任务被阻塞

// 工作流事件
'workflow:started'   // 工作流开始
'workflow:completed' // 工作流完成
'workflow:failed'    // 工作流失败

// 工具事件
'tool:before-execute' // 工具执行前
'tool:after-execute'  // 工具执行后
'tool:error'          // 工具错误

// 错误事件
'error'              // 通用错误
```

**对应代码位置**: [src/core/project-agent.ts:283-305](src/core/project-agent.ts#L283-L305)
