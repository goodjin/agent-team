import { useState, useEffect } from 'react';
import { tasksApi } from '../services/api';
import type { Task } from '../types';
import './Pages.css';

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const res = await tasksApi.getAll();
      setTasks(res.tasks || []);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const taskData = {
      title: formData.get('title'),
      description: formData.get('description'),
      type: formData.get('type'),
      priority: formData.get('priority'),
    };

    try {
      await tasksApi.create(taskData);
      setShowModal(false);
      loadTasks();
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const filteredTasks = filterStatus
    ? tasks.filter(t => t.status === filterStatus)
    : tasks;

  if (loading) {
    return <div className="page"><div className="loading">加载中...</div></div>;
  }

  return (
    <div className="page active">
      <div className="page-header">
        <div>
          <h2>📋 任务中心</h2>
          <p className="subtitle">任务全生命周期管理</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          ➕ 创建任务
        </button>
      </div>

      <div className="tasks-container">
        <div className="filters-bar">
          <div className="filter-group">
            <select
              className="filter-select"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="">所有状态</option>
              <option value="pending">待处理</option>
              <option value="in-progress">进行中</option>
              <option value="completed">已完成</option>
              <option value="failed">失败</option>
              <option value="blocked">阻塞</option>
            </select>
          </div>
        </div>

        <div className="task-list">
          {filteredTasks.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📋</span>
              <p>暂无任务</p>
              <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                创建第一个任务
              </button>
            </div>
          ) : (
            filteredTasks.map(task => (
              <div key={task.id} className="task-item">
                <div className="task-item-info">
                  <div className="task-item-title">{task.title}</div>
                  <div className="task-item-meta">
                    <span className={`status-badge ${task.status}`}>{task.status}</span>
                    <span>{task.priority}</span>
                    <span>{task.type}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📋 创建新任务</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleCreateTask}>
                <div className="form-group">
                  <label>任务类型</label>
                  <select name="type" required>
                    <option value="requirement-analysis">📝 需求分析</option>
                    <option value="architecture-design">🏗️ 架构设计</option>
                    <option value="development" selected>💻 开发</option>
                    <option value="testing">🧪 测试</option>
                    <option value="documentation">📖 文档</option>
                    <option value="code-review">👀 代码审查</option>
                    <option value="refactoring">♻️ 重构</option>
                    <option value="bug-fix">🐛 Bug修复</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>标题</label>
                  <input type="text" name="title" placeholder="简要描述任务目标" required />
                </div>
                <div className="form-group">
                  <label>详细描述</label>
                  <textarea name="description" rows={4} placeholder="详细描述任务要求" required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>优先级</label>
                    <select name="priority">
                      <option value="low">🟢 低</option>
                      <option value="medium" selected>🟡 中</option>
                      <option value="high">🟠 高</option>
                      <option value="critical">🔴 紧急</option>
                    </select>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                    取消
                  </button>
                  <button type="submit" className="btn btn-primary">创建任务</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
