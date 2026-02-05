# 3.3.1 RuleManager 规则管理器

## 任务描述
实现规则管理器，负责读取和管理规则 Markdown 文件，按优先级合并规则内容。

## 输入
- 无

## 输出
- `src/rules/rule-manager.ts` - RuleManager 类
- `src/rules/types.ts` - 规则类型定义

## 验收标准
1. 能够读取 rules 目录下的所有规则
2. 支持按类型筛选规则（global/project/role）
3. 优先级为 project > role > global
4. 能够根据项目或角色获取适用的规则

## 依赖任务
- 4.5.1 文件工具函数

## 估计工时
2h

## 优先级
中

## 任务内容
1. 创建 `src/rules/types.ts`
   - 定义 RuleType：'global' | 'project' | 'role'
   - 定义 Rule 接口：id、name、type、filePath、scope、enabled
   - 导出 Rule 和 RuleType

2. 创建 `src/rules/rule-manager.ts`
   - RuleManager 类
     - constructor(rulesDir?: string): 初始化，指定规则目录
     - getRule(id): 获取规则信息
     - getRuleContent(id): 获取规则文件内容
     - getAllRules(): 获取所有规则列表
     - getRulesByScope(scope): 获取指定范围的规则
     - getRulesForProject(projectId): 获取项目适用的规则
     - getRulesForRole(roleId): 获取角色适用的规则
     - getCombinedRules(projectId?, roleId?): 按优先级合并规则

3. 规则目录结构
   ```
   rules/
   ├── global_coding_standards.md
   ├── global_best_practices.md
   ├── project_{projectId}_security.md
   ├── role_{roleId}_testing.md
   ```

4. 规则优先级合并
   - 先加载全局规则
   - 再加载角色规则（覆盖全局）
   - 最后加载项目规则（覆盖角色）
   - 返回合并后的规则内容
