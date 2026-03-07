import { NavLink } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>🤖 Agent Team</h1>
          <div className="system-status">
            <span className="status-dot online"></span>
            <span className="status-text">系统在线</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="icon">📊</span>
            <span>仪表板</span>
          </NavLink>
          <NavLink to="/tasks" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="icon">📋</span>
            <span>任务中心</span>
          </NavLink>
          <NavLink to="/agents" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="icon">🤖</span>
            <span>智能体</span>
          </NavLink>
          <NavLink to="/projects" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="icon">📁</span>
            <span>项目管理</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="icon">⚙️</span>
            <span>系统设置</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <span className="version">v1.0.0</span>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
