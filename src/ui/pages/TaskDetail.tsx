import React, { useState, useEffect } from 'react';
import type { Task } from '../../types/index.js';
import { AgentList } from '../components/AgentList.js';
import { apiClient } from '../utils/api-client.js';

interface TaskDetailProps {
  taskId: string;
}

export const TaskDetail: React.FC<TaskDetailProps> = ({ taskId }) => {
  const [task, setTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTaskDetail();

    // 订阅实时更新
    const eventSource = new EventSource(`/api/tasks/${taskId}/events`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleUpdate(data);
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    eventSource.onerror = () => {
      console.warn('SSE connection error for task:', taskId);
    };

    return () => {
      eventSource.close();
    };
  }, [taskId]);

  const loadTaskDetail = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/tasks/${taskId}`);
      const taskData = response.data;
      setTask(taskData);
      setSubtasks(taskData?.subtasks || []);
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
  subtask: Task;
}

const SubTaskItem: React.FC<SubTaskItemProps> = ({ subtask }) => {
  const statusIcon: Record<string, string> = {
    pending: '[PENDING]',
    'in-progress': '[RUNNING]',
    completed: '[DONE]',
    failed: '[FAILED]',
    blocked: '[BLOCKED]',
  };

  return (
    <div className={`subtask-item status-${subtask.status}`}>
      <div className="subtask-status">{statusIcon[subtask.status] || '[?]'}</div>
      <div className="subtask-content">
        <div className="subtask-title">{subtask.title}</div>
        <div className="subtask-description">{subtask.description}</div>
        {subtask.assignedRole && (
          <div className="subtask-agent">Assigned to: {subtask.assignedRole}</div>
        )}
      </div>
    </div>
  );
};
