# 4.4.1 类型定义基础

## 任务描述
创建基础类型定义，包括通用类型、错误类型、项目类型等。

## 输入
- 无

## 输出
- `src/types/index.ts` - 基础类型导出
- `src/types/common.ts` - 通用类型
- `src/types/project.ts` - 项目类型

## 验收标准
1. 定义通用类型（Result、Error）
2. 定义项目相关类型
3. 导出所有类型供其他模块使用

## 依赖任务
- 无

## 估计工时
1h

## 优先级
高

## 任务内容
1. 创建 `src/types/common.ts`
   - 定义 Result<T> 接口：success、data、error
   - 定义 CommonError 接口：code、message、details
   - 导出常见错误码

2. 创建 `src/types/project.ts`
   - 定义 ProjectStatus：'active' | 'archived'
   - 定义 Project 接口：id、name、path、description、status、config、metadata

3. 创建 `src/types/index.ts`
   - 导出所有类型
   - 重新导出其他模块的类型
