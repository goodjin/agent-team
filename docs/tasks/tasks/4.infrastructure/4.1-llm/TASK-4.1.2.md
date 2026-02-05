# 4.1.2 LLM 适配器层

## 任务描述
实现 LLM 适配器层，为不同服务商提供统一的调用接口。

## 输入
- 无

## 输出
- `src/services/llm/adapters/` - 适配器目录
- `src/services/llm/adapter.ts` - 适配器接口

## 验收标准
1. 定义统一的适配器接口
2. 实现 OpenAI 适配器
3. 实现 Anthropic Claude 适配器
4. 实现通义千问适配器
5. 实现智谱 GLM 适配器

## 依赖任务
- 4.1.1 LLMService 服务层

## 估计工时
6h

## 优先级
高

## 任务内容
1. 创建 `src/services/llm/adapter.ts`
   - 定义 LLMAdapter 接口
   - 定义 AdapterFactory 接口
   - 导出适配器接口

2. 创建 `src/services/llm/adapters/openai.ts`
   - OpenAIAdapter 类
   - 实现 chat 接口
   - 实现 chatStream 接口
   - 格式转换：统一请求 → OpenAI 格式
   - 格式转换：OpenAI 响应 → 统一格式

3. 创建 `src/services/llm/adapters/anthropic.ts`
   - AnthropicAdapter 类
   - 实现 Claude 特有消息格式处理

4. 创建 `src/services/llm/adapters/qwen.ts`
   - QwenAdapter 类
   - 实现通义千问格式处理

5. 创建 `src/services/llm/adapters/glm.ts`
   - GLMAdapter 类
   - 实现智谱 GLM 格式处理

6. 创建 `src/services/llm/adapters/index.ts`
   - 适配器工厂实现
   - 适配器注册和获取
