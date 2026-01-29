import readline from 'readline';
import chalk from 'chalk';
import boxen from 'boxen';

type RoleBlock = {
  role: string;
  content: string;
};

export type EnhancedChatUIOptions = {
  inputPrompt?: string;
  maxOutputLines?: number;
  showTimestamps?: boolean;
  colorizeRoles?: boolean;
};

/**
 * 增强的聊天UI
 * 提供更好的格式化和可视化体验
 */
export class EnhancedChatUI {
  private blocks: Map<string, RoleBlock> = new Map();
  private order: string[] = [];
  private inputPrompt: string;
  private inputBuffer = '';
  private cursorIndex = 0;
  private scrollOffset = 0;
  private history: string[] = [];
  private historyIndex = -1;
  private pendingResolve: ((value: string) => void) | null = null;
  private started = false;
  private isRendering = false;
  private maxOutputLines?: number;
  private showTimestamps: boolean;
  private colorizeRoles: boolean;

  // 角色颜色映射
  private roleColors: Record<string, (text: string) => string> = {
    system: chalk.gray,
    user: chalk.cyan,
    assistant: chalk.green,
    'product-manager': chalk.blue,
    architect: chalk.magenta,
    developer: chalk.yellow,
    tester: chalk.red,
    'doc-writer': chalk.cyan,
  };

  constructor(options: EnhancedChatUIOptions = {}) {
    this.inputPrompt = options.inputPrompt || chalk.cyan('You: ');
    this.maxOutputLines = options.maxOutputLines;
    this.showTimestamps = options.showTimestamps ?? false;
    this.colorizeRoles = options.colorizeRoles ?? true;
  }

  isActive(): boolean {
    return this.started;
  }

  start(): void {
    if (this.started || !process.stdout.isTTY || !process.stdin.isTTY) return;
    this.started = true;
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', this.onKeypress);
    this.render();
  }

  close(): void {
    if (!this.started) return;
    process.stdin.off('keypress', this.onKeypress);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    this.started = false;
    this.showCursor();
    process.stdout.write('\n');
  }

  async readLine(prompt?: string): Promise<string> {
    if (prompt) {
      this.inputPrompt = prompt;
    }
    this.start();
    this.inputBuffer = '';
    this.cursorIndex = 0;
    this.historyIndex = -1;
    this.render();
    return new Promise<string>((resolve) => {
      this.pendingResolve = resolve;
    });
  }

  appendRole(role: string, text: string): void {
    if (!role) return;
    if (!this.blocks.has(role)) {
      this.blocks.set(role, { role, content: '' });
      this.order.push(role);
    }
    const block = this.blocks.get(role)!;
    block.content += text;
    this.render();
  }

  async streamRole(role: string, text: string, chunkSize = 12, delayMs = 10): Promise<void> {
    if (!text) return;
    this.appendRole(role, '');
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    for (const chunk of chunks) {
      this.appendRole(role, chunk);
      await this.sleep(delayMs);
    }
  }

  appendSystem(text: string): void {
    this.appendRole('system', text);
  }

  clearOutput(): void {
    this.blocks.clear();
    this.order = [];
    this.scrollOffset = 0;
    this.render();
  }

  scrollBy(delta: number): void {
    const totalLines = this.buildOutputLines(this.getContentWidth()).length;
    const outputHeight = this.getOutputHeight();
    const maxOffset = Math.max(0, totalLines - outputHeight);
    this.scrollOffset = Math.max(0, Math.min(maxOffset, this.scrollOffset + delta));
    this.render();
  }

  private onKeypress = (str: string, key: readline.Key) => {
    if (!this.pendingResolve) return;

    if (key && key.ctrl && key.name === 'c') {
      this.close();
      process.exit(0);
    }

    if (key.name === 'return') {
      const line = this.inputBuffer;
      this.history.push(line);
      this.pendingResolve(line);
      this.pendingResolve = null;
      this.inputBuffer = '';
      this.cursorIndex = 0;
      this.historyIndex = -1;
      this.render();
      return;
    }

    if (key.name === 'backspace') {
      if (this.cursorIndex > 0) {
        this.inputBuffer =
          this.inputBuffer.slice(0, this.cursorIndex - 1) +
          this.inputBuffer.slice(this.cursorIndex);
        this.cursorIndex--;
        this.render();
      }
      return;
    }

    if (key.name === 'delete') {
      if (this.cursorIndex < this.inputBuffer.length) {
        this.inputBuffer =
          this.inputBuffer.slice(0, this.cursorIndex) +
          this.inputBuffer.slice(this.cursorIndex + 1);
        this.render();
      }
      return;
    }

    if (key.name === 'left') {
      if (this.cursorIndex > 0) {
        this.cursorIndex--;
        this.render();
      }
      return;
    }

    if (key.name === 'right') {
      if (this.cursorIndex < this.inputBuffer.length) {
        this.cursorIndex++;
        this.render();
      }
      return;
    }

    if (key.name === 'up') {
      if (this.history.length > 0) {
        if (this.historyIndex < 0) {
          this.historyIndex = this.history.length - 1;
        } else if (this.historyIndex > 0) {
          this.historyIndex--;
        }
        this.inputBuffer = this.history[this.historyIndex] || '';
        this.cursorIndex = this.inputBuffer.length;
        this.render();
      }
      return;
    }

    if (key.name === 'down') {
      if (this.history.length > 0) {
        if (this.historyIndex >= 0 && this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          this.inputBuffer = this.history[this.historyIndex] || '';
        } else {
          this.historyIndex = -1;
          this.inputBuffer = '';
        }
        this.cursorIndex = this.inputBuffer.length;
        this.render();
      }
      return;
    }

    if (key.name === 'pageup') {
      this.scrollBy(3);
      return;
    }

    if (key.name === 'pagedown') {
      this.scrollBy(-3);
      return;
    }

    if (key.name === 'home') {
      this.cursorIndex = 0;
      this.render();
      return;
    }

    if (key.name === 'end') {
      this.cursorIndex = this.inputBuffer.length;
      this.render();
      return;
    }

    if (str && !key.ctrl && !key.meta) {
      this.inputBuffer =
        this.inputBuffer.slice(0, this.cursorIndex) +
        str +
        this.inputBuffer.slice(this.cursorIndex);
      this.cursorIndex += str.length;
      this.render();
    }
  };

  private render(): void {
    if (!this.started || this.isRendering) return;
    this.isRendering = true;

    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;
    const inputHeight = 3;
    const outputHeight = Math.max(1, rows - inputHeight);
    const outputLines = this.buildOutputLines(this.getContentWidth());
    const totalLines = outputLines.length;
    const maxOffset = Math.max(0, totalLines - outputHeight);
    if (this.scrollOffset > maxOffset) {
      this.scrollOffset = maxOffset;
    }

    const showScrollbar = totalLines > outputHeight;
    const contentWidth = showScrollbar ? cols - 1 : cols;
    const start = Math.max(0, totalLines - outputHeight - this.scrollOffset);
    const visible = outputLines.slice(start, start + outputHeight);

    this.hideCursor();
    process.stdout.write('\x1b[H\x1b[2J');

    const scrollbar = this.getScrollbar(outputHeight, totalLines, start);
    for (let i = 0; i < outputHeight; i++) {
      const line = (visible[i] || '').slice(0, contentWidth).padEnd(contentWidth, ' ');
      const scrollChar = showScrollbar ? scrollbar[i] : '';
      process.stdout.write(line + scrollChar + '\n');
    }

    // 使用更好的边框样式
    const topBorder = chalk.gray('┌' + '─'.repeat(Math.max(0, cols - 2)) + '┐');
    const bottomBorder = chalk.gray('└' + '─'.repeat(Math.max(0, cols - 2)) + '┘');
    const { inputLine, cursorCol } = this.buildInputLine(cols);

    process.stdout.write(topBorder + '\n');
    process.stdout.write(inputLine + '\n');
    process.stdout.write(bottomBorder);

    readline.cursorTo(process.stdout, cursorCol, outputHeight + 1);
    this.showCursor();
    this.isRendering = false;
  }

  private buildOutputLines(width: number): string[] {
    const lines: string[] = [];
    const maxLines = this.maxOutputLines;
    
    for (const role of this.order) {
      const block = this.blocks.get(role);
      if (!block) continue;
      
      // 格式化角色标题
      const roleColor = this.colorizeRoles && this.roleColors[role]
        ? this.roleColors[role]
        : (text: string) => text;
      
      const timestamp = this.showTimestamps
        ? chalk.gray(`[${new Date().toLocaleTimeString()}] `)
        : '';
      
      const header = `${timestamp}${roleColor(`[${role}]`)}`;
      lines.push(header);
      
      // 格式化内容
      const contentLines = this.wrapText(block.content, width - 2);
      contentLines.forEach(line => {
        // 检测代码块并高亮
        if (line.trim().startsWith('```')) {
          lines.push(chalk.gray(line));
        } else if (line.trim().match(/^\s*(function|const|let|var|class|interface|type|import|export)\s/)) {
          lines.push(chalk.yellow(line));
        } else {
          lines.push(line);
        }
      });
      lines.push('');
    }
    
    if (maxLines && lines.length > maxLines) {
      return lines.slice(lines.length - maxLines);
    }
    return lines;
  }

  private wrapText(text: string, width: number): string[] {
    if (!text) return [''];
    const lines: string[] = [];
    const parts = text.replace(/\r/g, '').split('\n');
    for (const part of parts) {
      if (part === '') {
        lines.push('');
        continue;
      }
      let start = 0;
      while (start < part.length) {
        lines.push(part.slice(start, start + width));
        start += width;
      }
    }
    return lines;
  }

  private buildInputLine(cols: number): { inputLine: string; cursorCol: number } {
    const innerWidth = Math.max(1, cols - 2);
    const full = this.inputPrompt.replace(/\x1b\[[0-9;]*m/g, '') + this.inputBuffer; // 去除ANSI码计算长度
    const cursorInFull = this.inputPrompt.replace(/\x1b\[[0-9;]*m/g, '').length + this.cursorIndex;
    let start = 0;
    if (full.length > innerWidth) {
      start = Math.max(0, cursorInFull - innerWidth + 1);
      const maxStart = full.length - innerWidth;
      if (start > maxStart) start = maxStart;
    }
    const visible = (this.inputPrompt + this.inputBuffer).slice(start, start + innerWidth);
    const cursorCol = 1 + (cursorInFull - start);
    const line = chalk.gray('│') + visible.padEnd(innerWidth, ' ') + chalk.gray('│');
    return { inputLine: line, cursorCol };
  }

  private getScrollbar(viewHeight: number, totalLines: number, start: number): string[] {
    const bar: string[] = new Array(viewHeight).fill(' ');
    if (totalLines <= viewHeight) {
      return bar;
    }
    const maxOffset = totalLines - viewHeight;
    const ratio = maxOffset === 0 ? 0 : start / maxOffset;
    const thumbSize = Math.max(1, Math.round((viewHeight * viewHeight) / totalLines));
    const thumbTop = Math.round((viewHeight - thumbSize) * ratio);
    for (let i = 0; i < viewHeight; i++) {
      if (i >= thumbTop && i < thumbTop + thumbSize) {
        bar[i] = chalk.cyan('#');
      } else {
        bar[i] = chalk.gray('│');
      }
    }
    return bar;
  }

  private getOutputHeight(): number {
    const rows = process.stdout.rows || 24;
    return Math.max(1, rows - 3);
  }

  private getContentWidth(): number {
    const cols = process.stdout.columns || 80;
    return Math.max(1, cols - 1);
  }

  private hideCursor(): void {
    process.stdout.write('\x1b[?25l');
  }

  private showCursor(): void {
    process.stdout.write('\x1b[?25h');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
