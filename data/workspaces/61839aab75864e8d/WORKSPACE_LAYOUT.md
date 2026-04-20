# 任务工作空间目录约定

本目录为任务 `data/workspaces/<taskId>/` 根。主控与工人工具（read/write/list）均相对此根。

## 推荐结构

| 路径 | 用途 |
|------|------|
| `docs/REQUIREMENTS.md` | **全局需求文档（主控维护，须保持最新）**：用户提出/变更需求时先更新此文件，再拆任务与派工 |
| `docs/EXPERIENCE.md` | **可复用经验（工人/主控追加）**：用 `record_experience` 写入；他人开工前 `read_file` 查阅 |
| `docs/CLOSURE_EXPERIENCE.md` | **结案后全局复盘摘要**（系统异步写入，可读不可依赖其存在） |
| `TASK.md` | **执行总览（主控维护）**：里程碑、节点索引、依赖关系、当前状态；不替代 REQUIREMENTS |
| `docs/CHANGE_LOG.md` | **变更与审计记录**：需求变更、计划重排、重大决策先记录再行动 |
| `docs/modules/` | 模块级任务说明（复杂任务第一层适合放这里） |
| `docs/subtasks/` | 各原子子任务说明（如 `<nodeId>.md`） |
| `docs/notes/` | 过程笔记、会议结论 |
| `deliverables/` | 对外交付物（构建产物、发布包等） |
| `reports/` | 报告、复盘、验证记录 |
| `.tmp/` | 临时文件（可定期清理） |

新建目录已预创建；可按项目需要增删。成品在 UI 中按路径树展示，请保持路径有层次、命名可读。
