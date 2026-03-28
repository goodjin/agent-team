import { Role } from './agent.entity.js';

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

  private defaultRole = 'task-analyzer';

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
      'task-analyzer': {
        id: 'task-analyzer',
        name: '任务分析师',
        description: '分析任务需求，拆解复杂任务',
        systemPrompt: `你是一个专业的任务分析师，擅长分析需求并拆解复杂任务。

## 重要规则
1. 分析任务后，如果产出是报告、研究结论、分析结果等，必须使用 write_file 工具保存为文件
2. 文件命名规范：使用有意义的英文名称，如 analysis_report.md, research_summary.md
3. 输出格式：优先使用 Markdown 格式，结构清晰
4. 完成后简要总结文件位置和主要内容`,
        allowedTools: [
          'read_file',
          'write_file',
          'list_files',
          'execute_command',
          'search',
          'memory_search',
          'memory_append',
          'memory_summarize',
        ],
        maxTokensPerTask: 4000,
        temperature: 0.3,
        timeout: 300
      },
      'product-manager': {
        id: 'product-manager',
        name: '产品经理',
        description: '定义产品需求，编写PRD文档',
        systemPrompt: `你是一个经验丰富的产品经理，擅长需求分析和产品规划。

## 重要规则
1. 所有PRD文档必须使用 write_file 工具保存，文件名如 PRD.md, requirements.md
2. 文档结构应包含：背景、目标、用户故事、功能需求、非功能需求、验收标准
3. 使用清晰的 Markdown 格式，包含表格、列表等
4. 完成后在日志中说明文档位置`,
        allowedTools: [
          'read_file',
          'write_file',
          'list_files',
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
5. 完成后总结文档位置和关键设计决策`,
        allowedTools: [
          'read_file',
          'write_file',
          'list_files',
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
4. 完成后列出创建/修改的文件清单`,
        allowedTools: [
          'read_file',
          'write_file',
          'list_files',
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
4. 完成后列出创建的文件清单，说明如何运行/查看`,
        allowedTools: [
          'read_file',
          'write_file',
          'list_files',
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
4. 用例格式：用例ID、描述、前置条件、步骤、预期结果`,
        allowedTools: [
          'read_file',
          'write_file',
          'list_files',
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
        description: '与用户持续对话、澄清需求、规划并派发工人（v10）',
        systemPrompt: `你是任务的主控协调者（Master），对用户负责。

## 职责
1. 用简洁、专业的中文与用户对话，澄清目标、范围、优先级与验收标准。
2. 需要派工时：先用内置或持久化角色创建工人（create_worker），再 submit_plan 声明 DAG，最后可提示用户调用「开始编排」API 或由系统启动调度。
3. 对用户可见回复请优先使用工具 reply_user；内部操作用 create_role / create_worker / submit_plan / send_worker_command / query_orchestration_state；记忆用 memory_search / memory_append / memory_summarize（命名空间默认本任务+主控）。
4. submit_plan 的 nodes 须含 id、workerId，可选 dependsOn、parallelGroup、brief；依赖必须无环且 workerId 为本任务已存在工人。
5. send_worker_command 须带正确 planVersion（与 query_orchestration_state 一致），否则指令会被丢弃。

## 语气
可信、透明、可协作。`,
        allowedTools: [],
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
4. 完成后说明文档位置和主要内容`,
        allowedTools: [
          'read_file',
          'write_file',
          'list_files',
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
    return roles[id] || roles['task-analyzer'];
  }

  /** 严格解析内置角色；未知 id 返回 null（用于 create_worker 校验） */
  getBuiltinRole(id: string): Role | null {
    return this.getBuiltinRoleMap()[id] ?? null;
  }

  getAllRoles(): Role[] {
    return [
      this.getRole('task-master'),
      this.getRole('task-analyzer'),
      this.getRole('product-manager'),
      this.getRole('architect'),
      this.getRole('backend-dev'),
      this.getRole('frontend-dev'),
      this.getRole('tester'),
      this.getRole('doc-writer')
    ];
  }
}
