import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function main() {
  const srcRoot = path.join(os.homedir(), '.claude', 'skills');
  const dstRoot = path.join(process.cwd(), 'roles', 'claude-skills');

  await fs.mkdir(dstRoot, { recursive: true });

  const entries = await fs.readdir(srcRoot, { withFileTypes: true });
  let copied = 0;
  let skipped = 0;

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const src = path.join(srcRoot, e.name, 'SKILL.md');
    const dst = path.join(dstRoot, e.name, 'SKILL.md');
    try {
      await fs.access(src);
    } catch {
      continue;
    }
    await fs.mkdir(path.dirname(dst), { recursive: true });
    try {
      // 不覆盖项目内已存在的版本，避免误覆盖手工修改
      await fs.access(dst);
      skipped++;
      continue;
    } catch {
      // ok
    }
    await fs.copyFile(src, dst);
    copied++;
  }

  console.log(`[sync] copied=${copied} skipped=${skipped} dst=${dstRoot}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

