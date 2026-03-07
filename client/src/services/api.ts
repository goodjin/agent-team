const API_BASE = '/api';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Tasks API
export const tasksApi = {
  getAll: () => fetchApi<{ tasks: any[] }>('/tasks'),
  getById: (id: string) => fetchApi<{ task: any }>(`/tasks/${id}`),
  create: (data: any) => fetchApi<{ task: any }>('/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => fetchApi<{ task: any }>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => fetchApi<{ success: boolean }>(`/tasks/${id}`, {
    method: 'DELETE',
  }),
  execute: (id: string) => fetchApi<{ result: any }>(`/tasks/${id}/execute`, {
    method: 'POST',
  }),
};

// Agents API
export const agentsApi = {
  getAll: () => fetchApi<{ agents: any[] }>('/agents'),
  getById: (id: string) => fetchApi<{ agent: any }>(`/agents/${id}`),
  create: (data: any) => fetchApi<{ agent: any }>('/agents', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  restart: (id: string) => fetchApi<{ success: boolean }>(`/agents/${id}/restart`, {
    method: 'POST',
  }),
  stop: (id: string) => fetchApi<{ success: boolean }>(`/agents/${id}/stop`, {
    method: 'POST',
  }),
  delete: (id: string) => fetchApi<{ success: boolean }>(`/agents/${id}`, {
    method: 'DELETE',
  }),
};

// Projects API
export const projectsApi = {
  getAll: () => fetchApi<{ projects: any[] }>('/projects'),
  getById: (id: string) => fetchApi<{ project: any }>(`/projects/${id}`),
  create: (data: any) => fetchApi<{ project: any }>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => fetchApi<{ project: any }>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => fetchApi<{ success: boolean }>(`/projects/${id}`, {
    method: 'DELETE',
  }),
};

// Roles API
export const rolesApi = {
  getAll: () => fetchApi<{ roles: any[] }>('/roles'),
  create: (data: any) => fetchApi<{ role: any }>('/roles', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// Health API
export const healthApi = {
  get: () => fetchApi<{ status: string }>('/health'),
};

// Workflows API
export const workflowsApi = {
  getAll: () => fetchApi<{ workflows: any[] }>('/workflows'),
  create: (data: any) => fetchApi<{ workflow: any }>('/workflows', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};
