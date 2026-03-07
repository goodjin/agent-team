// Agent Team Web UI - Enhanced Application

// API基础URL
const API_BASE = '/api';

// 状态管理
let state = {
    currentPage: 'dashboard',
    currentTaskId: null,
    currentProjectId: null,
    tasks: [],
    roles: [],
    workflows: [],
    agents: [],
    projects: [],
    stats: {
        total: 0,
        inProgress: 0,
        completed: 0,
        failed: 0
    },
    theme: localStorage.getItem('theme') || 'light',
    notifications: []
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initNavigation();
    initModals();
    initChatInput();
    initGlobalSearch();
    initKeyboardShortcuts();
    
    // 先检查配置状态
    checkConfigStatus().then(() => {
        loadDashboard();
        loadRoles();
        loadWorkflows();
        startAutoRefresh();
        showToast('欢迎使用 Agent Team 智能体指挥中心', 'success');
    });
});

// 检查配置状态
async function checkConfigStatus() {
    try {
        const data = await apiCall('/config').catch(() => null);
        if (data?.data?.llm?.providers) {
            const providers = Object.values(data.data.llm.providers);
            const enabledProviders = providers.filter(p => p.enabled);
            
            if (enabledProviders.length === 0) {
                showToast('⚠️  未配置 LLM 提供商，请先配置 API Key', 'warning');
                showConfigReminder();
            }
        }
    } catch {
        // 忽略错误
    }
}

// 显示配置提醒
function showConfigReminder() {
    const reminder = document.createElement('div');
    reminder.className = 'config-reminder';
    reminder.innerHTML = `
        <div class="reminder-content">
            <span class="reminder-icon">⚠️</span>
            <div class="reminder-text">
                <strong>需要配置 LLM</strong>
                <p>请设置环境变量或编辑配置文件</p>
            </div>
            <button class="reminder-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="reminder-actions">
            <button class="btn btn-primary btn-sm" onclick="window.openConfigGuide()">查看配置指南</button>
        </div>
    `;
    
    // 添加样式
    if (!document.getElementById('reminder-styles')) {
        const style = document.createElement('style');
        style.id = 'reminder-styles';
        style.textContent = `
            .config-reminder {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--warning-light);
                border: 1px solid var(--warning-color);
                border-radius: var(--radius-lg);
                padding: 1rem 1.5rem;
                z-index: 1000;
                max-width: 400px;
                box-shadow: var(--shadow-lg);
            }
            .reminder-content {
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }
            .reminder-icon {
                font-size: 1.5rem;
            }
            .reminder-text strong {
                display: block;
                color: #92400e;
            }
            .reminder-text p {
                font-size: 0.875rem;
                color: #78350f;
                margin: 0.25rem 0 0 0;
            }
            .reminder-close {
                background: none;
                border: none;
                font-size: 1.25rem;
                cursor: pointer;
                color: #78350f;
                padding: 0.25rem 0.5rem;
            }
            .reminder-actions {
                margin-top: 0.75rem;
                display: flex;
                gap: 0.5rem;
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(reminder);
    
    // 3分钟后自动移除
    setTimeout(() => {
        if (reminder.parentElement) {
            reminder.remove();
        }
    }, 180000);
}

// 全局函数：打开配置指南
window.openConfigGuide = function() {
    window.open('https://github.com/agent-team/docs/blob/main/CONFIG_GUIDE.md', '_blank');
};

// 主题初始化
function initTheme() {
    if (state.theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('theme-toggle').innerHTML = '<span class="theme-icon">☀️</span>';
    }
    
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
}

function toggleTheme() {
    const html = document.documentElement;
    if (state.theme === 'light') {
        state.theme = 'dark';
        html.setAttribute('data-theme', 'dark');
        document.getElementById('theme-toggle').innerHTML = '<span class="theme-icon">☀️</span>';
        localStorage.setItem('theme', 'dark');
        showToast('已切换到深色模式', 'info');
    } else {
        state.theme = 'light';
        html.removeAttribute('data-theme');
        document.getElementById('theme-toggle').innerHTML = '<span class="theme-icon">🌙</span>';
        localStorage.setItem('theme', 'light');
        showToast('已切换到浅色模式', 'info');
    }
}

// 导航初始化
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            switchPage(page);
        });
    });
    
    // 刷新任务按钮
    document.getElementById('btn-refresh-tasks')?.addEventListener('click', () => {
        loadTasks();
        showToast('已刷新任务列表', 'info');
    });
}

// 页面切换
function switchPage(page) {
    // 更新导航状态
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const navItem = document.querySelector(`[data-page="${page}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }
    
    // 更新页面显示
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) {
        pageEl.classList.add('active');
    }
    
    // 更新面包屑
    updateBreadcrumb(page);
    
    state.currentPage = page;
    
    // 加载对应页面数据
    switch (page) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'tasks':
            loadTasks();
            break;
        case 'agents':
            loadAgents();
            break;
        case 'projects':
            loadProjects();
            break;
        case 'workflows':
            loadWorkflows();
            break;
        case 'reports':
            loadReports();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

// 全局函数：切换页面
window.switchToPage = function(page, filter) {
    switchPage(page);
    if (filter && document.getElementById('filter-status')) {
        document.getElementById('filter-status').value = filter;
        applyFilters();
    }
};

// 更新面包屑
function updateBreadcrumb(page) {
    const breadcrumbMap = {
        'dashboard': ['首页', '仪表板'],
        'tasks': ['首页', '任务中心'],
        'task-detail': ['首页', '任务中心', '任务详情'],
        'agents': ['首页', '智能体管理'],
        'agent-detail': ['首页', '智能体管理', '智能体详情'],
        'projects': ['首页', '项目管理'],
        'workflows': ['首页', '工作流'],
        'reports': ['首页', '分析报告'],
        'settings': ['首页', '系统设置']
    };
    
    const items = breadcrumbMap[page] || ['首页', page];
    const breadcrumbEl = document.getElementById('breadcrumb');
    if (breadcrumbEl) {
        breadcrumbEl.innerHTML = items.map((item, index) => {
            if (index === items.length - 1) {
                return `<span class="current">${item}</span>`;
            }
            return `<span>${item}</span><span class="separator">/</span>`;
        }).join('');
    }
}

// 模态框初始化
function initModals() {
    // 创建任务模态框
    const createTaskModal = document.getElementById('modal-create-task');
    const createTaskBtn = document.getElementById('btn-quick-task');
    
    if (createTaskBtn && createTaskModal) {
        createTaskBtn.addEventListener('click', () => {
            createTaskModal.classList.add('active');
            loadRolesForSelect();
        });
    }
    
    // 创建智能体模态框
    const createAgentModal = document.getElementById('modal-create-agent');
    if (createAgentModal) {
        const form = document.getElementById('form-create-agent');
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await createAgent(form);
        });
    }

    // 创建项目模态框
    const createProjectForm = document.getElementById('form-create-project');
    createProjectForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await createProject(createProjectForm);
    });

    // 返回按钮
    const backBtn = document.getElementById('btn-back-to-tasks');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            switchPage('tasks');
        });
    }
}

// 对话输入初始化
function initChatInput() {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send-message');
    
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    if (chatInput) {
        chatInput.addEventListener('keydown', async (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                await sendMessage();
            } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                await sendMessage();
            }
        });
    }
}

// 全局搜索初始化
function initGlobalSearch() {
    const searchInput = document.getElementById('global-search');
    if (searchInput) {
        searchInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    switchPage('tasks');
                    document.getElementById('filter-search').value = query;
                    applyFilters();
                    showToast(`搜索: ${query}`, 'info');
                }
            }
        });
    }
}

// 键盘快捷键
function initKeyboardShortcuts() {
    document.addEventListener('keydown', async (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            showCreateTaskModal();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
            e.preventDefault();
            document.getElementById('keyboard-help').classList.add('active');
        }
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        }
    });
}

// API调用
async function apiCall(endpoint, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
    
    try {
        if (options.showLoading !== false) {
            showLoading(true);
        }
        
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
            signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '请求失败');
        }
        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.warn('API请求超时:', endpoint);
        } else {
            console.error('API调用失败:', error);
        }
        throw error;
    } finally {
        if (options.showLoading !== false) {
            showLoading(false);
        }
    }
}

// 加载仪表板
async function loadDashboard() {
    try {
        const [statsData, tasksData] = await Promise.all([
            apiCall('/stats').catch(() => ({ data: { tasks: { total: 0, byStatus: {} } } })),
            apiCall('/tasks').catch(() => ({ data: [] }))
        ]);

        const stats = statsData.data?.tasks || { total: 0, byStatus: {} };
        const tasks = tasksData.data || [];
        
        state.stats = {
            total: stats.total || 0,
            inProgress: stats.byStatus['in-progress'] || 0,
            completed: stats.byStatus['completed'] || 0,
            failed: stats.byStatus['failed'] || 0
        };
        
        // 更新统计卡片
        document.getElementById('stat-total').textContent = state.stats.total;
        document.getElementById('stat-in-progress').textContent = state.stats.inProgress;
        document.getElementById('stat-completed').textContent = state.stats.completed;
        document.getElementById('stat-failed').textContent = state.stats.failed;
        
        // 计算完成率
        const completionRate = state.stats.total > 0 
            ? Math.round((state.stats.completed / state.stats.total) * 100) 
            : 0;
        document.getElementById('stat-completed-rate').textContent = `完成率 ${completionRate}%`;
        
        // 更新进度圆环
        updateProgressCircle(completionRate);
        
        // 更新进度详情
        document.getElementById('prog-completed').textContent = state.stats.completed;
        document.getElementById('prog-inprogress').textContent = state.stats.inProgress;
        document.getElementById('prog-pending').textContent = (stats.byStatus['pending'] || 0) + (stats.byStatus['blocked'] || 0);
        document.getElementById('prog-failed').textContent = state.stats.failed;
        
        // 更新快速统计
        document.getElementById('qs-tasks').textContent = state.stats.total;
        
        // 显示最近任务
        const recentTasks = tasks.slice(0, 5);
        renderTasks(recentTasks, 'recent-tasks-list', true);
        renderTasksSidebar(tasks);
        
        // 加载活动列表
        renderActivityList(tasks);
        
        // 加载智能体概览
        loadAgentsOverview();
        
    } catch (error) {
        console.error('加载仪表板失败:', error);
    }
}

// 更新进度圆环
function updateProgressCircle(percentage) {
    const progressFill = document.getElementById('progress-fill');
    const progressValue = document.getElementById('progress-value');
    
    if (progressFill && progressValue) {
        const offset = 283 - (283 * percentage / 100);
        progressFill.style.strokeDashoffset = offset;
        progressValue.textContent = `${percentage}%`;
    }
}

// 渲染活动列表
function renderActivityList(tasks) {
    const container = document.getElementById('activity-list');
    if (!container) return;
    
    const activities = tasks.slice(0, 5).map(task => {
        const icons = {
            'completed': '✅',
            'in-progress': '⚡',
            'failed': '❌',
            'pending': '⏳',
            'blocked': '🚫'
        };
        return {
            icon: icons[task.status] || '📋',
            title: task.title,
            time: formatRelativeTime(task.updatedAt),
            type: task.status
        };
    });
    
    if (activities.length === 0) {
        container.innerHTML = '<div class="activity-empty">暂无活动记录</div>';
        return;
    }
    
    container.innerHTML = activities.map(activity => `
        <div class="activity-item">
            <div class="activity-icon ${activity.type}">${activity.icon}</div>
            <div class="activity-content">
                <div class="activity-title">${escapeHtml(activity.title)}</div>
                <div class="activity-time">${activity.time}</div>
            </div>
        </div>
    `).join('');
}

// 加载智能体概览
async function loadAgentsOverview() {
    try {
        const data = await apiCall('/agents').catch(() => ({ data: [] }));
        state.agents = data.data || [];
        
        // 更新智能体计数
        const running = state.agents.filter(a => a.status === 'running').length;
        const idle = state.agents.filter(a => a.status === 'idle').length;
        const error = state.agents.filter(a => a.status === 'error').length;
        
        document.getElementById('qs-agents').textContent = state.agents.length;
        document.getElementById('agent-running').textContent = running;
        document.getElementById('agent-idle').textContent = idle;
        document.getElementById('agent-error').textContent = error;
        document.getElementById('stat-in-progress-agents').textContent = `${running} 智能体处理中`;
        
        // 渲染智能体卡片
        renderAgentCards(state.agents.slice(0, 4));
        
    } catch (error) {
        console.error('加载智能体失败:', error);
    }
}

// 渲染智能体卡片
function renderAgentCards(agents) {
    const container = document.getElementById('agent-cards');
    if (!container) return;
    
    if (agents.length === 0) {
        container.innerHTML = '<div class="activity-empty">暂无运行中的智能体</div>';
        return;
    }
    
    container.innerHTML = agents.map(agent => `
        <div class="agent-card">
            <div class="agent-card-header">
                <span class="agent-name">${escapeHtml(agent.name || '未命名')}</span>
                <span class="agent-status ${agent.status}">
                    <span class="agent-status-dot"></span>
                    ${getStatusText(agent.status)}
                </span>
            </div>
            <div class="agent-card-body">
                <div class="agent-card-stat">
                    <span class="value">${agent.completedTasks || 0}</span>
                    <span>已完成</span>
                </div>
                <div class="agent-card-stat">
                    <span class="value">${agent.currentTask || '-'}</span>
                    <span>当前任务</span>
                </div>
                <div class="agent-card-stat">
                    <span class="value">${agent.role || '-'}</span>
                    <span>角色</span>
                </div>
            </div>
        </div>
    `).join('');
}

// 发送消息
async function sendMessage() {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput?.value.trim();
    
    if (!message) return;
    
    showLoading(true);
    chatInput.value = '';
    
    try {
        const result = await apiCall('/tasks/chat', {
            method: 'POST',
            body: JSON.stringify({ message }),
        });
        
        if (result.data.isNew) {
            await loadTasks();
            showToast('新任务已创建', 'success');
            if (result.data.task) {
                showTaskDetail(result.data.task.id);
            }
        } else {
            await loadTasks();
            showToast('消息已添加到任务', 'info');
            if (currentTaskId === result.data.task?.id) {
                await loadTaskDetail(result.data.task.id);
            }
        }
    } catch (error) {
        console.error('发送消息失败:', error);
    } finally {
        showLoading(false);
    }
}

// 显示创建任务模态框
window.showCreateTaskModal = function() {
    document.getElementById('modal-create-task').classList.add('active');
    loadRolesForSelect();
};

// 创建任务
async function createTask(form) {
    try {
        const formData = new FormData(form);
        const data = {
            type: formData.get('type'),
            title: formData.get('title'),
            description: formData.get('description'),
            priority: formData.get('priority'),
            assignedRole: formData.get('assignedRole') || undefined,
        };

        await apiCall('/tasks', {
            method: 'POST',
            body: JSON.stringify(data),
        });

        document.getElementById('modal-create-task').classList.remove('active');
        form.reset();
        
        showToast('任务创建成功', 'success');
        
        if (state.currentPage === 'tasks') {
            loadTasks();
        } else {
            loadDashboard();
        }
    } catch (error) {
        console.error('创建任务失败:', error);
    }
}

// 显示创建智能体模态框
window.showCreateAgentModal = function() {
    document.getElementById('modal-create-agent').classList.add('active');
    loadRolesForAgentSelect();
};

// 创建智能体
async function createAgent(form) {
    try {
        const formData = new FormData(form);
        const data = {
            roleId: formData.get('roleId'),
            taskId: formData.get('taskId') || undefined,
            notes: formData.get('notes') || undefined,
        };

        await apiCall('/agents', {
            method: 'POST',
            body: JSON.stringify(data),
        });

        document.getElementById('modal-create-agent').classList.remove('active');
        form.reset();
        
        showToast('智能体创建成功', 'success');
        loadAgents();
    } catch (error) {
        console.error('创建智能体失败:', error);
    }
}

// 加载任务
async function loadTasks() {
    try {
        const data = await apiCall('/tasks');
        state.tasks = data.data || [];
        renderTasks(state.tasks, 'tasks-list');
        renderTasksSidebar(state.tasks);
        updateFilters();
    } catch (error) {
        console.error('加载任务失败:', error);
    }
}

// 渲染任务侧边栏
function renderTasksSidebar(taskList) {
    const container = document.getElementById('tasks-sidebar-list');
    if (!container) return;
    
    const recentTasks = taskList.slice(0, 10);
    
    if (recentTasks.length === 0) {
        container.innerHTML = '<div class="task-empty">暂无任务</div>';
        return;
    }
    
    container.innerHTML = recentTasks.map(task => `
        <div class="task-sidebar-item ${task.id === state.currentTaskId ? 'active' : ''}" 
             data-task-id="${task.id}"
             onclick="showTaskDetail('${task.id}')">
            <div class="task-sidebar-title">${escapeHtml(task.title)}</div>
            <div class="task-sidebar-meta">
                <span class="status-badge status-${task.status}">${getStatusText(task.status)}</span>
                <span class="task-sidebar-time">${formatRelativeTime(task.updatedAt)}</span>
            </div>
        </div>
    `).join('');
}

// 渲染任务列表
function renderTasks(taskList, containerId, isCompact = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (taskList.length === 0) {
        container.innerHTML = `<div class="empty-state"><span class="empty-icon">📋</span><p>暂无任务</p><button class="btn btn-primary" onclick="showCreateTaskModal()">创建第一个任务</button></div>`;
        return;
    }

    container.innerHTML = taskList.map(task => {
        if (isCompact) {
            return `
                <div class="task-item compact" onclick="showTaskDetail('${task.id}')" style="cursor: pointer; padding: 1rem;">
                    <div class="task-title">${escapeHtml(task.title)}</div>
                    <div class="task-meta">
                        <span class="status-badge status-${task.status}">${getStatusText(task.status)}</span>
                        <span>${formatRelativeTime(task.updatedAt)}</span>
                    </div>
                </div>
            `;
        }
        return `
            <div class="task-item" onclick="showTaskDetail('${task.id}')" style="cursor: pointer;">
                <div class="task-header">
                    <div>
                        <div class="task-title">${escapeHtml(task.title)}</div>
                        <div class="task-meta">
                            <span class="status-badge status-${task.status}">${getStatusText(task.status)}</span>
                            <span class="priority-badge priority-${task.priority}">${getPriorityText(task.priority)}</span>
                            ${task.assignedRole ? `<span>👤 ${task.assignedRole}</span>` : ''}
                            <span>📅 ${formatDate(task.updatedAt)}</span>
                        </div>
                    </div>
                </div>
                ${task.description ? `<div class="task-description">${escapeHtml(task.description.substring(0, 100))}${task.description.length > 100 ? '...' : ''}</div>` : ''}
                <div class="task-actions" onclick="event.stopPropagation()">
                    ${task.status === 'pending' || task.status === 'blocked' ? `
                        <button class="btn btn-primary btn-sm" onclick="executeTask('${task.id}')">▶ 执行</button>
                    ` : ''}
                    ${task.status === 'in-progress' ? `
                        <button class="btn btn-secondary btn-sm" onclick="refreshTask('${task.id}')">🔄 刷新</button>
                    ` : ''}
                    ${task.status === 'failed' ? `
                        <button class="btn btn-primary btn-sm" onclick="retryTask('${task.id}')">🔁 重试</button>
                    ` : ''}
                    <button class="btn btn-danger btn-sm" onclick="deleteTask('${task.id}')">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

// 更新过滤器
function updateFilters() {
    const roleFilter = document.getElementById('filter-role');
    if (roleFilter) {
        const currentValue = roleFilter.value;
        const roles = [...new Set(state.tasks.map(t => t.assignedRole).filter(Boolean))];
        roleFilter.innerHTML = '<option value="">所有角色</option>' +
            roles.map(role => `<option value="${role}">${role}</option>`).join('');
        roleFilter.value = currentValue;
    }
    
    // 添加过滤器事件
    ['filter-status', 'filter-role', 'filter-priority', 'filter-search'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.removeEventListener('change', applyFilters);
            el.removeEventListener('input', applyFilters);
            el.addEventListener('change', applyFilters);
            el.addEventListener('input', applyFilters);
        }
    });
}

// 应用过滤器
function applyFilters() {
    const status = document.getElementById('filter-status')?.value || '';
    const role = document.getElementById('filter-role')?.value || '';
    const priority = document.getElementById('filter-priority')?.value || '';
    const search = document.getElementById('filter-search')?.value.toLowerCase() || '';

    let filtered = state.tasks;

    if (status) filtered = filtered.filter(t => t.status === status);
    if (role) filtered = filtered.filter(t => t.assignedRole === role);
    if (priority) filtered = filtered.filter(t => t.priority === priority);
    if (search) {
        filtered = filtered.filter(t =>
            t.title.toLowerCase().includes(search) ||
            t.description?.toLowerCase().includes(search)
        );
    }

    renderTasks(filtered, 'tasks-list');
}

// 显示任务详情
window.showTaskDetail = function(taskId) {
    state.currentTaskId = taskId;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-task-detail').classList.add('active');
    updateBreadcrumb('task-detail');
    loadTaskDetail(taskId);
};

// 加载任务详情
async function loadTaskDetail(taskId) {
    try {
        const data = await apiCall(`/tasks/${taskId}`);
        const task = data.data;
        
        // 更新标题
        const titleEl = document.getElementById('task-detail-title');
        if (titleEl) {
            titleEl.textContent = task.title;
        }
        document.getElementById('task-detail-id').textContent = `ID: ${task.id}`;
        
        // 更新执行按钮状态
        const executeBtn = document.getElementById('btn-execute-task');
        if (executeBtn) {
            executeBtn.style.display = task.status === 'pending' || task.status === 'blocked' ? 'inline-flex' : 'none';
        }
        
        // 显示任务信息
        renderTaskInfo(task);
        
        // 显示进度
        renderTaskProgress(task);
        
        // 显示对话历史
        renderTaskMessages(task);
        
        // 显示执行记录
        renderExecutionRecords(task);
        
        // 显示工具调用
        renderTaskTools(task);
        
    } catch (error) {
        console.error('加载任务详情失败:', error);
    }
}

function renderTaskInfo(task) {
    const container = document.getElementById('task-info');
    if (!container) return;
    
    container.innerHTML = `
        <div class="info-item">
            <span class="info-label">描述:</span>
            <span class="info-value">${escapeHtml(task.description || '无')}</span>
        </div>
        <div class="info-item">
            <span class="info-label">状态:</span>
            <span class="info-value"><span class="status-badge status-${task.status}">${getStatusText(task.status)}</span></span>
        </div>
        <div class="info-item">
            <span class="info-label">优先级:</span>
            <span class="info-value"><span class="priority-badge priority-${task.priority}">${getPriorityText(task.priority)}</span></span>
        </div>
        <div class="info-item">
            <span class="info-label">类型:</span>
            <span class="info-value">${getTaskTypeText(task.type)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">负责角色:</span>
            <span class="info-value">${task.assignedRole || '🤖 自动分配'}</span>
        </div>
        ${task.ownerRole ? `
        <div class="info-item">
            <span class="info-label">项目经理:</span>
            <span class="info-value">${task.ownerRole}</span>
        </div>
        ` : ''}
        <div class="info-item">
            <span class="info-label">创建时间:</span>
            <span class="info-value">${formatDate(task.createdAt)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">最后更新:</span>
            <span class="info-value">${formatDate(task.updatedAt)}</span>
        </div>
    `;
}

function renderTaskProgress(task) {
    const progressFill = document.getElementById('task-progress-fill');
    const progressText = document.getElementById('task-progress-text');
    const subtasksList = document.getElementById('subtasks-list');
    
    if (progressFill && progressText) {
        const progress = task.progress || 0;
        progressFill.style.width = `${progress}%`;
        progressText.textContent = `${progress}%`;
    }
    
    if (subtasksList && task.subtasks) {
        subtasksList.innerHTML = task.subtasks.map(st => `
            <div class="subtask-item">
                <span class="status ${st.status}">${st.status === 'completed' ? '✓' : st.status === 'in-progress' ? '●' : '○'}</span>
                <span>${escapeHtml(st.title)}</span>
            </div>
        `).join('');
    }
}

function renderTaskMessages(task) {
    const container = document.getElementById('task-messages');
    if (!container) return;
    
    const messages = task.messages || [];
    
    if (messages.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">暂无对话</p>';
        return;
    }
    
    container.innerHTML = messages.map(msg => `
        <div class="message-item message-${msg.role === 'user' ? 'user' : 'assistant'}">
            <div class="message-role">${msg.role === 'user' ? '👤 用户' : '🤖 助手'}</div>
            <div class="message-content">${escapeHtml(msg.content)}</div>
            <div class="message-time">${formatDate(msg.timestamp)}</div>
        </div>
    `).join('');
    
    container.scrollTop = container.scrollHeight;
}

function renderExecutionRecords(task) {
    const container = document.getElementById('task-execution-records');
    if (!container) return;
    
    const records = task.executionRecords || [];
    
    if (records.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">暂无执行记录</p>';
        return;
    }
    
    container.innerHTML = records.map(record => `
        <div class="execution-record-item">
            <div class="record-header">
                <span class="record-role">${record.role || '系统'}</span>
                <span class="record-action">${escapeHtml(record.action || '执行任务')}</span>
            </div>
            <div class="record-details">
                <div class="record-time">${formatDate(record.startTime)} - ${record.endTime ? formatDate(record.endTime) : '进行中'}</div>
                ${record.duration ? `<div class="record-duration">耗时: ${(record.duration / 1000).toFixed(2)}秒</div>` : ''}
                ${record.tokensUsed ? `
                <div class="record-tokens">
                    Tokens: ${record.tokensUsed.totalTokens || 0} 
                    (输入: ${record.tokensUsed.promptTokens || 0}, 输出: ${record.tokensUsed.completionTokens || 0})
                </div>
                ` : ''}
            </div>
            ${record.error ? `<div class="record-error">错误: ${escapeHtml(record.error)}</div>` : ''}
        </div>
    `).join('');
}

function renderTaskTools(task) {
    const container = document.getElementById('task-tools');
    if (!container) return;
    
    const tools = task.toolCalls || [];
    
    if (tools.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">暂无工具调用</p>';
        return;
    }
    
    container.innerHTML = tools.map(call => `
        <div class="tool-item">
            <span class="tool-name">${escapeHtml(call.tool)}</span>
            <span>${escapeHtml(call.input || '')}</span>
        </div>
    `).join('');
}

// 执行任务
window.executeTask = async function(taskId) {
    try {
        showLoading(true);
        await apiCall(`/tasks/${taskId}/execute`, { method: 'POST' });
        showToast('任务已开始执行', 'success');
        setTimeout(() => {
            loadTaskDetail(taskId);
            loadTasks();
        }, 1000);
    } catch (error) {
        console.error('执行任务失败:', error);
    } finally {
        showLoading(false);
    }
};

// 执行当前任务
window.executeCurrentTask = async function() {
    if (!state.currentTaskId) {
        showToast('请先选择一个任务', 'warning');
        return;
    }
    await window.executeTask(state.currentTaskId);
};

// 编辑当前任务
window.editCurrentTask = function() {
    if (!state.currentTaskId) {
        showToast('请先选择一个任务', 'warning');
        return;
    }
    // 编辑功能待实现
    showToast('任务编辑功能待实现', 'info');
};

// 删除当前任务
window.deleteCurrentTask = async function() {
    if (!state.currentTaskId) {
        showToast('请先选择一个任务', 'warning');
        return;
    }
    if (!confirm('确定要删除这个任务吗？')) {
        return;
    }
    try {
        showLoading(true);
        await apiCall(`/tasks/${state.currentTaskId}`, { method: 'DELETE' });
        showToast('任务已删除', 'success');
        switchToPage('tasks');
        loadTasks();
    } catch (error) {
        console.error('删除任务失败:', error);
    } finally {
        showLoading(false);
    }
};

// 重试任务
window.retryTask = async function(taskId) {
    try {
        showLoading(true);
        await apiCall(`/tasks/${taskId}/retry`, { method: 'POST' });
        showToast('任务已重新开始', 'success');
        setTimeout(() => {
            loadTaskDetail(taskId);
            loadTasks();
        }, 1000);
    } catch (error) {
        console.error('重试任务失败:', error);
    } finally {
        showLoading(false);
    }
};

// 刷新任务
window.refreshTask = async function(taskId) {
    try {
        await apiCall(`/tasks/${taskId}`);
        showToast('已刷新', 'info');
        loadTaskDetail(taskId);
    } catch (error) {
        console.error('刷新任务失败:', error);
    }
};

// 删除任务
window.deleteTask = async function(taskId) {
    if (!confirm('确定要删除这个任务吗？')) return;
    
    try {
        await apiCall(`/tasks/${taskId}`, { method: 'DELETE' });
        showToast('任务已删除', 'success');
        switchPage('tasks');
        loadTasks();
    } catch (error) {
        console.error('删除任务失败:', error);
    }
};

// 加载角色
async function loadRoles() {
    try {
        const data = await apiCall('/roles');
        state.roles = data.data || [];
        renderRoles(state.roles);
    } catch (error) {
        console.error('加载角色失败:', error);
    }
}

function renderRoles(roleList) {
    const container = document.getElementById('roles-grid');
    if (!container) return;

    container.innerHTML = roleList.map(role => `
        <div class="role-card">
            <h3>${escapeHtml(role.name)}</h3>
            <div class="role-description">${escapeHtml(role.description || '暂无描述')}</div>
            ${role.capabilities && role.capabilities.length > 0 ? `
                <div class="role-capabilities">
                    <h4>能力:</h4>
                    <ul>
                        ${role.capabilities.slice(0, 5).map(cap => `<li>${escapeHtml(cap)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `).join('');
}

// 加载角色到选择框
async function loadRolesForSelect() {
    try {
        const data = await apiCall('/roles');
        const select = document.getElementById('select-role');
        if (select) {
            select.innerHTML = '<option value="">🤖 自动分配</option>' +
                data.data.map(role => `<option value="${role.id}">${role.name}</option>`).join('');
        }
    } catch (error) {
        console.error('加载角色失败:', error);
    }
}

async function loadRolesForAgentSelect() {
    try {
        const data = await apiCall('/roles');
        const select = document.getElementById('select-agent-role');
        if (select) {
            select.innerHTML = '<option value="">选择角色...</option>' +
                data.data.map(role => `<option value="${role.id}">${role.name}</option>`).join('');
        }
    } catch (error) {
        console.error('加载角色失败:', error);
    }
}

// 加载智能体
async function loadAgents() {
    try {
        const data = await apiCall('/agents');
        state.agents = data.data || [];
        renderAgentsGrid(state.agents);
    } catch (error) {
        console.error('加载智能体失败:', error);
    }
}

function renderAgentsGrid(agents) {
    const container = document.getElementById('agents-grid');
    if (!container) return;
    
    if (agents.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🤖</span>
                <p>暂无运行中的智能体</p>
                <button class="btn btn-primary" onclick="showCreateAgentModal()">创建第一个智能体</button>
            </div>
        `;
        return;
    }
    
    // 更新统计
    const running = agents.filter(a => a.status === 'running').length;
    const idle = agents.filter(a => a.status === 'idle').length;
    const error = agents.filter(a => a.status === 'error').length;
    
    document.getElementById('agent-total').textContent = agents.length;
    document.getElementById('agent-running-count').textContent = running;
    document.getElementById('agent-idle-count').textContent = idle;
    document.getElementById('agent-error-count').textContent = error;
    
    container.innerHTML = agents.map(agent => `
        <div class="agent-card">
            <div class="agent-card-header">
                <span class="agent-name">${escapeHtml(agent.name || '未命名')}</span>
                <span class="agent-status ${agent.status}">
                    <span class="agent-status-dot"></span>
                    ${getStatusText(agent.status)}
                </span>
            </div>
            <div class="agent-card-body">
                <div class="agent-card-stat">
                    <span class="value">${agent.completedTasks || 0}</span>
                    <span>已完成</span>
                </div>
                <div class="agent-card-stat">
                    <span class="value">${agent.currentTask || '-'}</span>
                    <span>当前任务</span>
                </div>
                <div class="agent-card-stat">
                    <span class="value">${agent.role || '-'}</span>
                    <span>角色</span>
                </div>
            </div>
            <div class="task-actions">
                <button class="btn btn-sm btn-secondary" onclick="viewAgentDetail('${agent.id}')">📊 详情</button>
                <button class="btn btn-sm btn-danger" onclick="stopAgent('${agent.id}')">⏹️ 停止</button>
            </div>
        </div>
    `).join('');
}

window.refreshAgents = function() {
    loadAgents();
    showToast('已刷新智能体列表', 'info');
};

window.stopAgent = async function(agentId) {
    if (!confirm('确定要停止这个智能体吗？')) return;

    try {
        await apiCall(`/agents/${agentId}/stop`, { method: 'POST' });
        showToast('智能体已停止', 'success');
        loadAgents();
    } catch (error) {
        console.error('停止智能体失败:', error);
        showToast('停止失败: ' + (error.message || '未知错误'), 'error');
    }
};

window.restartAgent = async function(agentId) {
    try {
        await apiCall(`/agents/${agentId}/restart`, { method: 'POST' });
        showToast('智能体正在重启', 'success');
        loadAgents();
    } catch (error) {
        console.error('重启智能体失败:', error);
        showToast('重启失败: ' + (error.message || '未知错误'), 'error');
    }
};

window.deleteAgent = async function(agentId) {
    if (!confirm('确定要删除这个智能体吗？')) return;

    try {
        await apiCall(`/agents/${agentId}`, { method: 'DELETE' });
        showToast('智能体已删除', 'success');
        loadAgents();
    } catch (error) {
        console.error('删除智能体失败:', error);
        showToast('删除失败: ' + (error.message || '未知错误'), 'error');
    }
};

window.viewAgentDetail = async function(agentId) {
    try {
        const data = await apiCall(`/agents/${agentId}`);
        const agent = data.data;

        if (!agent) {
            showToast('智能体不存在', 'error');
            return;
        }

        document.getElementById('agent-detail-name').textContent = agent.name || '未命名';
        document.getElementById('agent-detail-id').textContent = `ID: ${agent.id}`;
        document.getElementById('agent-detail-role').textContent = agent.roleId || '-';
        document.getElementById('agent-detail-status').innerHTML = `<span class="agent-status ${agent.status}">${getStatusText(agent.status)}</span>`;
        document.getElementById('agent-detail-created').textContent = formatDate(agent.metadata?.createdAt);
        document.getElementById('agent-detail-active').textContent = formatDate(agent.metadata?.lastActiveAt);
        document.getElementById('agent-detail-restarts').textContent = agent.metadata?.restartCount || 0;

        document.getElementById('page-agents').classList.remove('active');
        document.getElementById('page-agent-detail').classList.add('active');
        updateBreadcrumb('agent-detail');

        state.currentAgentId = agentId;
    } catch (error) {
        console.error('加载智能体详情失败:', error);
        showToast('加载失败: ' + (error.message || '未知错误'), 'error');
    }
};

window.backToAgents = function() {
    document.getElementById('page-agent-detail').classList.remove('active');
    document.getElementById('page-agents').classList.add('active');
    updateBreadcrumb('agents');
    state.currentAgentId = null;
};

// 加载项目
async function loadProjects() {
    try {
        showLoading(true);
        const data = await apiCall('/projects');
        state.projects = data.data || [];

        if (state.projects.length > 0) {
            const current = state.projects[0];
            document.getElementById('current-project-name').textContent = current.name;
            document.getElementById('current-project-path').textContent = current.path || '-';
            document.getElementById('current-tasks').textContent = current.taskCount || 0;
            document.getElementById('current-modules').textContent = current.modules?.length || 0;
            document.getElementById('current-version').textContent = current.currentVersion || 'v1.0.0';
            document.getElementById('current-completion').textContent = current.completionRate || '0%';

            // 更新生命周期状态显示
            updateLifecycleStatus(current.lifecycleStatus);

            // 显示项目详情区域
            const detailSection = document.getElementById('project-detail-section');
            if (detailSection) {
                detailSection.style.display = 'block';
            }

            // 加载模块和版本
            loadProjectModules(current.id);
            loadProjectVersions(current.id);
        } else {
            // 隐藏项目详情区域
            const detailSection = document.getElementById('project-detail-section');
            if (detailSection) {
                detailSection.style.display = 'none';
            }
        }

        renderProjectsGrid(state.projects);
        showLoading(false);
    } catch (error) {
        console.error('加载项目失败:', error);
        showToast('加载项目失败', 'error');
        showLoading(false);
    }
}

// 更新生命周期状态显示
function updateLifecycleStatus(status) {
    const container = document.getElementById('current-lifecycle-status');
    if (!container) return;

    const statusMap = {
        'draft': { label: '草稿', class: 'draft' },
        'in-progress': { label: '进行中', class: 'in-progress' },
        'review': { label: '审核中', class: 'review' },
        'completed': { label: '已完成', class: 'completed' }
    };

    const statusInfo = statusMap[status] || statusMap.draft;
    container.innerHTML = `<span class="lifecycle-badge ${statusInfo.class}">${statusInfo.label}</span>`;
}

// 切换项目详情标签页
window.switchProjectTab = function(tabName) {
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));

    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => btn.classList.remove('active'));

    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
};

// 加载项目模块
async function loadProjectModules(projectId) {
    try {
        const data = await apiCall(`/projects/${projectId}/modules`);
        renderModulesList(data.data || []);
    } catch (error) {
        console.error('加载模块失败:', error);
    }
}

// 渲染模块列表
function renderModulesList(modules) {
    const container = document.getElementById('modules-list');
    if (!container) return;

    if (modules.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="empty-icon">📦</span><p>暂无模块</p></div>';
        return;
    }

    container.innerHTML = modules.map(mod => `
        <div class="module-card" data-module-id="${mod.id}">
            <div class="module-header">
                <span class="module-name">${escapeHtml(mod.name)}</span>
                <span class="module-version">v${mod.version}</span>
            </div>
            <div class="module-description">${escapeHtml(mod.description || '暂无描述')}</div>
            <div class="module-meta">
                <span class="status-badge status-${mod.status}">${getLifecycleLabel(mod.status)}</span>
                <span>顺序: ${mod.metadata?.order || 0}</span>
            </div>
            <div class="module-actions">
                <button class="btn btn-sm btn-secondary" onclick="editModule('${mod.id}')">✏️ 编辑</button>
                <button class="btn btn-sm btn-danger" onclick="deleteModule('${mod.id}')">🗑️ 删除</button>
            </div>
        </div>
    `).join('');
}

// 加载项目版本
async function loadProjectVersions(projectId) {
    try {
        const data = await apiCall(`/projects/${projectId}/versions`);
        renderVersionsList(data.data || []);
    } catch (error) {
        console.error('加载版本失败:', error);
    }
}

// 渲染版本列表
function renderVersionsList(versions) {
    const container = document.getElementById('versions-list');
    if (!container) return;

    if (versions.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="empty-icon">🏷️</span><p>暂无版本</p></div>';
        return;
    }

    container.innerHTML = versions.map(ver => `
        <div class="version-item ${ver.status === 'active' ? 'active' : ''}" data-version-id="${ver.id}">
            <div class="version-header">
                <span class="version-number">v${escapeHtml(ver.version)}</span>
                <span class="version-badge ${ver.status}">${getVersionStatusLabel(ver.status)}</span>
            </div>
            <div class="version-name">${escapeHtml(ver.name)}</div>
            <div class="version-description">${escapeHtml(ver.description || '')}</div>
            ${ver.changes && ver.changes.length > 0 ? `
                <div class="version-changes">
                    <strong>变更内容:</strong>
                    <ul>
                        ${ver.changes.map(c => `<li>${escapeHtml(c)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            <div class="version-meta">
                <span>创建时间: ${formatDate(ver.createdAt)}</span>
            </div>
        </div>
    `).join('');
}

function getLifecycleLabel(status) {
    const labels = {
        'draft': '草稿',
        'in-progress': '进行中',
        'review': '审核中',
        'completed': '已完成'
    };
    return labels[status] || status;
}

function getVersionStatusLabel(status) {
    const labels = {
        'active': '当前版本',
        'archived': '已归档',
        'deprecated': '已废弃'
    };
    return labels[status] || status;
}

// 显示创建模块模态框
window.showCreateModuleModal = function() {
    const modal = document.getElementById('modal-create-module');
    if (modal) {
        modal.classList.add('active');
        const form = document.getElementById('form-create-module');
        form?.reset();
    }
};

// 显示创建版本模态框
window.showCreateVersionModal = function() {
    const modal = document.getElementById('modal-create-version');
    if (modal) {
        modal.classList.add('active');
        const form = document.getElementById('form-create-version');
        form?.reset();
    }
};

// 创建模块
document.getElementById('form-create-module')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentProjectId && state.projects.length > 0) {
        state.currentProjectId = state.projects[0].id;
    }
    if (!state.currentProjectId) {
        showToast('请先选择一个项目', 'warning');
        return;
    }

    try {
        const data = {
            name: document.getElementById('module-name').value,
            description: document.getElementById('module-description').value,
            version: document.getElementById('module-version').value,
            roles: Array.from(document.getElementById('module-roles').selectedOptions).map(o => o.value)
        };

        await apiCall(`/projects/${state.currentProjectId}/modules`, {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showToast('模块创建成功', 'success');
        document.getElementById('modal-create-module')?.classList.remove('active');
        loadProjectModules(state.currentProjectId);
        loadProjects();
    } catch (error) {
        console.error('创建模块失败:', error);
        showToast('创建模块失败', 'error');
    }
});

// 创建版本
document.getElementById('form-create-version')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentProjectId && state.projects.length > 0) {
        state.currentProjectId = state.projects[0].id;
    }
    if (!state.currentProjectId) {
        showToast('请先选择一个项目', 'warning');
        return;
    }

    try {
        const changesText = document.getElementById('version-changes').value;
        const changes = changesText.split('\n').filter(c => c.trim());

        const data = {
            version: document.getElementById('version-number').value,
            name: document.getElementById('version-name').value,
            description: document.getElementById('version-description').value,
            changes
        };

        await apiCall(`/projects/${state.currentProjectId}/versions`, {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showToast('版本创建成功', 'success');
        document.getElementById('modal-create-version')?.classList.remove('active');
        loadProjectVersions(state.currentProjectId);
        loadProjects();
    } catch (error) {
        console.error('创建版本失败:', error);
        showToast('创建版本失败', 'error');
    }
});

// 删除模块
window.deleteModule = async function(moduleId) {
    if (!confirm('确定要删除这个模块吗？')) return;
    if (!state.currentProjectId && state.projects.length > 0) {
        state.currentProjectId = state.projects[0].id;
    }

    try {
        await apiCall(`/projects/${state.currentProjectId}/modules/${moduleId}`, {
            method: 'DELETE'
        });
        showToast('模块已删除', 'success');
        loadProjectModules(state.currentProjectId);
        loadProjects();
    } catch (error) {
        console.error('删除模块失败:', error);
        showToast('删除模块失败', 'error');
    }
};

function renderProjectsGrid(projects) {
    const container = document.getElementById('projects-grid');
    if (!container) return;

    if (projects.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📁</span>
                <p>暂无项目</p>
                <button class="btn btn-primary" onclick="showCreateProjectModal()">➕ 创建第一个项目</button>
            </div>
        `;
        return;
    }

    container.innerHTML = projects.map(project => `
        <div class="project-card" data-project-id="${project.id}">
            <div class="project-header">
                <div class="project-info">
                    <div class="project-name">${escapeHtml(project.name)}</div>
                    <span class="status-badge status-${project.status || 'active'}">${getStatusLabel(project.status)}</span>
                </div>
                <div class="project-actions">
                    <button class="btn-icon" onclick="event.stopPropagation(); viewProjectDetail('${project.id}')" title="查看详情">👁️</button>
                    <button class="btn-icon" onclick="event.stopPropagation(); editProject('${project.id}')" title="编辑">✏️</button>
                    <button class="btn-icon" onclick="event.stopPropagation(); deleteProjectById('${project.id}')" title="删除">🗑️</button>
                </div>
            </div>
            <div class="project-description">${escapeHtml(project.description || '暂无描述')}</div>
            <div class="project-path">📍 ${escapeHtml(project.path)}</div>
            <div class="project-footer">
                <span class="project-date">更新于 ${formatDate(project.metadata?.updatedAt)}</span>
            </div>
        </div>
    `).join('');
}

function getStatusLabel(status) {
    const labels = {
        'active': '活跃',
        'archived': '已归档',
        'draft': '草稿'
    };
    return labels[status] || status;
}

// 显示创建项目模态框
window.showCreateProjectModal = function() {
    const modal = document.getElementById('modal-create-project');
    if (modal) {
        modal.classList.add('active');
        const form = document.getElementById('form-create-project');
        form?.reset();
    }
};

// 查看项目详情
window.viewProjectDetail = async function(projectId) {
    try {
        const data = await apiCall(`/projects/${projectId}`);
        if (data.success && data.data) {
            const project = data.data;
            const modal = document.getElementById('modal-project-detail');
            const body = document.getElementById('project-detail-body');
            const title = document.getElementById('project-detail-title');

            if (modal && body && title) {
                title.textContent = `📁 ${escapeHtml(project.name)}`;
                body.innerHTML = `
                    <div class="project-detail-content">
                        <div class="detail-section">
                            <h4>基本信息</h4>
                            <div class="detail-row">
                                <span class="detail-label">项目ID:</span>
                                <span class="detail-value">${project.id}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">项目路径:</span>
                                <span class="detail-value">${escapeHtml(project.path)}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">状态:</span>
                                <span class="status-badge status-${project.status}">${getStatusLabel(project.status)}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">可见性:</span>
                                <span class="detail-value">${project.visibility || '私有'}</span>
                            </div>
                        </div>
                        <div class="detail-section">
                            <h4>描述</h4>
                            <p>${escapeHtml(project.description || '暂无描述')}</p>
                        </div>
                        <div class="detail-section">
                            <h4>创建时间</h4>
                            <p>${formatDate(project.metadata?.createdAt)}</p>
                        </div>
                        <div class="detail-section">
                            <h4>更新时间</h4>
                            <p>${formatDate(project.metadata?.updatedAt)}</p>
                        </div>
                    </div>
                `;
                modal.classList.add('active');
            }
        }
    } catch (error) {
        console.error('获取项目详情失败:', error);
        showToast('获取项目详情失败', 'error');
    }
};

// 编辑项目
window.editProject = function(projectId) {
    const project = state.projects.find(p => p.id === projectId);
    if (!project) {
        showToast('项目不存在', 'error');
        return;
    }

    const modal = document.getElementById('modal-create-project');
    if (modal) {
        const form = document.getElementById('form-create-project');
        form.name.value = project.name;
        form.path.value = project.path;
        form.description.value = project.description || '';
        form.visibility.value = project.visibility || 'private';

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.textContent = '更新项目';
        submitBtn.onclick = async (e) => {
            e.preventDefault();
            await updateProjectById(projectId, form);
        };

        modal.classList.add('active');
    }
};

// 创建项目
async function createProject(form) {
    try {
        showLoading(true);
        const formData = new FormData(form);
        const data = {
            name: formData.get('name'),
            path: formData.get('path'),
            description: formData.get('description'),
            visibility: formData.get('visibility')
        };

        const result = await apiCall('/projects', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        if (result.success) {
            showToast('项目创建成功', 'success');
            document.getElementById('modal-create-project')?.classList.remove('active');
            loadProjects();
        } else {
            showToast(result.error?.message || '创建项目失败', 'error');
        }
    } catch (error) {
        console.error('创建项目失败:', error);
        showToast('创建项目失败', 'error');
    } finally {
        showLoading(false);
    }
}

// 更新项目
async function updateProjectById(projectId, form) {
    try {
        showLoading(true);
        const formData = new FormData(form);
        const data = {
            name: formData.get('name'),
            path: formData.get('path'),
            description: formData.get('description'),
            visibility: formData.get('visibility')
        };

        const result = await apiCall(`/projects/${projectId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        if (result.success) {
            showToast('项目更新成功', 'success');
            document.getElementById('modal-create-project')?.classList.remove('active');
            loadProjects();
        } else {
            showToast(result.error?.message || '更新项目失败', 'error');
        }
    } catch (error) {
        console.error('更新项目失败:', error);
        showToast('更新项目失败', 'error');
    } finally {
        showLoading(false);
    }
}

// 删除项目
window.deleteProjectById = async function(projectId) {
    const project = state.projects.find(p => p.id === projectId);
    if (!project) {
        showToast('项目不存在', 'error');
        return;
    }

    if (!confirm(`确定要删除项目 "${project.name}" 吗？此操作不可撤销。`)) {
        return;
    }

    try {
        showLoading(true);
        const result = await apiCall(`/projects/${projectId}`, {
            method: 'DELETE'
        });

        if (result.success) {
            showToast('项目已删除', 'success');
            loadProjects();
        } else {
            showToast(result.error?.message || '删除项目失败', 'error');
        }
    } catch (error) {
        console.error('删除项目失败:', error);
        showToast('删除项目失败', 'error');
    } finally {
        showLoading(false);
    }
};

// 切换到项目
window.switchToProject = function(projectId) {
    state.currentProjectId = projectId;
    const project = state.projects.find(p => p.id === projectId);
    if (project) {
        document.getElementById('current-project-name').textContent = project.name;
        document.getElementById('current-project-path').textContent = project.path || '-';
        showToast(`已切换到项目: ${project.name}`, 'info');
    }
};

// 加载工作流
async function loadWorkflows() {
    try {
        const data = await apiCall('/workflows');
        state.workflows = data.data || [];
        renderWorkflows(state.workflows);
        loadWorkflowTemplates();
    } catch (error) {
        console.error('加载工作流失败:', error);
    }
}

async function loadWorkflowTemplates() {
    try {
        const templatesData = await apiCall('/workflows/templates');
        renderWorkflowTemplates(templatesData.data || []);
    } catch (error) {
        console.error('加载工作流模板失败:', error);
    }
}

function renderWorkflowTemplates(templates) {
    const container = document.getElementById('workflow-templates');
    if (!container) return;

    if (templates.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">暂无模板</p>';
        return;
    }

    container.innerHTML = templates.map(template => `
        <div class="template-card" onclick="createWorkflowFromTemplate('${template.id}')">
            <span class="template-icon">${getTemplateIcon(template.category)}</span>
            <span class="template-name">${escapeHtml(template.name)}</span>
            <span class="template-desc">${escapeHtml(template.description)}</span>
        </div>
    `).join('');
}

function getTemplateIcon(category) {
    const icons = {
        'development': '🔨',
        'maintenance': '🔧',
        'documentation': '📖',
        'testing': '🧪',
        'default': '🔄'
    };
    return icons[category] || icons.default;
}

window.createWorkflowFromTemplate = async function(templateId) {
    try {
        const templatesData = await apiCall('/workflows/templates');
        const templates = templatesData.data || [];
        const template = templates.find(t => t.id === templateId);

        if (!template) {
            showToast('模板不存在', 'error');
            return;
        }

        const workflowData = {
            name: `${template.name} (副本)`,
            description: template.description,
            steps: template.workflow?.steps || [],
            settings: template.workflow?.settings || {
                continueOnFailure: false,
                parallelByDefault: false
            }
        };

        const result = await apiCall('/workflows', {
            method: 'POST',
            body: workflowData
        });

        showToast('工作流创建成功', 'success');
        loadWorkflows();
    } catch (error) {
        console.error('从模板创建工作流失败:', error);
        showToast('创建工作流失败', 'error');
    }
};

window.showCreateWorkflowModal = function() {
    const modal = document.getElementById('modal-create-workflow');
    if (modal) {
        modal.classList.add('active');
    }
};

window.createCustomWorkflow = async function() {
    const name = document.getElementById('workflow-name')?.value;
    const description = document.getElementById('workflow-description')?.value;

    if (!name) {
        showToast('请输入工作流名称', 'error');
        return;
    }

    try {
        await apiCall('/workflows', {
            method: 'POST',
            body: {
                name,
                description,
                steps: [],
                settings: {
                    continueOnFailure: false,
                    parallelByDefault: false
                }
            }
        });

        showToast('工作流创建成功', 'success');
        closeModal('modal-create-workflow');
        loadWorkflows();
    } catch (error) {
        console.error('创建工作流失败:', error);
        showToast('创建工作流失败', 'error');
    }
};

function renderWorkflows(workflowList) {
    const container = document.getElementById('workflows-list');
    if (!container) return;

    if (workflowList.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">暂无自定义工作流</p>';
        return;
    }

    container.innerHTML = workflowList.map(workflow => `
        <div class="workflow-item">
            <div class="workflow-header">
                <h3>${escapeHtml(workflow.name)}</h3>
                <div class="workflow-actions">
                    <button class="btn btn-sm btn-secondary" onclick="viewWorkflowDetail('${workflow.id}')">👁️ 查看</button>
                    <button class="btn btn-sm btn-primary" onclick="executeWorkflow('${workflow.id}')">▶ 执行</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteWorkflow('${workflow.id}')">🗑️ 删除</button>
                </div>
            </div>
            <div class="workflow-description">${escapeHtml(workflow.description || '暂无描述')}</div>
            ${workflow.steps && workflow.steps.length > 0 ? `
                <div class="workflow-steps">
                    <div class="workflow-steps-header">步骤流程:</div>
                    ${workflow.steps.map((step, index) => `
                        <div class="workflow-step">
                            <span class="step-number">${index + 1}</span>
                            <span class="step-name">${escapeHtml(step.name)}</span>
                            <span class="step-role">👤 ${step.role || '自动分配'}</span>
                            ${step.dependencies && step.dependencies.length > 0 ? `
                                <span class="step-deps">依赖: ${step.dependencies.join(', ')}</span>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : '<p style="color: var(--text-secondary); font-size: 0.875rem;">暂无步骤</p>'}
            <div class="workflow-meta">
                <span>步骤数: ${workflow.steps?.length || 0}</span>
                <span>版本: ${workflow.version || '1.0.0'}</span>
            </div>
        </div>
    `).join('');
}

// 查看工作流详情
window.viewWorkflowDetail = async function(workflowId) {
    try {
        const data = await apiCall(`/workflows/${workflowId}`);
        const workflow = data.data;

        if (!workflow) {
            showToast('工作流不存在', 'error');
            return;
        }

        const modal = document.getElementById('modal-workflow-detail');
        if (!modal) {
            createWorkflowDetailModal();
        }

        const detailModal = document.getElementById('modal-workflow-detail');
        const detailBody = document.getElementById('workflow-detail-body');

        detailBody.innerHTML = `
            <div class="workflow-detail-content">
                <div class="detail-section">
                    <h4>基本信息</h4>
                    <div class="detail-row">
                        <span class="detail-label">ID:</span>
                        <span class="detail-value">${workflow.id}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">名称:</span>
                        <span class="detail-value">${escapeHtml(workflow.name)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">描述:</span>
                        <span class="detail-value">${escapeHtml(workflow.description || '暂无描述')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">版本:</span>
                        <span class="detail-value">${workflow.version || '1.0.0'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">步骤数:</span>
                        <span class="detail-value">${workflow.steps?.length || 0}</span>
                    </div>
                </div>
                ${workflow.steps && workflow.steps.length > 0 ? `
                    <div class="detail-section">
                        <h4>步骤详情</h4>
                        <div class="workflow-steps-detail">
                            ${workflow.steps.map((step, index) => `
                                <div class="step-detail-card">
                                    <div class="step-detail-header">
                                        <span class="step-number">${index + 1}</span>
                                        <span class="step-name">${escapeHtml(step.name)}</span>
                                    </div>
                                    <div class="step-detail-body">
                                        <div class="detail-row">
                                            <span class="detail-label">角色:</span>
                                            <span class="detail-value">${step.role || '自动分配'}</span>
                                        </div>
                                        <div class="detail-row">
                                            <span class="detail-label">类型:</span>
                                            <span class="detail-value">${step.type || 'task'}</span>
                                        </div>
                                        ${step.description ? `
                                            <div class="detail-row">
                                                <span class="detail-label">描述:</span>
                                                <span class="detail-value">${escapeHtml(step.description)}</span>
                                            </div>
                                        ` : ''}
                                        ${step.dependencies && step.dependencies.length > 0 ? `
                                            <div class="detail-row">
                                                <span class="detail-label">依赖:</span>
                                                <span class="detail-value">${step.dependencies.join(', ')}</span>
                                            </div>
                                        ` : ''}
                                        ${step.timeout ? `
                                            <div class="detail-row">
                                                <span class="detail-label">超时:</span>
                                                <span class="detail-value">${step.timeout}ms</span>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                ${workflow.settings ? `
                    <div class="detail-section">
                        <h4>设置</h4>
                        <div class="detail-row">
                            <span class="detail-label">失败时继续:</span>
                            <span class="detail-value">${workflow.settings.continueOnFailure ? '是' : '否'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">默认并行:</span>
                            <span class="detail-value">${workflow.settings.parallelByDefault ? '是' : '否'}</span>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        detailModal.classList.add('active');
    } catch (error) {
        console.error('获取工作流详情失败:', error);
        showToast('获取工作流详情失败', 'error');
    }
};

// 创建工作流详情模态框
function createWorkflowDetailModal() {
    if (document.getElementById('modal-workflow-detail')) return;

    const modalHtml = `
        <div id="modal-workflow-detail" class="modal">
            <div class="modal-content modal-lg">
                <div class="modal-header">
                    <h3 id="workflow-detail-title">📋 工作流详情</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body" id="workflow-detail-body">
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('modal-workflow-detail');
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
}

// 删除工作流
window.deleteWorkflow = async function(workflowId) {
    const workflow = state.workflows.find(w => w.id === workflowId);
    if (!workflow) {
        showToast('工作流不存在', 'error');
        return;
    }

    if (!confirm(`确定要删除工作流 "${workflow.name}" 吗？此操作不可撤销。`)) {
        return;
    }

    try {
        const result = await apiCall(`/workflows/${workflowId}`, {
            method: 'DELETE'
        });

        if (result.success) {
            showToast('工作流已删除', 'success');
            loadWorkflows();
        } else {
            showToast(result.error?.message || '删除工作流失败', 'error');
        }
    } catch (error) {
        console.error('删除工作流失败:', error);
        showToast('删除工作流失败', 'error');
    }
};

// 执行工作流
window.executeWorkflow = async function(workflowId, mode = 'step') {
    try {
        let endpoint = '/execute';
        if (mode === 'stage') {
            endpoint = '/execute-stage';
        }
        await apiCall(`/workflows/${workflowId}${endpoint}`, { method: 'POST' });
        showToast('工作流已开始执行', 'success');
        setTimeout(() => {
            loadTasks();
            loadDashboard();
        }, 1000);
    } catch (error) {
        console.error('执行工作流失败:', error);
    }
};

// 执行Stage工作流
window.executeStageWorkflow = async function(workflowId) {
    await window.executeWorkflow(workflowId, 'stage');
};

// 加载报告
async function loadReports() {
    try {
        // Token统计数据
        document.getElementById('token-total').textContent = '1,234,567';
        document.getElementById('token-cost').textContent = '$12.35';
        document.getElementById('token-daily').textContent = '45,678';
        document.getElementById('token-per-task').textContent = '2,345';
        
        // 性能排名
        const tbody = document.getElementById('performance-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td>1</td>
                    <td>🤖 DEV-Agent-001</td>
                    <td>45</td>
                    <td>2.8K</td>
                    <td>95%</td>
                    <td>5m 32s</td>
                </tr>
                <tr>
                    <td>2</td>
                    <td>🤖 PM-Agent-001</td>
                    <td>32</td>
                    <td>1.2K</td>
                    <td>100%</td>
                    <td>3m 15s</td>
                </tr>
                <tr>
                    <td>3</td>
                    <td>🤖 TST-Agent-001</td>
                    <td>28</td>
                    <td>3.5K</td>
                    <td>89%</td>
                    <td>8m 45s</td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('加载报告失败:', error);
    }
}

// 导出报告
window.exportReport = function() {
    showToast('报告导出中...', 'info');
    setTimeout(() => {
        showToast('报告已导出', 'success');
    }, 1500);
};

// 加载设置
async function loadSettings() {
    try {
        const configData = await apiCall('/config');
        renderLlmConfig(configData.data);
        renderSettingsRoles();
        renderSettingsRules();
    } catch (error) {
        console.error('加载设置失败:', error);
    }
}

function renderLlmConfig(config) {
    const container = document.getElementById('llm-config');
    if (!container) return;
    
    const providers = config.llm?.providers || [];
    container.innerHTML = providers.map(p => `
        <div class="config-item">
            <span class="config-label">${p.name}</span>
            <span class="config-value">
                <span class="status-badge ${p.enabled ? 'status-completed' : 'status-pending'}">
                    ${p.enabled ? '✅ 已启用' : '❌ 已禁用'}
                </span>
            </span>
        </div>
    `).join('') || '<p style="color: var(--text-secondary);">暂无LLM配置</p>';
}

function renderSettingsRoles() {
    const container = document.getElementById('settings-roles-list');
    if (!container) return;
    
    container.innerHTML = state.roles.map(role => `
        <div class="config-item">
            <span class="config-label">${role.name}</span>
            <span class="config-value">
                <button class="btn btn-sm btn-secondary">编辑</button>
            </span>
        </div>
    `).join('') || '<p style="color: var(--text-secondary);">暂无角色配置</p>';
}

function renderSettingsRules() {
    const container = document.getElementById('settings-rules-list');
    if (!container) return;
    
    container.innerHTML = '<p style="color: var(--text-secondary);">暂无规则配置</p>';
}

// 自动刷新
function startAutoRefresh() {
    setInterval(() => {
        switch (state.currentPage) {
            case 'dashboard':
                loadDashboard();
                break;
            case 'tasks':
                loadTasks();
                break;
            case 'agents':
                loadAgents();
                break;
        }
    }, 30000); // 每30秒刷新
}

// 刷新仪表板
window.refreshDashboard = function() {
    loadDashboard();
    showToast('已刷新仪表板', 'info');
};

// Toast通知
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    // 3秒后自动移除
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// 加载状态
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        if (show) {
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }
    }
}

// 工具函数
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getStatusText(status) {
    const map = {
        'pending': '待处理',
        'in-progress': '进行中',
        'completed': '已完成',
        'failed': '失败',
        'blocked': '阻塞',
        'running': '运行中',
        'idle': '空闲',
        'error': '异常'
    };
    return map[status] || status;
}

function getPriorityText(priority) {
    const map = {
        'low': '低',
        'medium': '中',
        'high': '高',
        'critical': '紧急'
    };
    return map[priority] || priority;
}

function getTaskTypeText(type) {
    const map = {
        'requirement-analysis': '📝 需求分析',
        'architecture-design': '🏗️ 架构设计',
        'development': '💻 开发',
        'testing': '🧪 测试',
        'documentation': '📖 文档',
        'code-review': '👀 代码审查',
        'refactoring': '♻️ 重构',
        'bug-fix': '🐛 Bug修复'
    };
    return map[type] || type;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
}

function formatRelativeTime(dateString) {
    if (!dateString) return '未知';
    
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    
    return formatDate(dateString);
}

// 导出到全局作用域
window.executeTask = executeTask;
window.refreshTask = refreshTask;
window.deleteTask = deleteTask;
window.retryTask = retryTask;
window.executeWorkflow = executeWorkflow;
window.showTaskDetail = showTaskDetail;
window.showCreateTaskModal = showCreateTaskModal;
window.showCreateAgentModal = showCreateAgentModal;
window.refreshAgents = refreshAgents;
window.refreshDashboard = refreshDashboard;
window.switchToPage = switchToPage;
