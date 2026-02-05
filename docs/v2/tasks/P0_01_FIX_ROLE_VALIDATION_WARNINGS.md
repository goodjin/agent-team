---
status: pending
priority: P0
estimated_hours: 2
created: 2026-02-04
updated: 2026-02-04
---

# P0.1 修复角色验证警告

## 任务信息

| 属性 | 值 |
|------|-----|
| 状态 | pending |
| 优先级 | P0 |
| 预估工时 | 2h |
| 负责人 | - |
| 关联任务 | - |

## 描述

启动时提示角色配置文件缺少 `deletable: false` 和 `disabled: false` 字段。

## 问题表现

```
角色 architect.yaml 验证失败: 内置角色 architect 不能设置为可删除, 内置角色 architect 不能设置为可禁用
角色 developer.yaml 验证失败: 内置角色 developer 不能设置为可删除, 内置角色 developer 不能设置为可禁用
```

## 解决方案

修改 `prompts/roles/*.yaml` 配置文件，添加必需字段：

```yaml
# architect.yaml 示例
id: architect
name: 架构师
deletable: false  # 添加此行
disabled: false   # 添加此行
```

## 修改文件

- [ ] `prompts/roles/architect.yaml`
- [ ] `prompts/roles/developer.yaml`
- [ ] `prompts/roles/doc-writer.yaml`
- [ ] `prompts/roles/product-manager.yaml`
- [ ] `prompts/roles/tester.yaml`

## 验收标准

- [ ] 启动时所有角色验证通过
- [ ] 无验证警告输出

## 技术备注

参考 `src/roles/role-validator.ts` 中的验证逻辑。

---

## 完成记录

| 日期 | 操作 | 负责人 |
|------|------|--------|
| - | - | - |
