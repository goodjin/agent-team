import { useState, useMemo } from 'react';
import ArtifactPreview from './ArtifactPreview.jsx';

function getFileType(ext) {
  const map = {
    js: 'JavaScript', ts: 'TypeScript', jsx: 'JSX', tsx: 'TSX',
    json: 'JSON', md: 'Markdown', txt: 'Text',
    css: 'CSS', html: 'HTML', yml: 'YAML', yaml: 'YAML',
    sh: 'Shell', py: 'Python', go: 'Go', rs: 'Rust',
    png: '图片', jpg: '图片', jpeg: '图片', gif: '图片', svg: '图片',
    pdf: 'PDF', zip: '压缩包', tar: '压缩包',
  };
  return map[ext] || '其他';
}

function getFileIcon(name) {
  if (!name) return '📄';
  const ext = name.split('.').pop()?.toLowerCase();
  const icons = {
    js: '📜', ts: '📘', jsx: '⚛️', tsx: '⚛️',
    json: '📋', md: '📝', txt: '📄',
    css: '🎨', html: '🌐', yml: '⚙️', yaml: '⚙️',
    sh: '💻', py: '🐍', go: '🔵', rs: '🦀',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️',
    pdf: '📕', zip: '📦', tar: '📦',
  };
  return icons[ext] || '📄';
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * 将磁盘绝对路径或未带盘符的路径，裁成「任务工作空间根」下的相对路径（正斜杠）。
 * 与后端 data/workspaces/&lt;taskId&gt;/ 一致。
 */
function pathRelativeToTaskWorkspace(filePath, taskId) {
  const s = String(filePath || '').replace(/\\/g, '/').trim();
  if (!s) return '';
  const tid = String(taskId || '').trim();
  if (!tid) return s.replace(/^\.?\//, '');

  const needle = `/workspaces/${tid}/`;
  const i = s.indexOf(needle);
  if (i !== -1) {
    return s.slice(i + needle.length).replace(/^\/+/, '');
  }
  const needle2 = `workspaces/${tid}/`;
  const j = s.indexOf(needle2);
  if (j !== -1) {
    return s.slice(j + needle2.length).replace(/^\/+/, '');
  }
  if (!s.startsWith('/') && !/^[a-zA-Z]:\//.test(s)) {
    return s.replace(/^\.?\//, '');
  }
  const parts = s.split('/').filter(Boolean);
  const widx = parts.findIndex((p, i) => p === 'workspaces' && parts[i + 1] === tid);
  if (widx >= 0) {
    return parts.slice(widx + 2).join('/');
  }
  return s;
}

/** 相对工作区路径 → 树：{ name, files: Artifact[], dirs: Record<string, TreeNode> } */
function buildTree(artifacts, taskId) {
  const root = { name: '', files: [], dirs: {} };
  for (const a of artifacts) {
    const raw = (a.path && String(a.path).trim()) || a.name || 'unnamed';
    let rel = pathRelativeToTaskWorkspace(raw, taskId) || '';
    if (!rel.trim()) rel = String(a.name || 'unnamed').trim();
    let parts = rel.split('/').filter(Boolean);
    if (parts.length === 0) {
      const nm = String(a.name || '').trim();
      if (!nm) continue;
      parts = [nm];
    }
    const displayRel = parts.join('/');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!cur.dirs[seg]) cur.dirs[seg] = { name: seg, files: [], dirs: {} };
      cur = cur.dirs[seg];
    }
    cur.files.push({ ...a, _displayPath: displayRel });
  }
  return root;
}

function TreeDir({ node, depth, onPick }) {
  const subdirs = Object.keys(node.dirs).sort();
  const gutter = depth * 14;
  return (
    <div className="artifact-tree-node artifact-tree-branch">
      {depth > 0 && (
        <div className="artifact-tree-dir-label" style={{ marginLeft: gutter }}>
          <span className="artifact-tree-chev">▾</span>
          <span className="artifact-tree-icon">📁</span>
          <span>{node.name}</span>
        </div>
      )}
      {subdirs.map((d) => (
        <TreeDir key={d} node={node.dirs[d]} depth={depth + 1} onPick={onPick} />
      ))}
      {node.files.map((a) => (
        <button
          key={a.id}
          type="button"
          className="artifact-tree-file artifact-clickable"
          style={{ marginLeft: gutter }}
          onClick={() => onPick(a)}
        >
          <span className="artifact-icon">{getFileIcon(a.name)}</span>
          <span className="artifact-tree-file-name">{a.name}</span>
          <span className="artifact-tree-file-meta muted">
            {a.mimeType ? `${a.mimeType} · ` : ''}{formatFileSize(a.size)}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * 成品：以任务工作空间为根目录树展示 + 类型筛选（不展示磁盘绝对路径前缀）
 * @param {string} [taskId] - 用于从 artifact.path 中剥掉 data/workspaces/ 下的任务目录前缀
 */
export default function ArtifactList({ taskId, artifacts = [] }) {
  const [previewArtifact, setPreviewArtifact] = useState(null);
  const [filterType, setFilterType] = useState('all');

  const grouped = useMemo(() => {
    const g = {};
    artifacts.forEach((a) => {
      const ext = a.name?.split('.').pop() || 'other';
      const type = getFileType(ext);
      if (!g[type]) g[type] = [];
      g[type].push(a);
    });
    return g;
  }, [artifacts]);

  const filtered = useMemo(() => {
    if (filterType === 'all') return artifacts;
    return grouped[filterType] || [];
  }, [artifacts, filterType, grouped]);

  const tree = useMemo(() => buildTree(filtered, taskId), [filtered, taskId]);

  if (!artifacts.length) {
    return <div className="empty-state"><div className="empty-state-text">暂无成品文件</div></div>;
  }

  if (!filtered.length) {
    return (
      <div className="artifacts-list">
        <div className="artifacts-filter">
          <label className="form-label">文件类型：</label>
          <select
            className="artifact-type-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">全部 ({artifacts.length})</option>
            {Object.entries(grouped).map(([type, list]) => (
              <option key={type} value={type}>
                {type} ({list.length})
              </option>
            ))}
          </select>
        </div>
        <div className="empty-state"><div className="empty-state-text">当前类型筛选下没有文件</div></div>
      </div>
    );
  }

  return (
    <div className="artifacts-list">
      <div className="artifacts-filter">
        <label className="form-label">文件类型：</label>
        <select
          className="artifact-type-select"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="all">全部 ({artifacts.length})</option>
          {Object.entries(grouped).map(([type, list]) => (
            <option key={type} value={type}>
              {type} ({list.length})
            </option>
          ))}
        </select>
      </div>

      <div className="artifacts-stats">
        {filterType !== 'all'
          ? `显示 ${filtered.length} 个 ${filterType} 文件（相对工作区目录树）`
          : `共 ${artifacts.length} 个文件（根：工作空间）`}
      </div>

      <div className="artifact-tree-root">
        <div className="artifact-tree-workspace-root">
          <span className="artifact-tree-chev">▾</span>
          <span className="artifact-tree-icon">📁</span>
          <span>工作空间</span>
        </div>
        <div className="artifact-tree-under-root">
          <TreeDir node={tree} depth={0} onPick={setPreviewArtifact} />
        </div>
      </div>

      {previewArtifact && (
        <ArtifactPreview
          artifact={previewArtifact}
          onClose={() => setPreviewArtifact(null)}
        />
      )}
    </div>
  );
}
