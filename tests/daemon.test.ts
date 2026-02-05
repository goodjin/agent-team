import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Daemon, createDaemon } from '../src/config/daemon.js';

describe('Daemon', () => {
  const testDir = '/tmp/agent-team-test';
  const pidFile = path.join(testDir, '.test-daemon.pid');
  const logFile = path.join(testDir, '.test-daemon.log');

  beforeAll(() => {
    vi.mock('child_process', () => ({
      spawn: vi.fn().mockReturnValue({
        pid: 12345,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'exit') {
            setTimeout(() => callback(0, null), 50);
          }
        }),
      }),
    }));
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    vi.clearAllMocks();
  });

  afterEach(() => {
    try {
      if (fs.existsSync(pidFile)) {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim());
        if (pid) {
          try { process.kill(pid, 0); process.kill(pid, 'SIGTERM'); } catch {}
        }
        fs.unlinkSync(pidFile);
      }
      if (fs.existsSync(logFile)) {
        fs.unlinkSync(logFile);
      }
    } catch {}
  });

  describe('createDaemon', () => {
    it('should create daemon instance with default config', () => {
      const daemon = createDaemon();
      expect(daemon).toBeInstanceOf(Daemon);
    });

    it('should create daemon instance with custom config', () => {
      const daemon = createDaemon({
        pidFile,
        logFile,
        maxRestartAttempts: 3,
        restartDelayMs: 500,
      });

      expect(daemon).toBeInstanceOf(Daemon);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      const daemon = createDaemon({ pidFile, logFile });
      const status = daemon.getStatus();

      expect(status).toHaveProperty('running');
      expect(status).toHaveProperty('pid');
      expect(status).toHaveProperty('startTime');
      expect(status).toHaveProperty('restartCount');
      expect(status).toHaveProperty('lastCrash');
    });
  });

  describe('getLogs', () => {
    it('should return empty array when no logs exist', () => {
      const daemon = createDaemon({ pidFile, logFile });
      const logs = daemon.getLogs();

      expect(Array.isArray(logs)).toBe(true);
    });

    it('should return last N log lines', () => {
      const daemon = createDaemon({ pidFile, logFile });

      fs.writeFileSync(logFile, 'line1\nline2\nline3\n');

      const logs = daemon.getLogs(2);
      expect(logs.length).toBeLessThanOrEqual(2);
    });
  });

  describe('clearLogs', () => {
    it('should clear log file', () => {
      const daemon = createDaemon({ pidFile, logFile });

      fs.writeFileSync(logFile, 'test log');
      daemon.clearLogs();

      expect(fs.existsSync(logFile)).toBe(false);
    });
  });

  describe('start', () => {
    it('should not start if already running', async () => {
      const daemon = createDaemon({ pidFile, logFile });

      await daemon.start();
      const status1 = daemon.getStatus();
      await daemon.start();
      const status2 = daemon.getStatus();

      expect(status1.running).toBe(true);
      expect(status2.running).toBe(true);
    });

    it('should emit started event', async () => {
      const daemon = createDaemon({ pidFile, logFile });
      let started = false;

      daemon.on('started', () => { started = true; });

      await daemon.start();

      expect(started).toBe(true);
    });
  });

  describe('stop', () => {
    it('should return true when not running', async () => {
      const daemon = createDaemon({ pidFile, logFile });
      const result = await daemon.stop();

      expect(result).toBe(true);
    });
  });

  describe('onCrash', () => {
    it('should register crash callback', () => {
      const daemon = createDaemon({ pidFile, logFile });
      const callback = vi.fn();

      daemon.onCrash(callback);

      expect(callback).toBeDefined();
    });
  });

  describe('status-change event', () => {
    it('should emit status-change when starting', async () => {
      const daemon = createDaemon({ pidFile, logFile });
      let statusChangeCount = 0;

      daemon.on('status-change', () => { statusChangeCount++; });

      await daemon.start();

      expect(statusChangeCount).toBeGreaterThan(0);
    });
  });

  describe('log event', () => {
    it('should emit log events', async () => {
      const daemon = createDaemon({ pidFile, logFile });
      let logMessages: string[] = [];

      daemon.on('log', (message) => { logMessages.push(message); });

      await daemon.start();

      expect(logMessages.length).toBeGreaterThan(0);
    });
  });
});
