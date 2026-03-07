import { useState, useEffect } from 'react';
import { agentsApi } from '../services/api';
import type { Agent } from '../types';
import './Pages.css';

export function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const res = await agentsApi.getAll();
      setAgents(res.agents || []);
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async (id: string) => {
    try {
      await agentsApi.restart(id);
      loadAgents();
    } catch (error) {
      console.error('Failed to restart agent:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个智能体吗？')) return;
    try {
      await agentsApi.delete(id);
      loadAgents();
    } catch (error) {
      console.error('Failed to delete agent:', error);
    }
  };

  const stats = {
    total: agents.length,
    running: agents.filter(a => a.status === 'running').length,
    idle: agents.filter(a => a.status === 'idle').length,
    error: agents.filter(a => a.status === 'error').length,
  };

  if (loading) {
    return <div className="page"><div className="loading">加载中...</div></div>;
  }

  return (
    <div className="page active">
      <div className="page-header">
        <div>
          <h2>🤖 智能体管理</h2>
          <p className="subtitle">监控和管理所有运行中的智能体</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={loadAgents}>🔄 刷新</button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            ➕ 创建智能体
          </button>
        </div>
      </div>

      <div className="agent-stats-bar">
        <div className="agent-stat-item">
          <span className="stat-num">{stats.total}</span>
          <span className="stat-name">总智能体</span>
        </div>
        <div className="agent-stat-item running">
          <span className="stat-num">{stats.running}</span>
          <span className="stat-name">运行中</span>
        </div>
        <div className="agent-stat-item idle">
          <span className="stat-num">{stats.idle}</span>
          <span className="stat-name">空闲</span>
        </div>
        <div className="agent-stat-item error">
          <span className="stat-num">{stats.error}</span>
          <span className="stat-name">异常</span>
        </div>
      </div>

      <div className="agents-grid">
        {agents.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🤖</span>
            <p>暂无运行中的智能体</p>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              创建第一个智能体
            </button>
          </div>
        ) : (
          agents.map(agent => (
            <div key={agent.id} className="Agent-card">
              <div className="agent-info">
                <span className="agent-name">{agent.role}</span>
                <span className={`agent-status status-${agent.status}`}>{agent.status}</span>
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-sm btn-secondary" onClick={() => handleRestart(agent.id)}>
                  🔄 重启
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(agent.id)}>
                  🗑️ 删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🤖 创建智能体</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>关联角色</label>
                <select>
                  <option value="">选择角色...</option>
                  <option value="product-manager">产品经理</option>
                  <option value="architect">架构师</option>
                  <option value="developer">开发者</option>
                  <option value="tester">测试工程师</option>
                </select>
              </div>
              <div className="form-group">
                <label>备注</label>
                <textarea rows={2} placeholder="智能体备注..."></textarea>
              </div>
              <div className="form-actions">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>取消</button>
                <button className="btn btn-primary" onClick={() => setShowModal(false)}>创建智能体</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
