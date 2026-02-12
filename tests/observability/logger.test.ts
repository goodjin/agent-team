import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StructuredLogger } from '../../src/observability/logger.js';

describe('StructuredLogger', () => {
  let tmpDir: string;
  let logger: StructuredLogger;

  beforeEach(() => {
    vi.useRealTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
    logger = new StructuredLogger({
      logDir: tmpDir,
      minLevel: 'debug',
      console: false,
    });
    // Override singleton so each test gets a clean instance
    StructuredLogger.setInstance(logger);
  });

  afterEach(() => {
    logger.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the log directory if it does not exist', () => {
    const nested = path.join(tmpDir, 'a', 'b', 'c');
    const l = new StructuredLogger({ logDir: nested, console: false });
    expect(fs.existsSync(nested)).toBe(true);
    l.close();
  });

  it('writes a log entry to file as JSONL', async () => {
    logger.info('test-module', 'test.event', { message: 'hello world' });
    await logger.flush();

    const date = new Date().toISOString().slice(0, 10);
    const logFile = path.join(tmpDir, `${date}.log`);
    expect(fs.existsSync(logFile)).toBe(true);

    const content = fs.readFileSync(logFile, 'utf-8').trim();
    expect(content.length).toBeGreaterThan(0);

    const entry = JSON.parse(content.split('\n')[0]);
    expect(entry.level).toBe('info');
    expect(entry.module).toBe('test-module');
    expect(entry.event).toBe('test.event');
    expect(entry.message).toBe('hello world');
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('respects minLevel - filters out lower-level messages', async () => {
    const warnLogger = new StructuredLogger({
      logDir: tmpDir,
      minLevel: 'warn',
      console: false,
    });

    warnLogger.debug('mod', 'debug.event', { message: 'debug msg' });
    warnLogger.info('mod', 'info.event', { message: 'info msg' });
    warnLogger.warn('mod', 'warn.event', { message: 'warn msg' });
    warnLogger.error('mod', 'error.event', { message: 'error msg' });
    await warnLogger.flush();
    warnLogger.close();

    const date = new Date().toISOString().slice(0, 10);
    const logFile = path.join(tmpDir, `${date}.log`);

    if (fs.existsSync(logFile)) {
      const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
      const levels = lines.map((l) => JSON.parse(l).level);
      expect(levels.includes('debug')).toBe(false);
      expect(levels.includes('info')).toBe(false);
      expect(levels.includes('warn')).toBe(true);
      expect(levels.includes('error')).toBe(true);
    }
  });

  it('all four log levels write entries', async () => {
    logger.debug('m', 'ev.debug', { message: 'debug' });
    logger.info('m', 'ev.info', { message: 'info' });
    logger.warn('m', 'ev.warn', { message: 'warn' });
    logger.error('m', 'ev.error', { message: 'error' });
    await logger.flush();

    const date = new Date().toISOString().slice(0, 10);
    const logFile = path.join(tmpDir, `${date}.log`);
    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(4);

    const levels = lines.map((l) => JSON.parse(l).level);
    expect(levels).toContain('debug');
    expect(levels).toContain('info');
    expect(levels).toContain('warn');
    expect(levels).toContain('error');
  });

  it('child logger inherits parent context', async () => {
    const child = logger.child({ taskId: 'task-42', agentId: 'agent-1' });
    child.info('child-mod', 'child.event', { message: 'from child' });
    await child.flush();

    const date = new Date().toISOString().slice(0, 10);
    const logFile = path.join(tmpDir, `${date}.log`);
    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.taskId).toBe('task-42');
    expect(entry.agentId).toBe('agent-1');
    child.close();
  });

  it('getInstance returns singleton', () => {
    const a = StructuredLogger.getInstance();
    const b = StructuredLogger.getInstance();
    expect(a).toBe(b);
  });

  it('setInstance replaces singleton', () => {
    const custom = new StructuredLogger({ logDir: tmpDir, console: false });
    StructuredLogger.setInstance(custom);
    expect(StructuredLogger.getInstance()).toBe(custom);
    custom.close();
  });

  it('flush resolves without error when buffer is empty', async () => {
    await expect(logger.flush()).resolves.toBeUndefined();
  });

  it('includes error field when provided', async () => {
    logger.error('m', 'some.error', {
      message: 'something broke',
      error: { name: 'TypeError', message: 'bad input', stack: 'at ...' },
    });
    await logger.flush();

    const date = new Date().toISOString().slice(0, 10);
    const logFile = path.join(tmpDir, `${date}.log`);
    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.error).toBeDefined();
    expect(entry.error.name).toBe('TypeError');
  });

  it('console output is suppressed when console=false', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    logger.info('m', 'ev', { message: 'quiet' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('console output is written when console=true', async () => {
    const consoleLogger = new StructuredLogger({
      logDir: tmpDir,
      console: true,
      minLevel: 'debug',
    });
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleLogger.info('m', 'ev', { message: 'loud' });
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain('[INFO]');
    expect(output).toContain('ev');
    spy.mockRestore();
    consoleLogger.close();
  });
});
