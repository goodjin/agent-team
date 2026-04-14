import TreeNode from './TreeNode.jsx';
import Badge from './Badge.jsx';
import { getRoleDisplayLabel, getRoleIcon } from '../../utils.js';

/**
 * 成员树形组件
 * @param {Object} taskMembers - { agents: [], deliverables: [] }
 * @param {Function} onSelectAgent - 选中某个 agent 的回调
 */
export default function MemberTree({ taskMembers, onSelectAgent }) {
  const agents = taskMembers?.agents || [];

  if (!agents.length) {
    return <div className="empty-state"><div className="empty-state-text">暂无成员数据</div></div>;
  }

  // 找 master agent（roleId 含 master/orchestrator 的，或者 kind 含 master 的）
  const master = agents.find(a =>
    a.roleId?.includes('master') ||
    a.roleId?.includes('orchestrator') ||
    a.kind?.includes('master')
  ) || agents[0];

  // 其他都是 master 创建的 sub-agent
  const subAgents = agents.filter(a => a.id !== master.id);

  // 构建树：master 是根，subAgents 是子节点
  const tree = {
    ...master,
    children: subAgents.map(a => ({ ...a, children: [] })),
  };

  const renderNode = (agent, depth) => {
    const roleId = agent.roleId || agent.kind || '';
    const icon = depth === 0 ? '👑' : getRoleIcon(roleId);
    return (
      <div className="member-tree-node">
        <div className="member-tree-info">
          <div className="member-tree-name">
            <span className="member-tree-role-icon" aria-hidden>
              {icon}
            </span>
            {agent.displayName}
          </div>
          <div className="member-tree-meta">
            <span className="role-tag member-tree-role-label">{getRoleDisplayLabel(roleId)}</span>
            <Badge status={agent.status} size="small" />
          </div>
        </div>
      </div>
    );
  };

  const getChildren = (node) => node.children || [];

  return (
    <div className="member-tree">
      <TreeNode
        nodes={[tree]}
        renderNode={renderNode}
        getChildren={getChildren}
        onNodeClick={onSelectAgent}
      />
    </div>
  );
}
