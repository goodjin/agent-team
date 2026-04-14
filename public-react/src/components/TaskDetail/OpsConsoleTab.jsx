import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchOrchestrationSnapshot, fetchTaskPostmortem } from '../../api.js';
import { formatDate } from '../../utils.js';
import OpsDagSvg from './OpsDagSvg.jsx';

const POLL_MS = 5000;

export default function OpsConsoleTab({ task }) {
  const [snap, setSnap] = useState(null);
  const [pm, setPm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    if (!task?.id) return;
    setErr(null);
    try {
      const [s, p] = await Promise.all([
        fetchOrchestrationSnapshot(task.id),
        fetchTaskPostmortem(task.id),
      ]);
      setSnap(s);
      setPm(p);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [task?.id]);

  useEffect(() => {
    setLoading(true);
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const dagEdges = useMemo(() => {
    const nodes = snap?.activePlan?.nodes;
    if (!nodes?.length) return [];
    const out = [];
    for (const n of nodes) {
      for (const d of n.dependsOn || []) {
        out.push({ from: d, to: n.id });
      }
    }
    return out;
  }, [snap]);

  const allPlanNodes = useMemo(() => snap?.activePlan?.nodes ?? [], [snap]);

  if (!task) return null;

  return (
    <div className="ops-console">
      <div className="ops-toolbar">
        <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>
          刷新
        </button>
        <span className="ops-hint muted">
          派工由主控 submit_plan 后自动执行 · 每 {POLL_MS / 1000}s 刷新 · 信箱为进程内队列，重启后清空
        </span>
      </div>

      {err && <div className="ops-error">{err}</div>}

      {loading && !snap ? (
        <div className="loading">
          <div className="spinner" />
        </div>
      ) : (
        <>
          <section className="ops-section">
            <h3 className="ops-section-title">编排状态</h3>
            <div className="ops-meta-grid">
              <div>
                <span className="muted">任务 planVersion</span>
                <div className="ops-meta-value">{task.planVersion ?? 0}</div>
              </div>
              <div>
                <span className="muted">内存激活计划</span>
                <div className="ops-meta-value">
                  {snap?.activePlan ? `v${snap.activePlan.planVersion}` : '—'}
                </div>
              </div>
              <div>
                <span className="muted">编排阶段</span>
                <div className="ops-meta-value">{snap?.orchestrationState ?? task.orchestrationState ?? '—'}</div>
              </div>
              <div>
                <span className="muted">信箱积压（深度）</span>
                <div className="ops-meta-value">
                  {snap?.mailboxDepths && Object.keys(snap.mailboxDepths).length
                    ? Object.entries(snap.mailboxDepths)
                        .map(([id, d]) => `${snap.workerNames?.[id] ?? id.slice(0, 8)}:${d}`)
                        .join(' · ')
                    : '—'}
                </div>
              </div>
            </div>
          </section>

          <section className="ops-section">
            <h3 className="ops-section-title">DAG 拓扑（SVG 连线）</h3>
            {!snap?.activePlan?.nodes?.length ? (
              <div className="empty-state">
                <div className="empty-state-text">暂无激活计划；主控提交 submit_plan 后将显示节点与依赖</div>
              </div>
            ) : (
              <>
                <p className="muted ops-dag-svg-hint">
                  图中为横向 DAG：箭头由前置节点指向后继。工具栏可重置视图；悬停节点可看完整 id。
                </p>
                <OpsDagSvg layers={snap.activePlan.layers} nodes={allPlanNodes} />
                {dagEdges.length > 0 && (
                  <details className="ops-dag-edge-details">
                    <summary className="ops-dag-edge-summary">文本边列表（与图中一致）</summary>
                    <div className="ops-dag-edges">
                      {dagEdges.map((e) => (
                        <span key={`${e.from}->${e.to}`} className="ops-dag-edge">
                          {e.from} → {e.to}
                        </span>
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </section>

          <section className="ops-section">
            <h3 className="ops-section-title">工人收件箱（待处理指令）</h3>
            {!snap?.inboxByWorker || !Object.keys(snap.inboxByWorker).length ? (
              <div className="empty-state">
                <div className="empty-state-text">当前无排队指令</div>
              </div>
            ) : (
              <div className="ops-inbox">
                {Object.entries(snap.inboxByWorker).map(([wid, queue]) => (
                  <div key={wid} className="ops-inbox-worker">
                    <div className="ops-inbox-head">
                      <span className="ops-inbox-name">{snap.workerNames?.[wid] ?? wid}</span>
                      <span className="muted">{queue.length} 条</span>
                    </div>
                    <ul className="ops-inbox-list">
                      {queue.map((env, i) => (
                        <li key={`${env.correlationId}-${i}`} className="ops-inbox-item">
                          <span className="ops-inbox-cmd">{env.command}</span>
                          <span className="muted">plan v{env.planVersion}</span>
                          <span className="muted mono">{env.correlationId?.slice(0, 8)}…</span>
                          {env.body?.brief != null && (
                            <div className="ops-inbox-brief">{String(env.body.brief)}</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="ops-section">
            <h3 className="ops-section-title">运行摘要 / 复盘要点</h3>
            {!pm ? (
              <div className="empty-state">
                <div className="empty-state-text">无法加载摘要</div>
              </div>
            ) : (
              <>
                <div className="muted ops-pm-time">生成时间 {formatDate(pm.generatedAt)}</div>
                <ul className="ops-bullets">
                  {pm.bullets?.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
                {pm.recentErrors?.length > 0 && (
                  <div className="ops-errors">
                    <div className="ops-subtitle">近期错误日志</div>
                    <ul>
                      {pm.recentErrors.map((e, i) => (
                        <li key={i}>
                          <span className="muted">{formatDate(e.timestamp)}</span>{' '}
                          {e.agentId && <span className="muted mono">{e.agentId.slice(0, 8)}… </span>}
                          {e.content}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
