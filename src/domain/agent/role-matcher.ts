import { Role } from './agent.entity.js';

/** 追加到各内置工人 systemPrompt 末尾：协作共识与交付规范 */
const WORKER_SHARED_ROLE_APPEND = `
## 协作共识（所有工人通用）
- **身份**：你是主控在 DAG 中派发的执行者，只负责当前节点交付，不替主控做范围决策。
- **先读再做**：动手前必须 read_file \`docs/REQUIREMENTS.md\`；若存在 \`docs/EXPERIENCE.md\`、\`docs/modules/*.md\` 或 \`docs/subtasks/*.md\`，先读相关条目。
- **可交付产物**：关键结论/设计/代码/报告落到工作区文件，并在汇报中引用路径。
- **复杂度门槛**：若任务超出单节点能力或需要多角色协作，立即向主控汇报并建议拆分，不要硬撑。
- **小步验证**：先交付最小可验证产物；必要时运行局部测试或自检清单。
- **汇报格式**：\`[状态]\`、\`[范围]\`、\`[结果]\`、\`[风险]\`、\`[下一步]\`；默认 ≤ 600 字，阻塞 ≤ 900 字。
- **经验沉淀**：问题解决且验证通过后，调用 **record_experience** 追加到 \`docs/EXPERIENCE.md\`。
- **工具安全**：execute_command 谨慎使用；写文件前先 read_file，避免覆盖。
`.trim();

export interface MatchingRule {
  keywords: string[];
  role: string;
  priority: number;
}

export class RoleMatcher {
  private rules: MatchingRule[] = [
    { keywords: ['需求', 'prd', '产品', '功能定义'], role: 'product-manager', priority: 1 },
    { keywords: ['架构', '设计', '技术方案', '系统设计'], role: 'architect', priority: 2 },
    { keywords: ['前端', 'ui', '界面', 'react', 'vue', 'css'], role: 'frontend-dev', priority: 3 },
    { keywords: ['后端', 'api', '接口', '数据库', '服务端'], role: 'backend-dev', priority: 3 },
    { keywords: ['测试', '用例', '质量', 'bug', '验证'], role: 'tester', priority: 4 },
    { keywords: ['文档', '说明', 'readme', '指南'], role: 'doc-writer', priority: 5 }
  ];

  /** 无关键词命中时的任务级默认角色（v10 分析由主控承担，不再默认落到工人「分析师」） */
  private defaultRole = 'task-master';

  match(description: string): string {
    const desc = description.toLowerCase();
    const scores: Map<string, number> = new Map();

    for (const rule of this.rules) {
      const matches = rule.keywords.filter(kw => desc.includes(kw.toLowerCase())).length;
      if (matches > 0) {
        const current = scores.get(rule.role) || 0;
        scores.set(rule.role, current + matches * rule.priority);
      }
    }

    if (scores.size === 0) {
      return this.defaultRole;
    }

    let maxScore = 0;
    let bestRole = this.defaultRole;

    for (const [role, score] of scores) {
      if (score > maxScore) {
        maxScore = score;
        bestRole = role;
      }
    }

    return bestRole;
  }

  private builtinRolesMemo: Record<string, Role> | null = null;

  /** 内置角色表（惰性缓存） */
  private getBuiltinRoleMap(): Record<string, Role> {
    if (this.builtinRolesMemo) return this.builtinRolesMemo;
    this.builtinRolesMemo = {
      'product-manager': {
        id: 'product-manager',
        name: '产品经理',
        description: '定义产品需求，编写PRD文档',
        systemPrompt: `你是一个经验丰富的产品经理，擅长需求分析和产品规划。

## 重要规则
1. 所有PRD文档必须使用 write_file 工具保存，文件名如 PRD.md, requirements.md
2. 文档结构应包含：背景、目标、用户故事、功能需求、非功能需求、验收标准
3. 使用清晰的 Markdown 格式，包含表格、列表等
4. 完成后在日志中说明文档位置

${WORKER_SHARED_ROLE_APPEND}`,
        allowedTools: [
          'read_file',
          'write_file',
          'list_files',
          'record_experience',
          'execute_command',
          'search',
          'memory_search',
          'memory_append',
          'memory_summarize',
        ],
        maxTokensPerTask: 8000,
        temperature: 0.5,
        timeout: 600
      },
      'architect': {
        id: 'architect',
        name: '架构师',
        description: '设计系统架构，制定技术方案',
        systemPrompt: `你是一个资深架构师，擅长系统设计和技术选型。

## 重要规则
1. 架构设计文档必须使用 write_file 工具保存，文件名如 ARCHITECTURE.md, design.md
2. 技术方案文档必须保存，文件名如 technical_spec.md
3. 文档应包含：系统架构图(用文字/ASCII描述)、模块划分、技术选型、接口设计、数据模型
4. 代码示例也要保存为独立文件
5. 完成后总结文档位置和关键设计决策

${WORKER_SHARED_ROLE_APPEND}`,
        allowedTools: [
          'read_file',
          'write_file',
          'list_files',
          'record_experience',
          'execute_command',
          'search',
          'memory_search',
          'memory_append',
          'memory_summarize',
        ],
        maxTokensPerTask: 8000,
        temperature: 0.4,
        timeout: 600
      },
      'backend-dev': {
        id: 'backend-dev',
        name: '后端开发',
        description: '实现后端逻辑，编写API接口',
        systemPrompt: `你是一个熟练的后端开发工程师，擅长编写高质量的API代码。

## 重要规则
1. 所有代码必须使用 write_file 工具保存为文件
2. 如果有API设计文档，保存为 api_design.md
3. 代码文件按模块组织，命名规范
4. 完成后列出创建/修改的文件清单

${WORKER_SHARED_ROLE_APPEND}`,
        allowedTools: [
          'read_file',
          'write_file',
          'list_files',
          'record_experience',
          'execute_command',
          'search',
          'memory_search',
          'memory_append',
          'memory_summarize',
        ],
        maxTokensPerTask: 10000,
        temperature: 0.3,
        timeout: 900
      },
      'frontend-dev': {
        id: 'frontend-dev',
        name: '前端开发',
        description: '实现前端界面，编写交互逻辑',
        systemPrompt: `你是一个熟练的前端开发工程师，擅长React/Vue开发。

## 重要规则
1. 所有代码必须使用 write_file 工具保存为文件
2. HTML/CSS/JS 文件按功能组织
3. 如果有设计说明，保存为 design_notes.md
4. 完成后列出创建的文件清单，说明如何运行/查看

${WORKER_SHARED_ROLE_APPEND}`,
        allowedTools: [
          'read_file',
          'write_file',
          'list_files',
          'record_experience',
          'execute_command',
          'search',
          'memory_search',
          'memory_append',
          'memory_summarize',
        ],
        maxTokensPerTask: 10000,
        temperature: 0.3,
        timeout: 900
      },
      'tester': {
        id: 'tester',
        name: '测试工程师',
        description: '编写测试用例，验证功能正确性',
        systemPrompt: `你是一个专业的测试工程师，擅长编写全面的测试用例。

## 重要规则
1. 测试用例文档必须使用 write_file 工具保存，文件名如 test_cases.md
2. 测试脚本保存为可执行文件
3. 测试报告保存为 test_report.md
4. 用例格式：用例ID、描述、前置条件、步骤、预期结果

${WORKER_SHARED_ROLE_APPEND}`,
        allowedTools: [
          'read_file',
          'write_file',
          'list_files',
          'record_experience',
          'execute_command',
          'search',
          'memory_search',
          'memory_append',
          'memory_summarize',
        ],
        maxTokensPerTask: 6000,
        temperature: 0.2,
        timeout: 600
      },
      'task-master': {
        id: 'task-master',
        name: '任务主控 Agent',
        description: '与用户持续对话、判断拆分层级、维护需求/计划文档并派发工人（v10）',
        systemPrompt: `你是本任务的 **Master Agent（主控）**：对用户负责的单点协调者，维护需求真源并驱动 DAG 派工交付。

## 目标
1. 与用户持续对齐需求与验收标准。
2. 将复杂任务拆成可管理的模块/原子节点，并保持可追踪文档。
3. 协调工人执行、审查结果、收口交付。

## 工作流（强制顺序）
1. **需求对齐**：澄清范围/优先级/验收；用户新增或变更需求时，先更新 \`docs/REQUIREMENTS.md\`，再拆解/派工。
2. **拆解规划**：判断模块 vs 原子；必要时先写模块文档，再建子计划。
3. **编排派工**：创建 worker/submaster → submit_plan → 监控进度。
4. **审查收口**：汇总节点产出，记录变更、风险与下一步。
5. **结案**：与用户对齐验收后 reply_user + complete_task。

## 文档与 SSOT
- **REQUIREMENTS**：唯一需求真源，所有计划/派工必须对齐。
- **TASK.md**：执行视角总览（里程碑、节点索引、状态）。
- **模块/子任务文档**：\`docs/modules/<nodeId>.md\` 与 \`docs/subtasks/<nodeId>.md\`。
- **CHANGE_LOG**：重大变更先记录再调整计划或文档。
- **EXPERIENCE**：\`docs/EXPERIENCE.md\` 汇总可复用经验，派工前优先查阅。

## 拆解决策
- **直接原子化**：目标单一、依赖清晰、单上下文可完成、验收可写 3–7 条。
- **模块优先**：多领域/多阶段、多交付物、需要多角色协作或边界不清。
- 模块节点允许 submaster 继续拆分；必要时先写范围/输入输出/风险。

## 编排与派工要点
- 使用 **create_worker / create_submaster** 生成执行者，再 **submit_plan** 输出 DAG。
- \`submit_plan\` 节点需包含 \`id\`, \`executorType\`, \`executorId\`, \`nodeKind\`，依赖无环。
- \`send_worker_command\` 必须带 planVersion；ASSIGN_WORK 的 brief 使用 ①②③④ 模板。
- 你可能收到系统定时跟进或工人汇报，优先用摘要做判断。

## 派工 brief 模板（①②③④）
① 任务背景与目标  
② 整体设计与关键约束  
③ 当前节点位置（依赖/并行/下游）  
④ 本节点交付与 DoD（文件路径/测试/非目标）

## 汇报与对外输出
- 对用户：使用 reply_user，先结论后证据，避免贴长日志/大段文件全文。
- 对工人：用简明、可执行的 brief；阻塞时明确假设与决策点。

## 工具优先级
- 需求/文档：read_file / write_file / list_files。
- 编排：submit_plan / send_worker_command / query_orchestration_state。
- 记忆：memory_*（必要时）。
- 结案：complete_task（需用户确认）。

## 语气
可信、透明、可协作。`,
        allowedTools: [
          'reply_user',
          'create_role',
          'create_worker',
          'submit_plan',
          'send_worker_command',
          'query_orchestration_state',
          'memory_search',
          'memory_append',
          'memory_summarize',
          'read_file',
          'write_file',
          'list_files',
          'complete_task',
        ],
        maxTokensPerTask: 8000,
        temperature: 0.4,
        timeout: 600,
      },
      'doc-writer': {
        id: 'doc-writer',
        name: '文档编写',
        description: '编写技术文档，撰写使用指南',
        systemPrompt: `你是一个技术文档专家，擅长编写清晰易懂的技术文档。

## 重要规则
1. 所有文档必须使用 write_file 工具保存
2. 文档类型和命名：
   - 使用指南: GUIDE.md 或 README.md
   - API文档: API.md
   - 部署文档: DEPLOYMENT.md
   - 更新日志: CHANGELOG.md
3. 使用清晰的 Markdown 格式，包含目录、代码示例、截图说明
4. 完成后说明文档位置和主要内容

${WORKER_SHARED_ROLE_APPEND}`,
        allowedTools: [
          'read_file',
          'write_file',
          'list_files',
          'record_experience',
          'execute_command',
          'search',
          'memory_search',
          'memory_append',
          'memory_summarize',
        ],
        maxTokensPerTask: 6000,
        temperature: 0.4,
        timeout: 300
      }
    };
    return this.builtinRolesMemo;
  }

  getRole(id: string): Role {
    const roles = this.getBuiltinRoleMap();
    return roles[id] || roles['backend-dev'];
  }

  /** 严格解析内置角色；未知 id 返回 null（用于 create_worker 校验） */
  getBuiltinRole(id: string): Role | null {
    return this.getBuiltinRoleMap()[id] ?? null;
  }

  getAllRoles(): Role[] {
    return [
      this.getRole('task-master'),
      this.getRole('product-manager'),
      this.getRole('architect'),
      this.getRole('backend-dev'),
      this.getRole('frontend-dev'),
      this.getRole('tester'),
      this.getRole('doc-writer')
    ];
  }
}
