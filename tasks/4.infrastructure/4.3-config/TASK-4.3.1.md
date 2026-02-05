# 4.3.1 配置管理器实现

## 任务描述
实现配置管理器，负责加载和解析配置文件，支持环境变量覆盖。

## 输入
- 无

## 输出
- `src/config/config-manager.ts` - ConfigManager 类
- `src/config/types.ts` - 配置类型定义

## 验收标准
1. 读取默认配置文件 ~/.agent-team/config.yaml
2. 支持环境变量覆盖
3. 配置检查：文件存在性、格式正确性
4. 启动时检查配置

## 依赖任务
- 4.4.1 类型定义基础
- 4.5.1 文件工具函数

## 估计工时
2h

## 优先级
高

## 任务内容
1. 创建 `src/config/types.ts`
   - 定义 AppConfig 接口：llm、project 等
   - 定义 LLMConfig 接口：providers、defaultProvider 等
   - 定义 ProviderConfig 接口
   - 导出所有类型

2. 创建 `src/config/config-manager.ts`
   - ConfigManager 类
     - constructor(configPath?: string): 初始化
     - loadConfig(): 加载配置文件
     - getConfig(): 获取完整配置
     - getLLMConfig(): 获取 LLM 配置
     - getProviderConfig(providerName): 获取指定服务商配置
     - getAPIKey(providerName): 获取 API Key（优先环境变量）
     - checkConfig(): 检查配置有效性

3. 配置检查逻辑
   - 检查配置文件是否存在
   - 检查 YAML 格式是否正确
   - 检查必要字段是否存在

4. 环境变量覆盖
   - 支持 AGENT_LLM_PROVIDER 覆盖默认服务商
   - 支持各服务商的 API Key 环境变量
