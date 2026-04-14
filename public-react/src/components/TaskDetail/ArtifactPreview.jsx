import { useState, useEffect } from 'react';
import { fetchArtifactContent, getArtifactRawUrl } from '../../api.js';

/**
 * 成品预览弹出窗口
 * @param {Object} artifact - 成品对象 { id, name, mimeType }
 * @param {Function} onClose - 关闭回调
 */
export default function ArtifactPreview({ artifact, onClose }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!artifact?.id) return;
    setLoading(true);
    setError('');
    fetchArtifactContent(artifact.id)
      .then(data => {
        const raw = data?.content ?? data;
        setContent(typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2));
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [artifact?.id]);

  if (!artifact) return null;

  const name = artifact.name || '';
  const ext = name.split('.').pop()?.toLowerCase();
  const mime = artifact.mimeType || '';
  const isJson = mime.includes('json') || ext === 'json';
  const isMarkdown = mime.includes('markdown') || ext === 'md';
  const isImage = mime.startsWith('image/') || ['png','jpg','jpeg','gif','svg','webp'].includes(ext);
  const isPdf = mime.includes('pdf') || ext === 'pdf';
  const isText = mime.startsWith('text/') ||
    isJson || isMarkdown ||
    /\.(txt|md|js|ts|jsx|tsx|css|html|yaml|yml|xml|sh|py|go|rs|toml|ini)$/i.test(name);

  const rawUrl = artifact.id ? getArtifactRawUrl(artifact.id) : '';
  const rendered = isJson
    ? formatJsonHtml(content)
    : isMarkdown
      ? renderMarkdownHtml(content)
      : escapeHtml(content).replace(/\n/g, '<br>');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content artifact-preview-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📄 {artifact.name}</h3>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body artifact-preview-body">
          {loading && <div className="loading"><div className="spinner"></div></div>}
          {error && <div className="error-message">{error}</div>}
          {!loading && !error && isImage && (
            <div style={{ padding: 16 }}>
              <img src={rawUrl} alt={artifact.name} style={{ maxWidth: '100%', borderRadius: 8 }} />
            </div>
          )}
          {!loading && !error && isPdf && (
            <iframe
              title={artifact.name}
              src={rawUrl}
              style={{ width: '100%', height: '70vh', border: 'none' }}
            />
          )}
          {!loading && !error && isText && !isImage && !isPdf && (
            <div
              className={`artifact-rich-preview ${isMarkdown ? 'is-md' : isJson ? 'is-json' : 'is-text'}`}
              dangerouslySetInnerHTML={{ __html: rendered }}
            />
          )}
          {!loading && !error && !isText && (
            <div className="artifact-binary-hint">
              <span>📦</span>
              <p>此文件类型不支持在线预览</p>
              <p className="muted">文件名：{artifact.name}</p>
              <p className="muted">类型：{artifact.mimeType || '未知'}</p>
              {artifact.id && (
                <p className="muted">
                  可尝试打开原文件：<a href={rawUrl} target="_blank" rel="noreferrer">raw</a>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdownHtml(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre class="md-code-block"><code class="lang-${lang}">${escapeHtml(code.trim())}</code></pre>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  html = html.replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  html = html.replace(/^---+$/gm, '<hr>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p>\s*<\/p>/g, '');
  return `<div class="markdown-body">${html}</div>`;
}

function formatJsonHtml(text) {
  try {
    const obj = JSON.parse(text);
    const pretty = JSON.stringify(obj, null, 2);
    return `<pre class="json-pre">${highlightJson(pretty)}</pre>`;
  } catch {
    return `<pre class="json-pre">${escapeHtml(text)}</pre>`;
  }
}

function highlightJson(pretty) {
  const esc = escapeHtml(pretty);
  return esc.replace(
    /(\"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\\"])*\"\\s*:)|(\"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\\"])*\")|\\b(true|false|null)\\b|(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)/g,
    (m, key, str, lit, num) => {
      if (key) return `<span class="json-key">${key}</span>`;
      if (str) return `<span class="json-string">${str}</span>`;
      if (lit) return `<span class="json-literal">${lit}</span>`;
      if (num) return `<span class="json-number">${num}</span>`;
      return m;
    }
  );
}
