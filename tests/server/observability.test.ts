import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MetricsCollector } from '../../src/observability/metrics.js';
import { createObservabilityRouter } from '../../src/server/routes/observability.js';

describe('Observability Router', () => {
  let app: express.Application;
  let metrics: MetricsCollector;

  beforeEach(() => {
    // Use a fresh MetricsCollector with a mock dir to avoid side effects
    vi.spyOn(MetricsCollector, 'getInstance').mockReturnValue(
      (() => {
        metrics = new MetricsCollector('/tmp/obs-test-metrics');
        return metrics;
      })()
    );

    app = express();
    app.use('/api', createObservabilityRouter());
  });

  afterEach(() => {
    metrics?.close();
    vi.restoreAllMocks();
  });

  // ─── GET /api/metrics ──────────────────────────────────────────────────

  describe('GET /api/metrics', () => {
    it('returns 200 with ok:true', async () => {
      const res = await request(app).get('/api/metrics').expect(200);
      expect(res.body.ok).toBe(true);
    });

    it('includes snapshotTime as ISO string', async () => {
      const res = await request(app).get('/api/metrics');
      expect(res.body.snapshotTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('includes metrics object with counters, histograms, gauges', async () => {
      const res = await request(app).get('/api/metrics');
      const m = res.body.metrics;
      expect(m).toHaveProperty('counters');
      expect(m).toHaveProperty('histograms');
      expect(m).toHaveProperty('gauges');
    });

    it('reflects recorded counter values', async () => {
      metrics.increment('task.total', 3);
      const res = await request(app).get('/api/metrics');
      expect(res.body.metrics.counters['task.total']).toBe(3);
    });

    it('reflects recorded gauge values', async () => {
      metrics.gauge('system.memory_mb', 128);
      const res = await request(app).get('/api/metrics');
      expect(res.body.metrics.gauges['system.memory_mb']).toBe(128);
    });
  });

  // ─── GET /api/metrics/prometheus ──────────────────────────────────────

  describe('GET /api/metrics/prometheus', () => {
    it('returns 200 with text/plain content type', async () => {
      const res = await request(app)
        .get('/api/metrics/prometheus')
        .expect(200);
      expect(res.headers['content-type']).toContain('text/plain');
    });

    it('contains TYPE comment lines for counters', async () => {
      metrics.increment('req.count');
      const res = await request(app).get('/api/metrics/prometheus');
      expect(res.text).toContain('# TYPE');
    });

    it('contains gauge metric lines', async () => {
      metrics.gauge('cpu.usage', 42);
      const res = await request(app).get('/api/metrics/prometheus');
      expect(res.text).toContain('cpu_usage');
    });
  });

  // ─── GET /api/health ──────────────────────────────────────────────────

  describe('GET /api/health', () => {
    it('returns 200 with ok:true', async () => {
      const res = await request(app).get('/api/health').expect(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns status: healthy', async () => {
      const res = await request(app).get('/api/health');
      expect(res.body.status).toBe('healthy');
    });

    it('includes timestamp as ISO string', async () => {
      const res = await request(app).get('/api/health');
      expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('includes uptime as a positive number', async () => {
      const res = await request(app).get('/api/health');
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.uptime).toBeGreaterThan(0);
    });

    it('includes memory object with heapUsedMb', async () => {
      const res = await request(app).get('/api/health');
      expect(res.body.memory).toHaveProperty('heapUsedMb');
      expect(typeof res.body.memory.heapUsedMb).toBe('number');
    });
  });

  // ─── GET /api/logs ────────────────────────────────────────────────────

  describe('GET /api/logs', () => {
    it('returns 200 with ok:true even when no log file exists', async () => {
      const res = await request(app).get('/api/logs').expect(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.logs)).toBe(true);
    });

    it('returns total as a number', async () => {
      const res = await request(app).get('/api/logs');
      expect(typeof res.body.total).toBe('number');
    });

    it('respects limit query param (no logs to filter, just verifies no crash)', async () => {
      const res = await request(app).get('/api/logs?limit=5').expect(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ─── Error handling ──────────────────────────────────────────────────

  describe('Error handling', () => {
    it('GET /api/metrics returns 500 when MetricsCollector throws', async () => {
      vi.spyOn(MetricsCollector, 'getInstance').mockImplementation(() => {
        throw new Error('metrics unavailable');
      });

      const testApp = express();
      testApp.use('/api', createObservabilityRouter());

      const res = await request(testApp).get('/api/metrics').expect(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBeTruthy();
    });
  });
});
