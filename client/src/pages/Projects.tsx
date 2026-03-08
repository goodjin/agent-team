import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi } from '../services/api';
import type { Project } from '../types';
import './Pages.css';

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await projectsApi.getAll();
      // fetchApi 已经解包了 data 部分，所以直接使用
      // 后端返回 { success, data: [...], total }
      // fetchApi 返回的是 data 部分，即项目数组
      setProjects(res?.projects || res || []);
    } catch (err: any) {
      console.error('Failed to load projects:', err);
      setError(err.message || '加载项目失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const projectData = {
      name: formData.get('name'),
      path: formData.get('path'),
      description: formData.get('description'),
      visibility: formData.get('visibility'),
    };

    try {
      await projectsApi.create(projectData);
      setShowModal(false);
      loadProjects();
    } catch (err: any) {
      console.error('Failed to create project:', err);
      setError(err.message || '创建项目失败');
    }
  };

  const handleProjectClick = (project: Project) => {
    // 进入模块视图 - 导航到项目详情页
    navigate(`/projects/${project.id}`);
  };

  const getLifecycleBadge = (lifecycle: string) => {
    const badges: Record<string, string> = {
      draft: '草稿',
      'in-progress': '进行中',
      review: '审核中',
      completed: '已完成',
    };
    return badges[lifecycle] || lifecycle;
  };

  // 兼容不同的字段名：lifecycle 或 lifecycleStatus
  const getProjectLifecycle = (project: Project) => {
    return project.lifecycle || (project as any).lifecycleStatus || 'draft';
  };

  if (loading) {
    return <div className="page"><div className="loading">加载中...</div></div>;
  }

  return (
    <div className="page active">
      <div className="page-header">
        <div>
          <h2>📁 项目管理</h2>
          <p className="subtitle">多项目隔离管理 - 支持模块化开发和版本控制</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          ➕ 创建项目
        </button>
      </div>

      {error && (
        <div className="toast toast-error">
          {error}
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📁</span>
          <p>暂无项目</p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            创建第一个项目
          </button>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map(project => (
            <div 
              key={project.id} 
              className="project-card"
              onClick={() => handleProjectClick(project)}
              style={{ cursor: 'pointer' }}
            >
              <div className="project-info">
                <div className="project-name">{project.name}</div>
                <div className="project-path">{project.path}</div>
                <div className="lifecycle-status">
                  <span className={`lifecycle-badge ${getProjectLifecycle(project)}`}>
                    {getLifecycleBadge(getProjectLifecycle(project))}
                  </span>
                </div>
              </div>
              <div className="project-stats">
                <div className="project-stat">
                  <span className="ps-value">{project.tasks || 0}</span>
                  <span className="ps-label">任务</span>
                </div>
                <div className="project-stat">
                  <span className="ps-value">{project.modules || 0}</span>
                  <span className="ps-label">模块</span>
                </div>
                <div className="project-stat">
                  <span className="ps-value">{project.version || 'v0.0.1'}</span>
                  <span className="ps-label">版本</span>
                </div>
                <div className="project-stat">
                  <span className="ps-value">{project.completion || 0}%</span>
                  <span className="ps-label">完成度</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📁 创建新项目</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleCreateProject}>
                <div className="form-group">
                  <label>项目名称 *</label>
                  <input type="text" name="name" placeholder="输入项目名称" required />
                </div>
                <div className="form-group">
                  <label>项目路径 *</label>
                  <input type="text" name="path" placeholder="/path/to/project" required />
                </div>
                <div className="form-group">
                  <label>项目描述</label>
                  <textarea name="description" rows={3} placeholder="描述项目的目标和范围..."></textarea>
                </div>
                <div className="form-group">
                  <label>可见性</label>
                  <select name="visibility">
                    <option value="private">🔒 私有</option>
                    <option value="team">👥 团队</option>
                    <option value="public">🌐 公开</option>
                  </select>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                    取消
                  </button>
                  <button type="submit" className="btn btn-primary">创建项目</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
