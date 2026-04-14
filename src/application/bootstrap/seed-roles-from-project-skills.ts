import * as fs from 'fs/promises';
import * as path from 'path';
import type { IRoleRepository } from '../../domain/role/role.repository.js';
import type { Role } from '../../domain/agent/agent.entity.js';
import type { ToolRegistry } from '../../domain/tool/index.js';

type SkillFrontmatter = { name?: string; description?: string; role_title?: string };

function parseFrontmatter(md: string): { fm: SkillFrontmatter; body: string } {
  const text = String(md || '');
  if (!text.startsWith('---')) return { fm: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { fm: {}, body: text };
  const raw = text.slice(3, end).trim();
  const body = text.slice(end + '\n---'.length).replace(/^\s*\n/, '');
  const fm: SkillFrontmatter = {};
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k === 'name') fm.name = v;
    if (k === 'description') fm.description = v;
    if (k === 'role_title') fm.role_title = v;
  }
  return { fm, body };
}

function deriveRoleName(id: string, description?: string): string {
  if (description && typeof description === 'string') {
    const short = description.split(' - ')[0]?.trim();
    if (short && short.length <= 32) return short;
  }
  return id;
}

export async function seedRolesFromProjectSkills(opts: {
  roleRepo: IRoleRepository;
  toolRegistry: ToolRegistry;
  rolesDir?: string;
}): Promise<{ created: number; skipped: number; scanned: number }> {
  const rolesDir =
    opts.rolesDir ?? path.join(process.cwd(), 'roles', 'claude-skills');

  let skillDirs: string[] = [];
  try {
    const entries = await fs.readdir(rolesDir, { withFileTypes: true });
    skillDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return { created: 0, skipped: 0, scanned: 0 };
  }

  const allToolNames = opts.toolRegistry.list().map((t) => t.name);
  let created = 0;
  let skipped = 0;
  let scanned = 0;

  for (const dir of skillDirs) {
    const p = path.join(rolesDir, dir, 'SKILL.md');
    let content: string;
    try {
      content = await fs.readFile(p, 'utf-8');
    } catch {
      continue;
    }
    scanned++;

    const { fm, body } = parseFrontmatter(content);
    const id = (fm.name || dir).trim();
    if (!id) continue;

    const exists = await opts.roleRepo.findById(id);
    if (exists) {
      skipped++;
      continue;
    }

    const systemPrompt = [
      `你正在以「${id}」角色工作。`,
      fm.description ? `角色说明：${fm.description}` : '',
      '',
      '下面是该角色的工作规程/方法论（来自项目内 roles/claude-skills/*/SKILL.md）：',
      body.trim(),
    ]
      .filter(Boolean)
      .join('\n');

    const displayName = (fm.role_title && fm.role_title.trim()) || deriveRoleName(id, fm.description);

    const role: Role = {
      id,
      name: displayName,
      description: fm.description ?? '',
      systemPrompt,
      allowedTools: allToolNames,
      maxTokensPerTask: 8000,
      temperature: 0.4,
      timeout: 600,
    };
    await opts.roleRepo.save(role);
    created++;
  }

  return { created, skipped, scanned };
}

