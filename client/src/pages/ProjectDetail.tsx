import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectsApi } from '../services/api';
import './Pages.css';

interface ProjectModule {
  id: string;
  name: string;
  description: string;
  status: string;
  completion: number;
}

interface Project {
  id: string;
  name: string;
  path: string;
  description: string;
  lifecycle: string;
  version: string;
  tasks: number;
  modules: number;
  completion: number;
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [modules, setModules] = useState<ProjectModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'modules' | 'versions' | 'tasks'>('modules');

  useEffect(() => {
    if (id) {
      loadProject(id);
    }
  }, [id]);

  const loadProject = async (projectId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const [projectData, modulesData] = await Promise.all([
        projectsApi.getById(projectId).catch(() => null),
        projectsApi.getModules(projectId).catch(() => ({ modules: [] })),
      ]);

      if (!projectData) {
        setError('项目不存在');
        return;
      }

      setProject(projectData.project || projectData);
      setModules(modulesData.modules || []);
    } catch (err: any) {
      console.error('Failed to load project:', err);
      setError(err.message || '加载项目失败');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/projects');
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

  // 兼容不同的字段名
  const getProjectLifecycle = (project: Project) => {
    return project.lifecycle || (project as any).lifecycleStatus || 'draft';
  };

  if (loading) {
    return <div className="page"><div className="loading">加载中...</div></div>;
  }

  if (error || !project) {
    return (
      <div className="page active">
        <div className="page-header">
          <button className="btn btn-secondary" onClick={handleBack}>
            ← 返回项目列表
          </button>
        </div>
        <div className="empty-state">
          <span className="empty-icon">⚠️</span>
          <p>{error || '项目加载失败'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page active">
      <div className="page-header">
        <div>
          <button className="btn btn-link" onClick={handleBack} style={{ marginBottom: '0.5rem' }}>
            ← 返回项目列表
          </button>
          <h2>📁 {project.name}</h2>
          <p className="subtitle">{project.path}</p>
        </div>
        <span className={`lifecycle-badge ${getProjectLifecycle(project)}`}>
          {getLifecycleBadge(getProjectLifecycle(project))}
        </span>
      </div>

      {error && (
        <div className="toast toast-error">
          {error}
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {/* 项目统计 */}
      <div className="project-stats-bar">
        <div className="stat-card">
          <span className="stat-value">{project.tasks || 0}</span>
          <span className="stat-label">任务</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{modules.length}</span>
          <span className="stat-label">模块</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{project.version || 'v0.0.1'}</span>
          <span className="stat-label">版本</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{project.completion || 0}%</span>
          <span className="stat-label">完成度</span>
        </div>
      </div>

      {/* 项目描述 */}
      {project.description && (
        <div className="project-description">
          <h3>项目描述</h3>
          <p>{project.description}</p>
        </div>
      )}

      {/* Tab 导航 */}
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'modules' ? 'active' : ''}`}
          onClick={() => setActiveTab('modules')}
        >
          📦 模块
        </button>
        <button 
          className={`tab ${activeTab === 'versions' ? 'active' : ''}`}
          onClick={() => setActiveTab('versions')}
        >
          🏷️ 版本
        </button>
        <button 
          className={`tab ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          📋 任务
        </button>
      </div>

      {/* Tab 内容 */}
      <div className="tab-content">
        {activeTab === 'modules' && (
          <div className="modules-grid">
            {modules.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">📦</span>
                <p>暂无模块</p>
                <button className="btn btn-primary">创建第一个模块</button>
              </div>
            ) : (
              modules.map(module => (
                <div key={module.id} className="module-card">
                  <div className="module-header">
                    <span className="module-name">{module.name}</span>
                    <span className={`status-badge ${module.status}`}>{module.status}</span>
                  </div>
                  <div className="module-description">{module.description}</div>
                  <div className="module-progress">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${module.completion || 0}%` }}
                      ></div>
                    </div>
                    <span className="progress-text">{module.completion || 0}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'versions' && (
          <div className="empty-state">
            <span className="empty-icon">🏷️</span>
            <p>暂无版本记录</p>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="empty-state">
            <span className="empty-icon">📋</span>
            <p>暂无任务</p>
          </div>
        )}
      </div>
    </div>
  );
}
