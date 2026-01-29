// API基础URL
const API_BASE = '/api';

// 状态管理
let currentPage = 'dashboard';
let currentTaskId = null;
let tasks = [];
let roles = [];
let workflows = [];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initModals();
    initChatInput();
    loadTasks();
    loadRoles();
    loadWorkflows();
    startAutoRefresh();
});

// 导航
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            switchPage(page);
        });
    });
}

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

    currentPage = page;

    // 加载对应页面数据
    switch (page) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'tasks':
            loadTasks();
            break;
        case 'roles':
            loadRoles();
            break;
        case 'workflows':
            loadWorkflows();
            break;
        case 'config':
            loadConfig();
            break;
    }
}

// 初始化对话输入
function initChatInput() {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send-message');
    
    if (sendBtn) {
        sendBtn.addEventListener('click', async () => {
            await sendMessage();
        });
    }
    
    if (chatInput) {
        chatInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                await sendMessage();
            }
        });
    }
}

// 发送消息
async function sendMessage() {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput?.value.trim();
    
    if (!message) return;
    
    // 清空输入
    if (chatInput) {
        chatInput.value = '';
    }
    
    try {
        // 发送到后端处理
        const result = await apiCall('/tasks/chat', {
            method: 'POST',
            body: JSON.stringify({ message }),
        });
        
        if (result.data.isNew) {
            // 新任务
            await loadTasks();
            // 切换到新任务
            if (result.data.task) {
                showTaskDetail(result.data.task.id);
            }
        } else {
            // 属于已有任务，刷新任务列表和详情
            await loadTasks();
            if (currentTaskId === result.data.task.id) {
                await loadTaskDetail(result.data.task.id);
            }
        }
    } catch (error) {
        console.error('发送消息失败:', error);
    }
}

// 模态框
function initModals() {
    // 创建任务模态框
    const taskModal = document.getElementById('modal-create-task');
    const taskOpenBtn = document.getElementById('btn-create-task');
    
    if (taskOpenBtn && taskModal) {
        taskOpenBtn.addEventListener('click', () => {
            taskModal.classList.add('active');
            loadRolesForSelect();
        });
    }

    // 关闭所有模态框
    const closeBtns = document.querySelectorAll('.modal-close');
    closeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        });
    });

    // 点击背景关闭
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });

    // 表单提交
    const taskForm = document.getElementById('form-create-task');
    if (taskForm) {
        taskForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await createTask(taskForm);
        });
    }
    
    // 返回按钮
    const backBtn = document.getElementById('btn-back-to-tasks');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            switchPage('tasks');
        });
    }
}

// API调用
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '请求失败');
        }
        return data;
    } catch (error) {
        console.error('API调用失败:', error);
        alert(`错误: ${error.message}`);
        throw error;
    }
}

// 加载仪表板
async function loadDashboard() {
    try {
        const statsData = await apiCall('/stats');
        const tasksData = await apiCall('/tasks');

        // 更新统计
        const stats = statsData.data.tasks;
        document.getElementById('stat-total').textContent = stats.total || 0;
        document.getElementById('stat-in-progress').textContent = stats.byStatus['in-progress'] || 0;
        document.getElementById('stat-completed').textContent = stats.byStatus.completed || 0;
        document.getElementById('stat-failed').textContent = stats.byStatus.failed || 0;

        // 显示最近任务
        const recentTasks = tasksData.data.slice(0, 5);
        renderTasks(recentTasks, 'recent-tasks-list');
    } catch (error) {
        console.error('加载仪表板失败:', error);
    }
}

// 加载任务
async function loadTasks() {
    try {
        const data = await apiCall('/tasks');
        tasks = data.data;
        renderTasks(tasks, 'tasks-list');
        renderTasksSidebar(tasks);
        updateFilters();
    } catch (error) {
        console.error('加载任务失败:', error);
    }
}

// 渲染侧边栏任务列表
function renderTasksSidebar(taskList) {
    const container = document.getElementById('tasks-sidebar-list');
    if (!container) return;
    
    // 只显示最近的任务
    const recentTasks = taskList.slice(0, 10);
    
    if (recentTasks.length === 0) {
        container.innerHTML = '<div class="task-empty">暂无任务</div>';
        return;
    }
    
    container.innerHTML = recentTasks.map(task => `
        <div class="task-sidebar-item ${task.id === currentTaskId ? 'active' : ''}" 
             data-task-id="${task.id}"
             onclick="showTaskDetail('${task.id}')">
            <div class="task-sidebar-title">${escapeHtml(task.title)}</div>
            <div class="task-sidebar-meta">
                <span class="status-badge status-${task.status}">${getStatusText(task.status)}</span>
                <span class="task-sidebar-time">${formatDate(task.updatedAt)}</span>
            </div>
        </div>
    `).join('');
}

// 渲染任务列表
function renderTasks(taskList, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (taskList.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">暂无任务</p>';
        return;
    }

    container.innerHTML = taskList.map(task => `
        <div class="task-item" onclick="showTaskDetail('${task.id}')" style="cursor: pointer;">
            <div class="task-header">
                <div>
                    <div class="task-title">${escapeHtml(task.title)}</div>
                    <div class="task-meta">
                        <span class="status-badge status-${task.status}">${getStatusText(task.status)}</span>
                        <span class="priority-badge priority-${task.priority}">${getPriorityText(task.priority)}</span>
                        ${task.assignedRole ? `<span>👤 ${task.assignedRole}</span>` : ''}
                        ${task.messages && task.messages.length > 0 ? `<span>💬 ${task.messages.length}条消息</span>` : ''}
                        <span>📅 ${formatDate(task.updatedAt)}</span>
                    </div>
                </div>
            </div>
            <div class="task-description">${escapeHtml(task.description)}</div>
            ${task.result ? `
                <div style="margin-top: 1rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 0.5rem;">
                    <strong>结果:</strong> ${task.result.success ? '✅ 成功' : '❌ 失败'}
                    ${task.result.error ? `<div style="margin-top: 0.5rem; color: var(--danger-color);">${escapeHtml(task.result.error)}</div>` : ''}
                </div>
            ` : ''}
            <div class="task-actions" onclick="event.stopPropagation()">
                ${task.status === 'pending' || task.status === 'blocked' ? `
                    <button class="btn btn-primary btn-sm" onclick="executeTask('${task.id}')">执行</button>
                ` : ''}
                ${task.status === 'in-progress' ? `
                    <button class="btn btn-secondary btn-sm" onclick="refreshTask('${task.id}')">刷新</button>
                ` : ''}
                <button class="btn btn-danger btn-sm" onclick="deleteTask('${task.id}')">删除</button>
            </div>
        </div>
    `).join('');
}

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
        
        if (currentPage === 'tasks') {
            loadTasks();
        } else {
            loadDashboard();
        }
    } catch (error) {
        console.error('创建任务失败:', error);
    }
}

// 执行任务
async function executeTask(taskId) {
    try {
        await apiCall(`/tasks/${taskId}/execute`, {
            method: 'POST',
        });
        alert('任务已开始执行');
        setTimeout(() => {
            if (currentPage === 'tasks') {
                loadTasks();
            } else {
                loadDashboard();
            }
        }, 1000);
    } catch (error) {
        console.error('执行任务失败:', error);
    }
}

// 删除任务
async function deleteTask(taskId) {
    if (!confirm('确定要删除这个任务吗？')) return;

    try {
        await apiCall(`/tasks/${taskId}`, {
            method: 'DELETE',
        });
        if (currentPage === 'tasks') {
            loadTasks();
        } else {
            loadDashboard();
        }
    } catch (error) {
        console.error('删除任务失败:', error);
    }
}

// 刷新任务
async function refreshTask(taskId) {
    try {
        const data = await apiCall(`/tasks/${taskId}`);
        // 更新任务显示
        if (currentPage === 'tasks') {
            loadTasks();
        } else {
            loadDashboard();
        }
    } catch (error) {
        console.error('刷新任务失败:', error);
    }
}

// 加载角色
async function loadRoles() {
    try {
        const data = await apiCall('/roles');
        roles = data.data;
        renderRoles(roles);
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
            <div class="role-description">${escapeHtml(role.description)}</div>
            ${role.capabilities && role.capabilities.length > 0 ? `
                <div class="role-capabilities">
                    <h4>能力:</h4>
                    <ul>
                        ${role.capabilities.map(cap => `<li>${escapeHtml(cap)}</li>`).join('')}
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
            select.innerHTML = '<option value="">未分配</option>' +
                data.data.map(role => `<option value="${role.id}">${role.name}</option>`).join('');
        }
    } catch (error) {
        console.error('加载角色失败:', error);
    }
}

// 加载工作流
async function loadWorkflows() {
    try {
        const data = await apiCall('/workflows');
        workflows = data.data;
        renderWorkflows(workflows);
    } catch (error) {
        console.error('加载工作流失败:', error);
    }
}

function renderWorkflows(workflowList) {
    const container = document.getElementById('workflows-list');
    if (!container) return;

    if (workflowList.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">暂无工作流</p>';
        return;
    }

    container.innerHTML = workflowList.map(workflow => `
        <div class="workflow-item">
            <h3>${escapeHtml(workflow.name)}</h3>
            <div class="workflow-description">${escapeHtml(workflow.description)}</div>
            ${workflow.steps && workflow.steps.length > 0 ? `
                <div class="workflow-steps">
                    <strong>步骤:</strong>
                    ${workflow.steps.map(step => `
                        <div class="workflow-step">
                            ${step.name} (${step.role}) - ${step.taskType}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            <div style="margin-top: 1rem;">
                <button class="btn btn-primary btn-sm" onclick="executeWorkflow('${workflow.id}')">执行工作流</button>
            </div>
        </div>
    `).join('');
}

// 执行工作流
async function executeWorkflow(workflowId) {
    try {
        await apiCall(`/workflows/${workflowId}/execute`, {
            method: 'POST',
        });
        alert('工作流已开始执行');
        setTimeout(() => {
            loadTasks();
            loadDashboard();
        }, 1000);
    } catch (error) {
        console.error('执行工作流失败:', error);
    }
}

// 加载配置
async function loadConfig() {
    try {
        const data = await apiCall('/config');
        renderConfig(data.data);
    } catch (error) {
        console.error('加载配置失败:', error);
    }
}

function renderConfig(config) {
    const container = document.getElementById('config-content');
    if (!container) return;

    container.innerHTML = `
        <div class="config-section">
            <h3>项目配置</h3>
            <div class="config-item">
                <span class="config-label">项目名称</span>
                <span class="config-value">${escapeHtml(config.project.projectName || 'N/A')}</span>
            </div>
            <div class="config-item">
                <span class="config-label">项目路径</span>
                <span class="config-value">${escapeHtml(config.project.projectPath || 'N/A')}</span>
            </div>
        </div>
        <div class="config-section">
            <h3>LLM配置</h3>
            <div class="config-item">
                <span class="config-label">默认提供商</span>
                <span class="config-value">${escapeHtml(config.llm.defaultProvider || 'N/A')}</span>
            </div>
            <div class="config-item">
                <span class="config-label">已启用提供商</span>
                <span class="config-value">${config.llm.providers?.length || 0} 个</span>
            </div>
        </div>
        <div class="config-section">
            <h3>统计信息</h3>
            <div class="config-item">
                <span class="config-label">总任务数</span>
                <span class="config-value">${config.stats.tasks.total || 0}</span>
            </div>
            <div class="config-item">
                <span class="config-label">进行中</span>
                <span class="config-value">${config.stats.tasks.byStatus['in-progress'] || 0}</span>
            </div>
            <div class="config-item">
                <span class="config-label">已完成</span>
                <span class="config-value">${config.stats.tasks.byStatus.completed || 0}</span>
            </div>
        </div>
    `;
}

// 更新过滤器
function updateFilters() {
    // 更新角色过滤器
    const roleFilter = document.getElementById('filter-role');
    if (roleFilter) {
        const currentValue = roleFilter.value;
        roleFilter.innerHTML = '<option value="">所有角色</option>' +
            [...new Set(tasks.map(t => t.assignedRole).filter(Boolean))]
                .map(role => `<option value="${role}">${role}</option>`).join('');
        roleFilter.value = currentValue;
    }

    // 添加过滤器事件
    const statusFilter = document.getElementById('filter-status');
    const searchFilter = document.getElementById('filter-search');

    [statusFilter, roleFilter, searchFilter].forEach(filter => {
        if (filter) {
            filter.addEventListener('change', applyFilters);
            filter.addEventListener('input', applyFilters);
        }
    });
}

function applyFilters() {
    const status = document.getElementById('filter-status')?.value || '';
    const role = document.getElementById('filter-role')?.value || '';
    const search = document.getElementById('filter-search')?.value.toLowerCase() || '';

    let filtered = tasks;

    if (status) {
        filtered = filtered.filter(t => t.status === status);
    }

    if (role) {
        filtered = filtered.filter(t => t.assignedRole === role);
    }

    if (search) {
        filtered = filtered.filter(t =>
            t.title.toLowerCase().includes(search) ||
            t.description.toLowerCase().includes(search)
        );
    }

    renderTasks(filtered, 'tasks-list');
}

// 自动刷新
function startAutoRefresh() {
    setInterval(() => {
        if (currentPage === 'dashboard') {
            loadDashboard();
        } else if (currentPage === 'tasks') {
            loadTasks();
        }
    }, 5000); // 每5秒刷新一次
}

// 显示任务详情
function showTaskDetail(taskId) {
    currentTaskId = taskId;
    // 直接切换页面，不通过导航
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });
    const pageEl = document.getElementById('page-task-detail');
    if (pageEl) {
        pageEl.classList.add('active');
    }
    loadTaskDetail(taskId);
}

// 加载任务详情
async function loadTaskDetail(taskId) {
    try {
        const data = await apiCall(`/tasks/${taskId}`);
        const task = data.data;
        
        // 更新标题
        const titleEl = document.getElementById('task-detail-title');
        if (titleEl) {
            titleEl.textContent = `任务: ${task.title}`;
        }
        
        // 显示任务信息
        renderTaskInfo(task);
        
        // 显示对话历史
        renderTaskMessages(task);
        
        // 显示执行记录
        renderExecutionRecords(task);
    } catch (error) {
        console.error('加载任务详情失败:', error);
    }
}

function renderTaskInfo(task) {
    const container = document.getElementById('task-info');
    if (!container) return;
    
    container.innerHTML = `
        <div class="info-item">
            <span class="info-label">标题:</span>
            <span class="info-value">${escapeHtml(task.title)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">描述:</span>
            <span class="info-value">${escapeHtml(task.description)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">状态:</span>
            <span class="status-badge status-${task.status}">${getStatusText(task.status)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">优先级:</span>
            <span class="priority-badge priority-${task.priority}">${getPriorityText(task.priority)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">负责角色:</span>
            <span class="info-value">${task.assignedRole || '未分配'}</span>
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
    `;
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
        <div class="message-item message-${msg.role}">
            <div class="message-role">${msg.role === 'user' ? '👤 用户' : '🤖 助手'}</div>
            <div class="message-content">${escapeHtml(msg.content)}</div>
            <div class="message-time">${formatDate(msg.timestamp)}</div>
        </div>
    `).join('');
    
    // 滚动到底部
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
                <span class="record-role">${record.role}</span>
                <span class="record-action">${escapeHtml(record.action)}</span>
            </div>
            <div class="record-details">
                <div class="record-time">${formatDate(record.startTime)} - ${record.endTime ? formatDate(record.endTime) : '进行中'}</div>
                ${record.duration ? `<div class="record-duration">耗时: ${(record.duration / 1000).toFixed(2)}秒</div>` : ''}
                ${record.model ? `<div class="record-model">模型: ${record.model}</div>` : ''}
                ${record.provider ? `<div class="record-provider">服务商: ${record.provider}</div>` : ''}
                ${record.tokensUsed ? `
                <div class="record-tokens">
                    Tokens: ${record.tokensUsed.totalTokens} 
                    (输入: ${record.tokensUsed.promptTokens}, 输出: ${record.tokensUsed.completionTokens})
                </div>
                ` : ''}
            </div>
            ${record.error ? `<div class="record-error">错误: ${escapeHtml(record.error)}</div>` : ''}
        </div>
    `).join('');
}

// 工具函数
function escapeHtml(text) {
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
    };
    return map[status] || status;
}

function getPriorityText(priority) {
    const map = {
        'low': '低',
        'medium': '中',
        'high': '高',
        'critical': '紧急',
    };
    return map[priority] || priority;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
}

// 导出到全局作用域
window.executeTask = executeTask;
window.deleteTask = deleteTask;
window.refreshTask = refreshTask;
window.executeWorkflow = executeWorkflow;
window.showTaskDetail = showTaskDetail;