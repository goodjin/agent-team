import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchTasks, fetchTask, fetchTaskMembers, fetchMasterConversation,
  fetchSubtasks, fetchArtifacts, createTask, startTask as apiStartTask,
  sendMasterMessage
} from './api.js';
import { formatDate, timeAgo, getStatusText, getRoleName } from './utils.js';
import Sidebar from './components/Sidebar.jsx';
import TaskDetail from './components/TaskDetail/index.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import EmptyDetail from './components/EmptyDetail.jsx';
import RoleManager from './components/RoleManager.jsx';
import './App.css';

export { formatDate, timeAgo, getStatusText, getRoleName };

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [currentTask, setCurrentTask] = useState(null);
  const [filter, setFilter] = useState('all');
  const [currentTab, setCurrentTab] = useState('chat');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatHasOlder, setChatHasOlder] = useState(false);
  const [chatOldestIndex, setChatOldestIndex] = useState(0);
  const [chatLoadingOlder, setChatLoadingOlder] = useState(false);
  const [chatScrollToBottomTick, setChatScrollToBottomTick] = useState(0);
  const [taskMembers, setTaskMembers] = useState(null);
  const [tabData, setTabData] = useState({ logs: [], subtasks: [], artifacts: [] });
  const [loading, setLoading] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [mode, setMode] = useState('tasks'); // tasks | roles
  const [logAgentId, setLogAgentId] = useState(null);
  const wsRef = useRef(null);
  const currentTaskIdRef = useRef(null);
  useEffect(() => {
    currentTaskIdRef.current = currentTask?.id ?? null;
  }, [currentTask?.id]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTasks(filter);
      setTasks(Array.isArray(data) ? data : []);
    } catch (e) { console.error('Failed to load tasks:', e); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const connectWs = useCallback((taskId) => {
    if (wsRef.current) wsRef.current.close();
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}?taskId=${taskId}`);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'status_change') loadTasks();
      if (data.type === 'master_reply') {
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.data?.content || '', _seq: Date.now() },
        ]);
      }
      if (data.type === 'master_conversation_updated' && currentTaskIdRef.current === taskId) {
        void fetchMasterConversation(taskId).then((conv) => {
          setChatMessages(conv.messages);
          setChatHasOlder(conv.hasOlder);
          setChatOldestIndex(conv.oldestIndex);
        });
      }
    };
    wsRef.current = ws;
  }, [loadTasks]);

  const handleViewTask = useCallback(async (taskId) => {
    setMode('tasks');
    setLoading(true);
    setCreateMode(false);
    setChatMessages([]);
    setChatHasOlder(false);
    setChatOldestIndex(0);
    setLogAgentId(null);
    try {
      let task = await fetchTask(taskId);
      if (task?.status === 'pending') {
        // v10：打开任务即确保主控会话启动
        await apiStartTask(taskId);
        task = await fetchTask(taskId);
      }
      const [members, conv] = await Promise.all([
        fetchTaskMembers(taskId),
        fetchMasterConversation(taskId),
      ]);
      setCurrentTask(task);
      setCurrentTab('chat');
      setTaskMembers(members);
      setChatMessages(conv.messages);
      setChatHasOlder(conv.hasOlder);
      setChatOldestIndex(conv.oldestIndex);
      connectWs(taskId);
    } catch (e) { console.error('Failed to load task:', e); }
    setLoading(false);
  }, [connectWs]);

  const loadOlderChat = useCallback(async () => {
    if (!currentTask?.id || !chatHasOlder || chatLoadingOlder) return;
    setChatLoadingOlder(true);
    try {
      const conv = await fetchMasterConversation(currentTask.id, {
        limit: 50,
        before: chatOldestIndex,
      });
      setChatMessages((prev) => [...conv.messages, ...prev]);
      setChatHasOlder(conv.hasOlder);
      setChatOldestIndex(conv.oldestIndex);
    } catch (e) {
      console.error('load older chat:', e);
    }
    setChatLoadingOlder(false);
  }, [currentTask?.id, chatHasOlder, chatLoadingOlder, chatOldestIndex]);

  const handleSendMessage = useCallback(async (text) => {
    if (!text.trim()) return;
    if (createMode) {
      setChatMessages((prev) => [...prev, { role: 'user', content: text, _seq: Date.now() }]);
      setChatScrollToBottomTick((t) => t + 1);
      try {
        const raw = text.trim();
        const title = raw.split('\n')[0].slice(0, 80) || '新对话';
        const task = await createTask({ title, description: raw });
        setCreateMode(false);
        setTasks(prev => [task, ...prev]);
        setCurrentTask(task);
        setCurrentTab('chat');
        await apiStartTask(task.id);
        const [members, conv] = await Promise.all([fetchTaskMembers(task.id), fetchMasterConversation(task.id)]);
        setTaskMembers(members);
        setChatHasOlder(conv.hasOlder);
        setChatOldestIndex(conv.oldestIndex);
        setChatMessages(
          conv.messages.length
            ? conv.messages
            : [
                { role: 'user', content: text, _seq: 0 },
                { role: 'assistant', content: '', _seq: 1 },
              ]
        );
        connectWs(task.id);
        setChatScrollToBottomTick((t) => t + 1);
      } catch (e) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `错误: ${e.message}`, _seq: Date.now() }]);
        setCreateMode(true);
        setCurrentTask(null);
      }
      return;
    }
    if (!currentTask) return;
    setChatMessages((prev) => [...prev, { role: 'user', content: text, _seq: Date.now() }]);
    setChatScrollToBottomTick((t) => t + 1);
    try {
      await sendMasterMessage(currentTask.id, text);
      const conv = await fetchMasterConversation(currentTask.id);
      setChatMessages(conv.messages.length ? conv.messages : [{ role: 'assistant', content: '', _seq: Date.now() }]);
      setChatHasOlder(conv.hasOlder);
      setChatOldestIndex(conv.oldestIndex);
      const task = await fetchTask(currentTask.id);
      setCurrentTask(task);
      setChatScrollToBottomTick((t) => t + 1);
    } catch (e) {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `错误: ${e.message}`, _seq: Date.now() }]);
    }
  }, [createMode, currentTask, connectWs]);

  const handleFilter = useCallback((f) => {
    setFilter(f);
    setCurrentTask(null);
    setCreateMode(false);
    setChatMessages([]);
    setChatHasOlder(false);
    setChatOldestIndex(0);
  }, []);

  const handleCreate = useCallback(() => {
    setMode('tasks');
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setCreateMode(true);
    setCurrentTask(null);
    setChatMessages([]);
    setChatHasOlder(false);
    setChatOldestIndex(0);
    setTaskMembers(null);
  }, []);

  const handleBack = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setCurrentTask(null);
    setCreateMode(false);
    setChatMessages([]);
    setChatHasOlder(false);
    setChatOldestIndex(0);
    setTaskMembers(null);
  }, []);

  const handleOpenRoles = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setMode('roles');
    setCreateMode(false);
    setCurrentTask(null);
    setChatMessages([]);
    setChatHasOlder(false);
    setChatOldestIndex(0);
    setTaskMembers(null);
  }, []);

  if (mode === 'roles') {
    return <RoleManager onBack={() => setMode('tasks')} />;
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Sidebar
          tasks={tasks}
          filter={filter}
          currentTaskId={currentTask?.id}
          loading={loading}
          onFilter={handleFilter}
          onViewTask={handleViewTask}
          onCreate={handleCreate}
          onOpenRoles={handleOpenRoles}
        />
      </aside>
      <main className="main-content">
        {createMode || currentTask ? (
          <div className="task-shell">
            <div className="task-shell-bar">
              <button className="btn btn-ghost" onClick={handleBack}>← 列表</button>
              <h2 className="task-shell-title">{createMode ? '新建任务' : currentTask?.title}</h2>
              {!createMode && currentTask && (
                <span className={`status-badge ${currentTask.status}`}>{getStatusText(currentTask.status)}</span>
              )}
            </div>
            {createMode ? (
              <ChatPanel
                messages={chatMessages}
                createMode={true}
                onSend={handleSendMessage}
                scrollToBottomTick={chatScrollToBottomTick}
              />
            ) : (
              <TaskDetail
                task={currentTask}
                tab={currentTab}
                onTabChange={setCurrentTab}
                tabData={tabData}
                setTabData={setTabData}
                taskMembers={taskMembers}
                chatMessages={chatMessages}
                chatHasOlder={chatHasOlder}
                chatLoadingOlder={chatLoadingOlder}
                onLoadOlderChat={loadOlderChat}
                chatScrollToBottomTick={chatScrollToBottomTick}
                onSendMessage={handleSendMessage}
                logAgentId={logAgentId}
                onFilterAgent={setLogAgentId}
                onViewTask={handleViewTask}
              />
            )}
          </div>
        ) : (
          <EmptyDetail onCreate={handleCreate} />
        )}
      </main>
    </div>
  );
}
