import { Router } from 'express';
import type { Request, Response } from 'express';
import { MetricsCollector } from '../../observability/metrics.js';
import { StructuredLogger } from '../../observability/logger.js';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

export function createObservabilityRouter(): Router {
  const router = Router();

  // ─── GET /api/metrics ────────────────────────────────────────────────────
  // Returns a JSON snapshot of all current metrics.
  router.get('/metrics', (_req: Request, res: Response) => {
    try {
      const metrics = MetricsCollector.getInstance();
      const snapshot = metrics.getSnapshot();
      res.json({
        ok: true,
        snapshotTime: new Date().toISOString(),
        metrics: snapshot,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });

  // ─── GET /api/metrics/prometheus ─────────────────────────────────────────
  // Returns a simplified Prometheus text format exposition.
  router.get('/metrics/prometheus', (_req: Request, res: Response) => {
    try {
      const metrics = MetricsCollector.getInstance();
      const snapshot = metrics.getSnapshot();

      const lines: string[] = [];
      const now = snapshot.timestamp;

      // Counters
      for (const [key, value] of Object.entries(snapshot.counters)) {
        const safeName = key.replace(/[^a-zA-Z0-9_{}"=,]/g, '_');
        lines.push(`# TYPE ${safeName} counter`);
        lines.push(`${safeName} ${value} ${now}`);
      }

      // Gauges
      for (const [key, value] of Object.entries(snapshot.gauges)) {
        const safeName = key.replace(/[^a-zA-Z0-9_{}"=,]/g, '_');
        lines.push(`# TYPE ${safeName} gauge`);
        lines.push(`${safeName} ${value} ${now}`);
      }

      // Histograms (summary)
      for (const [key, hist] of Object.entries(snapshot.histograms)) {
        const safeName = key.replace(/[^a-zA-Z0-9_{}"=,]/g, '_');
        lines.push(`# TYPE ${safeName} summary`);
        lines.push(`${safeName}_count ${hist.count} ${now}`);
        lines.push(`${safeName}_sum ${hist.sum} ${now}`);
        if (hist.p50 !== undefined) {
          lines.push(`${safeName}{quantile="0.5"} ${hist.p50} ${now}`);
        }
        if (hist.p95 !== undefined) {
          lines.push(`${safeName}{quantile="0.95"} ${hist.p95} ${now}`);
        }
      }

      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      res.send(lines.join('\n') + '\n');
    } catch (err) {
      res.status(500).send(`# Error: ${(err as Error).message}\n`);
    }
  });

  // ─── GET /api/logs ────────────────────────────────────────────────────────
  // Query params: level, module, limit (default 100, max 1000)
  router.get('/logs', async (req: Request, res: Response) => {
    try {
      const level = req.query['level'] as string | undefined;
      const module = req.query['module'] as string | undefined;
      const limitStr = (req.query['limit'] as string | undefined) ?? '100';
      const maxLimit = Math.min(parseInt(limitStr, 10) || 100, 1000);

      const today = new Date().toISOString().slice(0, 10);
      // Determine log directory from the singleton logger instance
      const logDir = (StructuredLogger.getInstance() as unknown as { logDir: string }).logDir
        ?? 'workspace/logs';
      const logFile = join(logDir, `${today}.log`);

      if (!existsSync(logFile)) {
        return res.json({ ok: true, logs: [], total: 0 });
      }

      const logs: unknown[] = [];
      const rl = createInterface({ input: createReadStream(logFile) });

      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as Record<string, unknown>;

          if (level && entry['level'] !== level) continue;
          if (module && entry['module'] !== module) continue;

          logs.push(entry);
          if (logs.length >= maxLimit) break;
        } catch {
          // skip malformed lines
        }
      }

      res.json({ ok: true, logs, total: logs.length });
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });

  // ─── GET /api/health ─────────────────────────────────────────────────────
  // Returns a basic health status including uptime and memory usage.
  router.get('/health', (_req: Request, res: Response) => {
    try {
      const mem = process.memoryUsage();
      res.json({
        ok: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
          rssMb: Math.round(mem.rss / 1024 / 1024),
        },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });

  return router;
}
