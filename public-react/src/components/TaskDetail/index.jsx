import { useState, useEffect, useMemo } from 'react';
import { fetchTaskLogs, fetchSubtasks, fetchArtifacts } from '../../api.js';
import { formatDate } from '../../utils.js';
import Badge from './Badge.jsx';
import ChatPanel from '../ChatPanel.jsx';
import MemberTree from './MemberTree.jsx';
import AgentLogFilter from './AgentLogFilter.jsx';
import SubtaskTree, { SubtaskCard } from './SubtaskTree.jsx';
import ArtifactList from './ArtifactList.jsx';
import OpsConsoleTab from './OpsConsoleTab.jsx';

export default function TaskDetail({
  task,
  tab,
  onTabChange,
  tabData,
  setTabData,
  taskMembers,
  chatMessages,
  chatHasOlder,
  chatLoadingOlder,
  onLoadOlderChat,
  chatScrollToBottomTick,
  onSendMessage,
  logAgentId,
  onFilterAgent,
  onViewTask,
}) {
  const [selectedSubtask, setSelectedSubtask] = useState(null);

  if (!task) return <div className="loading"><div className="spinner"></div></div>;

  const showSubtasksTab =
    task.orchestrationMode !== 'v10-master' || (task.subtaskIds?.length ?? 0) > 0;

  const tabs = useMemo(
    () => [
      { key: 'chat', label: '💬 对话' },
      { key: 'ops', label: '🎛️ 操作台' },
      { key: 'members', label: '👥 成员' },
      { key: 'logs', label: '📝 日志' },
      ...(showSubtasksTab ? [{ key: 'subtasks', label: '🔀 子任务' }] : []),
      { key: 'artifacts', label: '📦 成品' },
    ],
    [showSubtasksTab]
  );

  useEffect(() => {
    const keys = new Set(tabs.map((t) => t.key));
    if (!keys.has(tab)) onTabChange('chat');
    if (tab === 'subtasks' && !showSubtasksTab) onTabChange('ops');
  }, [tab, showSubtasksTab, onTabChange, tabs]);

  return (
    <div className="detail-panel">
      {/* 头部元信息 */}
      <div className="detail-header">
        <div className="detail-meta-row">
          <span className="meta-item">
            <span className="meta-icon">📅</span>
            <span>创建: {formatDate(task.createdAt)}</span>
          </span>
          {task.completedAt && (
            <span className="meta-item">
              <span className="meta-icon">✅</span>
              <span>完成: {formatDate(task.completedAt)}</span>
            </span>
          )}
        </div>
        <section className="detail-desc-panel" aria-label="任务说明">
          <div className="detail-desc-panel-head">
            <span className="detail-desc-panel-icon" aria-hidden>📝</span>
            <span className="detail-desc-panel-title">任务说明</span>
          </div>
          {String(task.description || '').trim() ? (
            <div className="detail-desc-panel-body">
              <div className="detail-desc-text">{String(task.description).trim()}</div>
            </div>
          ) : (
            <p className="detail-desc-empty muted">
              暂无详细描述。请查看「对话」里的需求；从新建对话创建的任务会把首条消息自动记在这里。
            </p>
          )}
        </section>
      </div>

      {/* Tab 导航 */}
      <div className="tabs">
        {tabs.map(t => (
          <div
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => onTabChange(t.key)}
          >
            {t.label}
          </div>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="tab-content">
        {tab === 'chat' && (
          <ChatPanel
            taskId={task.id}
            messages={chatMessages || []}
            createMode={false}
            onSend={onSendMessage}
            hasOlder={chatHasOlder}
            loadingOlder={chatLoadingOlder}
            onLoadMore={onLoadOlderChat}
            scrollToBottomTick={chatScrollToBottomTick}
          />
        )}
        {tab === 'ops' && <OpsConsoleTab task={task} />}
        {tab === 'members' && (
          <MemberTree
            taskMembers={taskMembers}
            onSelectAgent={(agent) => {
              onFilterAgent(agent.id);
              onTabChange('logs');
            }}
          />
        )}
        {tab === 'logs' && (
          <LogsTab
            task={task}
            taskMembers={taskMembers}
            logAgentId={logAgentId}
            onFilterAgent={onFilterAgent}
            tabData={tabData}
            setTabData={setTabData}
          />
        )}
        {tab === 'subtasks' && (
          <SubtaskTab
            task={task}
            tabData={tabData}
            setTabData={setTabData}
            onSelectSubtask={setSelectedSubtask}
          />
        )}
        {tab === 'artifacts' && (
          <ArtifactTab
            task={task}
            tabData={tabData}
            setTabData={setTabData}
          />
        )}
      </div>

      {/* 子任务详情卡片 */}
      {selectedSubtask && (
        <SubtaskCard
          subtask={selectedSubtask}
          onClose={() => setSelectedSubtask(null)}
        />
      )}
    </div>
  );
}

/* ========== 概览 Tab ========== */
// OverviewTab removed (ops console covers it)

/* ========== 日志 Tab ========== */
function LogsTab({ task, taskMembers, logAgentId, onFilterAgent, tabData, setTabData }) {
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('all'); // all | llm | tool | other
  const [expanded, setExpanded] = useState(() => new Set()); // key: llm_response log.id

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTaskLogs(task.id, logAgentId).then(logs => {
      if (!cancelled) { setTabData(prev => ({ ...prev, logs })); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [task.id, logAgentId]);

  const agents = taskMembers?.agents || [];
  const logs = Array.isArray(tabData.logs) ? tabData.logs : [];
  const filteredLogs =
    category === 'all' ? logs : logs.filter((l) => (l.category || 'other') === category);

  const displayItems = groupLlmPairs(filteredLogs);

  return (
    <div className="logs-tab">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {agents.length > 0 && (
          <AgentLogFilter
            agents={agents}
            selectedAgentId={logAgentId}
            onSelect={onFilterAgent}
          />
        )}
        <div className="agent-log-filter">
          <label className="form-label">按类别筛选：</label>
          <select
            className="agent-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">全部</option>
            <option value="llm">LLM 请求</option>
            <option value="tool">工具调用</option>
            <option value="other">其他</option>
          </select>
        </div>
      </div>
      {loading ? (
        <div className="loading"><div className="spinner"></div></div>
      ) : !displayItems.length ? (
        <div className="empty-state"><div className="empty-state-text">暂无执行日志</div></div>
      ) : (
        <div className="timeline">
          {displayItems.map(item => {
            if (item.kind === 'log') {
              const log = item.log;
              return (
                <div key={log.id} className="timeline-item">
                  <div className="timeline-marker">
                    <div className="timeline-icon">•</div>
                    <div className="timeline-line"></div>
                  </div>
                  <div className="timeline-content">
                    <div className="timeline-header">
                      <span className="timeline-time">{formatDate(log.timestamp)}</span>
                      <span className="timeline-badge">{log.type || 'info'}</span>
                    </div>
                    <div className="timeline-body">
                      {log.description || log.content || ''}
                    </div>
                  </div>
                </div>
              );
            }

            const { response, request } = item;
            const isOpen = expanded.has(response.id);
            const header = llmHeaderLabel(response);
            const metaLine = llmMetaLine(response);
            return (
              <div key={response.id} className="timeline-item">
                <div className="timeline-marker">
                  <div className="timeline-icon">•</div>
                  <div className="timeline-line"></div>
                </div>
                <div className="timeline-content">
                  <div className="timeline-header" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span className="timeline-time">{formatDate(response.timestamp)}</span>
                    <span className="timeline-badge">llm</span>
                    <span className="muted" style={{ fontSize: 12 }}>{header}</span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '2px 8px', height: 26 }}
                      onClick={() => {
                        setExpanded(prev => {
                          const next = new Set(prev);
                          if (next.has(response.id)) next.delete(response.id);
                          else next.add(response.id);
                          return next;
                        });
                      }}
                    >
                      {isOpen ? '收起' : '展开'}
                    </button>
                  </div>

                  <div className="timeline-body">
                    {metaLine && <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{metaLine}</div>}
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                      {llmResponseContentPreview(response)}
                    </div>

                    {isOpen && (
                      <div className="llm-details">
                        {request && (
                          <div className="llm-section">
                            <div className="llm-section-title">请求（messages 预览）</div>
                            <pre className="llm-pre">{formatLlmRequestPreview(request)}</pre>
                          </div>
                        )}
                        <div className="llm-section">
                          <div className="llm-section-title">响应（toolCalls / 预览）</div>
                          <pre className="llm-pre">{formatLlmResponsePreview(response)}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function groupLlmPairs(logs) {
  // 日志默认已按时间倒序（最新在前）。我们只把 llm_request + llm_response 配对后展示为一个组（默认显示 response）。
  // 配对规则：同一 agent、同一轮次(turn/iteration)，且 response 在 request 之前（时间上更晚）。
  const out = [];
  const used = new Set();

  const getKey = (log) => {
    const d = log.details || {};
    const round =
      typeof d.turn === 'number' ? `turn:${d.turn}` :
      typeof d.iteration === 'number' ? `iter:${d.iteration}` :
      '';
    const agent = log.agentId || '';
    return `${agent}::${round}`;
  };

  // 先建 request 索引（按 key 取最近一条 request）
  const requestByKey = new Map();
  for (const l of logs) {
    if (l.type === 'llm_request') {
      requestByKey.set(getKey(l), l);
    }
  }

  for (const l of logs) {
    if (used.has(l.id)) continue;
    if (l.type === 'llm_response') {
      const key = getKey(l);
      const req = requestByKey.get(key);
      if (req) used.add(req.id);
      used.add(l.id);
      out.push({ kind: 'llm_pair', response: l, request: req || null });
      continue;
    }
    if (l.type === 'llm_request') {
      // request 默认不单独展示（等配对 response）；若没有 response，也展示为普通 log
      const key = getKey(l);
      // 如果该 key 没有任何 response（粗略判断：没有同 key 的 llm_response）
      // 就把 request 作为普通日志展示，避免“丢日志”
      const maybeHasResp = logs.some((x) => x.type === 'llm_response' && getKey(x) === key);
      if (!maybeHasResp) out.push({ kind: 'log', log: l });
      used.add(l.id);
      continue;
    }
    out.push({ kind: 'log', log: l });
    used.add(l.id);
  }

  return out;
}

function llmHeaderLabel(resp) {
  const d = resp.details || {};
  const provider = d.provider ? String(d.provider) : '';
  const model = d.model ? String(d.model) : '';
  const round =
    typeof d.turn === 'number' ? `turn ${d.turn}` :
    typeof d.iteration === 'number' ? `iter ${d.iteration}` :
    '';
  const parts = [provider, model, round].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'LLM 调用';
}

function llmMetaLine(resp) {
  const d = resp.details || {};
  const url = d.url ? String(d.url) : '';
  const usage = d.usage ? d.usage : null;
  const u = usage ? `tokens ${usage.total ?? '-'}（in ${usage.prompt ?? '-'} / out ${usage.completion ?? '-'}）` : '';
  const tc = typeof d.toolCalls === 'number' ? `toolCalls ${d.toolCalls}` : '';
  const parts = [url, u, tc].filter(Boolean);
  return parts.join(' · ');
}

function llmResponseContentPreview(resp) {
  const rp = resp.details?.responsePreview;
  const content = rp?.contentPreview ?? resp.description ?? '';
  return String(content || '').trim() || '（无可见内容）';
}

function formatLlmRequestPreview(req) {
  const d = req.details || {};
  const tools = Array.isArray(d.tools) ? d.tools : [];
  const preview = Array.isArray(d.preview) ? d.preview : [];
  const lines = [];
  if (d.url) lines.push(`url: ${d.url}`);
  if (d.provider) lines.push(`provider: ${d.provider}`);
  if (d.model) lines.push(`model: ${d.model}`);
  if (tools.length) lines.push(`tools: ${tools.join(', ')}`);
  if (preview.length) {
    lines.push('messages:');
    for (const m of preview) {
      lines.push(`- ${m.role} (${m.length}): ${String(m.contentPreview || '').replace(/\n/g, '\\n')}`);
    }
  }
  return lines.join('\n');
}

function formatLlmResponsePreview(resp) {
  const d = resp.details || {};
  const lines = [];
  if (d.url) lines.push(`url: ${d.url}`);
  if (d.provider) lines.push(`provider: ${d.provider}`);
  if (d.model) lines.push(`model: ${d.model}`);
  if (d.usage) lines.push(`usage: ${JSON.stringify(d.usage)}`);
  if (typeof d.toolCalls === 'number') lines.push(`toolCalls: ${d.toolCalls}`);
  const rp = d.responsePreview || {};
  if (Array.isArray(rp.toolCalls) && rp.toolCalls.length) {
    lines.push('toolCallsPreview:');
    for (const tc of rp.toolCalls) {
      lines.push(`- ${tc.name}: ${String(tc.argumentsPreview || '').replace(/\n/g, '\\n')}`);
    }
  }
  if (rp.contentPreview) {
    lines.push('contentPreview:');
    lines.push(String(rp.contentPreview));
  }
  return lines.join('\n');
}

/* ========== 子任务 Tab ========== */
function SubtaskTab({ task, tabData, setTabData, onSelectSubtask }) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSubtasks(task.id).then(data => {
      if (!cancelled) { setTabData(prev => ({ ...prev, subtasks: data })); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [task.id]);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div className="subtask-tab-scroll">
      <SubtaskTree
        subtasks={tabData.subtasks || []}
        onSelectSubtask={onSelectSubtask}
      />
    </div>
  );
}

/* ========== 成品 Tab ========== */
function ArtifactTab({ task, tabData, setTabData }) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchArtifacts(task.id).then(data => {
      if (!cancelled) { setTabData(prev => ({ ...prev, artifacts: data })); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [task.id]);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return <ArtifactList taskId={task.id} artifacts={tabData.artifacts || []} />;
}
