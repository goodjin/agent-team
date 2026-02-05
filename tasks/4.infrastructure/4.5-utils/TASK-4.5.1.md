# 4.5.1 文件工具函数

## 任务描述
提供通用的文件操作工具函数。

## 输入
- 无

## 输出
- `src/utils/file.ts` - 文件工具函数

## 验收标准
1. 读取文件内容
2. 写入文件内容
3. 检查文件是否存在
4. 创建目录
5. 删除文件/目录

## 依赖任务
- 无

## 估计工时
1h

## 优先级
高

## 任务内容
1. 创建 `src/utils/file.ts`
   - readFile(path): 异步读取文件
   - writeFile(path, content): 异步写入文件
   - exists(path): 检查文件是否存在
   - mkdir(path, recursive): 创建目录
   - rm(path, recursive): 删除文件或目录
   - readdir(path): 读取目录内容
   - glob(pattern, cwd): 文件模式匹配

2. 错误处理
   - 文件不存在错误
   - 权限错误
   - 路径错误
