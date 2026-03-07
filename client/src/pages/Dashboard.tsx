import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { tasksApi, agentsApi } from '../services/api';
import type { Task, Agent } from '../types';
import './Pages.css';

export function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [tasksRes, agentsRes] = await Promise.all([
        tasksApi.getAll().catch(() => ({ tasks: [] })),
        agentsApi.getAll().catch(() => ({ agents: [] })),
      ]);
      setTasks(tasksRes.tasks || []);
      setAgents(agentsRes.agents || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    total: tasks.length,
    inProgress: tasks.filter(t => t.status === 'in-progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
    running: agents.filter(a => a.status === 'running').length,
    idle: agents.filter(a => a.status === 'idle').length,
    error: agents.filter(a => a.status === 'error').length,
  };

  const completionRate = stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;

  if (loading) {
    return <div className="page"><div className="loading">加载中...</div></div>;
  }

  return (
    <div className="page active">
      <div className="dashboard-header">
        <div>
          <h2>📊 仪表板</h2>
          <p className="subtitle">智能体指挥中心 - 系统概览</p>
        </div>
        <div className="dashboard-actions">
          <button className="btn btn-secondary" onClick={loadData}>🔄 刷新</button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card" onClick={() => {}}>
          <div className="stat-icon">📋</div>
          <div className="stat-content">
            <div className="stat-label">总任务数</div>
            <div className="stat-value">{stats.total}</div>
          </div>
        </div>
        <div className="stat-card highlight-blue">
          <div className="stat-icon">⚡</div>
          <div className="stat-content">
            <div className="stat-label">进行中</div>
            <div className="stat-value">{stats.inProgress}</div>
            <div className="stat-sub">{stats.running} 智能体处理中</div>
          </div>
        </div>
        <div className="stat-card highlight-green">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <div className="stat-label">已完成</div>
            <div className="stat-value">{stats.completed}</div>
            <div className="stat-trend positive">完成率 {completionRate}%</div>
          </div>
        </div>
        <div className="stat-card highlight-red">
          <div className="stat-icon">❌</div>
          <div className="stat-content">
            <div className="stat-label">失败</div>
            <div className="stat-value">{stats.failed}</div>
            <div className="stat-sub">需要关注</div>
          </div>
        </div>
      </div>

      <div className="dashboard-section">
        <h3>🤖 智能体运行状态</h3>
        <div className="agents-overview">
          <div className="agent-summary">
            <div className="agent-stat running">
              <span className="agent-count">{stats.running}</span>
              <span className="agent-label">运行中</span>
            </div>
            <div className="agent-stat idle">
              <span className="agent-count">{stats.idle}</span>
              <span className="agent-label">空闲</span>
            </div>
            <div className="agent-stat error">
              <span className="agent-count">{stats.error}</span>
              <span className="agent-label">异常</span>
            </div>
          </div>
          <div className="agent-cards">
            {agents.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🤖</span>
                <p>暂无智能体</p>
              </div>
            ) : (
              agents.map(agent => (
                <div key={agent.id} className={`agent-card ${agent.status}`}>
                  <div className="agent-info">
                    <span className="agent-name">{agent.role}</span>
                    <span className={`agent-status status-${agent.status}`}>{agent.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card">
          <div className="card-header">
            <h4>📈 任务进度</h4>
          </div>
          <div className="card-body">
            <div className="progress-overview">
              <div className="progress-circle">
                <svg viewBox="0 0 100 100">
                  <circle className="progress-bg" cx="50" cy="50" r="45"/>
                  <circle
                    className="progress-fill"
                    cx="50"
                    cy="50"
                    r="45"
                    strokeDasharray={`${completionRate * 2.83} 283`}
                  />
                </svg>
                <div className="progress-text">
                  <span className="progress-value">{completionRate}%</span>
                  <span className="progress-label">完成率</span>
                </div>
              </div>
              <div className="progress-details">
                <div className="progress-item">
                  <span className="progress-dot completed"></span>
                  <span className="progress-name">已完成</span>
                  <span className="progress-count">{stats.completed}</span>
                </div>
                <div className="progress-item">
                  <span className="progress-dot in-progress"></span>
                  <span className="progress-name">进行中</span>
                  <span className="progress-count">{stats.inProgress}</span>
                </div>
                <div className="progress-item">
                  <span className="progress-dot pending"></span>
                  <span className="progress-name">待处理</span>
                  <span className="progress-count">{stats.total - stats.completed - stats.inProgress - stats.failed}</span>
                </div>
                <div className="progress-item">
                  <span className="progress-dot failed"></span>
                  <span className="progress-name">失败</span>
                  <span className="progress-count">{stats.failed}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-header">
            <h4>📰 最近任务</h4>
            <Link to="/tasks" className="btn-link">查看全部 →</Link>
          </div>
          <div className="card-body">
            <div className="activity-list">
              {tasks.length === 0 ? (
                <div className="activity-empty">暂无任务</div>
              ) : (
                tasks.slice(0, 5).map(task => (
                  <div key={task.id} className="activity-item">
                    <span className="activity-icon">📋</span>
                    <div className="activity-content">
                      <span className="activity-title">{task.title}</span>
                      <span className={`status-badge ${task.status}`}>{task.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
