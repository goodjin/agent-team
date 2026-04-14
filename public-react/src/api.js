// API 客户端 - React 版本的 HTTP 请求
const BASE = '/api';

async function api(path, options = {}) {
  const { headers: hdr, ...rest } = options;
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(hdr || {}) },
    ...rest,
  });
  if (!res.ok) {
    let bodySnippet = '';
    try { bodySnippet = (await res.text()).slice(0, 1500); } catch (_) {}
    throw new Error(`API ${res.status} ${res.statusText} ${bodySnippet}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

export const fetchTasks = (filter = 'all') =>
  api(filter === 'all' ? '/tasks' : `/tasks?status=${filter}`);

export const fetchTask = (id) => api(`/tasks/${id}`);

export const fetchTaskLogs = (id, agentId) => {
  const q = agentId ? `?agentId=${encodeURIComponent(agentId)}` : '';
  return api(`/tasks/${id}/logs${q}`);
};

export const fetchTaskMembers = (id) => api(`/tasks/${id}/members`);

/**
 * 主控会话分页：默认最近 50 条；`before` 为完整历史中的切片右端下标（不包含），用于加载更早的 50 条。
 * @param {string} id
 * @param {{ limit?: number; before?: number }} [opts]
 */
export const fetchMasterConversation = (id, opts = {}) => {
  const limit = opts.limit ?? 50;
  const before = opts.before;
  const q = new URLSearchParams();
  q.set('limit', String(limit));
  if (before !== undefined && before !== null && Number.isFinite(Number(before))) {
    q.set('before', String(before));
  }
  return api(`/tasks/${id}/master/conversation?${q}`).then((data) => {
    const raw = data?.messages || [];
    const oldestIndex = typeof data.oldestIndex === 'number' ? data.oldestIndex : 0;
    const messages = raw
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
      .map((m, i) => ({
        role: m.role,
        content: String(m.content || ''),
        _seq: oldestIndex + i,
      }));
    return {
      messages,
      total: typeof data.total === 'number' ? data.total : messages.length,
      hasOlder: !!data.hasOlder,
      oldestIndex,
    };
  });
};

export const fetchSubtasks = (id) => api(`/tasks/${id}/subtasks`);

export const fetchArtifacts = (id) => api(`/tasks/${id}/artifacts`);

export const fetchRoles = () => api('/roles');

export const updateRole = (id, payload) =>
  api(`/roles/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const createRole = (payload) =>
  api('/roles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const deleteRole = (id) =>
  api(`/roles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

export const fetchTools = () => api('/tools');

export const fetchReviewRoleMapping = () => api('/config/review-role-mapping');

export const saveReviewRoleMapping = (payload) =>
  api('/config/review-role-mapping', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const createTask = (payload) =>
  api('/tasks', {
    method: 'POST',
    body: JSON.stringify({ ...payload }),
  });

export const startTask = (id) => api(`/tasks/${id}/start`, { method: 'POST' });

export const pauseTask = (id) => api(`/tasks/${id}/pause`, { method: 'POST' });

export const resumeTask = (id) => api(`/tasks/${id}/resume`, { method: 'POST' });

export const retryTask = (id) => api(`/tasks/${id}/retry`, { method: 'POST' });

export const fetchArtifactContent = (artifactId) =>
  api(`/artifacts/${artifactId}/content`);

export const getArtifactRawUrl = (artifactId) =>
  `${BASE}/artifacts/${encodeURIComponent(artifactId)}/raw`;

export const sendMasterMessage = (taskId, content) =>
  api(`/tasks/${taskId}/master/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });

/** 组织操作台：编排快照（DAG、信箱） */
export const fetchOrchestrationSnapshot = (taskId) =>
  api(`/tasks/${taskId}/orchestration/snapshot`);

/** 运行摘要 / 复盘要点 */
export const fetchTaskPostmortem = (taskId) => api(`/tasks/${taskId}/postmortem`);
