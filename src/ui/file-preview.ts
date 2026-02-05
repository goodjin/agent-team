import { OutputFile } from '../types/output.js';
import { PreviewResult } from './results-ui.js';

export interface PreviewConfig {
  maxImageWidth: number;
  maxImageHeight: number;
  maxCodeLineLength: number;
  maxTextPreviewLength: number;
  showLineNumbers: boolean;
  theme: 'dark' | 'light';
}

export interface ImagePreviewOptions {
  maxWidth?: number;
  maxHeight?: number;
  preserveAspectRatio: boolean;
}

export interface CodePreviewOptions {
  showLineNumbers: boolean;
  maxLines: number;
  highlightLanguage: boolean;
}

export class FilePreview {
  private config: PreviewConfig;
  private supportedImageTypes: Set<string>;
  private supportedCodeTypes: Set<string>;
  private supportedTextTypes: Set<string>;

  constructor(config?: Partial<PreviewConfig>) {
    this.config = {
      maxImageWidth: 1200,
      maxImageHeight: 800,
      maxCodeLineLength: 200,
      maxTextPreviewLength: 5000,
      showLineNumbers: true,
      theme: 'dark',
      ...config,
    };
    this.supportedImageTypes = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp']);
    this.supportedCodeTypes = new Set(['js', 'ts', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'html', 'css', 'scss', 'json', 'yaml', 'yml', 'md', 'xml', 'sql', 'sh', 'bash', 'zsh', 'dockerfile']);
    this.supportedTextTypes = new Set(['txt', 'log', 'csv', 'ini', 'conf', 'env', 'properties', 'readme', 'license', 'notice']);
  }

  canPreview(file: OutputFile): boolean {
    if (!file.content) {
      return false;
    }

    if (file.size > this.config.maxTextPreviewLength * 2) {
      return false;
    }

    const ext = file.path.split('.').pop()?.toLowerCase() || '';

    if (file.mimeType?.startsWith('image/')) {
      return this.supportedImageTypes.has(ext);
    }

    if (this.supportedCodeTypes.has(ext)) {
      return true;
    }

    if (this.supportedTextTypes.has(ext)) {
      return true;
    }

    return false;
  }

  getPreviewType(file: OutputFile): PreviewResult['type'] | null {
    if (!file.content) {
      return 'download';
    }

    const ext = file.path.split('.').pop()?.toLowerCase() || '';

    if (file.mimeType?.startsWith('image/') || this.supportedImageTypes.has(ext)) {
      return 'image';
    }

    if (['md', 'markdown'].includes(ext)) {
      return 'markdown';
    }

    if (['html', 'htm'].includes(ext)) {
      return 'iframe';
    }

    if (this.supportedCodeTypes.has(ext)) {
      return 'code';
    }

    return 'text';
  }

  previewAsHtml(file: OutputFile): string {
    const previewType = this.getPreviewType(file);
    if (!previewType) {
      return this.renderUnsupported(file);
    }

    switch (previewType) {
      case 'image':
        return this.renderImagePreview(file);
      case 'code':
        return this.renderCodePreview(file);
      case 'markdown':
        return this.renderMarkdownPreview(file);
      case 'iframe':
        return this.renderIframePreview(file);
      case 'text':
        return this.renderTextPreview(file);
      default:
        return this.renderDownloadPrompt(file);
    }
  }

  previewAsTerminal(file: OutputFile, width: number = 80): string {
    const previewType = this.getPreviewType(file);
    if (!previewType || previewType === 'image' || previewType === 'iframe') {
      return this.renderTextPreview(file, Math.min(width, 80));
    }

    if (previewType === 'download') {
      return `📄 ${file.name}\n   Path: ${file.path}\n   Size: ${this.formatSize(file.size)}\n   Type: ${file.mimeType || 'unknown'}\n   Content: Not available (download only)`;
    }

    return this.renderCodePreview(file, Math.min(width, 80));
  }

  private renderImagePreview(file: OutputFile, options?: ImagePreviewOptions): string {
    const maxWidth = options?.maxWidth || this.config.maxImageWidth;
    const maxHeight = options?.maxHeight || this.config.maxImageHeight;
    const mimeType = file.mimeType || 'image/png';
    const content = file.content || '';

    let dataUrl = content;
    if (!dataUrl.startsWith('data:')) {
      const base64 = Buffer.from(content, 'binary').toString('base64');
      dataUrl = `data:${mimeType};base64,${base64}`;
    }

    return `<div class="image-preview">
  <img src="${dataUrl}" alt="${file.name}" style="max-width: ${maxWidth}px; max-height: ${maxHeight}px;" />
  <div class="file-info">
    <span class="file-name">${file.name}</span>
    <span class="file-size">${this.formatSize(file.size)}</span>
  </div>
</div>`;
  }

  private renderCodePreview(file: OutputFile, _width?: number): string {
    const ext = file.path.split('.').pop()?.toLowerCase() || '';
    const language = this.getLanguageName(ext);
    const content = file.content || '';
    const lines = content.split('\n');
    const maxLines = 100;

    let displayLines = lines;
    if (lines.length > maxLines) {
      displayLines = lines.slice(0, maxLines);
    }

    const lineNumbers = this.config.showLineNumbers
      ? displayLines.map((_, i) => String(i + 1).padStart(4)).join('\n')
      : '';

    const highlightedCode = this.highlightCode(displayLines.join('\n'), ext);

    return `<div class="code-preview" data-language="${language}">
  <div class="code-header">
    <span class="file-name">${file.name}</span>
    <span class="file-size">${this.formatSize(file.size)}</span>
    <span class="language-badge">${language}</span>
  </div>
  <pre class="code-content ${this.config.theme}"><code>${highlightedCode}</code></pre>
</div>`;
  }

  private renderMarkdownPreview(file: OutputFile): string {
    const content = file.content || '';
    const htmlContent = this.parseMarkdown(content);

    return `<div class="markdown-preview">
  <div class="markdown-header">
    <span class="file-name">${file.name}</span>
    <span class="file-size">${this.formatSize(file.size)}</span>
  </div>
  <div class="markdown-content">${htmlContent}</div>
</div>`;
  }

  private renderIframePreview(file: OutputFile): string {
    const sandbox = 'allow-scripts allow-same-origin';
    const content = file.content || '';
    const base64 = Buffer.from(content).toString('base64');

    return `<div class="iframe-preview">
  <div class="iframe-header">
    <span class="file-name">${file.name}</span>
    <a href="data:text/html;base64,${base64}" download="${file.name}" class="download-link">Download</a>
  </div>
  <iframe src="data:text/html;base64,${base64}" sandbox="${sandbox}" class="preview-frame"></iframe>
</div>`;
  }

  private renderTextPreview(file: OutputFile, width?: number): string {
    let content = file.content || '';

    const maxLength = this.config.maxTextPreviewLength;
    if (content.length > maxLength) {
      content = content.slice(0, maxLength) + '\n... (truncated)';
    }

    if (width) {
      content = this.wrapText(content, width);
    }

    const escapedContent = this.escapeHtml(content);

    return `<div class="text-preview">
  <div class="text-header">
    <span class="file-name">${file.name}</span>
    <span class="file-size">${this.formatSize(file.size)}</span>
  </div>
  <pre class="text-content">${escapedContent}</pre>
</div>`;
  }

  private renderUnsupported(file: OutputFile): string {
    return `<div class="unsupported-preview">
  <div class="unsupported-header">
    <span class="file-name">${file.name}</span>
    <span class="file-size">${this.formatSize(file.size)}</span>
  </div>
  <div class="unsupported-message">
    <p>Preview not available for this file type.</p>
    <a href="#" class="download-link" data-path="${file.path}">Download file</a>
  </div>
</div>`;
  }

  private renderDownloadPrompt(file: OutputFile): string {
    return `<div class="download-prompt">
  <p>File content is not available for preview:</p>
  <ul>
    <li><strong>Name:</strong> ${file.name}</li>
    <li><strong>Path:</strong> ${file.path}</li>
    <li><strong>Size:</strong> ${this.formatSize(file.size)}</li>
    <li><strong>Type:</strong> ${file.mimeType || 'unknown'}</li>
  </ul>
</div>`;
  }

  private getLanguageName(ext: string): string {
    const languageMap: Record<string, string> = {
      js: 'JavaScript',
      ts: 'TypeScript',
      py: 'Python',
      java: 'Java',
      c: 'C',
      cpp: 'C++',
      cs: 'C#',
      go: 'Go',
      rs: 'Rust',
      rb: 'Ruby',
      php: 'PHP',
      swift: 'Swift',
      kt: 'Kotlin',
      html: 'HTML',
      css: 'CSS',
      scss: 'SCSS',
      json: 'JSON',
      yaml: 'YAML',
      yml: 'YAML',
      md: 'Markdown',
      xml: 'XML',
      sql: 'SQL',
      sh: 'Shell',
      bash: 'Bash',
      zsh: 'Zsh',
      dockerfile: 'Docker',
    };

    return languageMap[ext] || ext.toUpperCase();
  }

  private highlightCode(code: string, _ext: string): string {
    const escaped = this.escapeHtml(code);
    return escaped;
  }

  private parseMarkdown(markdown: string): string {
    let html = this.escapeHtml(markdown);

    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

    html = html.replace(/^\- (.*$)/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';

    return html;
  }

  private wrapText(text: string, width: number): string {
    const lines = text.split('\n');
    const wrappedLines: string[] = [];

    for (const line of lines) {
      if (line.length <= width) {
        wrappedLines.push(line);
      } else {
        let remaining = line;
        while (remaining.length > width) {
          let cutIndex = width;
          while (cutIndex > 0 && remaining[cutIndex] !== ' ') {
            cutIndex--;
          }
          if (cutIndex === 0) {
            cutIndex = width;
          }
          wrappedLines.push(remaining.slice(0, cutIndex));
          remaining = remaining.slice(cutIndex + 1).trim();
        }
        if (remaining) {
          wrappedLines.push(remaining);
        }
      }
    }

    return wrappedLines.join('\n');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }
}
