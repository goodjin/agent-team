import { useEffect, useMemo, useState } from 'react';
import {
  createRole,
  deleteRole,
  fetchReviewRoleMapping,
  fetchRoles,
  fetchTools,
  saveReviewRoleMapping,
  updateRole,
} from '../api.js';

const PROMPT_FONT_STORAGE_KEY = 'role-editor-font-family';

const PROMPT_FONT_OPTIONS = [
  { value: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', label: '等宽（推荐）' },
  { value: "system-ui, -apple-system, 'Segoe UI', sans-serif", label: '系统无衬线' },
  { value: 'Georgia, Cambria, serif', label: '衬线' },
  { value: "'Noto Sans SC', system-ui, sans-serif", label: '中文无衬线' },
];

export default function RoleManager({ onBack }) {
  const [roles, setRoles] = useState([]);
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState('');
  const [draftAllowed, setDraftAllowed] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [reviewDefault, setReviewDefault] = useState('');
  const [reviewRows, setReviewRows] = useState(() => [{ workerRoleId: '', reviewerRoleId: '' }]);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewHint, setReviewHint] = useState('');
  const [reviewError, setReviewError] = useState('');

  const [promptFont, setPromptFont] = useState(() => {
    try {
      const v = localStorage.getItem(PROMPT_FONT_STORAGE_KEY);
      if (v && PROMPT_FONT_OPTIONS.some((o) => o.value === v)) return v;
      return PROMPT_FONT_OPTIONS[0].value;
    } catch {
      return PROMPT_FONT_OPTIONS[0].value;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PROMPT_FONT_STORAGE_KEY, promptFont);
    } catch {
      /* ignore */
    }
  }, [promptFont]);

  const selected = useMemo(
    () => roles.find((r) => r.id === selectedId) || null,
    [roles, selectedId]
  );

  const mappingToRows = (roleToReviewer) => {
    const o = roleToReviewer && typeof roleToReviewer === 'object' ? roleToReviewer : {};
    const entries = Object.entries(o);
    if (!entries.length) return [{ workerRoleId: '', reviewerRoleId: '' }];
    return entries.map(([workerRoleId, reviewerRoleId]) => ({
      workerRoleId: String(workerRoleId || ''),
      reviewerRoleId: String(reviewerRoleId || ''),
    }));
  };

  const load = async () => {
    setLoading(true);
    setError('');
    setReviewError('');
    try {
      const [data, toolData, mapping] = await Promise.all([
        fetchRoles(),
        fetchTools(),
        fetchReviewRoleMapping(),
      ]);
      setRoles(Array.isArray(data) ? data : []);
      setTools(Array.isArray(toolData) ? toolData : []);
      setReviewDefault(String(mapping?.defaultReviewerRoleId || ''));
      setReviewRows(mappingToRows(mapping?.roleToReviewer));
      if (!selectedId && Array.isArray(data) && data.length) {
        setSelectedId(data[0].id);
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) {
      setDraft(String(selected.systemPrompt || ''));
      setDraftAllowed(Array.isArray(selected.allowedTools) ? selected.allowedTools : []);
      setHint('');
    }
  }, [selected?.id]);

  const onSave = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    setHint('');
    try {
      const next = await updateRole(selected.id, { systemPrompt: draft, allowedTools: draftAllowed });
      setHint('已保存');
      await load();
      setSelectedId(next.id);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const toolGroups = useMemo(() => {
    const map = new Map();
    for (const t of tools) {
      const cat = t.category || 'other';
      const list = map.get(cat) || [];
      list.push(t);
      map.set(cat, list);
    }
    return [...map.entries()].map(([cat, list]) => [
      cat,
      list.sort((a, b) => String(a.name).localeCompare(String(b.name))),
    ]);
  }, [tools]);

  const roleIdOptions = useMemo(() => {
    const list = (roles || []).map((r) => r.id).filter(Boolean);
    return [...list].sort((a, b) => String(a).localeCompare(String(b)));
  }, [roles]);

  const onToggleTool = (name) => {
    setDraftAllowed((prev) => {
      const s = new Set(prev);
      if (s.has(name)) s.delete(name);
      else s.add(name);
      return [...s];
    });
  };

  const onToggleCategory = (cat, checked) => {
    const list = toolGroups.find(([c]) => c === cat)?.[1] || [];
    setDraftAllowed((prev) => {
      const s = new Set(prev);
      for (const t of list) {
        if (checked) s.add(t.name);
        else s.delete(t.name);
      }
      return [...s];
    });
  };

  const onDeleteRole = async () => {
    if (!selected || selected.isSystem) return;
    if (!window.confirm(`确定删除角色「${selected.name || selected.id}」？此操作不可恢复。`)) return;
    setSaving(true);
    setError('');
    setHint('');
    try {
      await deleteRole(selected.id);
      setHint('已删除');
      setSelectedId('');
      await load();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const onSaveReviewMapping = async () => {
    setReviewSaving(true);
    setReviewError('');
    setReviewHint('');
    try {
      const roleToReviewer = {};
      for (const row of reviewRows) {
        const w = String(row.workerRoleId || '').trim();
        const rev = String(row.reviewerRoleId || '').trim();
        if (!w && !rev) continue;
        if (!w || !rev) {
          setReviewError('映射表每一行需同时填写工人角色与审查员角色，或留空整行。');
          return;
        }
        roleToReviewer[w] = rev;
      }
      const saved = await saveReviewRoleMapping({
        defaultReviewerRoleId: String(reviewDefault || '').trim(),
        roleToReviewer,
      });
      setReviewHint('审查映射已保存');
      setReviewDefault(String(saved?.defaultReviewerRoleId || ''));
      setReviewRows(mappingToRows(saved?.roleToReviewer));
    } catch (e) {
      setReviewError(String(e.message || e));
    } finally {
      setReviewSaving(false);
    }
  };

  const onAddReviewRow = () => {
    setReviewRows((prev) => [...prev, { workerRoleId: '', reviewerRoleId: '' }]);
  };

  const onRemoveReviewRow = (index) => {
    setReviewRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const onChangeReviewRow = (index, field, value) => {
    setReviewRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const onCopyRole = async () => {
    if (!selected) return;
    const newId = window.prompt('新角色 id（唯一）', `${selected.id}-copy`);
    if (!newId) return;
    const newName = window.prompt('新角色 name（展示名）', `${selected.name}（副本）`) || newId;
    setSaving(true);
    setError('');
    setHint('');
    try {
      await createRole({
        id: newId,
        name: newName,
        description: selected.description || '',
        systemPrompt: draft,
        allowedTools: draftAllowed,
        maxTokensPerTask: selected.maxTokensPerTask,
        temperature: selected.temperature,
        timeout: selected.timeout,
      });
      setHint('已复制为新角色');
      await load();
      setSelectedId(newId);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-layout role-app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            ← 任务
          </button>
          <h1 className="sidebar-title">🧩 角色</h1>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void load()}
            disabled={loading || saving}
          >
            刷新
          </button>
        </div>
        <div className="task-list-container">
          {loading ? (
            <div className="muted" style={{ padding: 12 }}>
              加载中…
            </div>
          ) : roles.length === 0 ? (
            <div className="muted" style={{ padding: 12 }}>
              暂无角色
            </div>
          ) : (
            roles.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`role-item task-item ${selectedId === r.id ? 'active' : ''}`}
                onClick={() => setSelectedId(r.id)}
              >
                <div className="role-item-name task-item-title">
                  {r.name || r.id}
                  {r.isSystem ? <span className="role-system-badge">系统</span> : null}
                </div>
                <div className="role-item-id muted">{r.id}</div>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="main-content role-detail-main">
        <div className="role-detail-inner">
          {error && <div className="ops-error">{error}</div>}
          {hint && <div className="ops-banner">{hint}</div>}

          {!selected ? (
            <div className="muted">请从左侧选择一个角色</div>
          ) : (
            <>
              <div className="role-detail-toolbar">
                <div>
                  <div className="role-editor-title">
                    {selected.name}
                    {selected.isSystem ? <span className="role-system-badge role-system-badge-lg">系统</span> : null}
                  </div>
                  <div className="muted mono" style={{ fontSize: 12 }}>
                    {selected.id}
                  </div>
                  {selected.isSystem ? (
                    <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                      系统预留角色：可编辑提示词与参数，不可删除；不会作为工人派工。
                    </div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void onCopyRole()}
                    disabled={saving}
                  >
                    复制为新角色
                  </button>
                  {!selected.isSystem ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ color: 'var(--danger, #b42318)' }}
                      onClick={() => void onDeleteRole()}
                      disabled={saving}
                    >
                      删除角色
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving}>
                    保存
                  </button>
                </div>
              </div>

              <section className="role-prompt-section">
                <label className="form-label" htmlFor="role-system-prompt">
                  提示词（systemPrompt）
                </label>
                <div className="role-prompt-font-row">
                  <span className="role-prompt-font-label">编辑区字体</span>
                  <select
                    id="role-prompt-font"
                    className="form-input role-prompt-font-select"
                    value={promptFont}
                    onChange={(e) => setPromptFont(e.target.value)}
                    aria-label="提示词编辑区字体"
                  >
                    {PROMPT_FONT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  id="role-system-prompt"
                  className="form-input role-textarea"
                  rows={28}
                  style={{ fontFamily: promptFont, fontSize: '16pt' }}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="在此编辑 systemPrompt…"
                />
              </section>

              <section className="role-tools-section" style={{ marginTop: 24 }}>
                <div className="role-tools-title">审查员映射（质量门禁）</div>
                <p className="muted" style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.5 }}>
                  工人完成节点后按「工人角色 → 审查员角色」选人；未配置时使用默认审查员。配置保存在服务端
                  data/config/review-role-mapping.json。
                </p>
                {reviewError ? <div className="ops-error">{reviewError}</div> : null}
                {reviewHint ? <div className="ops-banner">{reviewHint}</div> : null}
                <label className="form-label" htmlFor="review-default-reviewer">
                  默认审查员（roleId）
                </label>
                <select
                  id="review-default-reviewer"
                  className="form-input"
                  style={{ maxWidth: 420, marginBottom: 16 }}
                  value={reviewDefault}
                  onChange={(e) => setReviewDefault(e.target.value)}
                >
                  <option value="">请选择</option>
                  {roleIdOptions.map((id) => (
                    <option key={`def-${id}`} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
                <div className="role-tools-title" style={{ fontSize: 14, marginTop: 8 }}>
                  按工人角色指定审查员
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {reviewRows.map((row, index) => (
                    <div key={`rev-row-${index}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <select
                        className="form-input"
                        style={{ flex: '1 1 160px', minWidth: 140 }}
                        aria-label={`工人角色 ${index + 1}`}
                        value={row.workerRoleId}
                        onChange={(e) => onChangeReviewRow(index, 'workerRoleId', e.target.value)}
                      >
                        <option value="">工人 roleId</option>
                        {roleIdOptions.map((id) => (
                          <option key={`w-${index}-${id}`} value={id}>
                            {id}
                          </option>
                        ))}
                      </select>
                      <span className="muted">→</span>
                      <select
                        className="form-input"
                        style={{ flex: '1 1 160px', minWidth: 140 }}
                        aria-label={`审查员 ${index + 1}`}
                        value={row.reviewerRoleId}
                        onChange={(e) => onChangeReviewRow(index, 'reviewerRoleId', e.target.value)}
                      >
                        <option value="">审查员 roleId</option>
                        {roleIdOptions.map((id) => (
                          <option key={`r-${index}-${id}`} value={id}>
                            {id}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => onRemoveReviewRow(index)}
                        disabled={reviewRows.length <= 1}
                      >
                        删行
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-ghost" onClick={onAddReviewRow} disabled={reviewSaving}>
                    添加一行
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void onSaveReviewMapping()}
                    disabled={reviewSaving || !String(reviewDefault || '').trim()}
                  >
                    {reviewSaving ? '保存中…' : '保存审查映射'}
                  </button>
                </div>
              </section>

              <section className="role-tools-section">
                <div className="role-tools-title">工具权限（allowedTools）</div>
                {selected.isSystem ? (
                  <div className="muted" style={{ marginBottom: 10, fontSize: 13 }}>
                    后台归档调度不使用工人工具链；此项可留空，仅在与未来扩展对齐时填写。
                  </div>
                ) : null}
                {!tools.length ? (
                  <div className="muted">工具列表为空</div>
                ) : (
                  toolGroups.map(([cat, list]) => {
                    const names = list.map((t) => t.name);
                    const selectedCount = names.filter((n) => draftAllowed.includes(n)).length;
                    const allChecked = selectedCount === names.length && names.length > 0;
                    return (
                      <div key={cat} className="role-tools-group">
                        <label className="role-tools-cat">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={(e) => onToggleCategory(cat, e.target.checked)}
                          />
                          <span>{cat}</span>
                          <span className="muted">
                            （{selectedCount}/{names.length}）
                          </span>
                        </label>
                        <div className="role-tools-items">
                          {list.map((t) => (
                            <label key={t.name} className="role-tools-item">
                              <input
                                type="checkbox"
                                checked={draftAllowed.includes(t.name)}
                                onChange={() => onToggleTool(t.name)}
                              />
                              <span className="mono">{t.name}</span>
                              {t.dangerous && <span className="muted">危险</span>}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
