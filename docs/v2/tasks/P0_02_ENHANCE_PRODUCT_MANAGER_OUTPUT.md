---
status: pending
priority: P0
estimated_hours: 4
created: 2026-02-04
updated: 2026-02-04
---

# P0.2 完善 ProductManager 角色输出

## 任务信息

| 属性 | 值 |
|------|-----|
| 状态 | pending |
| 优先级 | P0 |
| 预估工时 | 4h |
| 负责人 | - |
| 关联任务 | - |

## 描述

当前 ProductManager 角色输出依赖 LLM 返回严格格式，容易因解析失败而报错。需要增强容错能力。

## 问题表现

任务执行完成后返回 `error: '功能缺少必需字段'`，导致流程中断。

## 解决方案

1. 增强 `extractFeatures` 方法，支持更多返回格式
2. 为空字段提供默认值
3. 改进验证逻辑

## 修改文件

- [ ] `src/roles/product-manager.ts`

## 详细修改

### 1. extractFeatures 方法增强

```typescript
private extractFeatures(content: string): Feature[] {
  // 当前实现只解析 Markdown 列表格式
  // 需要支持更多格式：
  // - Markdown 表格
  // - JSON 数组
  // - 自然语言描述
}
```

### 2. 验证逻辑改进

```typescript
// 当前会抛错的代码
if (!feature.id || !feature.name || !feature.description) {
  throw new Error('功能缺少必需字段');
}

// 改进：自动补充默认值
if (!feature.id) feature.id = `feature-${Date.now()}`;
if (!feature.name) feature.name = '未命名功能';
if (!feature.description) feature.description = '待完善';
```

## 验收标准

- [ ] 简单需求能成功解析
- [ ] LLM 返回非标准格式时有容错
- [ ] 不再出现 "功能缺少必需字段" 错误

## 技术备注

相关文件：
- `src/roles/product-manager.ts`
- `src/types/index.ts` (RequirementAnalysis 类型)

---

## 完成记录

| 日期 | 操作 | 负责人 |
|------|------|--------|
| - | - | - |
