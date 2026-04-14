import * as fs from 'fs/promises';
import * as path from 'path';
import type { IEventBus } from '../../infrastructure/event-bus/index.js';
import type { ILogger } from '../../infrastructure/logger/index.js';
import { LLMService } from '../../infrastructure/llm/index.js';
import type { ITaskRepository } from '../../domain/task/task.repository.js';
import type { IRoleRepository } from '../../domain/role/role.repository.js';
import { MasterAgentService } from '../master-agent/master-agent.service.js';
import type { PostmortemService } from '../ops/postmortem.service.js';
import {
  EXPERIENCE_ARCHIVIST_ROLE_ID,
  getDefaultExperienceArchivistSystemPrompt,
} from '../bootstrap/seed-system-roles.js';

/**
 * 订阅任务结案事件，异步调用 LLM 生成全局复盘并落盘（团队库 + 任务工作区）。
 * 系统提示词来自持久化角色 \`experience-archivist\`（可编辑），缺省时用种子默认正文。
 */
export class ExperienceCuratorService {
  constructor(
    private taskRepo: ITaskRepository,
    private roleRepo: IRoleRepository,
    private masterAgentService: MasterAgentService,
    private postmortemService: PostmortemService,
    private llmService: LLMService,
    private logger: ILogger
  ) {}

  start(bus: IEventBus): void {
    bus.subscribe('experience.task_closure_requested', (ev) => {
      const p = ev.payload as { taskId?: string; masterClosingNote?: string };
      if (!p?.taskId) return;
      void this.runClosure(p.taskId, String(p.masterClosingNote ?? ''));
    });
  }

  private async runClosure(taskId: string, masterClosingNote: string): Promise<void> {
    try {
      await this.runClosureInner(taskId, masterClosingNote);
    } catch (e) {
      await this.logger.log({
        timestamp: new Date(),
        level: 'error',
        taskId,
        type: 'error',
        content: `[ExperienceCurator] 结案经验归档失败: ${e instanceof Error ? e.message : String(e)}`,
        metadata: {},
      });
    }
  }

  private async runClosureInner(taskId: string, masterClosingNote: string): Promise<void> {
    const task = await this.taskRepo.findById(taskId);
    if (!task || task.status !== 'completed') return;

    const wsRoot = path.resolve(process.cwd(), 'data/workspaces', taskId);
    const chunks: string[] = [];
    chunks.push(
      `# 原料：任务「${task.title}」\n\n` +
        `**任务 ID**：${taskId}\n\n` +
        `**描述摘要**：\n${(task.description || '（无）').slice(0, 4000)}\n\n` +
        `**主控结案说明（closing_note）**：\n${masterClosingNote.trim() || '（无）'}\n`
    );

    for (const rel of ['docs/REQUIREMENTS.md', 'docs/EXPERIENCE.md', 'TASK.md']) {
      try {
        const p = path.join(wsRoot, rel);
        const txt = await fs.readFile(p, 'utf-8');
        chunks.push(`\n## 文件: ${rel}\n\n` + txt.slice(0, 14000));
      } catch {
        // optional
      }
    }

    let postmortemJson = '';
    try {
      const pm = await this.postmortemService.build(taskId);
      postmortemJson = JSON.stringify(pm, null, 2).slice(0, 12000);
      chunks.push(`\n## 复盘快照（JSON）\n\n\`\`\`json\n${postmortemJson}\n\`\`\``);
    } catch {
      chunks.push('\n## 复盘快照\n\n（无法生成）');
    }

    try {
      const conv = await this.masterAgentService.getConversation(taskId, { limit: 80 });
      const lines = conv.messages.map((m) => `**${m.role}**: ${m.content}`);
      chunks.push('\n## 主控对话摘录\n\n' + lines.join('\n\n').slice(0, 16000));
    } catch {
      chunks.push('\n## 主控对话摘录\n\n（无法读取）');
    }

    const userPayload = chunks.join('\n');

    const archivist = await this.roleRepo.findById(EXPERIENCE_ARCHIVIST_ROLE_ID);
    const systemPrompt =
      archivist?.systemPrompt?.trim() || getDefaultExperienceArchivistSystemPrompt();
    const temperature =
      typeof archivist?.temperature === 'number' && Number.isFinite(archivist.temperature)
        ? archivist.temperature
        : 0.25;
    let maxTokens = 4096;
    if (
      typeof archivist?.maxTokensPerTask === 'number' &&
      archivist.maxTokensPerTask > 0 &&
      Number.isFinite(archivist.maxTokensPerTask)
    ) {
      maxTokens = Math.min(Math.round(archivist.maxTokensPerTask), 8192);
    }

    let report = '';
    try {
      const res = await this.llmService.chatWithFallback({
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content:
              '请根据以下材料撰写结案复盘 Markdown（按系统提示中的结构）。材料可能被截断。\n\n' +
              userPayload,
          },
        ],
        temperature,
        maxTokens,
      });
      report = (res.message.content || '').trim();
    } catch (e) {
      report =
        `## 流程回顾\n\nLLM 调用失败，无法自动生成全文：${e instanceof Error ? e.message : String(e)}\n\n` +
        `## 可复用经验\n\n请人工补充。\n\n## 若重来可改进点\n\n（待填）\n`;
    }

    const header = `\n\n---\n\n## 任务 ${taskId} · ${task.title}\n\n**归档时间**：${new Date().toISOString()}\n\n`;

    const teamDir = path.resolve(process.cwd(), 'data/experience');
    await fs.mkdir(teamDir, { recursive: true });
    const teamFile = path.join(teamDir, 'TASK_CLOSURES.md');
    let teamPrev = '';
    try {
      teamPrev = await fs.readFile(teamFile, 'utf-8');
    } catch {
      teamPrev = '# 团队任务结案经验库（异步归档）\n\n';
    }
    await fs.writeFile(teamFile, teamPrev.replace(/\s*$/, '') + header + report + '\n', 'utf-8');

    const closurePath = path.join(wsRoot, 'docs', 'CLOSURE_EXPERIENCE.md');
    try {
      await fs.mkdir(path.dirname(closurePath), { recursive: true });
      await fs.writeFile(
        closurePath,
        `# 任务结案复盘（自动生成）\n\n> 由「经验归档员」在任务标记完成后异步写入；可与 docs/EXPERIENCE.md 条目对照阅读。\n\n` +
          report +
          '\n',
        'utf-8'
      );
    } catch (e) {
      await this.logger.log({
        timestamp: new Date(),
        level: 'warn',
        taskId,
        type: 'milestone',
        content: `[ExperienceCurator] 写入工作区 CLOSURE_EXPERIENCE.md 失败: ${e instanceof Error ? e.message : String(e)}`,
        metadata: {},
      });
    }

    await this.logger.log({
      timestamp: new Date(),
      level: 'info',
      taskId,
      type: 'milestone',
      content: '[ExperienceCurator] 任务结案经验归档已完成',
      metadata: { teamFile: 'data/experience/TASK_CLOSURES.md' },
    });
  }
}
