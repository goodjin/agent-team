import { useState, useEffect } from 'react';
import { rolesApi } from '../services/api';
import type { Role, LLMConfig } from '../types';
import './Pages.css';

export function Settings() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [llmConfig] = useState<LLMConfig>({
    provider: 'anthropic',
    model: 'claude-sonnet',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await rolesApi.getAll();
      setRoles(res.roles || []);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="page"><div className="loading">加载中...</div></div>;
  }

  return (
    <div className="page active">
      <div className="page-header">
        <div>
          <h2>⚙️ 系统设置</h2>
          <p className="subtitle">配置管理</p>
        </div>
      </div>

      <div className="settings-container">
        <div className="settings-section">
          <h3>🤖 LLM 配置</h3>
          <div className="settings-content">
            <div className="form-group">
              <label>Provider</label>
              <input type="text" value={llmConfig.provider} disabled />
            </div>
            <div className="form-group">
              <label>Model</label>
              <input type="text" value={llmConfig.model} disabled />
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>👥 角色配置</h3>
          <div className="settings-content">
            {roles.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>暂无角色配置</p>
            ) : (
              <div className="roles-list">
                {roles.map(role => (
                  <div key={role.id} className="role-item" style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                    <strong>{role.name}</strong>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{role.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="settings-section">
          <h3>💾 数据管理</h3>
          <div className="settings-content">
            <div className="data-actions" style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-secondary">📤 导出数据</button>
              <button className="btn btn-secondary">📥 导入数据</button>
              <button className="btn btn-danger">🗑️ 清除所有数据</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
