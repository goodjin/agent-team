# Agent Team v5.0 - 任务拆分清单

**版本**: 5.0.0
**日期**: 2025-02-07
**状态**: 待执行

---

## 任务概览

总共 **12 个任务**，分为 **3 个阶段**：

- **Phase 1**: Agent 核心能力（任务 1-7）- Week 1-2
- **Phase 2**: Agent 协作（任务 8-10）- Week 3
- **Phase 3**: 用户界面（任务 11-12）- Week 4

---

## Phase 1: Agent 核心能力

### 任务 1: 更新 LLM 配置系统

**优先级**: P0
**预计工时**: 4 小时
**依赖**: 无

**目标**：
1. 更新 `config/llm.yaml` 配置文件，增加权重配置
2. 添加 MiniMax 和 BigModel 服务商配置
3. 实现权重选择逻辑
4. 实现配置验证脚本

**输入**：
- 现有配置文件：`config/llm.yaml`
- 需求文档：`docs/v5/03-llm-providers.md`

**输出**：
- 更新后的配置文件：`config/llm.yaml`
- 配置验证脚本：`scripts/validate-llm-config.ts`
- 更新的配置管理器：`src/services/llm-config.ts`

**验收标准**：
- ✅ 配置文件包含所有服务商（OpenAI, Claude, DeepSeek, Qwen, MiniMax, BigModel）
- ✅ 每个服务商都有 weight 配置
- ✅ 权重选择逻辑正确（按权重比例随机选择）
- ✅ `weight: 0` 或 `apiKey` 为空的服务商被过滤
- ✅ 配置验证脚本可以正常运行

**详细文档**：`docs/v5/tasks/task-01.md`

---

### 任务 2: 实现 LLM 服务商适配器

**优先级**: P0
**预计工时**: 8 小时
**依赖**: 任务 1

**目标**：
1. 实现 OpenAI SDK 适配器（支持 OpenAI、DeepSeek、Qwen、MiniMax）
2. 实现 Anthropic SDK 适配器
3. 实现 BigModel HTTP 适配器
4. 实现 LLMServiceFactory

**输入**：
- 配置文件：`config/llm.yaml`
- 架构设计：`docs/v5/02-architecture.md`

**输出**：
- `src/services/llm/adapters/openai.ts`
- `src/services/llm/adapters/anthropic.ts`
- `src/services/llm/adapters/bigmodel.ts`
- `src/services/llm/factory.ts`

**验收标准**：
- ✅ 所有适配器实现 `LLMService` 接口
- ✅ OpenAI 适配器支持自定义 baseURL
- ✅ Anthropic 适配器正常工作
- ✅ BigModel 适配器通过 HTTP 调用
- ✅ LLMServiceFactory 按权重选择服务商
- ✅ Fallback 机制正常工作

**详细文档**：`docs/v5/tasks/task-02.md`

---

### 任务 3: 实现 Token 管理器

**优先级**: P0
**预计工时**: 4 小时
**依赖**: 任务 2

**目标**：
1. 实现 TokenManager 类
2. 实现预算检查和记录
3. 实现预算告警（80%、90%）
4. 实现使用统计

**输入**：
- 架构设计：`docs/v5/02-architecture.md`

**输出**：
- `src/ai/token-manager.ts`
- 单元测试：`tests/ai/token-manager.test.ts`

**验收标准**：
- ✅ 预算检查正确
- ✅ 使用记录准确
- ✅ 80% 和 90% 告警正常触发
- ✅ 可以重置预算
- ✅ 单元测试覆盖率 > 80%

**详细文档**：`docs/v5/tasks/task-03.md`

---

### 任务 4: 实现上下文压缩器

**优先级**: P0
**预计工时**: 6 小时
**依赖**: 任务 2, 任务 3

**目标**：
1. 实现 ContextCompressor 类
2. 实现滑动窗口策略
3. 实现智能总结策略
4. 实现 Token 估算

**输入**：
- 架构设计：`docs/v5/02-architecture.md`

**输出**：
- `src/ai/context-compressor.ts`
- 单元测试：`tests/ai/context-compressor.test.ts`

**验收标准**：
- ✅ 滑动窗口正确（保留系统提示词 + 最近 10 条）
- ✅ 超出阈值时自动压缩
- ✅ 智能总结功能正常
- ✅ Token 估算准确（误差 < 10%）
- ✅ 单元测试覆盖率 > 80%

**详细文档**：`docs/v5/tasks/task-04.md`

---

### 任务 5: 实现工具执行器

**优先级**: P0
**预计工时**: 8 小时
**依赖**: 无

**目标**：
1. 完善 ToolExecutor 类
2. 实现参数验证（Zod）
3. 实现工具调用重试（指数退避）
4. 实现危险操作确认
5. 实现结果后处理（脱敏、截断）

**输入**：
- 现有代码：`src/tools/tool-registry.ts`
- 架构设计：`docs/v5/02-architecture.md`

**输出**：
- 更新的 `src/tools/tool-executor.ts`
- 单元测试：`tests/tools/tool-executor.test.ts`

**验收标准**：
- ✅ 参数验证正确（Schema 验证）
- ✅ 重试机制正常（最多 3 次，指数退避）
- ✅ 危险操作需要确认
- ✅ 结果自动脱敏
- ✅ 结果超过 10,000 字符时截断
- ✅ 单元测试覆盖率 > 80%

**详细文档**：`docs/v5/tasks/task-05.md`

---

### 任务 6: 实现并发控制器

**优先级**: P0
**预计工时**: 4 小时
**依赖**: 无

**目标**：
1. 实现 ConcurrencyController 类
2. 实现队列机制
3. 实现并发限制

**输入**：
- 架构设计：`docs/v5/02-architecture.md`

**输出**：
- `src/core/concurrency.ts`
- 单元测试：`tests/core/concurrency.test.ts`

**验收标准**：
- ✅ 并发限制生效（最多 N 个同时运行）
- ✅ 超出限制时正确排队
- ✅ 先进先出（FIFO）
- ✅ 状态查询正确
- ✅ 单元测试覆盖率 > 80%

**详细文档**：`docs/v5/tasks/task-06.md`

---

### 任务 7: 实现 LLM 循环引擎

**优先级**: P0
**预计工时**: 10 小时
**依赖**: 任务 2, 任务 3, 任务 4, 任务 5

**目标**：
1. 实现 AgentLoop 类
2. 实现 LLM 迭代循环
3. 集成 TokenManager
4. 集成 ContextCompressor
5. 集成 ToolExecutor
6. 实现循环检测

**输入**：
- TokenManager
- ContextCompressor
- ToolExecutor
- 架构设计：`docs/v5/02-architecture.md`

**输出**：
- `src/ai/agent-loop.ts`
- 单元测试：`tests/ai/agent-loop.test.ts`
- 集成测试：`tests/integration/agent-loop.test.ts`

**验收标准**：
- ✅ 最大迭代次数限制（10 次）
- ✅ Token 预算检查正常
- ✅ 超出预算时自动压缩上下文
- ✅ 工具调用正确执行
- ✅ 循环检测正常（避免重复调用）
- ✅ 单元测试覆盖率 > 80%
- ✅ 集成测试通过

**详细文档**：`docs/v5/tasks/task-07.md`

---

## Phase 2: Agent 协作

### 任务 8: 实现 Agent 通信系统

**优先级**: P1
**预计工时**: 6 小时
**依赖**: 任务 7

**目标**：
1. 实现 AgentCommunicator 类
2. 实现事件总线
3. 实现广播、点对点、请求-响应模式

**输入**：
- 架构设计：`docs/v5/02-architecture.md`

**输出**：
- `src/ai/agent-communicator.ts`
- 单元测试：`tests/ai/agent-communicator.test.ts`

**验收标准**：
- ✅ 广播模式正常
- ✅ 点对点消息正确路由
- ✅ 请求-响应模式支持超时
- ✅ 消息格式标准化
- ✅ 单元测试覆盖率 > 80%

**详细文档**：`docs/v5/tasks/task-08.md`

---

### 任务 9: 实现子 Agent

**优先级**: P1
**预计工时**: 8 小时
**依赖**: 任务 7, 任务 8

**目标**：
1. 实现 SubAgent 类
2. 集成 AgentLoop
3. 集成 AgentCommunicator
4. 实现进度上报

**输入**：
- AgentLoop
- AgentCommunicator
- 架构设计：`docs/v5/02-architecture.md`

**输出**：
- `src/ai/sub-agent.ts`
- 单元测试：`tests/ai/sub-agent.test.ts`

**验收标准**：
- ✅ 子 Agent 可以独立执行任务
- ✅ 进度上报正常
- ✅ 结果返回正确
- ✅ 错误处理完善
- ✅ 单元测试覆盖率 > 80%

**详细文档**：`docs/v5/tasks/task-09.md`

---

### 任务 10: 实现主 Agent

**优先级**: P1
**预计工时**: 10 小时
**依赖**: 任务 9

**目标**：
1. 实现 MasterAgent 类
2. 实现任务分析和拆分
3. 实现子 Agent 创建和管理
4. 实现结果汇总
5. 集成并发控制

**输入**：
- SubAgent
- ConcurrencyController
- 架构设计：`docs/v5/02-architecture.md`

**输出**：
- `src/ai/master-agent.ts`
- 单元测试：`tests/ai/master-agent.test.ts`
- 集成测试：`tests/integration/master-agent.test.ts`

**验收标准**：
- ✅ 任务分析正确
- ✅ 任务拆分合理
- ✅ 子 Agent 创建成功
- ✅ 并发控制生效
- ✅ 结果汇总正确
- ✅ 单元测试覆盖率 > 80%
- ✅ 集成测试通过

**详细文档**：`docs/v5/tasks/task-10.md`

---

## Phase 3: 用户界面

### 任务 11: 实现提示词管理系统

**优先级**: P1
**预计工时**: 8 小时
**依赖**: 任务 7

**目标**：
1. 创建提示词目录结构
2. 实现 PromptLoader 类
3. 实现 Handlebars 模板支持
4. 创建内置提示词
5. 实现提示词 Web 编辑 API

**输入**：
- 架构设计：`docs/v5/02-architecture.md`

**输出**：
- `prompts/` 目录结构
- `src/prompts/loader.ts`
- `src/server/routes/prompts.ts`
- 内置提示词：`prompts/roles/*.md`

**验收标准**：
- ✅ PromptLoader 可以加载 Markdown 文件
- ✅ 支持变量替换
- ✅ 支持提示词热加载
- ✅ Web API 可以编辑提示词
- ✅ 至少 3 个内置角色提示词

**详细文档**：`docs/v5/tasks/task-11.md`

---

### 任务 12: 实现用户界面

**优先级**: P1
**预计工时**: 16 小时
**依赖**: 任务 10, 任务 11

**目标**：
1. 实现任务列表界面
2. 实现任务详情界面
3. 实现 Agent 列表展示
4. 实现 Agent 对话界面
5. 实现实时状态更新（SSE）

**输入**：
- MasterAgent
- PromptLoader
- 需求文档：`docs/v5/01-requirements.md`

**输出**：
- `src/ui/pages/TaskList.tsx`
- `src/ui/pages/TaskDetail.tsx`
- `src/ui/components/AgentList.tsx`
- `src/ui/components/AgentChat.tsx`
- `src/server/routes/tasks.ts`（SSE 支持）

**验收标准**：
- ✅ 任务列表按状态分类显示
- ✅ 任务详情显示完整信息
- ✅ Agent 列表显示状态和进度
- ✅ 可以与 Agent 对话
- ✅ 实时状态更新正常
- ✅ 界面美观易用

**详细文档**：`docs/v5/tasks/task-12.md`

---

## 任务执行计划

### Week 1

- [x] 任务 1: 更新 LLM 配置系统
- [x] 任务 2: 实现 LLM 服务商适配器
- [x] 任务 3: 实现 Token 管理器
- [x] 任务 4: 实现上下文压缩器

### Week 2

- [x] 任务 5: 实现工具执行器
- [x] 任务 6: 实现并发控制器
- [x] 任务 7: 实现 LLM 循环引擎

### Week 3

- [x] 任务 8: 实现 Agent 通信系统
- [x] 任务 9: 实现子 Agent
- [x] 任务 10: 实现主 Agent

### Week 4

- [x] 任务 11: 实现提示词管理系统
- [x] 任务 12: 实现用户界面

---

## 任务依赖图

```
任务 1 (LLM配置)
    │
    ▼
任务 2 (LLM适配器)
    │
    ├──────────────┬──────────────┐
    │              │              │
    ▼              ▼              ▼
任务 3 (Token)  任务 4 (压缩)  任务 5 (工具)
    │              │              │
    └──────┬───────┴──────┬───────┘
           │              │
           ▼              ▼
       任务 7 (LLM循环)  任务 6 (并发)
           │              │
           └──────┬───────┘
                  │
                  ▼
          任务 8 (通信)
                  │
                  ▼
          任务 9 (子Agent)
                  │
                  ▼
          任务 10 (主Agent)
                  │
           ┌──────┴──────┐
           │             │
           ▼             ▼
   任务 11 (提示词)  任务 12 (UI)
```

---

## 执行方式

### 串行执行（推荐）

**逐个完成任务，每完成一个任务再启动下一个子代理**：

```bash
# 任务 1
启动子代理 → 完成 → 验收 → 关闭

# 任务 2
启动子代理 → 完成 → 验收 → 关闭

# ...依次进行
```

**优点**：
- 可以及时发现问题
- 每个任务验收后再进行下一个
- 更容易调试

### 并行执行（可选）

**无依赖关系的任务可以并行执行**：

```bash
# Week 1 可以并行
任务 1, 任务 5, 任务 6

# Week 2 依赖 Week 1 完成后
任务 2, 任务 3, 任务 4

# 依次类推
```

---

## 验收检查清单

每个任务完成后，需要通过以下检查：

- [ ] 代码编译通过（`npm run build`）
- [ ] 单元测试通过（`npm run test`）
- [ ] 代码格式检查通过（`npm run lint`）
- [ ] TypeScript 类型检查通过（`npm run type-check`）
- [ ] 所有验收标准满足
- [ ] 代码已提交并推送

---

**文档结束**
