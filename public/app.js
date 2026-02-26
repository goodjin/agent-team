// Agent Team - 任务管理中心前端应用

const API_BASE = '';

// 状态管理
const state = {
  tasks: [],
  currentTask: null,
  currentTab: 'overview',
  filter: 'all',
  loading: false,
  ws: null,
  tabData: {
    logs: [],
    subtasks: [],
    artifacts: []
  }
};

// 日志类型图标映射
const LOG_ICONS = {
  thought: '💭',
  action: '▶️',
  tool_call: '🔧',
  tool_result: '✓',
  milestone: '🏁',
  status_change: '📢',
  error: '❌',
  info: 'ℹ️',
  warning: '⚠️'
};

// 成品类型配置
const ARTIFACT_TYPES = {
  code: { icon: '📄', label: '代码文件' },
  document: { icon: '📝', label: '文档' },
  diagram: { icon: '📊', label: '图表' },
  test: { icon: '🧪', label: '测试' },
  config: { icon: '⚙️', label: '配置' },
  data: { icon: '📦', label: '数据' },
  other: { icon: '📎', label: '其他' }
};

// 工具函数
function $(selector) {
  return document.querySelector(selector);
}

function formatDate(date) {
  return new Date(date).toLocaleString('zh-CN');
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
  return `${Math.floor(seconds / 86400)}天前`;
}

// API 请求
async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

// 获取任务列表
async function fetchTasks() {
  state.loading = true;
  render();
  
  try {
    const params = state.filter !== 'all' ? `?status=${state.filter}` : '';
    state.tasks = await api(`/api/tasks${params}`);
  } catch (e) {
    console.error('Failed to fetch tasks:', e);
  }
  
  state.loading = false;
  render();
}

// 获取任务详情
async function fetchTask(taskId) {
  state.loading = true;
  render();
  
  try {
    state.currentTask = await api(`/api/tasks/${taskId}`);
    state.currentTab = 'overview';
  } catch (e) {
    console.error('Failed to fetch task:', e);
  }
  
  state.loading = false;
  render();
}

// 获取任务日志
async function fetchTaskLogs(taskId) {
  try {
    return await api(`/api/tasks/${taskId}/logs`);
  } catch (e) {
    console.error('Failed to fetch logs:', e);
    return [];
  }
}

// 获取子任务
async function fetchSubtasks(taskId) {
  try {
    return await api(`/api/tasks/${taskId}/subtasks`);
  } catch (e) {
    console.error('Failed to fetch subtasks:', e);
    return [];
  }
}

// 获取成品文件
async function fetchArtifacts(taskId) {
  try {
    return await api(`/api/tasks/${taskId}/artifacts`);
  } catch (e) {
    console.error('Failed to fetch artifacts:', e);
    return [];
  }
}

// 创建任务
async function createTask(title, description) {
  try {
    const task = await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, description })
    });
    state.tasks.unshift(task);
    render();
    return task;
  } catch (e) {
    console.error('Failed to create task:', e);
    throw e;
  }
}

// 启动任务
async function startTask(taskId) {
  try {
    await api(`/api/tasks/${taskId}/start`, { method: 'POST' });
    await fetchTask(taskId);
  } catch (e) {
    console.error('Failed to start task:', e);
  }
}

// 暂停任务
async function pauseTask(taskId) {
  try {
    await api(`/api/tasks/${taskId}/pause`, { method: 'POST' });
    await fetchTask(taskId);
  } catch (e) {
    console.error('Failed to pause task:', e);
  }
}

// 恢复任务
async function resumeTask(taskId) {
  try {
    await api(`/api/tasks/${taskId}/resume`, { method: 'POST' });
    await fetchTask(taskId);
  } catch (e) {
    console.error('Failed to resume task:', e);
  }
}

// 重试任务
async function retryTask(taskId) {
  try {
    await api(`/api/tasks/${taskId}/retry`, { method: 'POST' });
    await fetchTask(taskId);
  } catch (e) {
    console.error('Failed to retry task:', e);
  }
}

// WebSocket 连接
function connectWebSocket(taskId) {
  if (state.ws) {
    state.ws.close();
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${protocol}//${location.host}?taskId=${taskId}`);

  state.ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('WebSocket event:', data);

    handleWebSocketEvent(data);
  };

  state.ws.onerror = (e) => {
    console.error('WebSocket error:', e);
  };

  state.ws.onclose = () => {
    console.log('WebSocket closed');
  };
}

// 处理WebSocket事件
function handleWebSocketEvent(event) {
  const taskId = state.currentTask?.id;

  switch (event.type) {
    case 'status_change':
      if (state.currentTask && state.currentTask.id === event.data.taskId) {
        state.currentTask.status = event.data.newStatus;
        render();
      }
      fetchTasks();
      break;

    case 'log_entry':
      if (taskId && state.currentTab === 'logs') {
        // 追加新日志到列表
        state.tabData.logs.push(event.data);
        appendLogToTimeline(event.data);
        scrollLogsToBottom();
      }
      break;

    case 'artifact_created':
      if (taskId) {
        // 更新成品列表
        if (!state.currentTask.artifacts) {
          state.currentTask.artifacts = [];
        }
        state.currentTask.artifacts.push(event.data);
        // 如果在成品Tab，刷新显示
        if (state.currentTab === 'artifacts') {
          prependArtifact(event.data);
        }
        showNotification('新文件: ' + event.data.name);
      }
      break;

    case 'subtask_created':
      if (taskId && state.currentTab === 'subtasks') {
        state.tabData.subtasks.push(event.data);
        prependSubtask(event.data);
      }
      break;

    case 'progress_update':
      if (state.currentTask && state.currentTask.id === event.data.taskId) {
        state.currentTask.progress = event.data.percent;
        updateProgressBar(event.data.percent, event.data.message);
      }
      break;

    case 'error':
      console.error('Task error:', event.data);
      showNotification('错误: ' + event.data.message, 'error');
      break;

    default:
      console.log('Unknown event type:', event.type);
  }
}

// 辅助函数
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getStatusText(status) {
  const map = {
    pending: '待执行',
    running: '执行中',
    paused: '已暂停',
    completed: '已完成',
    failed: '失败'
  };
  return map[status] || status;
}

function getRoleName(role) {
  const map = {
    'task-analyzer': '任务分析师',
    'product-manager': '产品经理',
    'architect': '架构师',
    'backend-dev': '后端开发',
    'frontend-dev': '前端开发',
    'tester': '测试工程师',
    'doc-writer': '文档编写'
  };
  return map[role] || role;
}

// 获取文件图标
function getFileIcon(type) {
  const icons = {
    code: '📄',
    document: '📝',
    diagram: '📊',
    test: '🧪',
    config: '⚙️',
    data: '📦'
  };
  return icons[type] || '📎';
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 追加日志到时间线
function appendLogToTimeline(log) {
  const timelineEl = document.querySelector('.timeline');
  if (!timelineEl) return;

  // 适配 API 返回字段
  const type = log.type || 'info';
  const icon = log.icon || LOG_ICONS[type] || '•';
  const levelClass = log.level === 'error' ? 'error' : '';
  const content = log.description || log.content || '';
  const metadata = log.metadata || log.details;

  // 判断是否需要渲染 Markdown
  const shouldRenderMd = shouldRenderAsMarkdown(content, type);
  const renderedContent = shouldRenderMd
    ? `<div class="log-markdown markdown-body">${renderMarkdown(content)}</div>`
    : escapeHtml(content);

  const toggleBtn = shouldRenderMd
    ? `<button class="btn-toggle-md" onclick="toggleLogMarkdown(this)" title="切换源码/渲染">📝</button>`
    : '';

  const itemHtml = `
    <div class="timeline-item ${levelClass}" data-id="${log.id}" data-type="${type}">
      <div class="timeline-icon">${icon}</div>
      <div class="timeline-content">
        <div class="timeline-time">${formatDate(log.timestamp)}</div>
        <div class="timeline-type">${type} ${toggleBtn}</div>
        <div class="timeline-desc" data-raw="${escapeHtml(content)}" data-rendered="${shouldRenderMd ? 'true' : 'false'}">
          ${renderedContent}
        </div>
        ${metadata ? renderLogMetadata(metadata, type) : ''}
      </div>
    </div>
  `;

  timelineEl.insertAdjacentHTML('beforeend', itemHtml);
  scrollLogsToBottom();
}

// 渲染日志元数据（工具调用详情）
function renderLogMetadata(metadata, type) {
  if (type === 'tool_call' && metadata.toolName) {
    return `
      <div class="tool-details">
        <div class="tool-name">🔧 ${escapeHtml(metadata.toolName)}</div>
        ${metadata.toolInput ? `<pre class="tool-input"><code>${escapeHtml(JSON.stringify(metadata.toolInput, null, 2))}</code></pre>` : ''}
        ${metadata.duration ? `<div class="tool-duration">⏱️ ${metadata.duration}ms</div>` : ''}
      </div>
    `;
  }
  if (type === 'tool_result' && metadata.toolOutput) {
    return `
      <div class="tool-result">
        <pre class="tool-output"><code>${escapeHtml(typeof metadata.toolOutput === 'string' ? metadata.toolOutput : JSON.stringify(metadata.toolOutput, null, 2))}</code></pre>
      </div>
    `;
  }
  return '';
}

// 滚动日志到底部
function scrollLogsToBottom() {
  const tabContent = document.getElementById('tab-content');
  if (tabContent) {
    tabContent.scrollTop = tabContent.scrollHeight;
  }
}

// 追加成品到列表
function prependArtifact(artifact) {
  const container = document.querySelector('.artifacts-list');
  if (!container) return;

  const itemHtml = renderArtifactItem(artifact);
  container.insertAdjacentHTML('afterbegin', itemHtml);
}

// 渲染单个成品项
function renderArtifactItem(artifact) {
  const icon = getFileIcon(artifact.type);
  return `
    <div class="artifact-item" data-id="${artifact.id}">
      <div class="artifact-icon">${icon}</div>
      <div class="artifact-info">
        <div class="artifact-name">${escapeHtml(artifact.name)}</div>
        <div class="artifact-meta">${formatFileSize(artifact.size)} · ${timeAgo(artifact.createdAt)}</div>
      </div>
      <div class="artifact-actions">
        <button class="btn-icon" onclick="previewArtifact('${artifact.id}')" title="预览">👁</button>
        <button class="btn-icon" onclick="downloadArtifact('${artifact.id}')" title="下载">⬇</button>
      </div>
    </div>
  `;
}

// 追加子任务到列表
function prependSubtask(subtask) {
  const container = document.querySelector('.subtask-list');
  if (!container) return;

  const statusIcon = subtask.status === 'completed' ? '✓' : subtask.status === 'running' ? '●' : '○';
  const itemHtml = `
    <div class="subtask-item" onclick="viewTask('${subtask.id}')">
      <div class="subtask-status ${subtask.status}">${statusIcon}</div>
      <div class="subtask-info">
        <div class="subtask-title">${escapeHtml(subtask.title)}</div>
        <div class="subtask-role">${getRoleName(subtask.role)}</div>
      </div>
      <span class="status-badge ${subtask.status}">${getStatusText(subtask.status)}</span>
    </div>
  `;
  container.insertAdjacentHTML('afterbegin', itemHtml);
}

// 更新进度条
function updateProgressBar(percent, message) {
  const progressEl = document.querySelector('.progress-fill');
  const textEl = document.querySelector('.progress-text');
  if (progressEl) progressEl.style.width = percent + '%';
  if (textEl) textEl.textContent = message || percent + '%';
}

// 显示通知
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <span class="notification-icon">${type === 'error' ? '❌' : type === 'success' ? '✓' : 'ℹ️'}</span>
    <span class="notification-message">${escapeHtml(message)}</span>
  `;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// 预览成品
async function previewArtifact(artifactId) {
  try {
    const artifact = state.currentTask?.artifacts?.find(a => a.id === artifactId);
    if (!artifact) {
      showNotification('文件不存在', 'error');
      return;
    }

    // 获取文件内容
    const response = await api(`/api/artifacts/${artifactId}/content`);
    const content = response.content || response;
    const fileName = artifact.name.toLowerCase();
    const ext = fileName.split('.').pop();

    // 判断文件类型
    const fileInfo = detectFileType(fileName, ext);

    // 构建预览内容
    const contentHtml = buildPreviewContent(artifact, content, fileInfo, artifactId);

    showModal({
      title: artifact.name,
      content: contentHtml,
      actions: [
        { label: '下载', primary: true, onClick: () => downloadArtifact(artifactId) },
        { label: '关闭', onClick: hideModal }
      ]
    });

    // 如果是可渲染类型，初始化渲染
    if (fileInfo.canRender && fileInfo.type !== 'image') {
      setTimeout(() => renderPreviewContent(artifactId, content, fileInfo), 100);
    }
  } catch (e) {
    console.error('Failed to preview artifact:', e);
    showNotification('预览失败: ' + e.message, 'error');
  }
}

// 检测文件类型
function detectFileType(fileName, ext) {
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'];
  const htmlExts = ['html', 'htm'];
  const mdExts = ['md', 'markdown'];
  const jsonExts = ['json', 'jsonc', 'json5'];
  const codeExts = ['js', 'ts', 'jsx', 'tsx', 'css', 'scss', 'sass', 'less', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'sh', 'bash', 'yaml', 'yml', 'xml', 'sql'];
  const textExts = ['txt', 'log', 'csv', 'tsv'];
  const fontExts = ['woff', 'woff2', 'ttf', 'otf', 'eot'];

  if (imageExts.includes(ext)) {
    return { type: 'image', canRender: true, canToggle: false };
  }
  if (htmlExts.includes(ext)) {
    return { type: 'html', canRender: true, canToggle: true };
  }
  if (mdExts.includes(ext)) {
    return { type: 'markdown', canRender: true, canToggle: true };
  }
  if (jsonExts.includes(ext)) {
    return { type: 'json', canRender: true, canToggle: true };
  }
  if (codeExts.includes(ext)) {
    return { type: 'code', canRender: false, canToggle: false, lang: ext };
  }
  if (textExts.includes(ext)) {
    return { type: 'text', canRender: false, canToggle: false };
  }
  if (fontExts.includes(ext)) {
    return { type: 'font', canRender: true, canToggle: false };
  }
  return { type: 'binary', canRender: false, canToggle: false };
}

// 构建预览内容HTML
function buildPreviewContent(artifact, content, fileInfo, artifactId) {
  const fileName = artifact.name;
  const ext = fileName.split('.').pop().toLowerCase();

  // 切换按钮
  const toggleBtn = fileInfo.canToggle ? `
    <div class="preview-toolbar">
      <button class="btn btn-sm" id="preview-toggle-btn" onclick="togglePreviewMode('${artifactId}')">
        <span class="toggle-icon">👁</span>
        <span class="toggle-text">渲染视图</span>
      </button>
    </div>
  ` : '';

  // 预览区域
  let previewArea = '';

  if (fileInfo.type === 'image') {
    previewArea = `
      <div class="preview-image-container">
        <img src="/api/artifacts/${artifactId}/download" alt="${escapeHtml(fileName)}" class="preview-image">
      </div>
    `;
  } else if (fileInfo.type === 'html') {
    previewArea = `
      <div class="preview-container">
        <div id="preview-rendered-${artifactId}" class="preview-rendered" style="display: none;"></div>
        <div id="preview-source-${artifactId}" class="preview-source">
          <pre class="code-preview"><code class="lang-html">${highlightSyntax(escapeHtml(content), 'html')}</code></pre>
        </div>
      </div>
    `;
  } else if (fileInfo.type === 'markdown') {
    previewArea = `
      <div class="preview-container">
        <div id="preview-rendered-${artifactId}" class="preview-rendered markdown-body" style="display: none;"></div>
        <div id="preview-source-${artifactId}" class="preview-source">
          <pre class="code-preview"><code class="lang-markdown">${highlightSyntax(escapeHtml(content), 'markdown')}</code></pre>
        </div>
      </div>
    `;
  } else if (fileInfo.type === 'json') {
    previewArea = `
      <div class="preview-container">
        <div id="preview-rendered-${artifactId}" class="preview-rendered json-viewer" style="display: none;"></div>
        <div id="preview-source-${artifactId}" class="preview-source">
          <pre class="code-preview"><code class="lang-json">${highlightSyntax(escapeHtml(content), 'json')}</code></pre>
        </div>
      </div>
    `;
  } else if (fileInfo.type === 'code') {
    previewArea = `
      <div class="preview-container">
        <pre class="code-preview"><code class="lang-${fileInfo.lang}">${highlightSyntax(escapeHtml(content), fileInfo.lang)}</code></pre>
      </div>
    `;
  } else if (fileInfo.type === 'text') {
    previewArea = `
      <div class="preview-container">
        <pre class="code-preview"><code>${escapeHtml(content)}</code></pre>
      </div>
    `;
  } else if (fileInfo.type === 'font') {
    previewArea = `
      <div class="preview-font-container">
        <div class="font-preview" style="font-family: 'PreviewFont';">
          <div class="font-sample" style="font-size: 48px;">AaBbCc 123 字体预览</div>
          <div class="font-sample" style="font-size: 24px;">The quick brown fox jumps over the lazy dog.</div>
          <div class="font-sample" style="font-size: 16px;">敏捷的棕色狐狸跳过了懒狗。</div>
        </div>
        <style>
          @font-face {
            font-family: 'PreviewFont';
            src: url('/api/artifacts/${artifactId}/download');
          }
        </style>
      </div>
    `;
  } else {
    previewArea = `
      <div class="preview-placeholder">
        <div class="placeholder-icon">📄</div>
        <div class="placeholder-text">此文件类型不支持预览</div>
        <div class="placeholder-hint">文件: ${escapeHtml(fileName)}</div>
        <button class="btn btn-primary" onclick="downloadArtifact('${artifactId}')">下载文件</button>
      </div>
    `;
  }

  return toggleBtn + previewArea;
}

// 渲染预览内容
function renderPreviewContent(artifactId, content, fileInfo) {
  if (fileInfo.type === 'html') {
    const container = document.getElementById(`preview-rendered-${artifactId}`);
    if (container) {
      // 使用 iframe 安全渲染 HTML
      container.innerHTML = `
        <iframe class="html-preview-frame" sandbox="allow-same-origin"></iframe>
      `;
      const iframe = container.querySelector('iframe');
      if (iframe) {
        iframe.srcdoc = content;
      }
    }
  } else if (fileInfo.type === 'markdown') {
    const container = document.getElementById(`preview-rendered-${artifactId}`);
    if (container) {
      container.innerHTML = renderMarkdown(content);
    }
  } else if (fileInfo.type === 'json') {
    const container = document.getElementById(`preview-rendered-${artifactId}`);
    if (container) {
      try {
        const parsed = JSON.parse(content);
        container.innerHTML = renderJsonTree(parsed);
      } catch (e) {
        container.innerHTML = `<pre class="code-preview"><code>${escapeHtml(content)}</code></pre>`;
      }
    }
  }
}

// 切换预览模式
window.previewModes = {};
function togglePreviewMode(artifactId) {
  const rendered = document.getElementById(`preview-rendered-${artifactId}`);
  const source = document.getElementById(`preview-source-${artifactId}`);
  const btn = document.getElementById('preview-toggle-btn');

  if (!rendered || !source) return;

  const currentMode = window.previewModes[artifactId] || 'source';

  if (currentMode === 'source') {
    rendered.style.display = 'block';
    source.style.display = 'none';
    btn.querySelector('.toggle-text').textContent = '源码视图';
    btn.querySelector('.toggle-icon').textContent = '📝';
    window.previewModes[artifactId] = 'rendered';
  } else {
    rendered.style.display = 'none';
    source.style.display = 'block';
    btn.querySelector('.toggle-text').textContent = '渲染视图';
    btn.querySelector('.toggle-icon').textContent = '👁';
    window.previewModes[artifactId] = 'source';
  }
}
window.togglePreviewMode = togglePreviewMode;

// 简单的 Markdown 渲染
function renderMarkdown(text) {
  if (!text) return '';

  let html = escapeHtml(text);

  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre class="md-code-block"><code class="lang-${lang}">${code.trim()}</code></pre>`;
  });

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // 标题
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 粗体和斜体
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // 列表
  html = html.replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // 有序列表
  html = html.replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>');

  // 引用
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // 水平线
  html = html.replace(/^---+$/gm, '<hr>');

  // 段落
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // 清理空段落
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

// 渲染 JSON 树形视图
function renderJsonTree(data, depth = 0) {
  if (depth > 10) return '<span class="json-ellipsis">...</span>';

  const indent = '  '.repeat(depth);
  const nextIndent = '  '.repeat(depth + 1);

  if (data === null) {
    return '<span class="json-null">null</span>';
  }

  if (typeof data === 'boolean') {
    return `<span class="json-boolean">${data}</span>`;
  }

  if (typeof data === 'number') {
    return `<span class="json-number">${data}</span>`;
  }

  if (typeof data === 'string') {
    const escaped = escapeHtml(data);
    if (data.length > 100) {
      return `<span class="json-string">"${escaped.substring(0, 100)}..."</span>`;
    }
    return `<span class="json-string">"${escaped}"</span>`;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return '<span class="json-bracket">[]</span>';
    const items = data.map(item => nextIndent + renderJsonTree(item, depth + 1)).join(',\n');
    return `<span class="json-bracket">[</span>\n${items}\n${indent}<span class="json-bracket">]</span>`;
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return '<span class="json-bracket">{}</span>';
    const items = keys.map(key => {
      const keyHtml = `<span class="json-key">"${escapeHtml(key)}"</span>`;
      return `${nextIndent}${keyHtml}: ${renderJsonTree(data[key], depth + 1)}`;
    }).join(',\n');
    return `<span class="json-bracket">{</span>\n${items}\n${indent}<span class="json-bracket">}</span>`;
  }

  return String(data);
}

// 语法高亮
function highlightSyntax(code, lang) {
  if (!code) return '';

  // 通用高亮
  let highlighted = code;

  if (lang === 'json') {
    highlighted = code
      .replace(/"([^"]+)":/g, '<span class="hl-key">"$1"</span>:')
      .replace(/:\s*"([^"]*)"/g, ': <span class="hl-string">"$1"</span>')
      .replace(/:\s*(\d+\.?\d*)/g, ': <span class="hl-number">$1</span>')
      .replace(/:\s*(true|false|null)/g, ': <span class="hl-boolean">$1</span>');
  } else if (lang === 'html') {
    highlighted = code
      .replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="hl-tag">$2</span>')
      .replace(/([\w-]+)=/g, '<span class="hl-attr">$1</span>=')
      .replace(/"([^"]*)"/g, '<span class="hl-string">"$1"</span>');
  } else if (['js', 'ts', 'jsx', 'tsx'].includes(lang)) {
    highlighted = code
      .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this)\b/g, '<span class="hl-keyword">$1</span>')
      .replace(/"([^"]*)"/g, '<span class="hl-string">"$1"</span>')
      .replace(/'([^']*)'/g, "<span class=\"hl-string\">'$1'</span>")
      .replace(/`([^`]*)`/g, '<span class="hl-string">`$1`</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-number">$1</span>')
      .replace(/\/\/(.*)$/gm, '<span class="hl-comment">//$1</span>')
      .replace(/\/\*[\s\S]*?\*\//g, '<span class="hl-comment">$&</span>');
  } else if (['css', 'scss', 'less'].includes(lang)) {
    highlighted = code
      .replace(/([\w-]+)\s*:/g, '<span class="hl-key">$1</span>:')
      .replace(/:([^;{]+)/g, ': <span class="hl-string">$1</span>')
      .replace(/(#[\da-fA-F]{3,8})\b/g, '<span class="hl-number">$1</span>')
      .replace(/\.( [\w-]+)/g, '.<span class="hl-class">$1</span>');
  } else if (lang === 'markdown') {
    highlighted = code
      .replace(/^(#{1,6})\s+(.+)$/gm, '<span class="hl-keyword">$1</span> <span class="hl-title">$2</span>')
      .replace(/\*\*([^*]+)\*\*/g, '<span class="hl-bold">**$1**</span>')
      .replace(/`([^`]+)`/g, '<span class="hl-string">`$1`</span>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="hl-link">[$1]($2)</span>');
  }

  return highlighted;
}

// 下载成品
async function downloadArtifact(artifactId) {
  try {
    const response = await fetch(`${API_BASE}/api/artifacts/${artifactId}/download`);
    if (!response.ok) throw new Error('Download failed');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // 从响应头或artifact信息获取文件名
    const artifact = state.currentTask?.artifacts?.find(a => a.id === artifactId);
    a.download = artifact?.name || 'download';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Failed to download artifact:', e);
    showNotification('下载失败: ' + e.message, 'error');
  }
}

// 模态框函数
let modalCallback = null;

function showModal({ title, content, actions }) {
  modalCallback = hideModal;

  let actionsHtml = actions.map((action, index) => `
    <button class="btn ${action.primary ? 'btn-success' : ''}" onclick="handleModalAction(${index})">${action.label}</button>
  `).join('');

  const modalHtml = `
    <div class="modal-overlay" id="modal-overlay" onclick="hideModal()">
      <div class="modal modal-large" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title">${escapeHtml(title)}</h3>
          <button class="modal-close" onclick="hideModal()">×</button>
        </div>
        <div class="modal-body">
          ${content}
        </div>
        <div class="modal-footer">
          ${actionsHtml}
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // 保存回调
  window.modalActions = actions;
}

function hideModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.remove();
  window.modalActions = null;
}

function handleModalAction(index) {
  if (window.modalActions && window.modalActions[index]) {
    window.modalActions[index].onClick();
  }
}

// 渲染任务列表页
function renderTaskList() {
  const filteredTasks = state.filter === 'all' 
    ? state.tasks 
    : state.tasks.filter(t => t.status === state.filter);

  let html = `
    <div class="header">
      <h1>🤖 Agent Team</h1>
      <div class="header-status">
        <span class="status-dot"></span>
        <span>系统在线</span>
      </div>
    </div>
    
    <div class="container">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <h2 class="page-title">任务列表</h2>
        <button class="btn-primary" onclick="showCreateModal()">
          <span>+</span> 新建任务
        </button>
      </div>
      
      <div class="filter-bar">
        <button class="filter-btn ${state.filter === 'all' ? 'active' : ''}" onclick="setFilter('all')">全部</button>
        <button class="filter-btn ${state.filter === 'pending' ? 'active' : ''}" onclick="setFilter('pending')">待执行</button>
        <button class="filter-btn ${state.filter === 'running' ? 'active' : ''}" onclick="setFilter('running')">执行中</button>
        <button class="filter-btn ${state.filter === 'completed' ? 'active' : ''}" onclick="setFilter('completed')">已完成</button>
        <button class="filter-btn ${state.filter === 'failed' ? 'active' : ''}" onclick="setFilter('failed')">失败</button>
      </div>
  `;

  if (state.loading) {
    html += `<div class="loading"><div class="spinner"></div></div>`;
  } else if (filteredTasks.length === 0) {
    html += `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">暂无任务</div>
      </div>
    `;
  } else {
    html += `<div class="task-list">`;
    for (const task of filteredTasks) {
      html += `
        <div class="task-card status-${task.status}" onclick="viewTask('${task.id}')">
          <div class="task-card-header">
            <div class="task-card-title">${escapeHtml(task.title)}</div>
            <span class="status-badge ${task.status}">${getStatusText(task.status)}</span>
          </div>
          <div class="task-card-desc">${escapeHtml(task.description || '')}</div>
          <div class="task-card-meta">
            <span class="role-badge">👤 ${getRoleName(task.role)}</span>
            <span>⏰ ${timeAgo(task.createdAt)}</span>
          </div>
        </div>
      `;
    }
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

// 渲染任务详情页
function renderTaskDetail() {
  const task = state.currentTask;
  if (!task) return renderTaskList();

  let html = `
    <div class="header">
      <h1>🤖 Agent Team</h1>
      <button class="btn" onclick="goBack()">← 返回列表</button>
    </div>
    
    <div class="container">
      <div class="task-detail">
        <div class="task-detail-header">
          <h2 class="task-detail-title">${escapeHtml(task.title)}</h2>
          <div class="task-detail-meta">
            <span class="status-badge ${task.status}">${getStatusText(task.status)}</span>
            <span class="role-badge">👤 ${getRoleName(task.role)}</span>
            <span>创建: ${formatDate(task.createdAt)}</span>
            ${task.completedAt ? `<span>完成: ${formatDate(task.completedAt)}</span>` : ''}
          </div>
          
          <div class="task-actions">
            ${task.status === 'pending' ? `<button class="btn btn-success" onclick="startTask('${task.id}')">▶ 开始执行</button>` : ''}
            ${task.status === 'running' ? `<button class="btn btn-warning" onclick="pauseTask('${task.id}')">⏸ 暂停</button>` : ''}
            ${task.status === 'paused' ? `<button class="btn btn-success" onclick="resumeTask('${task.id}')">▶ 继续</button>` : ''}
            ${task.status === 'failed' ? `<button class="btn btn-danger" onclick="retryTask('${task.id}')">↻ 重试</button>` : ''}
          </div>
        </div>
        
        <div class="tabs">
          <div class="tab ${state.currentTab === 'overview' ? 'active' : ''}" onclick="setTab('overview')">📋 概览</div>
          <div class="tab ${state.currentTab === 'logs' ? 'active' : ''}" onclick="setTab('logs')">📝 执行日志</div>
          <div class="tab ${state.currentTab === 'subtasks' ? 'active' : ''}" onclick="setTab('subtasks')">🔀 子任务</div>
          <div class="tab ${state.currentTab === 'artifacts' ? 'active' : ''}" onclick="setTab('artifacts')">📦 成品</div>
        </div>
        
        <div class="tab-content" id="tab-content">
          ${renderTabContentSync()}
        </div>
      </div>
    </div>
  `;

  return html;
}

// 同步渲染标签页内容
function renderTabContentSync() {
  const task = state.currentTask;
  if (!task) return '';

  if (state.currentTab === 'overview') {
    return renderOverviewContent(task);
  }

  if (state.currentTab === 'logs') {
    // 异步加载日志
    fetchTaskLogs(task.id).then(logs => {
      state.tabData.logs = logs;
      const el = document.getElementById('tab-content');
      if (el && state.currentTab === 'logs') {
        el.innerHTML = renderLogsContent(logs);
        scrollLogsToBottom();
      }
    });
    return `<div class="loading"><div class="spinner"></div></div>`;
  }

  if (state.currentTab === 'subtasks') {
    // 异步加载子任务
    fetchSubtasks(task.id).then(subtasks => {
      state.tabData.subtasks = subtasks;
      const el = document.getElementById('tab-content');
      if (el && state.currentTab === 'subtasks') {
        el.innerHTML = renderSubtasksContent(subtasks);
      }
    });
    return `<div class="loading"><div class="spinner"></div></div>`;
  }

  if (state.currentTab === 'artifacts') {
    // 异步加载成品
    fetchArtifacts(task.id).then(artifacts => {
      state.currentTask.artifacts = artifacts;
      const el = document.getElementById('tab-content');
      if (el && state.currentTab === 'artifacts') {
        el.innerHTML = renderArtifactsContent(artifacts);
      }
    });
    return `<div class="loading"><div class="spinner"></div></div>`;
  }

  return '';
}

// 渲染概览内容
function renderOverviewContent(task) {
  const progress = task.progress || 0;
  return `
    <div class="overview-section">
      <div class="form-group">
        <label class="form-label">任务描述</label>
        <p class="task-description">${escapeHtml(task.description || '无描述')}</p>
      </div>
      <div class="form-group">
        <label class="form-label">执行进度</label>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <span class="progress-text">${progress}%</span>
      </div>
      ${task.artifacts?.length > 0 ? `
      <div class="form-group">
        <label class="form-label">产出文件 (${task.artifacts.length})</label>
        <div class="artifacts-mini-list">
          ${task.artifacts.slice(0, 5).map(a => `
            <div class="artifact-mini-item">
              <span>${getFileIcon(a.type)}</span>
              <span>${escapeHtml(a.name)}</span>
            </div>
          `).join('')}
          ${task.artifacts.length > 5 ? `<div class="more-artifacts">+${task.artifacts.length - 5} 更多</div>` : ''}
        </div>
      </div>
      ` : ''}
    </div>
  `;
}

// 渲染日志内容（增强版，支持工具调用格式化）
function renderLogsContent(logs) {
  if (!logs || logs.length === 0) {
    return `<div class="empty-state"><div class="empty-state-text">暂无执行日志</div></div>`;
  }

  let html = `<div class="timeline">`;
  for (const log of logs) {
    // 适配 API 返回字段：description, details, icon
    const type = log.type || 'info';
    const icon = log.icon || LOG_ICONS[type] || '•';
    const levelClass = log.level === 'error' ? 'error' : log.level === 'warning' ? 'warning' : '';
    const isToolCall = type === 'tool_call';
    const isToolResult = type === 'tool_result';
    const metadata = log.metadata || log.details;
    const hasMetadata = metadata && (isToolCall || isToolResult);
    const content = log.description || log.content || '';

    // 判断是否需要渲染 Markdown
    const shouldRenderMarkdown = shouldRenderAsMarkdown(content, type);

    // 渲染内容
    let renderedContent;
    if (shouldRenderMarkdown) {
      renderedContent = `<div class="log-markdown markdown-body">${renderMarkdown(content)}</div>`;
    } else {
      renderedContent = escapeHtml(content);
    }

    html += `
      <div class="timeline-item ${levelClass}" data-id="${log.id}" data-type="${type}">
        <div class="timeline-marker">
          <div class="timeline-icon">${icon}</div>
          <div class="timeline-line"></div>
        </div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="timeline-time">${formatDate(log.timestamp)}</span>
            <span class="timeline-badge ${type}">${type}</span>
            ${log.level && log.level !== 'info' ? `<span class="level-badge ${log.level}">${log.level}</span>` : ''}
            ${shouldRenderMarkdown ? `<button class="btn-toggle-md" onclick="toggleLogMarkdown(this)" title="切换源码/渲染">📝</button>` : ''}
          </div>
          <div class="timeline-body" data-raw="${escapeHtml(content)}" data-rendered="${shouldRenderMarkdown ? 'true' : 'false'}">
            ${renderedContent}
          </div>
          ${hasMetadata ? renderLogMetadataPanel(metadata, type) : ''}
        </div>
      </div>
    `;
  }
  html += `</div>`;
  return html;
}

// 判断内容是否应该渲染为 Markdown
function shouldRenderAsMarkdown(content, type) {
  if (!content || typeof content !== 'string') return false;

  // thought 和 milestone 类型的日志通常包含 Markdown
  const mdTypes = ['thought', 'milestone', 'action'];
  if (!mdTypes.includes(type)) return false;

  // 检测 Markdown 特征
  const mdPatterns = [
    /^#{1,6}\s/m,           // 标题
    /\*\*.+?\*\*/,          // 粗体
    /^\s*[-*+]\s/m,         // 无序列表
    /^\s*\d+\.\s/m,         // 有序列表
    /^\|.*\|/m,             // 表格
    /\[.+?\]\(.+?\)/,       // 链接
    /```[\s\S]*?```/,       // 代码块
    /^>\s/m,                // 引用
    /---+/,                 // 分隔线
  ];

  let matchCount = 0;
  for (const pattern of mdPatterns) {
    if (pattern.test(content)) {
      matchCount++;
    }
  }

  // 至少匹配2个 Markdown 特征才渲染
  return matchCount >= 2;
}

// 切换日志的 Markdown 渲染/源码显示
function toggleLogMarkdown(btn) {
  const body = btn.closest('.timeline-content').querySelector('.timeline-body');
  if (!body) return;

  const isRendered = body.dataset.rendered === 'true';
  const rawContent = body.dataset.raw;

  if (isRendered) {
    // 切换到源码
    body.innerHTML = escapeHtml(unescapeHtml(rawContent));
    body.dataset.rendered = 'false';
    btn.textContent = '👁';
    btn.title = '切换渲染/源码';
  } else {
    // 切换到渲染
    body.innerHTML = `<div class="log-markdown markdown-body">${renderMarkdown(unescapeHtml(rawContent))}</div>`;
    body.dataset.rendered = 'true';
    btn.textContent = '📝';
    btn.title = '切换源码/渲染';
  }
}
window.toggleLogMarkdown = toggleLogMarkdown;

// HTML 反转义
function unescapeHtml(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

// 渲染日志元数据面板（工具调用详情）
function renderLogMetadataPanel(metadata, type) {
  if (type === 'tool_call' && metadata.toolName) {
    const inputStr = typeof metadata.toolInput === 'object'
      ? JSON.stringify(metadata.toolInput, null, 2)
      : String(metadata.toolInput || '');

    return `
      <div class="tool-call-panel">
        <div class="tool-call-header">
          <span class="tool-icon">🔧</span>
          <span class="tool-name">${escapeHtml(metadata.toolName)}</span>
          ${metadata.duration ? `<span class="tool-duration">⏱️ ${metadata.duration}ms</span>` : ''}
        </div>
        ${metadata.toolInput ? `
        <div class="tool-section">
          <div class="tool-section-title">输入参数</div>
          <pre class="tool-code"><code>${formatCodeContent(inputStr)}</code></pre>
        </div>
        ` : ''}
      </div>
    `;
  }

  if (type === 'tool_result' && metadata.toolOutput !== undefined) {
    const outputStr = typeof metadata.toolOutput === 'object'
      ? JSON.stringify(metadata.toolOutput, null, 2)
      : String(metadata.toolOutput);

    return `
      <div class="tool-result-panel">
        <div class="tool-section">
          <div class="tool-section-title">执行结果</div>
          <pre class="tool-code ${detectContentType(outputStr)}"><code>${formatCodeContent(outputStr)}</code></pre>
        </div>
      </div>
    `;
  }

  if (metadata.filePath) {
    return `
      <div class="file-ref">
        <span class="file-icon">📄</span>
        <span class="file-path">${escapeHtml(metadata.filePath)}</span>
      </div>
    `;
  }

  return '';
}

// 检测内容类型
function detectContentType(content) {
  if (typeof content !== 'string') return '';
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (trimmed.startsWith('<')) return 'xml';
  if (trimmed.includes('function') || trimmed.includes('const ') || trimmed.includes('import ')) return 'code';
  return '';
}

// 格式化代码内容（添加简单语法高亮）
function formatCodeContent(content) {
  if (typeof content !== 'string') return escapeHtml(String(content));

  let escaped = escapeHtml(content);

  // JSON 高亮
  try {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const parsed = JSON.parse(trimmed);
      escaped = escapeHtml(JSON.stringify(parsed, null, 2));
    }
  } catch (e) {
    // 不是有效的 JSON，使用原始内容
  }

  // 简单的关键字高亮
  escaped = escaped
    // 字符串值（双引号内容）
    .replace(/"([^"]+)":/g, '<span class="hl-key">"$1"</span>:')
    // 字符串值
    .replace(/:\s*"([^"]*)"/g, ': <span class="hl-string">"$1"</span>')
    // 数字
    .replace(/:\s*(\d+\.?\d*)/g, ': <span class="hl-number">$1</span>')
    // 布尔值
    .replace(/:\s*(true|false|null)/g, ': <span class="hl-boolean">$1</span>')
    // 错误关键字
    .replace(/\b(Error|error|ERROR|Failed|failed|FAILED)\b/g, '<span class="hl-error">$1</span>')
    // 路径
    .replace(/(\/[\w\-\.\/]+)/g, '<span class="hl-path">$1</span>');

  return escaped;
}

function renderSubtasksContent(subtasks) {
  if (!subtasks || subtasks.length === 0) {
    return `<div class="empty-state"><div class="empty-state-text">暂无子任务</div></div>`;
  }

  let html = `<div class="subtask-list">`;
  for (const st of subtasks) {
    const statusIcon = st.status === 'completed' ? '✓' : st.status === 'running' ? '●' : '○';
    html += `
      <div class="subtask-item" onclick="viewTask('${st.id}')">
        <div class="subtask-status ${st.status}">${statusIcon}</div>
        <div class="subtask-info">
          <div class="subtask-title">${escapeHtml(st.title)}</div>
          <div class="subtask-role">${getRoleName(st.role)}</div>
        </div>
        <span class="status-badge ${st.status}">${getStatusText(st.status)}</span>
      </div>
    `;
  }
  html += `</div>`;
  return html;
}

// 渲染成品内容
function renderArtifactsContent(artifacts) {
  if (!artifacts || artifacts.length === 0) {
    return `<div class="empty-state"><div class="empty-state-text">暂无成品文件</div></div>`;
  }

  // 按类型分组
  const grouped = {};
  for (const artifact of artifacts) {
    const type = artifact.type || 'other';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(artifact);
  }

  let html = `<div class="artifacts-section">`;

  // 工具栏
  html += `
    <div class="artifacts-toolbar">
      <div class="artifacts-stats">
        共 ${artifacts.length} 个文件
      </div>
      <button class="btn" onclick="downloadAllArtifacts()">
        📦 打包下载
      </button>
    </div>
  `;

  // 按类型分组显示
  for (const [type, items] of Object.entries(grouped)) {
    const config = ARTIFACT_TYPES[type] || ARTIFACT_TYPES.other;
    html += `
      <div class="artifact-group">
        <h4 class="artifact-group-title">
          <span class="group-icon">${config.icon}</span>
          ${config.label}
          <span class="group-count">(${items.length})</span>
        </h4>
        <div class="artifacts-list">
          ${items.map(a => renderArtifactItem(a)).join('')}
        </div>
      </div>
    `;
  }

  html += `</div>`;
  return html;
}

// 下载所有成品
async function downloadAllArtifacts() {
  const artifacts = state.currentTask?.artifacts;
  if (!artifacts || artifacts.length === 0) {
    showNotification('没有可下载的文件', 'warning');
    return;
  }

  showNotification('正在准备打包下载...', 'info');

  try {
    const response = await fetch(`${API_BASE}/api/tasks/${state.currentTask.id}/artifacts/download-all`, {
      method: 'POST'
    });

    if (!response.ok) throw new Error('打包下载失败');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `task-${state.currentTask.id}-artifacts.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showNotification('下载已开始', 'success');
  } catch (e) {
    console.error('Failed to download all artifacts:', e);
    showNotification('打包下载失败: ' + e.message, 'error');
  }
}

// 创建任务模态框状态
let createModalVisible = false;

// 模态框相关函数
function showCreateModal() {
  createModalVisible = true;
  render();
}

function hideCreateModal() {
  createModalVisible = false;
  render();
}

function renderCreateModal() {
  if (!createModalVisible) return '';
  
  return `
    <div class="modal-overlay" onclick="hideCreateModal()">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title">新建任务</h3>
          <button class="modal-close" onclick="hideCreateModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">任务标题</label>
            <input type="text" class="form-input" id="task-title" placeholder="输入任务标题">
          </div>
          <div class="form-group">
            <label class="form-label">任务描述</label>
            <textarea class="form-input" id="task-desc" placeholder="详细描述任务内容..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="hideCreateModal()">取消</button>
          <button class="btn btn-success" onclick="submitCreateTask()">创建</button>
        </div>
      </div>
    </div>
  `;
}

async function submitCreateTask() {
  const titleEl = document.getElementById('task-title');
  const descEl = document.getElementById('task-desc');
  
  const title = titleEl ? titleEl.value.trim() : '';
  const description = descEl ? descEl.value.trim() : '';
  
  if (!title) {
    alert('请输入任务标题');
    return;
  }
  
  try {
    const task = await createTask(title, description);
    hideCreateModal();
    viewTask(task.id);
  } catch (e) {
    alert('创建任务失败: ' + e.message);
  }
}

// 导航函数 - 暴露到全局
window.setFilter = function(filter) {
  state.filter = filter;
  fetchTasks();
};

window.setTab = function(tab) {
  state.currentTab = tab;
  updateUrl();
  render();
};

window.viewTask = function(taskId) {
  // 获取任务详情
  (async () => {
    state.loading = true;
    render();

    try {
      state.currentTask = await api(`/api/tasks/${taskId}`);
      state.currentTab = 'overview';
      updateUrl();
      connectWebSocket(taskId);
    } catch (e) {
      console.error('Failed to fetch task:', e);
    }

    state.loading = false;
    render();
  })();
};

window.goBack = function() {
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  state.currentTask = null;
  state.currentTab = 'overview';
  updateUrl();
  render();
};

// ========== URL 状态管理 ==========

// 更新 URL
function updateUrl() {
  const params = new URLSearchParams();

  if (state.currentTask) {
    params.set('task', state.currentTask.id);
    if (state.currentTab && state.currentTab !== 'overview') {
      params.set('tab', state.currentTab);
    }
  }

  if (state.filter && state.filter !== 'all') {
    params.set('filter', state.filter);
  }

  const newUrl = params.toString() ? `${location.pathname}?${params.toString()}` : location.pathname;
  history.replaceState(null, '', newUrl);
}

// 从 URL 恢复状态
function restoreFromUrl() {
  const params = new URLSearchParams(location.search);

  const taskId = params.get('task');
  const tab = params.get('tab');
  const filter = params.get('filter');

  // 恢复过滤器
  if (filter && ['all', 'running', 'completed', 'failed', 'paused'].includes(filter)) {
    state.filter = filter;
  }

  // 恢复任务视图
  if (taskId) {
    state.currentTab = tab || 'overview';
    return taskId;
  }

  return null;
}

// 监听浏览器前进/后退
window.addEventListener('popstate', () => {
  const taskId = restoreFromUrl();
  if (taskId) {
    // 不更新 URL，只恢复状态
    (async () => {
      try {
        state.currentTask = await api(`/api/tasks/${taskId}`);
        connectWebSocket(taskId);
      } catch (e) {
        console.error('Failed to restore task:', e);
        state.currentTask = null;
      }
      render();
    })();
  } else {
    if (state.ws) {
      state.ws.close();
      state.ws = null;
    }
    state.currentTask = null;
    state.currentTab = 'overview';
    render();
  }
});

window.showCreateModal = showCreateModal;
window.hideCreateModal = hideCreateModal;
window.submitCreateTask = submitCreateTask;
window.startTask = startTask;
window.pauseTask = pauseTask;
window.resumeTask = resumeTask;
window.retryTask = retryTask;
window.previewArtifact = previewArtifact;
window.downloadArtifact = downloadArtifact;
window.downloadAllArtifacts = downloadAllArtifacts;
window.handleModalAction = handleModalAction;

// 主渲染函数
function render() {
  const modal = renderCreateModal();

  // 两栏布局：左侧任务列表 + 右侧任务详情
  const html = `
    <div class="app-layout">
      <!-- 左侧：任务列表 -->
      <aside class="sidebar">
        ${renderSidebar()}
      </aside>

      <!-- 右侧：任务详情 -->
      <main class="main-content">
        ${state.currentTask ? renderTaskDetailPanel() : renderEmptyDetail()}
      </main>
    </div>
    ${modal}
  `;

  document.getElementById('app').innerHTML = html;

  // 如果是详情页，异步加载标签页内容
  if (state.currentTask && state.currentTab !== 'overview') {
    renderTabContentSync();
  }
}

// 渲染侧边栏
function renderSidebar() {
  const filteredTasks = state.filter === 'all'
    ? state.tasks
    : state.tasks.filter(t => t.status === state.filter);

  return `
    <div class="sidebar-header">
      <h1 class="sidebar-title">🤖 Agent Team</h1>
      <button class="btn-create" onclick="showCreateModal()" title="新建任务">+</button>
    </div>

    <div class="filter-tabs">
      <button class="filter-tab ${state.filter === 'all' ? 'active' : ''}" onclick="setFilter('all')">全部</button>
      <button class="filter-tab ${state.filter === 'running' ? 'active' : ''}" onclick="setFilter('running')">执行中</button>
      <button class="filter-tab ${state.filter === 'completed' ? 'active' : ''}" onclick="setFilter('completed')">已完成</button>
      <button class="filter-tab ${state.filter === 'failed' ? 'active' : ''}" onclick="setFilter('failed')">失败</button>
    </div>

    <div class="task-list-container">
      ${state.loading ? `
        <div class="loading"><div class="spinner"></div></div>
      ` : filteredTasks.length === 0 ? `
        <div class="empty-sidebar">
          <div class="empty-icon">📋</div>
          <div class="empty-text">暂无任务</div>
        </div>
      ` : filteredTasks.map(task => `
        <div class="task-item ${state.currentTask?.id === task.id ? 'active' : ''} status-${task.status}"
             onclick="viewTask('${task.id}')">
          <div class="task-item-header">
            <span class="task-item-title">${escapeHtml(task.title)}</span>
            <span class="status-dot ${task.status}"></span>
          </div>
          <div class="task-item-meta">
            <span class="role-tag">${getRoleName(task.role)}</span>
            <span class="time-tag">${timeAgo(task.createdAt)}</span>
          </div>
          ${task.progress !== undefined && task.progress > 0 ? `
          <div class="task-item-progress">
            <div class="progress-mini-bar">
              <div class="progress-mini-fill" style="width: ${task.progress}%"></div>
            </div>
            <span class="progress-mini-text">${task.progress}%</span>
          </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

// 渲染空详情
function renderEmptyDetail() {
  return `
    <div class="empty-detail">
      <div class="empty-detail-icon">👈</div>
      <div class="empty-detail-title">选择一个任务</div>
      <div class="empty-detail-text">从左侧列表中选择一个任务查看详情</div>
      <button class="btn btn-primary btn-lg" onclick="showCreateModal()">
        + 创建新任务
      </button>
    </div>
  `;
}

// 渲染任务详情面板
function renderTaskDetailPanel() {
  const task = state.currentTask;
  if (!task) return renderEmptyDetail();

  return `
    <div class="detail-panel">
      <div class="detail-header">
        <div class="detail-title-row">
          <h2 class="detail-title">${escapeHtml(task.title)}</h2>
          <span class="status-badge large ${task.status}">${getStatusText(task.status)}</span>
        </div>
        <div class="detail-meta-row">
          <span class="meta-item">
            <span class="meta-icon">👤</span>
            <span>${getRoleName(task.role)}</span>
          </span>
          <span class="meta-item">
            <span class="meta-icon">📅</span>
            <span>创建: ${formatDate(task.createdAt)}</span>
          </span>
          ${task.completedAt ? `
          <span class="meta-item">
            <span class="meta-icon">✅</span>
            <span>完成: ${formatDate(task.completedAt)}</span>
          </span>
          ` : ''}
        </div>
        <div class="detail-actions">
          ${task.status === 'pending' ? `<button class="btn btn-success" onclick="startTask('${task.id}')">▶ 开始执行</button>` : ''}
          ${task.status === 'running' ? `<button class="btn btn-warning" onclick="pauseTask('${task.id}')">⏸ 暂停</button>` : ''}
          ${task.status === 'paused' ? `<button class="btn btn-success" onclick="resumeTask('${task.id}')">▶ 继续</button>` : ''}
          ${task.status === 'failed' ? `<button class="btn btn-danger" onclick="retryTask('${task.id}')">↻ 重试</button>` : ''}
        </div>
      </div>

      <div class="tabs">
        <div class="tab ${state.currentTab === 'overview' ? 'active' : ''}" onclick="setTab('overview')">📋 概览</div>
        <div class="tab ${state.currentTab === 'logs' ? 'active' : ''}" onclick="setTab('logs')">📝 执行日志</div>
        <div class="tab ${state.currentTab === 'subtasks' ? 'active' : ''}" onclick="setTab('subtasks')">🔀 子任务</div>
        <div class="tab ${state.currentTab === 'artifacts' ? 'active' : ''}" onclick="setTab('artifacts')">📦 成品</div>
      </div>

      <div class="tab-content" id="tab-content">
        ${renderTabContentSync()}
      </div>
    </div>
  `;
}

// 初始化
async function init() {
  // 先获取任务列表
  await fetchTasks();

  // 从 URL 恢复状态
  const taskId = restoreFromUrl();
  if (taskId) {
    // 静默加载任务详情（不更新 URL）
    try {
      state.currentTask = await api(`/api/tasks/${taskId}`);
      connectWebSocket(taskId);
    } catch (e) {
      console.error('Failed to restore task from URL:', e);
      state.currentTask = null;
    }
    render();
  }
}

// 启动应用
init();
