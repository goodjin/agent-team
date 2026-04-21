import * as path from 'path';
import * as fs from 'fs/promises';

const LAYOUT_MD = `# 任务工作空间目录约定

本目录为任务 \`data/workspaces/<taskId>/\` 根。主控与工人工具（read/write/list）均相对此根。

## 推荐结构

| 路径 | 用途 |
|------|------|
| \`docs/REQUIREMENTS.md\` | **全局需求文档（主控维护，须保持最新）**：用户提出/变更需求时先更新此文件，再拆任务与派工 |
| \`docs/EXPERIENCE.md\` | **可复用经验（工人/主控追加）**：用 \`record_experience\` 写入；他人开工前 \`read_file\` 查阅 |
| \`docs/CLOSURE_EXPERIENCE.md\` | **结案后全局复盘摘要**（系统异步写入，可读不可依赖其存在） |
| \`TASK.md\` | **执行总览（主控维护）**：里程碑、节点索引、依赖关系、当前状态；不替代 REQUIREMENTS |
| \`docs/CHANGE_LOG.md\` | **变更与审计记录**：需求变更、计划重排、重大决策先记录再行动 |
| \`docs/modules/\` | 模块级任务说明（复杂任务第一层适合放这里） |
| \`docs/subtasks/\` | 各原子子任务说明（如 \`<nodeId>.md\`） |
| \`docs/plans/\` | 规划文档（主控/规划角色输出，建议版本化保存） |
| \`docs/notepads/\` | 规划与执行过程的 learnings / decisions / issues / verification |
| \`docs/notes/\` | 过程笔记、会议结论 |
| \`deliverables/\` | 对外交付物（构建产物、发布包等） |
| \`reports/\` | 报告、复盘、验证记录 |
| \`.tmp/\` | 临时文件（可定期清理） |

新建目录已预创建；可按项目需要增删。成品在 UI 中按路径树展示，请保持路径有层次、命名可读。
`;

const REQUIREMENTS_SEED = `# 需求文档（主控维护 · 须保持最新）

> **规范**：用户提出**新需求**或**修改需求**时，主控须先用 \`read_file\` / \`write_file\` **更新本文件**，使内容与用户最新意图一致，**再**拆分任务、\`submit_plan\`、派工。派发到工人的 \`ASSIGN_WORK\` 说明中系统会自动引用本路径；工人应先 \`read_file\` 本文件建立全局上下文，再读子任务文档与节点说明后开工。
>
> **边界**：
> - 本文件描述“用户真正要什么”，是全局真源。
> - \`TASK.md\` 只记录执行计划、节点索引、状态与里程碑。
> - \`docs/modules/*.md\` 描述模块任务边界与模块内拆分。
> - \`docs/subtasks/*.md\` 描述原子任务细节与验收口径。

## 1. 背景与目标

（主控根据对话填写）

## 2. 范围与非目标

## 3. 约束与验收标准

## 4. 变更记录

| 时间 | 摘要 |
|------|------|
|  |  |
`;

const TASK_SEED = `# 任务执行总览（主控维护）

> **用途**：本文件服务执行过程，而不是替代 \`docs/REQUIREMENTS.md\`。
>
> - \`docs/REQUIREMENTS.md\`：记录用户需求、范围、约束、验收标准
> - \`TASK.md\`：记录里程碑、节点索引、依赖关系、状态推进
> - \`docs/modules/*.md\`：复杂任务的模块级说明
> - \`docs/subtasks/*.md\`：原子任务的详细执行说明
>
> **规范**：需求或计划发生显著变化时，先在 \`docs/CHANGE_LOG.md\` 追加记录，再回写本文件与相关模块/子任务文档。

## 1. 当前执行摘要

（主控填写）

## 2. 里程碑

- [ ] 待补充

## 3. 节点索引

| 节点ID | 类型 | 文档 | 状态 | 依赖 | 备注 |
|------|------|------|------|------|------|
|  |  |  | pending |  |  |
`;

const CHANGE_LOG_SEED = `# 变更与审计记录

> **规范**：需求变更、计划重排、拆分策略变化、重大返工前，先追加一条记录，再执行后续动作。

| 时间 | 级别 | 对象 | 变更前摘要 | 变更后摘要 | 原因/影响 |
|------|------|------|------|------|------|
|  |  |  |  |  |  |
`;

const EXPERIENCE_SEED = `# 任务内可复用经验

> 工人/主控在**问题已解决且方案已验证**后，应调用 \`record_experience\` 工具追加条目。开工前请先 \`read_file\` 本文件，按标题/标签筛选与当前节点相关的经验。

（尚无条目时此处为空，首条经验写入后自动出现章节。）
`;

/**
 * 创建任务工作空间推荐目录与说明文件（幂等）。
 */
export async function ensureTaskWorkspaceLayout(taskId: string): Promise<void> {
  const root = path.resolve(process.cwd(), 'data/workspaces', taskId);
  const subdirs = [
    'docs/modules',
    'docs/subtasks',
    'docs/plans',
    'docs/notepads',
    'docs/notes',
    'deliverables',
    'reports',
    'reports/audit',
    '.tmp',
  ];
  for (const rel of subdirs) {
    await fs.mkdir(path.join(root, rel), { recursive: true });
  }
  const layoutPath = path.join(root, 'WORKSPACE_LAYOUT.md');
  try {
    await fs.access(layoutPath);
  } catch {
    await fs.writeFile(layoutPath, LAYOUT_MD, 'utf-8');
  }
  const reqPath = path.join(root, 'docs', 'REQUIREMENTS.md');
  try {
    await fs.access(reqPath);
  } catch {
    await fs.writeFile(reqPath, REQUIREMENTS_SEED, 'utf-8');
  }
  const taskPath = path.join(root, 'TASK.md');
  try {
    await fs.access(taskPath);
  } catch {
    await fs.writeFile(taskPath, TASK_SEED, 'utf-8');
  }
  const changeLogPath = path.join(root, 'docs', 'CHANGE_LOG.md');
  try {
    await fs.access(changeLogPath);
  } catch {
    await fs.writeFile(changeLogPath, CHANGE_LOG_SEED, 'utf-8');
  }
  const expPath = path.join(root, 'docs', 'EXPERIENCE.md');
  try {
    await fs.access(expPath);
  } catch {
    await fs.writeFile(expPath, EXPERIENCE_SEED, 'utf-8');
  }
}
