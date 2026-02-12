# Task 07：指标 API 端点

**优先级**: P1
**预估工时**: 3h
**依赖**: Task 3（MetricsCollector）
**阶段**: Phase 2

---

## 目标

在现有 Web 服务器（`src/server/`）上新增三个只读 API 端点，分别提供指标快照、日志查询和 Trace 查询功能，不修改现有路由。

---

## 输入文件

- `src/server/` - 了解现有路由结构和框架
- `src/observability/metrics.ts` - Task 3 输出
- `src/observability/logger.ts` - Task 1 输出（用于日志查询）
- `src/observability/tracer.ts` - Task 2 输出（用于 Trace 查询）

---

## 输出文件

| 文件 | 说明 |
|------|------|
| `src/server/routes/metrics.ts` | GET /api/metrics/snapshot |
| `src/server/routes/logs.ts` | GET /api/logs |
| `src/server/routes/traces.ts` | GET /api/traces/:traceId |

---

## 实现步骤

### 步骤 1：审查现有服务器结构

首先阅读 `src/server/` 目录，了解：
- 使用的 HTTP 框架（express / fastify / 原生 http）
- 现有路由注册方式
- 中间件和错误处理方式

### 步骤 2：实现指标端点 `src/server/routes/metrics.ts`

```typescript
import type { RequestHandler } from 'express'; // 根据实际框架调整
import { MetricsCollector } from '../../observability/metrics.js';

// GET /api/metrics/snapshot
// Query params: window (minutes, default: 60)
export const getMetricsSnapshot: RequestHandler = (req, res) => {
  try {
    const metrics = MetricsCollector.getInstance();
    const windowMinutes = parseInt(req.query.window as string) || 60;

    const snapshot = metrics.getSnapshot();

    res.json({
      ok: true,
      windowMinutes,
      snapshotTime: new Date().toISOString(),
      metrics: snapshot,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
};

// GET /api/metrics/prometheus
// 导出 Prometheus 格式（预留接口）
export const getMetricsPrometheus: RequestHandler = (_req, res) => {
  try {
    const metrics = MetricsCollector.getInstance();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics.exportPrometheus());
  } catch (err) {
    res.status(500).send(`# Error: ${(err as Error).message}`);
  }
};
```

### 步骤 3：实现日志查询端点 `src/server/routes/logs.ts`

日志存储在 JSONL 文件中，查询时需要从文件读取并过滤：

```typescript
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
import type { RequestHandler } from 'express';

interface LogQueryParams {
  taskId?: string;
  traceId?: string;
  level?: string;
  startTime?: string;
  endTime?: string;
  limit?: string;
}

// GET /api/logs?taskId=xxx&level=info&limit=100
export const getLogs: RequestHandler = async (req, res) => {
  try {
    const {
      taskId, traceId, level,
      startTime, endTime,
      limit = '100',
    } = req.query as LogQueryParams;

    const maxLimit = Math.min(parseInt(limit), 1000);
    const today = new Date().toISOString().slice(0, 10);
    const logFile = join('workspace/logs', `${today}.log`);

    if (!existsSync(logFile)) {
      return res.json({ ok: true, logs: [], total: 0 });
    }

    const logs: any[] = [];
    const rl = createInterface({ input: createReadStream(logFile) });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);

        // 过滤条件
        if (taskId && entry.taskId !== taskId) continue;
        if (traceId && entry.traceId !== traceId) continue;
        if (level && entry.level !== level) continue;
        if (startTime && entry.timestamp < startTime) continue;
        if (endTime && entry.timestamp > endTime) continue;

        logs.push(entry);
        if (logs.length >= maxLimit) break;
      } catch { /* 跳过解析失败的行 */ }
    }

    res.json({ ok: true, logs, total: logs.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
};
```

### 步骤 4：实现 Trace 查询端点 `src/server/routes/traces.ts`

```typescript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { RequestHandler } from 'express';
import { Tracer } from '../../observability/tracer.js';

// GET /api/traces/:traceId
export const getTrace: RequestHandler = (req, res) => {
  try {
    const { traceId } = req.params;

    // 先查内存（活跃 trace）
    const tracer = Tracer.getInstance();
    const liveTrace = tracer.getTrace(traceId);
    if (liveTrace) {
      return res.json({ ok: true, trace: liveTrace, source: 'memory' });
    }

    // 再查文件（已完成的 trace）
    const filePath = join('workspace/traces', `${traceId}.json`);
    if (!existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: `Trace ${traceId} not found` });
    }

    const content = readFileSync(filePath, 'utf-8');
    const trace = JSON.parse(content);
    res.json({ ok: true, trace, source: 'file' });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
};

// GET /api/traces?taskId=xxx
export const listTraces: RequestHandler = (req, res) => {
  try {
    // 返回最近 20 个 trace 文件列表（不加载完整内容）
    const { readdirSync, statSync } = require('fs');
    const tracesDir = 'workspace/traces';

    if (!existsSync(tracesDir)) {
      return res.json({ ok: true, traces: [] });
    }

    const files = readdirSync(tracesDir)
      .filter((f: string) => f.endsWith('.json'))
      .map((f: string) => ({
        traceId: f.replace('.json', ''),
        size: statSync(join(tracesDir, f)).size,
        mtime: statSync(join(tracesDir, f)).mtime.toISOString(),
      }))
      .sort((a: any, b: any) => b.mtime.localeCompare(a.mtime))
      .slice(0, 20);

    res.json({ ok: true, traces: files });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
};
```

### 步骤 5：注册路由

根据现有框架在服务器路由文件中注册新端点（最小化修改已有文件）：

```typescript
// 在现有路由注册文件中追加：
import { getMetricsSnapshot, getMetricsPrometheus } from './routes/metrics.js';
import { getLogs } from './routes/logs.js';
import { getTrace, listTraces } from './routes/traces.js';

router.get('/api/metrics/snapshot', getMetricsSnapshot);
router.get('/api/metrics/prometheus', getMetricsPrometheus);
router.get('/api/logs', getLogs);
router.get('/api/traces', listTraces);
router.get('/api/traces/:traceId', getTrace);
```

---

## 验收标准

- [ ] `GET /api/metrics/snapshot` 返回 200 和 JSON，包含 `task.total` 等指标
- [ ] `GET /api/logs?level=info&limit=10` 返回过滤后的日志（不超过 10 条）
- [ ] `GET /api/traces/{validTraceId}` 返回完整 Trace 树（含 spans 数组）
- [ ] `GET /api/traces/{invalidId}` 返回 404
- [ ] 所有端点有错误处理，内部异常返回 500（不 crash 服务器）
- [ ] 用 `curl` 手动测试三个端点均通过
- [ ] TypeScript 编译无错误（strict 模式）
