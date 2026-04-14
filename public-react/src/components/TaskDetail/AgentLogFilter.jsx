/**
 * Agent 下拉选择器
 * @param {Array} agents - agent 列表
 * @param {string|null} selectedAgentId - 当前选中的 agent id
 * @param {Function} onSelect - 切换选中的回调
 */
export default function AgentLogFilter({ agents = [], selectedAgentId, onSelect }) {
  if (!agents.length) return null;

  return (
    <div className="agent-log-filter">
      <label className="form-label">按成员筛选：</label>
      <select
        className="agent-select"
        value={selectedAgentId || ''}
        onChange={e => onSelect(e.target.value || null)}
      >
        <option value="">全部成员</option>
        {agents.map(a => (
          <option key={a.id} value={a.id}>
            {a.displayName || a.roleId || a.kind}
          </option>
        ))}
      </select>
    </div>
  );
}
