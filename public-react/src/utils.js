export function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return '刚刚';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const day = Math.floor(h / 24);
  return `${day}天前`;
}

export function getStatusText(status) {
  const map = {
    pending: '等待中',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
  };
  return map[status] || status || '';
}

export function getRoleName(role) {
  const map = {
    'task-master': '主控 Agent',
    'task_master': '主控 Agent',
    'product-manager': '产品经理',
    'architect': '架构师',
    'architecture-designer': '架构设计',
    'backend-dev': '后端开发',
    'frontend-dev': '前端开发',
    'tester': '测试工程师',
    'test-auditor': '测试审计',
    'doc-writer': '文档编写',
    'doc-organizer': '文档整理',
    'dev-plan-builder': '开发计划',
    'prd-builder': '需求文档',
    'github-researcher': 'GitHub 调研',
    'github_researcher': 'GitHub 调研',
    'content-collector': '资料采集',
    'note-taker': '笔记提取',
    'writer': '写作',
    'bugfix': '缺陷修复',
    'task-executor': '任务执行',
    'auto-developer': '自动开发',
    'skill-creator': '技能编写',
    'web_dev': 'Web 开发',
    'webterm-dev': '终端 Web',
    'mem9-recall': '记忆检索',
    'mem9-store': '记忆写入',
    'mem9-setup': '记忆配置',
    'inspiration-capture': '灵感记录',
  };
  return map[role] || role || '';
}

/** 中文称呼 + 英文 id，如：后端开发（backend-dev） */
export function getRoleDisplayLabel(roleId) {
  const id = roleId ? String(roleId) : '';
  const zh = getRoleName(id);
  if (!id) return zh || '成员';
  if (!zh || zh === id) return id;
  return `${zh}（${id}）`;
}

/** 按角色 id 关键字选用图标 */
export function getRoleIcon(roleId) {
  const id = (roleId || '').toLowerCase();
  if (id.includes('master') || id.includes('orchestrator')) return '👑';
  if (id.includes('architect') || id.includes('design')) return '🏗️';
  if (id.includes('product') || id.includes('prd')) return '📋';
  if (id.includes('test')) return '🧪';
  if (id.includes('doc') || id.includes('writer') || id.includes('note')) return '📝';
  if (id.includes('frontend') || id.includes('web') || id.includes('swift')) return '💻';
  if (id.includes('backend')) return '⚙️';
  if (id.includes('dev') || id.includes('executor') || id.includes('auto')) return '🛠️';
  if (id.includes('github') || id.includes('research')) return '🔎';
  if (id.includes('bug')) return '🐛';
  if (id.includes('plan')) return '🗂️';
  if (id.includes('mem')) return '🧠';
  if (id.includes('content') || id.includes('collect')) return '📰';
  if (id.includes('inspiration')) return '💡';
  if (id.includes('skill')) return '🧩';
  return '🤖';
}
