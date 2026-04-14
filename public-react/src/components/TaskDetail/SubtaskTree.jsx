import { useState } from 'react';
import TreeNode from './TreeNode.jsx';
import Badge from './Badge.jsx';
import { getStatusText, getRoleName } from '../../utils.js';

/**
 * 子任务树形组件
 * @param {Array} subtasks - 子任务数组
 * @param {Function} onSelectSubtask - 选中某个子任务的回调
 */
export default function SubtaskTree({ subtasks = [], onSelectSubtask }) {
  if (!subtasks.length) {
    return <div className="empty-state"><div className="empty-state-text">暂无子任务</div></div>;
  }

  // 构建 parentId → children 映射
  const nodeMap = {};
  const roots = [];

  subtasks.forEach(st => {
    nodeMap[st.id] = { ...st, children: [] };
  });

  subtasks.forEach(st => {
    if (st.parentId && nodeMap[st.parentId]) {
      nodeMap[st.parentId].children.push(nodeMap[st.id]);
    } else {
      roots.push(nodeMap[st.id]);
    }
  });

  const renderNode = (st, depth) => (
    <div className="subtask-tree-node">
      <div className="subtask-status">
        {st.status === 'completed' ? '✓' : st.status === 'running' ? '●' : '○'}
      </div>
      <div className="subtask-tree-info">
        <div className="subtask-tree-title">{st.title}</div>
        <div className="subtask-tree-meta">
          <span className="role-tag">{getRoleName(st.role)}</span>
          <Badge status={st.status} size="small" />
        </div>
      </div>
    </div>
  );

  const getChildren = (node) => node.children || [];

  return (
    <div className="subtask-tree">
      <TreeNode
        nodes={roots}
        renderNode={renderNode}
        getChildren={getChildren}
        onNodeClick={onSelectSubtask}
      />
    </div>
  );
}

/**
 * 子任务详情卡片（弹出）
 * @param {Object} subtask - 子任务对象
 * @param {Function} onClose - 关闭回调
 */
export function SubtaskCard({ subtask, onClose }) {
  if (!subtask) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content task-card-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{subtask.title}</h3>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">状态</label>
            <Badge status={subtask.status} />
          </div>
          <div className="form-group">
            <label className="form-label">角色</label>
            <span>{getRoleName(subtask.role)}</span>
          </div>
          {subtask.description && (
            <div className="form-group">
              <label className="form-label">描述</label>
              <p className="task-description">{subtask.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
