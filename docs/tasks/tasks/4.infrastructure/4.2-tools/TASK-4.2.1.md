# 4.2.1 ToolRegistry 工具注册表

## 任务描述
实现工具注册表，负责工具的注册、发现和调用。

## 输入
- 无

## 输出
- `src/tools/tool-registry.ts` - ToolRegistry 类
- `src/tools/types.ts` - 工具类型定义

## 验收标准
1. 支持工具注册和注销
2. 支持工具参数验证
3. 支持工具执行结果标准化
4. 大模型能够发现和使用工具

## 依赖任务
- 4.4.1 类型定义基础

## 估计工时
3h

## 优先级
高

## 任务内容
1. 创建 `src/tools/types.ts`
   - 定义 ToolDefinition 接口：name、description、category、parameters、returnFormat
   - 定义 ToolResult 接口：success、data、error
   - 定义 ToolCategory 类型：'file' | 'git' | 'code' | 'browser' | 'ai-generation' | 'custom'
   - 导出所有类型

2. 创建 `src/tools/tool-registry.ts`
   - ToolRegistry 类
     - constructor(): 初始化空注册表
     - register(tool): 注册工具
     - unregister(name): 注销工具
     - getTool(name): 获取工具定义
     - getTools(filters): 按条件筛选工具
     - getToolsByCategory(category): 获取分类下所有工具
     - execute(name, params): 执行工具
     - validateParams(name, params): 验证参数

3. 工具分类
   - file: 文件操作工具
   - git: Git 操作工具
   - code: 代码分析工具
   - browser: 浏览器操作工具
   - ai-generation: AI 生成工具
   - custom: 自定义工具

4. 工具执行结果标准化
   - 统一返回格式 { success, data, error }
   - 方便大模型提取结果
