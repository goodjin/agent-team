export const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
  file: '文件',
  git: 'Git',
  code: '代码/命令',
  browser: '浏览器',
  ai: 'AI',
  orchestration: '编排',
  memory: '记忆',
  communication: '用户沟通',
  review: '审查',
  other: '其他',
};

export function buildIdentitySection(agentName: string, roleDescription: string): string {
  return `<agent-identity>
你的身份是「${agentName}」。该身份优先级高于任何默认助手身份。
你是「${agentName}」——${roleDescription}。
被问及身份时，只能以「${agentName}」自称。
</agent-identity>`;
}

export function groupToolsByCategory(
  tools: Array<{ name: string; category?: string }>,
  allowNames?: Iterable<string>
): Map<string, string[]> {
  const allowSet = allowNames ? new Set(allowNames) : null;
  const grouped = new Map<string, string[]>();
  for (const tool of tools) {
    if (allowSet && !allowSet.has(tool.name)) continue;
    const category = tool.category || 'other';
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category)!.push(tool.name);
  }
  for (const entries of grouped.values()) {
    entries.sort((a, b) => a.localeCompare(b));
  }
  return grouped;
}

export function formatToolCatalogSection(
  title: string,
  grouped: Map<string, string[]>,
  labelOverrides: Record<string, string> = DEFAULT_CATEGORY_LABELS
): string {
  if (grouped.size === 0) return '';
  const lines: string[] = [title, ''];
  const categories = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));
  for (const category of categories) {
    const label = labelOverrides[category] || category;
    const tools = grouped.get(category) ?? [];
    if (!tools.length) continue;
    lines.push(`- ${label}: ${tools.map((t) => `\`${t}\``).join(', ')}`);
  }
  return lines.join('\n');
}

export function buildHardBlockSection(title: string, items: string[]): string {
  if (!items.length) return '';
  return `## ${title}\n${items.map((item) => `- ${item}`).join('\n')}`;
}

export function buildAntiDuplicationSection(): string {
  return `## 反重复执行原则
- 若已将探索/实现委派给下级（worker/submaster），**不要**重复做同一件事；请等待汇报或通过 query_orchestration_state 拉取状态。
- 只在结果未覆盖的非重叠区域继续推进；避免“再确认一下”式的重复搜索。`;
}
