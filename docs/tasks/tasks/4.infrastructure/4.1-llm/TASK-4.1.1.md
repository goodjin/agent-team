# 4.1.1 LLMService 服务层

## 任务描述
实现 LLM 服务层，提供统一的 LLM 调用接口，支持多服务商和故障转移。

## 输入
- 无

## 输出
- `src/services/llm/llm-service.ts` - LLMService 类
- `src/services/llm/types.ts` - LLM 类型定义

## 验收标准
1. 提供统一的 chat 接口
2. 支持流式输出
3. 支持多服务商配置
4. 支持故障转移
5. 用户仅需配置 API Key

## 依赖任务
- 4.3.1 配置管理器实现
- 4.4.1 类型定义基础

## 估计工时
4h

## 优先级
高

## 任务内容
1. 创建 `src/services/llm/types.ts`
   - 定义 ProviderConfig 接口
   - 定义 ChatRequest 接口
   - 定义 ChatResponse 接口
   - 定义 TokenUsage 接口
   - 导出所有类型

2. 创建 `src/services/llm/llm-service.ts`
   - LLMService 类
     - constructor(config): 初始化配置
     - chat(request): 发送对话请求
     - chatStream(request): 流式对话请求
     - getAvailableProviders(): 获取可用服务商列表
     - failover(provider): 切换到备用服务商
     - getStats(): 获取 Token 使用统计

3. 配置简化
   - 从配置文件加载 API Key
   - 其他配置项使用系统预设值
   - 支持环境变量覆盖

4. 故障转移机制
   - 检测请求失败
   - 自动切换到备用服务商
   - 记录故障转移日志
