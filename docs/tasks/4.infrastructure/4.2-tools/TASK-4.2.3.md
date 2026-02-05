# 4.2.3 Git 工具

## 任务描述
实现 Git 操作工具，包括查看状态、提交、分支管理、拉取和推送。

## 输入
- 无

## 输出
- `src/tools/impl/git-tools.ts` - Git 操作工具实现

## 验收标准
1. 查看 Git 状态
2. 提交更改
3. 分支管理（列出、创建、切换）
4. 拉取远程更改
5. 推送本地更改

## 依赖任务
- 4.2.1 ToolRegistry 工具注册表
- 4.5.1 文件工具函数

## 估计工时
3h

## 优先级
中

## 任务内容
1. 创建 `src/tools/impl/git-tools.ts`
   - gitStatus(params): 查看状态
     - 参数：cwd
     - 返回：修改文件列表、当前分支

   - gitCommit(params): 提交更改
     - 参数：cwd、message
     - 返回：提交结果

   - gitBranch(params): 分支管理
     - 参数：cwd、action（list/create/delete）、branchName
     - 返回：分支列表或操作结果

   - gitPull(params): 拉取远程
     - 参数：cwd
     - 返回：拉取结果

   - gitPush(params): 推送本地
     - 参数：cwd
     - 返回：推送结果

2. 注册工具到注册表

3. 错误处理
   - 检查是否为 Git 仓库
   - 处理冲突
   - 处理认证错误
