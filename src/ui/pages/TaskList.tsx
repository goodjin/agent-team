import React, { useState, useEffect } from 'react';
import type { Task, TaskStatus } from '../../types/index.js';
import { apiClient } from '../utils/api-client.js';

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
      const response = await apiClient.get('/tasks');
      setTasks(response.data || []);
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
    running: filteredTasks.filter((t) => t.status === 'in-progress'),
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
          className={filter === 'in-progress' ? 'active' : ''}
          onClick={() => setFilter('in-progress')}
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
  const statusIcon: Record<string, string> = {
    pending: '[PENDING]',
    'in-progress': '[RUNNING]',
    completed: '[DONE]',
    failed: '[FAILED]',
    blocked: '[BLOCKED]',
  };

  return (
    <div className={`task-item status-${task.status}`} onClick={onClick}>
      <div className="task-status">{statusIcon[task.status] || '[?]'}</div>
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
