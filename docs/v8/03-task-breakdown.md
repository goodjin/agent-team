# Agent Team v8.0 - 任务拆分

**版本**: 8.0.0
**状态**: 已审核
**作者**: 系统架构师
**创建日期**: 2026-02-12

---

## 任务总览

| 编号 | 任务名称 | 优先级 | 预计工时 | 阶段 | 依赖 | 输出产物 |
|------|---------|--------|---------|------|------|---------|
| Task 1 | KnowledgeEntry 类型系统 + VectorStore 基础 | P0 | 4h | Phase 1 | - | `types.ts`, `vector-store.ts`（骨架） |
| Task 2 | TF-IDF 向量化引擎 | P0 | 5h | Phase 1 | Task 1 | `vector-store.ts`（向量化部分） |
| Task 3 | 余弦相似度检索 + Top-K 搜索 | P0 | 3h | Phase 1 | Task 2 | `vector-store.ts`（检索部分） |
| Task 4 | KnowledgeExtractor - 事件监听 + 知识提取 | P0 | 4h | Phase 2 | Task 3 | `extractor.ts` |
| Task 5 | AgentMemory - 三层记忆系统 | P1 | 5h | Phase 2 | Task 3 | `agent-memory.ts` |
| Task 6 | ProjectKnowledgeBase - 项目隔离 + Markdown I/O | P1 | 4h | Phase 2 | Task 3 | `project-kb.ts` |
| Task 7 | 知识库 REST API | P1 | 3h | Phase 3 | Task 6 | `api/knowledge-api.ts` |
| Task 8 | 端到端测试 | P1 | 4h | Phase 3 | Task 1-7 | `tests/v8/` |

**总预计工时**：32h（约 4 个工作日）

---

## 阶段规划

### Phase 1：存储基础设施（Task 1-3，顺序执行）

```
Task 1 → Task 2 → Task 3
```

Task 1-3 存在强依赖，必须顺序执行。Task 1 建立类型系统和 VectorStore 骨架，Task 2 实现向量化，Task 3 实现检索。

**Phase 1 完成标准**：
- `VectorStore` 完整可用（CRUD + 向量化 + 检索 + 持久化）
- 单元测试覆盖率 >= 80%
- 10,000 条数据下检索延迟 <= 200ms

---

### Phase 2：知识管理层（Task 4-6，可并发执行）

```
Task 4（依赖 Task 3）
Task 5（依赖 Task 3）  ← 三者可在 Phase 1 完成后并发执行
Task 6（依赖 Task 3）
```

Task 4/5/6 均只依赖 Task 3 的完成，相互独立，可并发执行（最多 3 个 subagent）。

**Phase 2 完成标准**：
- Agent 执行任务后自动提取并存储知识
- 记忆注入对 AgentLoop 透明，现有测试无回归
- ProjectKnowledgeBase 支持 Markdown 导入导出

---

### Phase 3：集成与 API（Task 7-8）

```
Task 7（依赖 Task 6）
Task 8（依赖 Task 1-7）← Task 7 和 Task 8 可并发，Task 8 最终需等待 Task 7
```

**Phase 3 完成标准**：
- REST API 全部端点可用
- E2E 测试全部通过
- 性能基准测试达标

---

## 任务详情速览

### Task 1: KnowledgeEntry 类型系统 + VectorStore 基础 (P0, 4h)

**目标**：建立整个知识库系统的类型基础和 VectorStore 的骨架，包括文件持久化机制。

**核心交付**：
- `src/knowledge/types.ts` - 所有类型定义
- `src/knowledge/vector-store.ts` - VectorStore 类（CRUD + 持久化，不含向量化）
- `src/knowledge/index.ts` - 统一导出

**验收标准**：
- [ ] TypeScript 编译无错误
- [ ] VectorStore 支持 add/get/update/delete/list 操作
- [ ] 原子写入：写临时文件再 rename
- [ ] 防抖写入：500ms debounce
- [ ] 进程退出前强制同步写入（`process.on('exit')`）

---

### Task 2: TF-IDF 向量化引擎 (P0, 5h)

**目标**：实现纯 JS/TS 的 TF-IDF 向量化算法，支持中英文混合文本。

**核心交付**：
- `src/knowledge/vector-store.ts` - 向量化部分（tokenize + TF-IDF 计算）
- 词汇表管理（增量更新 + 全量重建）

**验收标准**：
- [ ] 单条文本向量化延迟 <= 50ms
- [ ] 同一文本多次向量化结果一致（幂等）
- [ ] 支持中英文混合文本
- [ ] 词汇表上限 10,000 词可配置
- [ ] 每 100 次 CRUD 触发全量 IDF 重建（异步）

---

### Task 3: 余弦相似度检索 + Top-K 搜索 (P0, 3h)

**目标**：实现基于余弦相似度的 Top-K 知识检索。

**核心交付**：
- `src/knowledge/vector-store.ts` - search 方法
- 支持相似度阈值过滤、分类过滤、命名空间过滤

**验收标准**：
- [ ] 相同语义文本相似度 >= 0.7
- [ ] 完全不相关文本相似度 <= 0.2
- [ ] 10,000 条数据检索延迟 P99 <= 200ms
- [ ] 支持 K 值范围 1-50
- [ ] 空知识库返回空数组，不报错

---

### Task 4: KnowledgeExtractor - 事件监听 + 知识提取 (P0, 4h)

**目标**：实现从 Agent 任务执行中自动提取知识的提取器。

**核心交付**：
- `src/knowledge/extractor.ts` - KnowledgeExtractor 类

**验收标准**：
- [ ] 监听 task:completed / task:failed / tool:error 事件
- [ ] 任务完成后 <= 2 秒内完成知识提取
- [ ] 相似度 > 0.9 的重复知识自动合并
- [ ] 敏感信息（API Key、密码、Token）自动脱敏
- [ ] 自动分类准确率 >= 70%（基于规则引擎）
- [ ] 知识条目包含 source.taskId 引用

---

### Task 5: AgentMemory - 三层记忆系统 (P1, 5h)

**目标**：实现三层记忆系统的统一管理接口和记忆注入 middleware。

**核心交付**：
- `src/knowledge/agent-memory.ts` - AgentMemory 类
- 情景记忆持久化（episodes.json）
- 记忆注入格式化

**验收标准**：
- [ ] 情景记忆自动持久化到独立文件
- [ ] 最多保留 1000 条情景记录
- [ ] 情景摘要压缩到 <= 500 字符
- [ ] 记忆注入不超过 token 预算（默认 1000 tokens）
- [ ] 无相关记忆时不注入空内容
- [ ] AgentLoop 上下文超过 80% token 限制时自动触发压缩
- [ ] 支持查询"最近 7 天的任务"

---

### Task 6: ProjectKnowledgeBase - 项目隔离 + Markdown I/O (P1, 4h)

**目标**：实现项目级知识库管理，包括混合搜索、版本控制和 Markdown 导入导出。

**核心交付**：
- `src/knowledge/project-kb.ts` - ProjectKnowledgeBase 类

**验收标准**：
- [ ] 不同项目知识库完全隔离（独立文件路径）
- [ ] 单条目最多保留 20 个历史版本
- [ ] 回滚操作本身也创建新版本（可审计）
- [ ] stats() 返回：总条数、各类别条数、存储大小
- [ ] 混合搜索权重可配置（semantic_weight 0-1）
- [ ] Markdown 导出文件人类可读
- [ ] 导入支持增量导入（跳过已存在条目）
- [ ] 导入时验证格式，无效条目记录 warning 并跳过

---

### Task 7: 知识库 REST API (P1, 3h)

**目标**：实现 HTTP REST API，使用 Node.js 原生 http 模块，无新依赖。

**核心交付**：
- `src/knowledge/api/knowledge-api.ts` - KnowledgeAPI 类

**端点清单**：
```
POST   /api/v1/knowledge          创建
GET    /api/v1/knowledge/:id      获取
PUT    /api/v1/knowledge/:id      更新
DELETE /api/v1/knowledge/:id      删除
GET    /api/v1/knowledge          列表
POST   /api/v1/knowledge/search   搜索
GET    /api/v1/knowledge/stats    统计
GET    /api/v1/knowledge/export   导出
POST   /api/v1/knowledge/import   导入
```

**验收标准**：
- [ ] 所有端点返回标准 JSON（`{ code, data, message }`）
- [ ] 错误响应包含明确错误码
- [ ] 支持 CORS（Access-Control-Allow-Origin: *）
- [ ] 默认端口 3001，可通过环境变量配置
- [ ] 仅使用 Node.js 原生 `http` 模块，不引入新依赖

---

### Task 8: 端到端测试 (P1, 4h)

**目标**：编写完整的单元测试和 E2E 集成测试，验证系统在真实场景下的正确性和性能。

**核心交付**：
- `tests/v8/unit/` - 各模块单元测试
- `tests/v8/e2e/` - 端到端集成测试

**测试场景**：
1. 多任务知识积累：模拟 10 个任务，验证知识自动提取和检索
2. 记忆注入：验证 LLM 调用前正确注入相关知识
3. 持久化恢复：进程重启后知识库数据完整恢复
4. 性能基准：10,000 条数据下各操作延迟达标

**验收标准**：
- [ ] 单元测试覆盖率 >= 80%
- [ ] E2E 测试全部通过
- [ ] 性能基准：检索延迟 P99 <= 200ms（10,000 条）
- [ ] 与 v5/v6/v7 集成无回归（现有测试全部通过）
- [ ] 进程崩溃不丢失数据（原子写入验证）

---

## 并发执行建议

```
顺序执行（Phase 1）:
  Task 1 → Task 2 → Task 3

并发执行（Phase 2，3 个 subagent）:
  Subagent A: Task 4（KnowledgeExtractor）
  Subagent B: Task 5（AgentMemory）
  Subagent C: Task 6（ProjectKnowledgeBase）

Phase 2 全部完成后:
  Task 7（REST API）
  Task 8（E2E 测试，基础用例先行，Task 7 完成后补全 API 测试）
```

**估计总日历时间**：
- Phase 1：1.5 天（顺序执行，总 12h）
- Phase 2：1 天（并发执行，最长 5h）
- Phase 3：1 天（7h，Task 7 + Task 8）
- **总计：约 3.5 个工作日**
