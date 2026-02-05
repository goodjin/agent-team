import { EventEmitter } from 'eventemitter3';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface DaemonConfig {
  pidFile: string;
  logFile: string;
  maxRestartAttempts: number;
  restartDelayMs: number;
}

export interface DaemonStatus {
  running: boolean;
  pid: number | null;
  startTime: Date | null;
  restartCount: number;
  lastCrash: Date | null;
}

export interface DaemonEvents {
  'status-change': (status: DaemonStatus) => void;
  'log': (message: string) => void;
  'error': (error: Error) => void;
  'started': () => void;
  'stopped': () => void;
  'crashed': (error: Error) => void;
}

export class Daemon extends EventEmitter<DaemonEvents> {
  private config: DaemonConfig;
  private process: ChildProcess | null = null;
  private status: DaemonStatus;
  private restartAttempts: number = 0;
  private crashing: boolean = false;

  constructor(config?: Partial<DaemonConfig>) {
    super();
    this.config = {
      pidFile: config?.pidFile || path.join(process.cwd(), '.daemon.pid'),
      logFile: config?.logFile || path.join(process.cwd(), '.daemon.log'),
      maxRestartAttempts: config?.maxRestartAttempts || 5,
      restartDelayMs: config?.restartDelayMs || 1000,
    };
    this.status = {
      running: false,
      pid: null,
      startTime: null,
      restartCount: 0,
      lastCrash: null,
    };
    this.loadStatus();
  }

  getStatus(): DaemonStatus {
    return { ...this.status };
  }

  private loadStatus(): void {
    try {
      if (fs.existsSync(this.config.pidFile)) {
        const pid = parseInt(fs.readFileSync(this.config.pidFile, 'utf-8').trim());
        try {
          process.kill(pid, 0);
          this.status.pid = pid;
          this.status.running = true;
        } catch {
          this.status.pid = null;
          this.status.running = false;
        }
      }
    } catch (error) {
      this.status.pid = null;
      this.status.running = false;
    }
  }

  private saveStatus(): void {
    fs.writeFileSync(this.config.pidFile, String(this.status.pid || ''));
  }

  private clearStatus(): void {
    try {
      if (fs.existsSync(this.config.pidFile)) {
        fs.unlinkSync(this.config.pidFile);
      }
    } catch (error) {
    }
  }

  private writeLog(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(this.config.logFile, logMessage);
    this.emit('log', message);
  }

  async start(scriptPath?: string): Promise<boolean> {
    if (this.status.running && this.status.pid) {
      this.writeLog('Daemon is already running');
      return false;
    }

    this.writeLog('Starting daemon...');

    const script = scriptPath || path.join(process.cwd(), 'dist', 'index.js');

    if (!fs.existsSync(script)) {
      const error = new Error(`Script not found: ${script}`);
      this.emit('error', error);
      return false;
    }

    try {
      this.process = spawn('node', [script], {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, DAEMON_MODE: 'true' },
      });

      this.status.pid = this.process.pid || null;
      this.status.running = true;
      this.status.startTime = new Date();
      this.saveStatus();

      this.writeLog(`Daemon started with PID: ${this.status.pid}`);

      this.process.stdout?.on('data', (data) => {
        this.writeLog(`[STDOUT] ${data.toString().trim()}`);
      });

      this.process.stderr?.on('data', (data) => {
        this.writeLog(`[STDERR] ${data.toString().trim()}`);
      });

      this.process.on('exit', (code, signal) => {
        this.handleExit(code, signal);
      });

      this.process.on('error', (error) => {
        this.handleError(error);
      });

      this.emit('started');
      this.emitStatusChange();

      return true;
    } catch (error) {
      this.emit('error', error as Error);
      return false;
    }
  }

  async stop(): Promise<boolean> {
    if (!this.status.running || !this.status.pid) {
      this.writeLog('Daemon is not running');
      return true;
    }

    this.writeLog(`Stopping daemon (PID: ${this.status.pid})...`);

    try {
      this.crashing = true;
      process.kill(this.status.pid, 'SIGTERM');

      const checkInterval = setInterval(() => {
        try {
          process.kill(this.status.pid!, 0);
        } catch {
          clearInterval(checkInterval);
          this.completeStop();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        try {
          process.kill(this.status.pid!, 'SIGKILL');
        } catch {
        }
        this.completeStop();
      }, 5000);

      return true;
    } catch (error) {
      this.completeStop();
      return true;
    }
  }

  private completeStop(): void {
    this.writeLog('Daemon stopped');
    this.process = null;
    this.status.running = false;
    this.status.pid = null;
    this.clearStatus();
    this.emit('stopped');
    this.emitStatusChange();
  }

  async restart(scriptPath?: string): Promise<boolean> {
    this.writeLog('Restarting daemon...');
    await this.stop();
    await this.delay(this.config.restartDelayMs);
    return this.start(scriptPath);
  }

  onCrash(callback: (error: Error) => void): void {
    this.on('crashed', callback);
  }

  private handleExit(code: number | null, signal: string | null): void {
    if (this.crashing) {
      return;
    }

    const error = new Error(`Daemon exited with code ${code}, signal: ${signal}`);
    this.writeLog(`Daemon crashed: ${error.message}`);
    this.status.lastCrash = new Date();

    this.emit('crashed', error);

    if (this.restartAttempts < this.config.maxRestartAttempts) {
      this.restartAttempts++;
      this.status.restartCount = this.restartAttempts;
      this.writeLog(`Attempting restart (${this.restartAttempts}/${this.config.maxRestartAttempts})...`);
      this.emitStatusChange();

      setTimeout(() => {
        this.start().then(() => {
          this.restartAttempts = 0;
        });
      }, this.config.restartDelayMs);
    } else {
      this.writeLog('Max restart attempts reached, giving up');
      this.completeStop();
    }
  }

  private handleError(error: Error): void {
    this.writeLog(`Daemon error: ${error.message}`);
    this.emit('error', error);
  }

  private emitStatusChange(): void {
    this.emit('status-change', this.getStatus());
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getLogs(lines: number = 100): string[] {
    try {
      if (fs.existsSync(this.config.logFile)) {
        const content = fs.readFileSync(this.config.logFile, 'utf-8');
        return content.split('\n').filter(Boolean).slice(-lines);
      }
    } catch {
    }
    return [];
  }

  clearLogs(): void {
    try {
      if (fs.existsSync(this.config.logFile)) {
        fs.unlinkSync(this.config.logFile);
      }
    } catch {
    }
  }
}

export function createDaemon(config?: Partial<DaemonConfig>): Daemon {
  return new Daemon(config);
}
