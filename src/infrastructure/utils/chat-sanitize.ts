/**
 * 剥离模型输出中的 <think>...</think> 思考块（常见推理模型格式）。
 * 可见部分写入会话；思考原文可记入执行日志。
 */
export function splitThinkingAndVisible(raw: string): { visible: string; thinking: string | null } {
  if (!raw) return { visible: '', thinking: null };
  const parts: string[] = [];
  const visible = raw.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, (m) => {
    parts.push(m.trim());
    return '';
  });
  const thinking = parts.length > 0 ? parts.join('\n\n---\n\n') : null;
  const v = visible.replace(/\n{3,}/g, '\n\n').trim();
  return { visible: v, thinking };
}
