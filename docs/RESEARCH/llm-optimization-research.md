# LLM 优化技术调研报告

> 生成日期: 2026-03-06  
> 调研目标: 为 agent-team 多智能体协作平台提供最新的 LLM 优化技术方案

## 目录

1. [Prompt Engineering 最新技术](#1-prompt-engineering-最新技术)
2. [思维链系列技术 (CoT, ToT, GoT)](#2-思维链系列技术-cot-tot-got)
3. [LLM 工具调用优化](#3-llm-工具调用优化)
4. [Token 优化和成本控制](#4-token-优化和成本控制)
5. [Agent 系统最佳实践](#5-agent-系统最佳实践)
6. [项目应用建议](#6-项目应用建议)

---

## 1. Prompt Engineering 最新技术

### 1.1 基础 Prompt 技术

| 技术 | 描述 | 适用场景 |
|------|------|----------|
| Zero-shot | 不提供示例直接完成任务 | 简单任务、模型已熟练掌握的能力 |
| Few-shot | 提供 1-3 个示例 | 需要特定格式或复杂推理的任务 |
| Chain-of-Thought | 要求模型展示思考过程 | 复杂推理、数学、逻辑问题 |

### 1.2 高级 Prompt 技术

#### 1.2.1 Role Prompting (角色提示)
```python
# 示例：角色定义
system_prompt = """你是一位资深软件架构师，拥有 15 年分布式系统设计经验。
你的回答应该：
1. 优先考虑可扩展性和容错性
2. 提供具体的代码示例
3. 引用业界最佳实践
4. 指出潜在的权衡取舍"""
```

#### 1.2.2 structured Output (结构化输出)
```python
# 使用 JSON Schema 强制结构化输出
response_format = {
    "type": "json_schema",
    "json_schema": {
        "name": "architecture_decision",
        "schema": {
            "type": "object",
            "properties": {
                "recommendation": {"type": "string"},
                "pros": {"type": "array", "items": {"type": "string"}},
                "cons": {"type": "array", "items": {"type": "string"}},
                "alternatives": {"type": "array", "items": {"type": "string"}},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["recommendation", "pros", "cons", "confidence"]
        }
    }
}
```

#### 1.2.3 System-2 Attention (系统二注意力)
让模型在生成响应前主动关注、重新阅读和修正理解：

```python
system_prompt = """在回答问题时，请遵循以下步骤：
1. 首先识别问题中的关键信息
2. 列出你需要回顾的所有相关信息
3. 逐一回顾并确认每项信息
4. 综合所有信息给出答案
5. 检查答案是否完整回答了问题"""
```

#### 1.2.4 上下文压缩 (Context Compression)
```python
# 使用 LLM 压缩长文档为关键信息
def compress_context(documents: list[str], query: str) -> str:
    """压缩相关文档为与查询相关的摘要"""
    compression_prompt = f"""从以下文档中提取与问题"{query}"相关的关键信息。
    输出格式：每条信息一行，使用 bullet point 格式。
    
    文档：
    {documents}
    
    关键信息："""
    # 调用 LLM 进行压缩...
```

### 1.3 Prompt 优化最佳实践

1. **明确任务边界**: 清晰定义输入输出格式
2. **使用分隔符**: 用 XML 标签或特殊符号分隔不同部分
3. **链式指令**: 将复杂任务分解为步骤列表
4. **约束输出**: 明确禁止事项和格式要求
5. **示例质量**: few-shot 示例要多样化且正确

---

## 2. 思维链系列技术 (CoT, ToT, GoT)

### 2.1 Chain-of-Thought (CoT) - 思维链

**核心思想**: 让模型在给出最终答案前展示推理过程

```python
# 标准 CoT prompt
cot_prompt = """请逐步思考并解决以下问题。每一步都要清晰展示你的推理过程。

问题：{question}

步骤：
1. [理解问题]
2. [分析已知条件]
3. [制定解决方案]
4. [执行计算/推理]
5. [验证答案]

推理过程：
"""
```

**变体技术**:

| 技术 | 描述 | 适用场景 |
|------|------|----------|
| Self-Consistency CoT | 多次采样，选择最一致的答案 | 需要高准确率 |
| CoT + SC | 结合思维链和自一致性 | 数学、推理任务 |
| Least-to-Most | 从最简单子问题开始，逐步复杂化 | 组合问题 |

**Least-to-Most Prompting 示例**:
```python
ltm_prompt = """将问题分解为最简单的子问题，然后逐步解决。

原始问题：{question}

分解过程：
1. [子问题1] - 答案：[答案1]
2. [子问题2] - 答案：[答案2]（需要子问题1的结果）
...

综合答案：[最终答案]"""
```

### 2.2 Tree-of-Thoughts (ToT) - 思维树

**核心思想**: 在多个可能的推理路径上并行探索，类似于树的广度优先搜索

```python
# ToT 实现架构
class TreeOfThoughts:
    def __init__(self, llm, max_depth=3, branch_factor=3):
        self.llm = llm
        self.max_depth = max_depth
        self.branch_factor = branch_factor
    
    def generate_thoughts(self, state: str) -> list[str]:
        """为当前状态生成多个可能的思考方向"""
        prompt = f"""为以下问题生成 {self.branch_factor} 个不同的思考方向：
        
        当前状态：{state}
        
        思考方向：
        1. 
        2. 
        3. """
        return self.llm.generate(prompt).split('\n')
    
    def evaluate_states(self, states: list[str]) -> dict:
        """评估每个状态的可行性"""
        prompt = f"""评估以下每个思考方向的可行性和前景（1-10分）：
        
        {states}
        
        评估结果："""
        # 返回分数映射
        return {s: score for s, score in zip(states, scores)}
    
    def search(self, problem: str) -> str:
        """执行 ToT 搜索"""
        # BFS/DFS 搜索最佳路径
        ...
```

### 2.3 Graph-of-Thoughts (GoT) - 思维图

**核心思想**: 将推理过程建模为图结构，支持更复杂的推理模式（合并、回溯、循环）

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│  Idea A │────▶│  Idea B │────▶│ Result  │
└─────────┘     └─────────┘     └─────────┘
      │               │
      ▼               ▼
┌─────────┐     ┌─────────┐
│  Idea C │     │  Idea D │
└─────────┘     └─────────┘
      │               │
      └───────┬───────┘
              ▼
       ┌──────────┐
       │ Synthesis│  ← 多节点合并
       └──────────┘
```

**GoT 核心操作**:
1. **Generate**: 生成新节点
2. **Score**: 评估节点质量
3. **Select**: 选择要扩展的节点
4. **Merge**: 合并多个节点
5. **Transform**: 转换节点内容
6. **Backtrack**: 回溯到之前状态

### 2.4 技术对比

| 技术 | 复杂度 | 适用场景 | 成本 |
|------|--------|----------|------|
| CoT | 低 | 简单推理、数学 | 1x |
| ToT | 中 | 需要多方案选择 | 3-5x |
| GoT | 高 | 复杂规划、创意生成 | 5-10x |

**建议**: 根据任务复杂度选择合适技术，简单任务使用 CoT，需要多方案评估时使用 ToT。

---

## 3. LLM 工具调用优化

### 3.1 Function Calling 最佳实践

#### 3.1.1 工具描述优化
```python
# 良好的工具描述示例
tools = [
    {
        "type": "function",
        "function": {
            "name": "search_codebase",
            "description": "在代码库中搜索指定的代码模式、函数名或文件内容。适用于查找现有实现、定位 bug 或理解代码结构。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词，可以是函数名、类名、代码片段或自然语言描述"
                    },
                    "scope": {
                        "type": "string",
                        "enum": ["all", "src", "tests", "docs"],
                        "description": "搜索范围",
                        "default": "all"
                    },
                    "file_types": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "文件类型过滤，如 ['.ts', '.js']"
                    }
                },
                "required": ["query"]
            }
        }
    }
]
```

#### 3.1.2 工具调用策略

```python
class ToolCallOptimizer:
    def __init__(self, llm, max_retries=3):
        self.llm = llm
        self.max_retries = max_retries
    
    async def execute_with_retry(self, tool_name: str, params: dict) -> dict:
        """带重试的工具调用"""
        for attempt in range(self.max_retries):
            try:
                result = await self.llm.tools.execute(tool_name, params)
                # 验证结果有效性
                if self._is_valid_result(result):
                    return result
            except Exception as e:
                if attempt == self.max_retries - 1:
                    raise
                # 分析错误，调整参数重试
                params = self._adjust_params(params, e)
        return None
    
    def _is_valid_result(self, result) -> bool:
        """验证结果是否有效"""
        # 实现具体验证逻辑
        return result is not None and result != ""
```

### 3.2 工具选择优化

#### 3.2.1 动态工具选择
```python
class DynamicToolSelector:
    def __init__(self, tools: list):
        self.tools = tools
        self.tool_embeddings = self._embed_tools(tools)
    
    def select_tools(self, query: str, top_k: int = 3) -> list:
        """基于查询语义相似度选择最相关的工具"""
        query_embedding = self._embed(query)
        similarities = cosine_similarity(
            query_embedding, 
            self.tool_embeddings
        )
        top_indices = np.argsort(similarities)[-top_k:]
        return [self.tools[i] for i in top_indices]
```

#### 3.2.2 工具调用规划
```python
# 工具调用链规划
TOOL_PLANNING_PROMPT = """Given the user request, plan the sequence of tool calls needed.

Request: {user_request}

Available tools:
{tool_descriptions}

Plan (in JSON):
{{
    "steps": [
        {{
            "tool": "tool_name",
            "reason": "why this tool is needed",
            "depends_on": ["previous_step_id or null"]
        }}
    ]
}}"""
```

### 3.3 错误处理与恢复

```python
class ToolErrorHandler:
    ERROR_STRATEGIES = {
        "invalid_params": "修正参数并重试",
        "timeout": "增加超时时间重试",
        "rate_limit": "等待后重试",
        "not_found": "尝试替代工具或分解任务",
        "permission": "请求用户授权或使用替代方案"
    }
    
    async def handle_error(self, error: Exception, context: dict) -> dict:
        """根据错误类型选择恢复策略"""
        error_type = self._classify_error(error)
        strategy = self.ERROR_STRATEGIES.get(error_type, "直接报告错误")
        
        if strategy == "修正参数并重试":
            return await self._retry_with_fix(context)
        elif strategy == "尝试替代工具":
            return await self._try_alternative_tool(context)
        else:
            return {"error": str(error), "recovered": False}
```

---

## 4. Token 优化和成本控制

### 4.1 Token 优化策略

#### 4.1.1 上下文压缩技术
```python
class ContextCompressor:
    def __init__(self, llm):
        self.llm = llm
    
    def compress_messages(self, messages: list, max_tokens: int) -> list:
        """压缩消息历史以适应 token 限制"""
        while self.count_tokens(messages) > max_tokens:
            # 策略1：移除最旧的消息
            # 策略2：压缩历史消息为摘要
            # 策略3：保留系统消息和关键对话
            
            if len(messages) <= 2:
                break  # 保留至少系统消息和最后一条
            
            # 压缩中间消息
            compressed = await self._summarize_turns(
                messages[1:-1]
            )
            messages = [messages[0]] + compressed + [messages[-1]]
        
        return messages
    
    async def _summarize_turns(self, messages: list) -> list:
        """将多轮对话压缩为摘要"""
        prompt = """将以下对话历史压缩为简洁的摘要，保留关键信息：
        
        {messages}
        
        摘要："""
        summary = await self.llm.generate(prompt)
        return [{"role": "system", "content": f"[对话摘要] {summary}"}]
```

#### 4.1.2 分块处理长文本
```python
class ChunkProcessor:
    def __init__(self, llm, chunk_size: int = 4000, overlap: int = 200):
        self.chunk_size = chunk_size
        self.overlap = overlap
    
    def process_long_document(
        self, 
        document: str, 
        task: str
    ) -> str:
        """分块处理长文档并聚合结果"""
        chunks = self._split_into_chunks(document)
        
        # 并行处理各块
        results = asyncio.gather(*[
            self._process_chunk(chunk, task) 
            for chunk in chunks
        ])
        
        # 聚合结果
        return self._aggregate_results(results, task)
    
    def _aggregate_results(self, results: list, task: str) -> str:
        """聚合各块的处理结果"""
        if "总结" in task or "概括" in task:
            prompt = f"""将以下各部分的结果整合为一个完整的总结：
            
            {results}
            
            完整总结："""
        else:
            prompt = f"""将以下各部分的结果整合：
            
            {results}
            
            整合结果："""
        
        return self.llm.generate(prompt)
```

### 4.2 成本优化策略

#### 4.2.1 模型路由
```python
class ModelRouter:
    ROUTING_RULES = {
        # 简单任务 -> 使用小模型
        ("simple", "classification"): "gpt-4o-mini",
        ("simple", "extraction"): "gpt-4o-mini",
        ("simple", "summarization"): "gpt-4o-mini",
        
        # 中等复杂度 -> 使用标准模型
        ("medium", "reasoning"): "gpt-4o",
        ("medium", "writing"): "gpt-4o",
        
        # 复杂任务 -> 使用最强模型
        ("complex", "planning"): "o1",
        ("complex", "code_generation"): "o1",
    }
    
    def select_model(self, task_type: str, complexity: str) -> str:
        """根据任务类型和复杂度选择最合适的模型"""
        key = (complexity, task_type)
        return self.ROUTING_RULES.get(key, "gpt-4o")
    
    def estimate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        """估算请求成本"""
        PRICING = {
            "gpt-4o": {"input": 2.5, "output": 10},  # $/M tokens
            "gpt-4o-mini": {"input": 0.15, "output": 0.6},
            "o1": {"input": 15, "output": 60},
        }
        pricing = PRICING.get(model, PRICING["gpt-4o"])
        return (input_tokens / 1_000_000) * pricing["input"] + \
               (output_tokens / 1_000_000) * pricing["output"]
```

#### 4.2.2 缓存策略
```python
class SemanticCache:
    def __init__(self, similarity_threshold: float = 0.95):
        self.cache = {}
        self.similarity_threshold = similarity_threshold
    
    def get_cached_response(self, prompt: str) -> str | None:
        """语义缓存查找"""
        prompt_embedding = self._embed(prompt)
        
        for cached_prompt, (cached_embedding, response) in self.cache.items():
            similarity = cosine_similarity(
                prompt_embedding, 
                cached_embedding
            )
            if similarity >= self.similarity_threshold:
                return response
        return None
    
    def cache_response(self, prompt: str, response: str):
        """缓存响应"""
        self.cache[prompt] = (self._embed(prompt), response)
```

### 4.3 Token 使用监控

```python
class TokenMonitor:
    def __init__(self):
        self.usage_history = []
    
    def track_usage(
        self, 
        model: str, 
        input_tokens: int, 
        output_tokens: int,
        metadata: dict = None
    ):
        """记录 token 使用情况"""
        self.usage_history.append({
            "timestamp": datetime.now(),
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "metadata": metadata or {}
        })
    
    def get_cost_report(self, period: str = "daily") -> dict:
        """生成成本报告"""
        # 按周期聚合并计算成本
        ...
    
    def alert_on_anomaly(self, threshold: float = 2.0):
        """检测异常使用并告警"""
        avg_usage = np.mean([h["total_tokens"] for h in self.usage_history])
        recent = self.usage_history[-10:]
        
        for usage in recent:
            if usage["total_tokens"] > avg_usage * threshold:
                send_alert(f"异常 token 使用: {usage}")
```

---

## 5. Agent 系统最佳实践

### 5.1 Agent 架构模式

#### 5.1.1 ReAct Agent (推理 + 行动)
```python
class ReActAgent:
    """Reasoning + Acting 模式"""
    
    def __init__(self, llm, tools: list):
        self.llm = llm
        self.tools = {t.name: t for t in tools}
    
    async def run(self, query: str, max_iterations: int = 10) -> str:
        history = []
        
        for _ in range(max_iterations):
            # 1. 推理：分析当前状态
            thought = await self.llm.generate(
                f"""分析当前状态并决定下一步行动。
                
                历史步骤：{history}
                用户问题：{query}
                
                你的思考："""
            )
            
            # 2. 行动：决定使用工具或给出答案
            action = await self.llm.generate(
                f"""基于以上推理，决定：
                1. 使用哪个工具（如果需要）
                2. 或者直接给出最终答案
                
                格式：
                行动：[工具名 或 "最终答案"]
                参数：{{JSON 格式 或 N/A}}"""
            )
            
            if action.type == "final_answer":
                return action.answer
            
            # 3. 观察：执行工具并获取结果
            result = await self.tools[action.tool_name].execute(action.params)
            history.append({
                "thought": thought,
                "action": action,
                "observation": result
            })
```

#### 5.1.2 Plan-and-Execute Agent
```python
class PlanExecuteAgent:
    """先规划后执行模式"""
    
    async def run(self, query: str) -> str:
        # 阶段1：制定计划
        plan = await self._create_plan(query)
        
        # 阶段2：执行计划
        results = []
        for step in plan.steps:
            # 检查前置条件
            if not self._check_prerequisites(step, results):
                # 重新规划
                plan = await self._replan(query, results)
                break
            
            result = await self._execute_step(step)
            results.append(result)
        
        # 阶段3：整合结果
        return await self._finalize_response(plan, results)
```

#### 5.1.3 Self-Correcting Agent
```python
class SelfCorrectingAgent:
    """带自我纠错的 Agent"""
    
    async def run(self, query: str) -> str:
        max_attempts = 3
        
        for attempt in range(max_attempts):
            # 生成响应
            response = await self._generate_response(query)
            
            # 验证响应
            is_valid, feedback = await self._validate_response(
                query, 
                response
            )
            
            if is_valid:
                return response
            
            # 纠错
            if attempt < max_attempts - 1:
                query = f"""原始问题：{query}
                之前尝试的响应：{response}
                反馈：{feedback}
                
                请根据反馈修正响应："""
            else:
                return self._fallback_response(response, feedback)
```

### 5.2 多 Agent 协作模式

#### 5.2.1 Supervisor 模式
```
┌─────────────────────────────────────┐
│           Supervisor               │
│    (路由、任务分配、协调)            │
└──────────────┬──────────────────────┘
               │
       ┌───────┼───────┐
       ▼       ▼       ▼
    ┌─────┐ ┌─────┐ ┌─────┐
    │Agent│ │Agent│ │Agent│
    │  A  │ │  B  │ │  C  │
    └─────┘ └─────┘ └─────┘
```

```python
class SupervisorAgent:
    def __init__(self, agents: dict):
        self.agents = agents
    
    async def route_task(self, task: str) -> str:
        """动态路由任务到合适的 Agent"""
        analysis = await self.llm.analyze(
            f"""分析任务并选择最合适的执行者。
            
            任务：{task}
            
            可用 Agent：
            {self._describe_agents()}
            
            选择："""
        )
        
        selected_agent = self.agents[analysis.selected]
        return await selected_agent.execute(task)
```

#### 5.2.2 Debate/Discussion 模式
```python
class DebateAgent:
    """多 Agent 辩论模式，用于复杂决策"""
    
    def __init__(self, agents: list, num_rounds: int = 3):
        self.agents = agents
        self.num_rounds = num_rounds
    
    async def discuss(self, topic: str) -> str:
        """执行多轮辩论并达成共识"""
        arguments = {agent.name: [] for agent in self.agents}
        
        for round in range(self.num_rounds):
            for agent in self.agents:
                # 基于其他 Agent 的论点生成回应
                response = await agent.respond(
                    topic=topic,
                    other_arguments={
                        k: v[-1] for k, v in arguments.items() 
                        if k != agent.name
                    }
                )
                arguments[agent.name].append(response)
        
        # 最终整合所有论点
        return await self._synthesize(arguments)
```

#### 5.2.3 Pipeline 模式
```python
class PipelineAgent:
    """顺序流水线模式"""
    
    def __init__(self, stages: list):
        self.stages = stages  # [(agent, input_transform, output_transform)]
    
    async def run(self, initial_input: dict) -> str:
        current = initial_input
        
        for agent, input_transform, output_transform in self.stages:
            # 转换输入
            transformed_input = input_transform(current)
            
            # 执行阶段
            result = await agent.execute(transformed_input)
            
            # 转换输出供下一阶段使用
            current = output_transform(result)
        
        return current
```

### 5.3 Agent 工具生态

| 框架 | 特点 | 适用场景 |
|------|------|----------|
| **LangChain** | 丰富的预置组件，易上手 | 快速原型 |
| **LangGraph** | 图结构编排，精细控制 | 复杂工作流 |
| **Deep Agents** | 自动上下文压缩、虚拟文件系统 | 生产级应用 |
| **AutoGen** | 多 Agent 对话编排 | 协作场景 |
| **CrewAI** | Role-based Agent 组织 | 团队协作模拟 |

### 5.4 观测与调试

```python
# LangSmith 集成示例
from langsmith import trace

class ObservabilityWrapper:
    @trace(name="agent_execution", tags=["agent", "production"])
    async def execute_with_trace(self, agent, query: str) -> str:
        # 自动追踪所有工具调用和决策
        return await agent.run(query)
    
    def analyze_failure(self, trace_id: str) -> dict:
        """分析失败轨迹"""
        trace_data = langsmith.get_trace(trace_id)
        return {
            "failure_point": trace_data.find_failure_point(),
            "error_message": trace_data.error.message,
            "tool_calls": trace_data.tool_calls,
            "llm_calls": trace_data.llm_calls,
            "recommendations": self._generate_recommendations(trace_data)
        }
```

---

## 6. 项目应用建议

### 6.1 立即可实施的优化

1. **Prompt 优化**
   - 为不同任务类型设计专用 Prompt 模板
   - 引入结构化输出强制 JSON 格式
   - 实现 Few-shot 示例库

2. **CoT 集成**
   - 在复杂推理任务中启用 Chain-of-Thought
   - 使用 Least-to-Most 处理组合问题

3. **工具调用优化**
   - 完善工具描述 (description)
   - 实现工具调用的错误处理和重试
   - 添加语义工具选择

4. **成本控制**
   - 实现 Token 使用监控
   - 引入模型路由 (简单任务用小模型)
   - 基础缓存机制

### 6.2 中期改进

1. **Agent 架构升级**
   - 实现 Plan-and-Execute 模式处理复杂任务
   - 添加自我纠错机制
   - 引入多 Agent 协作

2. **高级优化**
   - 实现 ToT 用于关键决策点
   - 部署语义缓存
   - 集成 LangSmith 观测

3. **性能优化**
   - 实现异步并行工具调用
   - 添加请求队列和限流
   - 优化上下文压缩算法

### 6.3 架构建议

```
┌─────────────────────────────────────────────────────┐
│                   API Layer                         │
│    (限流、认证、监控)                                 │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│               Agent Orchestrator                     │
│    (LangGraph/LangChain)                            │
│    - 任务分解与路由                                   │
│    - 多 Agent 协调                                    │
│    - 状态管理                                        │
└─────────────────────┬───────────────────────────────┘
                      │
    ┌─────────────────┼─────────────────┐
    ▼                 ▼                 ▼
┌────────┐       ┌────────┐        ┌────────┐
│ Agent  │       │ Agent  │        │ Agent  │
│ (推理) │       │ (执行) │        │ (验证) │
└────────┘       └────────┘        └────────┘
    │                 │                 │
    └─────────────────┼─────────────────┘
                      ▼
┌─────────────────────────────────────────────────────┐
│              Tool Registry                          │
│    (工具描述、版本管理、访问控制)                      │
└─────────────────────────────────────────────────────┘
```

### 6.4 关键指标监控

| 指标 | 目标值 | 告警阈值 |
|------|--------|----------|
| Token 使用效率 | > 80% | < 60% |
| 首次响应延迟 | < 2s | > 5s |
| 任务成功率 | > 95% | < 90% |
| Agent 循环次数 | 平均 < 5 | > 10 |
| 工具调用成功率 | > 98% | < 95% |

---

## 参考资源

- [Prompt Engineering Guide](https://www.promptingguide.ai/)
- [LangChain Documentation](https://python.langchain.com/docs/)
- [Anthropic CoT Documentation](https://docs.anthropic.com/)
- [LangGraph](https://python.langchain.com/docs/langgraph/)
- [AutoGen](https://microsoft.github.io/autogen/)
- [LLM 成本优化实践](https://www.anyscale.com/blog)

---

*本报告将根据技术发展持续更新*
