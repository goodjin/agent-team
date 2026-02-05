# 3.2.1 RoleManager 角色提示词管理器

## 任务描述
实现角色提示词管理器，负责读取和管理角色 Markdown 文件。

## 输入
- 无

## 输出
- `src/roles/role-manager.ts` - RoleManager 类
- `src/roles/types.ts` - 角色类型定义

## 验收标准
1. 能够读取 roles 目录下的所有角色
2. 能够根据角色 ID 获取提示词
3. 支持变量替换（如 {{project_name}}）
4. 支持创建和删除角色（仅操作文件）

## 依赖任务
- 4.5.1 文件工具函数

## 估计工时
2h

## 优先级
高

## 任务内容
1. 创建 `src/roles/types.ts`
   - 定义 RoleType 枚举
   - 定义 Role 接口：id、name、type、description、promptPath、createdBy、enabled
   - 导出 Role 和 RoleType

2. 创建 `src/roles/role-manager.ts`
   - RoleManager 类
     - constructor(rolesDir?: string): 初始化，指定角色目录
     - getRole(roleId): 获取角色信息
     - getRolePrompt(roleId): 获取角色提示词内容
     - getAllRoles(): 获取所有角色列表
     - createRole(role): 创建角色（创建目录和 Markdown 文件）
     - deleteRole(roleId): 删除角色
     - listRoles(): 列出所有角色

3. 角色目录结构
   ```
   roles/
   ├── product-manager/
   │   └── system_prompt.md
   ├── project-manager/
   │   └── system_prompt.md
   ├── architect/
   │   └── system_prompt.md
   ├── developer/
   │   └── system_prompt.md
   ├── tester/
   │   └── system_prompt.md
   └── doc-writer/
       └── system_prompt.md
   ```

4. 变量替换
   - 解析 {{variable}} 格式
   - 替换为实际值（如项目名称）
