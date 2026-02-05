# 4.2.2 文件操作工具

## 任务描述
实现文件操作工具，包括读取、写入、搜索、删除、列出目录。

## 输入
- 无

## 输出
- `src/tools/impl/file-tools.ts` - 文件操作工具实现

## 验收标准
1. 读取文件内容
2. 写入文件内容
3. 搜索文件（支持模式匹配）
4. 删除文件
5. 列出目录内容

## 依赖任务
- 4.2.1 ToolRegistry 工具注册表
- 4.5.1 文件工具函数

## 估计工时
3h

## 优先级
高

## 任务内容
1. 创建 `src/tools/impl/file-tools.ts`
   - readFile(params): 读取文件
     - 参数：filePath
     - 返回：文件内容

   - writeFile(params): 写入文件
     - 参数：filePath、content
     - 返回：操作结果

   - searchFiles(params): 搜索文件
     - 参数：pattern、cwd、ignore
     - 返回：匹配文件列表

   - deleteFile(params): 删除文件
     - 参数：filePath
     - 返回：操作结果

   - listDirectory(params): 列出目录
     - 参数：dirPath
     - 返回：目录内容列表

2. 注册工具到注册表
   - 将上述工具注册到 ToolRegistry

3. 参数验证
   - 检查文件路径是否有效
   - 检查文件是否存在
   - 处理权限错误
