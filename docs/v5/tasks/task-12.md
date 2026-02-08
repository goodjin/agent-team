# Task 12: 实现用户界面

**优先级**: P1
**预计工时**: 16 小时
**依赖**: 任务 10, 任务 11
**状态**: 待执行

---

## 目标

1. 实现任务列表界面
2. 实现任务详情界面
3. 实现 Agent 列表展示
4. 实现 Agent 对话界面
5. 实现实时状态更新（SSE）

---

## 输入

- MasterAgent: `src/ai/master-agent.ts`
- PromptLoader: `src/prompts/loader.ts`
- 需求文档：`docs/v5/01-requirements.md`

---

## 输出

- `src/ui/pages/TaskList.tsx`
- `src/ui/pages/TaskDetail.tsx`
- `src/ui/components/AgentList.tsx`
- `src/ui/components/AgentChat.tsx`
- `src/server/routes/tasks.ts`（SSE 支持）

---

## 实现步骤

### 步骤 1: 实现任务列表界面

创建 `src/ui/pages/TaskList.tsx`：

```typescript
import React, { useState, useEffect } from 'react';
import { Task, TaskStatus } from '../../types/task';
import { apiClient } from '../utils/api-client';

interface TaskListProps {
  onTaskSelect: (taskId: string) => void;
}

export const TaskList: React.FC<TaskListProps> = ({ onTaskSelect }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/tasks');
      setTasks(response.data.tasks);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'all') return true;
    return task.status === filter;
  });

  const groupedTasks = {
    pending: filteredTasks.filter((t) => t.status === 'pending'),
    running: filteredTasks.filter((t) => t.status === 'running'),
    completed: filteredTasks.filter((t) => t.status === 'completed'),
    failed: filteredTasks.filter((t) => t.status === 'failed'),
  };

  return (
    <div className="task-list">
      <div className="task-list-header">
        <h2>Tasks</h2>
        <button onClick={loadTasks} className="refresh-btn">
          Refresh
        </button>
      </div>

      <div className="task-filter">
        <button
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All ({tasks.length})
        </button>
        <button
          className={filter === 'pending' ? 'active' : ''}
          onClick={() => setFilter('pending')}
        >
          Pending ({groupedTasks.pending.length})
        </button>
        <button
          className={filter === 'running' ? 'active' : ''}
          onClick={() => setFilter('running')}
        >
          Running ({groupedTasks.running.length})
        </button>
        <button
          className={filter === 'completed' ? 'active' : ''}
          onClick={() => setFilter('completed')}
        >
          Completed ({groupedTasks.completed.length})
        </button>
        <button
          className={filter === 'failed' ? 'active' : ''}
          onClick={() => setFilter('failed')}
        >
          Failed ({groupedTasks.failed.length})
        </button>
      </div>

      <div className="task-groups">
        {loading ? (
          <div className="loading">Loading tasks...</div>
        ) : (
          <>
            {filter === 'all' && (
              <>
                <TaskGroup
                  title="Running"
                  tasks={groupedTasks.running}
                  onTaskSelect={onTaskSelect}
                />
                <TaskGroup
                  title="Pending"
                  tasks={groupedTasks.pending}
                  onTaskSelect={onTaskSelect}
                />
                <TaskGroup
                  title="Completed"
                  tasks={groupedTasks.completed}
                  onTaskSelect={onTaskSelect}
                />
                <TaskGroup
                  title="Failed"
                  tasks={groupedTasks.failed}
                  onTaskSelect={onTaskSelect}
                />
              </>
            )}
            {filter !== 'all' && (
              <TaskGroup
                title={filter.charAt(0).toUpperCase() + filter.slice(1)}
                tasks={filteredTasks}
                onTaskSelect={onTaskSelect}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

interface TaskGroupProps {
  title: string;
  tasks: Task[];
  onTaskSelect: (taskId: string) => void;
}

const TaskGroup: React.FC<TaskGroupProps> = ({ title, tasks, onTaskSelect }) => {
  if (tasks.length === 0) return null;

  return (
    <div className="task-group">
      <h3>{title}</h3>
      <div className="task-items">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} onClick={() => onTaskSelect(task.id)} />
        ))}
      </div>
    </div>
  );
};

interface TaskItemProps {
  task: Task;
  onClick: () => void;
}

const TaskItem: React.FC<TaskItemProps> = ({ task, onClick }) => {
  const statusIcon = {
    pending: '⏸️',
    running: '▶️',
    completed: '✅',
    failed: '❌',
  }[task.status];

  return (
    <div className={`task-item status-${task.status}`} onClick={onClick}>
      <div className="task-status">{statusIcon}</div>
      <div className="task-content">
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          <span className="task-id">{task.id}</span>
          <span className="task-time">
            {new Date(task.createdAt).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};
```

### 步骤 2: 实现任务详情界面

创建 `src/ui/pages/TaskDetail.tsx`：

```typescript
import React, { useState, useEffect } from 'react';
import { Task, SubTask } from '../../types/task';
import { AgentList } from '../components/AgentList';
import { apiClient } from '../utils/api-client';

interface TaskDetailProps {
  taskId: string;
}

export const TaskDetail: React.FC<TaskDetailProps> = ({ taskId }) => {
  const [task, setTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTaskDetail();

    // 订阅实时更新
    const eventSource = new EventSource(`/api/tasks/${taskId}/events`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleUpdate(data);
    };

    return () => {
      eventSource.close();
    };
  }, [taskId]);

  const loadTaskDetail = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/api/tasks/${taskId}`);
      setTask(response.data.task);
      setSubtasks(response.data.subtasks || []);
    } catch (error) {
      console.error('Failed to load task detail:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = (data: any) => {
    if (data.type === 'task:updated') {
      setTask(data.task);
    } else if (data.type === 'subtask:updated') {
      setSubtasks((prev) =>
        prev.map((st) => (st.id === data.subtask.id ? data.subtask : st))
      );
    }
  };

  if (loading) {
    return <div className="loading">Loading task details...</div>;
  }

  if (!task) {
    return <div className="error">Task not found</div>;
  }

  return (
    <div className="task-detail">
      <div className="task-header">
        <h1>{task.title}</h1>
        <div className={`task-status-badge status-${task.status}`}>
          {task.status}
        </div>
      </div>

      <div className="task-description">
        <h3>Description</h3>
        <p>{task.description}</p>
      </div>

      <div className="task-meta">
        <div className="meta-item">
          <span className="label">ID:</span>
          <span className="value">{task.id}</span>
        </div>
        <div className="meta-item">
          <span className="label">Created:</span>
          <span className="value">{new Date(task.createdAt).toLocaleString()}</span>
        </div>
        {task.completedAt && (
          <div className="meta-item">
            <span className="label">Completed:</span>
            <span className="value">
              {new Date(task.completedAt).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {subtasks.length > 0 && (
        <div className="subtasks">
          <h3>Subtasks ({subtasks.length})</h3>
          <div className="subtask-list">
            {subtasks.map((subtask) => (
              <SubTaskItem key={subtask.id} subtask={subtask} />
            ))}
          </div>
        </div>
      )}

      <div className="agents-section">
        <h3>Agents</h3>
        <AgentList taskId={taskId} />
      </div>

      {task.result && (
        <div className="task-result">
          <h3>Result</h3>
          <pre>{JSON.stringify(task.result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

interface SubTaskItemProps {
  subtask: SubTask;
}

const SubTaskItem: React.FC<SubTaskItemProps> = ({ subtask }) => {
  const statusIcon = {
    pending: '⏸️',
    running: '▶️',
    completed: '✅',
    failed: '❌',
  }[subtask.status];

  return (
    <div className={`subtask-item status-${subtask.status}`}>
      <div className="subtask-status">{statusIcon}</div>
      <div className="subtask-content">
        <div className="subtask-title">{subtask.title}</div>
        <div className="subtask-description">{subtask.description}</div>
        {subtask.assignedTo && (
          <div className="subtask-agent">Assigned to: {subtask.assignedTo}</div>
        )}
      </div>
    </div>
  );
};
```

### 步骤 3: 实现 Agent 列表组件

创建 `src/ui/components/AgentList.tsx`：

```typescript
import React, { useState, useEffect } from 'react';
import { Agent } from '../../types/agent';
import { AgentChat } from './AgentChat';
import { apiClient } from '../utils/api-client';

interface AgentListProps {
  taskId: string;
}

export const AgentList: React.FC<AgentListProps> = ({ taskId }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();

    // 订阅实时更新
    const eventSource = new EventSource(`/api/tasks/${taskId}/agents/events`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleAgentUpdate(data);
    };

    return () => {
      eventSource.close();
    };
  }, [taskId]);

  const loadAgents = async () => {
    try {
      const response = await apiClient.get(`/api/tasks/${taskId}/agents`);
      setAgents(response.data.agents);
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  };

  const handleAgentUpdate = (data: any) => {
    if (data.type === 'agent:created') {
      setAgents((prev) => [...prev, data.agent]);
    } else if (data.type === 'agent:updated') {
      setAgents((prev) =>
        prev.map((a) => (a.id === data.agent.id ? data.agent : a))
      );
    } else if (data.type === 'agent:destroyed') {
      setAgents((prev) => prev.filter((a) => a.id !== data.agentId));
    }
  };

  return (
    <div className="agent-list">
      <div className="agent-items">
        {agents.length === 0 ? (
          <div className="no-agents">No agents running</div>
        ) : (
          agents.map((agent) => (
            <AgentItem
              key={agent.id}
              agent={agent}
              selected={selectedAgent === agent.id}
              onClick={() => setSelectedAgent(agent.id)}
            />
          ))
        )}
      </div>

      {selectedAgent && (
        <div className="agent-chat-panel">
          <AgentChat agentId={selectedAgent} onClose={() => setSelectedAgent(null)} />
        </div>
      )}
    </div>
  );
};

interface AgentItemProps {
  agent: Agent;
  selected: boolean;
  onClick: () => void;
}

const AgentItem: React.FC<AgentItemProps> = ({ agent, selected, onClick }) => {
  const statusIcon = {
    idle: '⏸️',
    working: '▶️',
    completed: '✅',
    failed: '❌',
  }[agent.status];

  return (
    <div
      className={`agent-item status-${agent.status} ${selected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="agent-header">
        <div className="agent-status">{statusIcon}</div>
        <div className="agent-id">{agent.id}</div>
      </div>
      <div className="agent-role">{agent.role}</div>
      {agent.currentTask && (
        <div className="agent-task">Task: {agent.currentTask}</div>
      )}
      {agent.progress !== undefined && (
        <div className="agent-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${agent.progress}%` }}
            />
          </div>
          <span className="progress-text">{agent.progress}%</span>
        </div>
      )}
    </div>
  );
};
```

### 步骤 4: 实现 Agent 对话组件

创建 `src/ui/components/AgentChat.tsx`：

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { Message } from '../../types/message';
import { apiClient } from '../utils/api-client';

interface AgentChatProps {
  agentId: string;
  onClose: () => void;
}

export const AgentChat: React.FC<AgentChatProps> = ({ agentId, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();

    // 订阅新消息
    const eventSource = new EventSource(`/api/agents/${agentId}/messages/events`);

    eventSource.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setMessages((prev) => [...prev, message]);
    };

    return () => {
      eventSource.close();
    };
  }, [agentId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    try {
      const response = await apiClient.get(`/api/agents/${agentId}/messages`);
      setMessages(response.data.messages);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    setSending(true);
    const message = input.trim();
    setInput('');

    try {
      await apiClient.post(`/api/agents/${agentId}/messages`, {
        content: message,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setInput(message); // 恢复输入
    } finally {
      setSending(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="agent-chat">
      <div className="chat-header">
        <h3>Chat with {agentId}</h3>
        <button onClick={onClose} className="close-btn">
          ×
        </button>
      </div>

      <div className="chat-messages">
        {messages.map((message, index) => (
          <MessageItem key={index} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
          disabled={sending}
        />
        <button onClick={sendMessage} disabled={sending || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
};

interface MessageItemProps {
  message: Message;
}

const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  return (
    <div className={`message message-${message.role}`}>
      <div className="message-role">{message.role}</div>
      <div className="message-content">{message.content}</div>
      <div className="message-time">
        {new Date(message.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
};
```

### 步骤 5: 实现 SSE 端点

创建 `src/server/routes/tasks.ts`：

```typescript
import express from 'express';
import { MasterAgent } from '../../ai/master-agent.js';

const router = express.Router();

// 存储活跃的 SSE 连接
const sseClients = new Map<string, Set<express.Response>>();

/**
 * GET /api/tasks - 获取所有任务
 */
router.get('/', async (req, res) => {
  // TODO: 从数据库获取任务列表
  res.json({
    success: true,
    tasks: [],
  });
});

/**
 * GET /api/tasks/:taskId - 获取任务详情
 */
router.get('/:taskId', async (req, res) => {
  const { taskId } = req.params;

  // TODO: 从数据库获取任务
  res.json({
    success: true,
    task: null,
    subtasks: [],
  });
});

/**
 * GET /api/tasks/:taskId/events - SSE 实时更新
 */
router.get('/:taskId/events', (req, res) => {
  const { taskId } = req.params;

  // 设置 SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 添加到客户端集合
  if (!sseClients.has(taskId)) {
    sseClients.set(taskId, new Set());
  }
  sseClients.get(taskId)!.add(res);

  // 发送初始连接消息
  res.write('data: {"type":"connected"}\n\n');

  // 清理连接
  req.on('close', () => {
    const clients = sseClients.get(taskId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        sseClients.delete(taskId);
      }
    }
  });
});

/**
 * 广播事件到所有订阅的客户端
 */
export function broadcastTaskEvent(taskId: string, event: any) {
  const clients = sseClients.get(taskId);
  if (!clients) return;

  const data = `data: ${JSON.stringify(event)}\n\n`;

  for (const client of clients) {
    try {
      client.write(data);
    } catch (error) {
      console.error('Failed to send SSE event:', error);
      clients.delete(client);
    }
  }
}

export default router;
```

---

## 验收标准

- ✅ 任务列表按状态分类显示
- ✅ 任务详情显示完整信息
- ✅ Agent 列表显示状态和进度
- ✅ 可以与 Agent 对话
- ✅ 实时状态更新正常
- ✅ 界面美观易用

---

## 依赖安装

```bash
npm install react react-dom
npm install --save-dev @types/react @types/react-dom
npm install express
```

---

## CSS 样式示例

创建 `src/ui/styles/main.css`：

```css
/* Task List */
.task-list {
  padding: 20px;
}

.task-filter {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.task-filter button {
  padding: 8px 16px;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
}

.task-filter button.active {
  background: #007bff;
  color: white;
}

.task-item {
  display: flex;
  align-items: center;
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
}

.task-item:hover {
  background: #f5f5f5;
}

.task-item.status-running {
  border-left: 4px solid #007bff;
}

.task-item.status-completed {
  border-left: 4px solid #28a745;
}

.task-item.status-failed {
  border-left: 4px solid #dc3545;
}

/* Agent List */
.agent-list {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 20px;
}

.agent-item {
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
}

.agent-item.selected {
  background: #e3f2fd;
  border-color: #007bff;
}

.agent-progress {
  margin-top: 8px;
}

.progress-bar {
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #007bff;
  transition: width 0.3s;
}

/* Agent Chat */
.agent-chat {
  display: flex;
  flex-direction: column;
  height: 600px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.message {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 8px;
}

.message-user {
  background: #007bff;
  color: white;
  align-self: flex-end;
}

.message-assistant {
  background: #f0f0f0;
}

.chat-input {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid #ddd;
}

.chat-input input {
  flex: 1;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}
```

---

## 相关文档

- 任务 10: `docs/v5/tasks/task-10.md`
- 任务 11: `docs/v5/tasks/task-11.md`
- 需求文档：`docs/v5/01-requirements.md`
- 架构设计：`docs/v5/02-architecture.md`

---

**任务完成标志**：

- [ ] 任务列表界面实现完成
- [ ] 任务详情界面实现完成
- [ ] Agent 列表组件实现完成
- [ ] Agent 对话组件实现完成
- [ ] SSE 实时更新实现完成
- [ ] 样式美观，用户体验良好
