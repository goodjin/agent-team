# 4.2.6 代码分析工具

## 任务描述
实现代码分析工具，包括代码分析和代码差异对比。

## 输入
- 无

## 输出
- `src/tools/impl/code-analysis.ts` - 代码分析工具实现

## 验收标准
1. 分析代码结构
2. 检测代码异味
3. 对比代码差异
4. 生成分析报告

## 依赖任务
- 4.2.1 ToolRegistry 工具注册表
- 4.5.1 文件工具函数

## 估计工时
3h

## 优先级
低

## 任务内容
1. 创建 `src/tools/impl/code-analysis.ts`
   - analyzeCode(params): 代码分析
     - 参数：filePath 或 code
     - 返回：分析结果（函数列表、类列表、复杂度等）

   - detectCodeSmells(params): 代码异味检测
     - 参数：code
     - 返回：问题列表

   - diff(params): 代码差异对比
     - 参数：oldCode、newCode 或 oldFile、newFile
     - 返回：差异报告

   - getImports(params): 获取导入依赖
     - 参数：filePath 或 code
     - 返回：导入列表

2. 工具注册

3. 支持的语言
   - JavaScript/TypeScript
   - Python
   - 其他常用语言（可选）
