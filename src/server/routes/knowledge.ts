import { Router, Request, Response } from 'express';
import { VectorStore } from '../../knowledge/vector-store.js';
import { AgentMemory } from '../../knowledge/agent-memory.js';

export function createKnowledgeRouter(store?: VectorStore): Router {
  const router = Router();

  // 若未传入 store，使用默认实例
  function getStore(): VectorStore {
    if (store) return store;
    // 延迟初始化：使用 AgentMemory 单例的长期记忆 store
    const memory = AgentMemory.getInstance();
    return memory.getLongTermMemory();
  }

  // ==================== 统计（需在 /:id 路由之前注册）====================

  router.get('/stats', async (_req: Request, res: Response) => {
    try {
      const s = getStore();
      const stats = await s.getStats();
      res.json({ code: 200, data: stats, message: 'ok' });
    } catch (e: any) {
      res.status(500).json({
        code: 500, data: null,
        message: e.message, errorCode: 'INTERNAL_ERROR',
      });
    }
  });

  // ==================== 搜索（需在 /:id 路由之前注册）====================

  router.post('/search', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      if (!body.text) {
        return res.status(400).json({
          code: 400, data: null,
          message: 'text 是必填字段', errorCode: 'MISSING_FIELDS',
        });
      }
      const results = await getStore().search(body as any);
      res.json({ code: 200, data: results, message: 'ok' });
    } catch (e: any) {
      res.status(500).json({
        code: 500, data: null,
        message: e.message, errorCode: 'INTERNAL_ERROR',
      });
    }
  });

  // ==================== 列表查询 ====================

  router.get('/', async (req: Request, res: Response) => {
    try {
      const q = req.query as Record<string, string>;
      const filter = {
        category: q.category as any,
        tags: q.tags ? String(q.tags).split(',') : undefined,
        status: (q.status as any) ?? 'active',
        page: q.page ? parseInt(q.page, 10) : 1,
        pageSize: q.pageSize ? Math.min(parseInt(q.pageSize, 10), 100) : 20,
        namespace: q.namespace,
      };
      const result = await getStore().list(filter);
      res.json({ code: 200, data: result, message: 'ok' });
    } catch (e: any) {
      res.status(500).json({
        code: 500, data: null,
        message: e.message, errorCode: 'INTERNAL_ERROR',
      });
    }
  });

  // ==================== 创建 ====================

  router.post('/', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      if (!body.title || !body.content) {
        return res.status(400).json({
          code: 400, data: null,
          message: 'title 和 content 是必填字段', errorCode: 'MISSING_FIELDS',
        });
      }
      const entry = await getStore().add(body as any);
      res.status(201).json({ code: 201, data: entry, message: '创建成功' });
    } catch (e: any) {
      res.status(500).json({
        code: 500, data: null,
        message: e.message, errorCode: 'INTERNAL_ERROR',
      });
    }
  });

  // ==================== 单条读取 ====================

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const entry = await getStore().get(req.params.id);
      if (!entry) {
        return res.status(404).json({
          code: 404, data: null,
          message: `条目 ${req.params.id} 不存在`, errorCode: 'NOT_FOUND',
        });
      }
      res.json({ code: 200, data: entry, message: 'ok' });
    } catch (e: any) {
      res.status(500).json({
        code: 500, data: null,
        message: e.message, errorCode: 'INTERNAL_ERROR',
      });
    }
  });

  // ==================== 更新 ====================

  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const entry = await getStore().update(req.params.id, body as any);
      res.json({ code: 200, data: entry, message: '更新成功' });
    } catch (e: any) {
      if (e.message?.includes('not found') || e.message?.includes('不存在')) {
        return res.status(404).json({
          code: 404, data: null,
          message: e.message, errorCode: 'NOT_FOUND',
        });
      }
      res.status(500).json({
        code: 500, data: null,
        message: e.message, errorCode: 'INTERNAL_ERROR',
      });
    }
  });

  // ==================== 删除 ====================

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await getStore().delete(req.params.id);
      res.json({ code: 200, data: null, message: '删除成功' });
    } catch (e: any) {
      if (e.message?.includes('not found') || e.message?.includes('不存在')) {
        return res.status(404).json({
          code: 404, data: null,
          message: e.message, errorCode: 'NOT_FOUND',
        });
      }
      res.status(500).json({
        code: 500, data: null,
        message: e.message, errorCode: 'INTERNAL_ERROR',
      });
    }
  });

  return router;
}
