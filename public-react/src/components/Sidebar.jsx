import { getStatusText, getRoleName, timeAgo } from '../utils.js';

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'running', label: '执行中' },
  { key: 'completed', label: '已完成' },
  { key: 'failed', label: '失败' },
];

export default function Sidebar({ tasks, filter, currentTaskId, loading, onFilter, onViewTask, onCreate, onOpenRoles }) {
  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);

  return (
    <>
      <div className="sidebar-header">
        <h1 className="sidebar-title">🤖 Agent Team</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => onOpenRoles?.()} title="角色管理">🧩</button>
          <button className="btn-create" onClick={onCreate} title="新建任务">+</button>
        </div>
      </div>

      <div className="filter-tabs">
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`filter-tab ${filter === f.key ? 'active' : ''}`}
            onClick={() => onFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="task-list-container">
        {loading ? (
          <div className="loading"><div className="spinner"></div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-sidebar">
            <div className="empty-icon">📋</div>
            <div className="empty-text">暂无任务</div>
          </div>
        ) : (
          filtered.map(task => (
            <div
              key={task.id}
              className={`task-item ${currentTaskId === task.id ? 'active' : ''} status-${task.status}`}
              onClick={() => onViewTask(task.id)}
            >
              <div className="task-item-header">
                <span className="task-item-title">{task.title}</span>
                <span className={`status-dot ${task.status}`}></span>
              </div>
              <div className="task-item-meta">
                <span className="role-tag">{getRoleName(task.role)}</span>
                <span className="time-tag">{timeAgo(task.createdAt)}</span>
              </div>
              {task.progress > 0 && (
                <div className="task-item-progress">
                  <div className="progress-mini-bar">
                    <div className="progress-mini-fill" style={{ width: `${task.progress}%` }}></div>
                  </div>
                  <span className="progress-mini-text">{task.progress}%</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
